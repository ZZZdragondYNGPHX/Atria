// SPDX-License-Identifier: AGPL-3.0-or-later
import { projectFacts } from './atomic-facts.js';
import { projectTemporalGraph } from './temporal-graph.js';
import { createMemorySupportChecker } from './source-provenance.js';
import { projectProviders, providerProofCurrent } from './provider-provenance.js';
import { resolveProviderFields } from './state-providers.js';
import { stateClaimAlreadyPresent } from './state-prompt.js';
import { buildCollectionId } from './vector-index-core.js';
import { memoryQuerySeeds, memorySemanticHints } from './query-plan.js';
import { memoryEvidenceGroups, memoryEvidenceRecord, memoryEvidenceHeader, composeMemoryCoverage } from './packing.js';
import { memoryInvocationDecision } from './invocation-policy.js';
import { memoryCorpusReuse } from './index-reuse.js';

export const RETRIEVAL_DEFAULTS = Object.freeze({ tokenBudget: 2400, maxDepth: 2, maxEntities: 20,
    maxRelations: 30, topK: 30, maxResults: 20, rrf: 60,
    weights: Object.freeze({ lexical: 1, vector: 1, graph: 1.5, confidence: 0.15, importance: 0.1, recency: 0.05, access: 0.05 }) });
const normalized = value => String(value || '').normalize('NFKC').toLowerCase();
const unit = value => Math.max(0, Math.min(1, Number(value) || 0));
const tokens = text => normalized(text).match(/[a-z0-9_]+|\p{Script=Han}/gu) || [];
const terms = text => {
    const words = tokens(text);
    return words.flatMap((word, index) => /\p{Script=Han}/u.test(word) && /\p{Script=Han}/u.test(words[index + 1] || '')
        ? [word, word + words[index + 1]] : [word]);
};
const evidenceIds = (record, check) => [...new Set((record.supports || [])
    .filter(check).flatMap(ref => ref.episodeIds))];

export function analyzeMemoryQuery(query, entities, { at = null } = {}) {
    const text = normalized(query);
    const queryWords = tokens(text);
    const history = Number.isFinite(at) || /以前|过去|曾经|当时|历史|之前|\b(past|before|previous|history|formerly|used to)\b/u.test(text);
    const intent = /哪里|在哪|何处|\bwhere\b/u.test(text) ? 'location'
        : /为什么|为何|\bwhy\b/u.test(text) ? 'cause'
            : /谁.*(持有|拥有)|归谁|\b(owns|holds|owner)\b/u.test(text) ? 'ownership' : 'general';
    const entityIds = entities.filter(entity => [entity.canonicalName, ...entity.aliases].some(name => {
        const needle = normalized(name);
        const words = tokens(needle);
        return needle && (/\p{Script=Han}/u.test(needle) ? text.includes(needle)
            : words.length && queryWords.some((_, start) => words.every((word, offset) => queryWords[start + offset] === word)));
    })).map(entity => entity.id).slice(0, RETRIEVAL_DEFAULTS.maxEntities);
    return { text, history, intent, at: Number.isFinite(at) ? at : null, entityIds };
}

/** Build only source-valid records; stale/disputed records never reach any lane. */
export function buildMemoryCorpus(snapshot, at = null) {
    const { state, chat } = snapshot;
    const check = createMemorySupportChecker(state, chat);
    const facts = projectFacts(state, chat, { includeInactive: true, checkSupport: check });
    const factOrder = new Map(facts.map((fact, index) => [fact.id, index]));
    const graph = projectTemporalGraph(state, chat, {
        includeInactive: true,
        at,
        checkSupport: check,
        projectedFacts: facts,
    });
    const entities = graph.entities.filter(entity => entity.status === 'active');
    const names = new Map(entities.map(entity => [entity.id, entity.canonicalName]));
    const eligible = record => ['active', 'superseded'].includes(record.status);
    // Build relation-derived fact indexes in one pass. These sets are used by
    // both current-state suppression and historical validAt checks.
    const inactiveFacts = new Set();
    const activeFacts = new Set();
    const uncertainFacts = new Set();
    const validAtFacts = new Set();
    for (const relation of graph.relations) {
        for (const ref of relation.supports || []) {
            const factId = ref.factId;
            if (!factId) continue;
            if (relation.status === 'active') activeFacts.add(factId);
            else inactiveFacts.add(factId);
            if (['stale', 'disputed', 'rejected'].includes(relation.status)) uncertainFacts.add(factId);
            if (relation.validAt === true) validAtFacts.add(factId);
        }
    }
    const documents = facts.filter(fact => eligible(fact) && (!uncertainFacts.has(fact.id) || activeFacts.has(fact.id))).map(fact => ({ ...fact, id: `fact:${fact.id}`, kind: 'fact', factId: fact.id,
        status: fact.validUntil !== undefined || inactiveFacts.has(fact.id) && !activeFacts.has(fact.id) ? 'superseded' : fact.status,
        validAt: Number.isFinite(at) && Number.isFinite(fact.validFrom) && (fact.validUntil === undefined || Number.isFinite(fact.validUntil))
            && (fact.status !== 'superseded' || Number.isFinite(fact.validUntil))
            && (!inactiveFacts.has(fact.id) || activeFacts.has(fact.id)
                || validAtFacts.has(fact.id))
            ? at >= fact.validFrom && (fact.validUntil === undefined || at < fact.validUntil) : null,
        manualSources: (fact.supports || []).filter(ref => state.corrections?.[ref.manualId]).map(ref => ref.manualId), episodeIds: evidenceIds(fact, check) }));
    documents.push(...graph.relations.filter(eligible).map(relation => ({ ...relation, id: `relation:${relation.id}`, kind: 'relation',
        text: `${names.get(relation.sourceEntityId)} — ${relation.predicate} → ${names.get(relation.targetEntityId)}`,
        type: facts[relation.supports.reduce((index, ref) => Math.min(index, factOrder.get(ref.factId) ?? Infinity), Infinity)]?.type || 'inferred',
        manualSources: (relation.supports || []).filter(ref => state.corrections?.[ref.manualId]).map(ref => ref.manualId), episodeIds: evidenceIds(relation, check) })));
    documents.push(...Object.values(state.episodes).filter(episode => check({ episodeIds: [episode.id] }))
        .map(episode => ({ ...episode, id: `episode:${episode.id}`, kind: 'episode', text: episode.content,
            type: 'source', episodeIds: [episode.id], confidence: 0.5 })));
    const providers = projectProviders(state, chat);
    const fields = resolveProviderFields(providers);
    for (const field of fields) {
        documents.push({ id: `state:${field.key}`, kind: 'state', type: field.status === 'conflict' ? 'conflict' : 'provider',
            status: 'active', text: field.status === 'conflict' ? `Unresolved state conflict: ${JSON.stringify(field.claims.map(claim => ({ provider: claim.providerId, label: claim.label, value: claim.value })))}`
                : `${field.claims[0].label}: ${JSON.stringify(field.claims[0].value)}`,
            confidence: field.status === 'conflict' ? 0 : 1, importance: 1,
            episodeIds: [], providerRefs: field.claims.map(claim => ({ providerId: claim.providerId, snapshotId: claim.snapshotId, path: claim.path })),
            claims: field.claims });
    }
    for (const old of Object.values(state.providerSnapshots || {})) {
        if (old.status !== 'superseded' || !providerProofCurrent(old, chat)) continue;
        for (const field of old.fields.filter(field => field.remember)) documents.push({ id: `state-history:${old.id}:${JSON.stringify(field.path)}`,
            kind: 'state', type: 'provider-history', status: 'superseded', text: `${field.label}: ${JSON.stringify(field.value)}`,
            confidence: 1, createdAt: old.createdAt, episodeIds: [], providerRefs: [{ providerId: old.providerId, snapshotId: old.id, path: field.path }] });
    }
    for (const doc of documents) {
        const ids = (doc.episodeIds || []).flatMap(id => state.episodes[id]?.messageIds || []);
        const group = snapshot.eligibility?.atomicGroups?.find(group => ids.some(id => group.sourceMessageIds.includes(id)));
        if (group) doc.atomicGroup = group.id;
    }
    return { documents, entities, providers };
}

export function rankMemory(query, corpus, vectorIds = [], options = {}) {
    const seeds = memoryQuerySeeds(query, corpus.entities, options.sceneText);
    const plan = { ...analyzeMemoryQuery(seeds.userInput, corpus.entities, options), ...seeds };
    const seededEntities = analyzeMemoryQuery(seeds.seedText, corpus.entities, options).entityIds;
    plan.entityIds = [...new Set([...plan.entityIds, ...seededEntities])].slice(0, RETRIEVAL_DEFAULTS.maxEntities);
    if (!plan.text.trim()) return { plan, candidates: [] };
    const cfg = RETRIEVAL_DEFAULTS;
    const entityIdSet = new Set(plan.entityIds);

    const authoritativeSlots = new Set();
    for (const doc of corpus.documents) {
        if (doc.kind !== 'state' || doc.status !== 'active') continue;
        for (const claim of doc.claims || []) {
            if (claim.entityId && claim.predicate) {
                authoritativeSlots.add(JSON.stringify([claim.entityId, claim.predicate]));
            }
        }
    }

    const overriddenIds = new Set();
    const overriddenFacts = new Set();
    if (!plan.history && authoritativeSlots.size > 0) {
        for (const doc of corpus.documents) {
            if (doc.kind !== 'relation'
                || !authoritativeSlots.has(JSON.stringify([doc.sourceEntityId, doc.predicate]))) continue;
            overriddenIds.add(doc.id);
            for (const ref of doc.supports || []) overriddenFacts.add(ref.factId);
        }
    }

    const documents = [];
    const documentById = new Map();
    const relations = [];
    const stateDocs = [];
    const episodeDocs = [];
    for (const doc of corpus.documents) {
        if (!(plan.history || doc.status === 'active')
            || overriddenIds.has(doc.id)
            || overriddenFacts.has(doc.factId)
            || (plan.at !== null && (doc.kind === 'episode' || doc.validAt !== true))) {
            continue;
        }
        documents.push(doc);
        documentById.set(doc.id, doc);
        if (doc.kind === 'relation') relations.push(doc);
        else if (doc.kind === 'state') stateDocs.push(doc);
        else if (doc.kind === 'episode') episodeDocs.push(doc);
    }

    const queryTerms = [...new Set(terms(plan.seedText))];
    const originalTerms = new Set(terms(plan.userInput));
    const documentFrequency = new Map(queryTerms.map(term => [term, 0]));
    const bags = documents.map(doc => {
        const words = terms(doc.text);
        const counts = new Map();
        for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
        for (const term of queryTerms) {
            if (counts.has(term)) documentFrequency.set(term, documentFrequency.get(term) + 1);
        }
        return { length: words.length, counts };
    });
    const average = bags.reduce((sum, bag) => sum + bag.length, 0) / (bags.length || 1) || 1;
    const lexical = documents.map((doc, index) => ({ id: doc.id, score: queryTerms.reduce((sum, term) => {
        const count = bags[index].counts.get(term) || 0;
        const df = documentFrequency.get(term) || 0;
        return sum + (originalTerms.has(term) ? 1 : .25) * Math.log(1 + (documents.length - df + 0.5) / (df + 0.5))
            * count * 2.2 / (count + 1.2 * (0.25 + 0.75 * bags[index].length / average));
    }, 0) })).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, cfg.topK);

    // Build relation adjacency once instead of filtering the complete document
    // corpus at every graph depth. The explicit order map preserves the old
    // stable-sort tie behavior for equal status/confidence edges.
    const relationOrder = new Map();
    const adjacency = new Map();
    relations.forEach((relation, index) => {
        relationOrder.set(relation.id, index);
        for (const entityId of [relation.sourceEntityId, relation.targetEntityId]) {
            if (!adjacency.has(entityId)) adjacency.set(entityId, []);
            adjacency.get(entityId).push(relation);
        }
    });

    const visited = new Set(plan.entityIds);
    let frontier = [...visited];
    const graphHits = new Map();
    for (let depth = 1; depth <= cfg.maxDepth && frontier.length; depth++) {
        const next = [];
        const edgeIds = new Set();
        const edges = [];
        for (const entityId of frontier) {
            for (const edge of adjacency.get(entityId) || []) {
                if (edgeIds.has(edge.id)) continue;
                edgeIds.add(edge.id);
                edges.push(edge);
            }
        }
        edges.sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active')
            || b.confidence - a.confidence
            || relationOrder.get(a.id) - relationOrder.get(b.id));
        for (const edge of edges) {
            if (graphHits.size >= cfg.maxRelations) break;
            if (graphHits.has(edge.id)) continue;
            const additions = [edge.sourceEntityId, edge.targetEntityId].filter(id => !visited.has(id));
            if (visited.size + additions.length > cfg.maxEntities) continue;
            graphHits.set(edge.id, depth);
            for (const id of additions) {
                visited.add(id);
                next.push(id);
            }
        }
        frontier = next;
    }

    const scores = new Map();
    const lane = (ids, weight) => ids.forEach((id, index) => {
        scores.set(id, (scores.get(id) || 0) + weight / (cfg.rrf + index + 1));
    });
    lane(lexical.map(hit => hit.id), cfg.weights.lexical);
    if (plan.commitment) lane(documents.filter(doc => memorySemanticHints(doc.text).commitment).map(doc => doc.id), 2);
    lane(vectorIds.slice(0, cfg.topK), cfg.weights.vector);
    lane([...graphHits.keys()], cfg.weights.graph);
    lane(stateDocs
        .filter(doc => doc.claims?.some(claim => entityIdSet.has(claim.entityId)))
        .map(doc => doc.id), 2);

    // Retrieve source Episodes behind relevant edges/facts, even without lexical overlap.
    const supporting = new Set();
    for (const [id] of scores) {
        const doc = documentById.get(id);
        if (!doc || doc.kind === 'episode') continue;
        for (const episodeId of doc.episodeIds || []) supporting.add(episodeId);
    }
    lane(episodeDocs
        .filter(doc => supporting.has(doc.episodeIds?.[0]))
        .map(doc => doc.id), 0.5);

    const now = options.now ?? Date.now();
    const candidates = [];
    for (const [id, score] of scores) {
        const doc = documentById.get(id);
        if (!doc) continue;
        const boost = cfg.weights.confidence * unit(doc.confidence) + cfg.weights.importance * unit(doc.importance)
            + cfg.weights.recency / (1 + Math.max(0, now - (doc.updatedAt || doc.createdAt || 0)) / 86400000)
            + cfg.weights.access * Math.min(1, Math.log1p(Math.max(0, Number(doc.accessCount) || 0)) / 10);
        const intentBoost = doc.kind === 'relation' && (plan.intent === 'location' && doc.predicate === 'located_in'
            || plan.intent === 'ownership' && ['owns', 'holds'].includes(doc.predicate)) ? 1.5 : 1;
        candidates.push({
            ...doc,
            score: score * (1 + boost) * intentBoost / (graphHits.get(doc.id) || 1),
        });
    }
    candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return { plan, candidates: candidates.slice(0, cfg.topK) };
}

export function memoryTokenBudget(settings = {}) {
    const value = Number(settings.memoryOsTokenBudget);
    return Number.isFinite(value) && value >= 0 ? Math.min(32000, Math.floor(value)) : RETRIEVAL_DEFAULTS.tokenBudget;
}
export function memoryTokenCounter(context) {
    return async text => {
        if (!text) return 0;
        const count = context.getTokenCountAsync ? await context.getTokenCountAsync(text) : new TextEncoder().encode(text).length;
        if (!Number.isFinite(count) || count < 0) throw new Error('Invalid memory token count');
        return Math.ceil(count);
    };
}

/** Admit complete records only, counting headings, quoting and source references. */
export async function composeMemory(candidates, { countTokens, budget, corePacket = '', at = null, assertCurrent = () => {} }) {
    let text = '';
    const selected = [];
    for (const doc of candidates.slice(0, RETRIEVAL_DEFAULTS.topK)) {
        const section = doc.kind === 'episode' ? 'Relevant past / source excerpt' : doc.status === 'superseded' ? 'Historical assertion'
            : doc.kind === 'state' ? 'Provider current state / conflicts'
                : 'Source assertion';
        const record = JSON.stringify(memoryEvidenceRecord(doc, at));
        const next = `${text || memoryEvidenceHeader}\n${section}\n${record}`;
        const count = await countTokens([corePacket, next].filter(Boolean).join('\n'));
        assertCurrent();
        if (count <= budget) { text = next; selected.push(doc.id); }
        if (selected.length >= RETRIEVAL_DEFAULTS.maxResults) break;
    }
    const tokenCount = await countTokens([corePacket, text].filter(Boolean).join('\n'));
    assertCurrent();
    return { text, selected, tokenCount, budget, coreOverBudget: tokenCount > budget };
}

async function digest(text) {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
        .map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Content-addressed vectors, isolated by chat and embedding configuration. */
export async function retrieveMemory(snapshot, query, { service, profile, rerankProfile, countTokens,
    budget = RETRIEVAL_DEFAULTS.tokenBudget, corePacket = '', existingStateText = '', signal, at = null, rebuildVectors = false,
    sceneText = '', packing = 'coverage', computeContext = null, reuseDerived = true } = {}) {
    const work = { guardChecks: 0, guardMs: 0, documentsHashed: 0, hashReused: 0, hashMs: 0, serviceRequests: 0,
        requestDataBytes: 0, responseDataBytes: 0, embeddingTextsRequested: 0, rerankRequests: 0 };
    const guard = () => {
        const begin = performance.now(); work.guardChecks++;
        try {
            if (signal?.aborted) throw Object.assign(new Error('Memory recall aborted'), { name: 'AbortError' });
            snapshot.assertCurrent();
        } finally { work.guardMs += performance.now() - begin; }
    };
    const callService = async (method, args) => {
        work.serviceRequests++;
        work.requestDataBytes += new TextEncoder().encode(JSON.stringify(args)).length;
        if (method === 'insert') work.embeddingTextsRequested += args.items.length;
        if (method === 'query') work.embeddingTextsRequested++;
        if (method === 'rerank') work.rerankRequests++;
        const response = await service[method](args);
        work.responseDataBytes += new TextEncoder().encode(JSON.stringify(response ?? null)).length;
        return response;
    };
    const started = performance.now();
    guard();
    const reused = reuseDerived ? memoryCorpusReuse(snapshot, at, () => buildMemoryCorpus(snapshot, at))
        : { corpus: buildMemoryCorpus(snapshot, at), fingerprints: null, decision: { status: 'miss', reason: 'manual_bypass' } };
    const corpus = reused.corpus;
    const querySeeds = memoryQuerySeeds(query, corpus.entities, sceneText);
    const unavailableGroups = [];
    if (snapshot.eligibility) {
        const temporal = analyzeMemoryQuery(querySeeds.userInput, corpus.entities, { at });
        // Time constraints apply to every lane, including vector indexing and
        // rerank inputs, rather than only suppressing ranked hits afterward.
        corpus.documents = corpus.documents.filter(doc => temporal.at !== null
            ? doc.kind !== 'episode' && doc.validAt === true
            : temporal.history || doc.status === 'active');
        const present = new Set(corpus.documents.flatMap(doc => (doc.episodeIds || []).flatMap(id => snapshot.state.episodes[id]?.messageIds || [])));
        for (const group of snapshot.eligibility.atomicGroups || []) {
            if (!group.sourceMessageIds.every(id => present.has(id))) {
                corpus.documents = corpus.documents.filter(doc => doc.atomicGroup !== group.id);
                unavailableGroups.push({ id: group.id, reason: 'complete_group_outside_time_domain' });
            }
        }
    }
    const corpusReady = performance.now();
    const diagnostics = [];
    let vectorIds = [];
    if (service && profile && String(query).trim()) {
        try {
            const collectionId = `memory_hybrid_v1_${await digest(JSON.stringify([snapshot.key, profile, snapshot.eligibility?.identity ?? null]))}`;
            guard();
            // Only identified derived namespaces are cleared. Source/World/
            // Timeline storage is outside this retrieval service entirely.
            if (snapshot.eligibility) {
                for (const retired of [buildCollectionId(snapshot.key), `memory_os_${await digest(JSON.stringify([snapshot.key, profile]))}`]) {
                    guard();
                    const hashes = await callService('listHashes', { collectionId: retired, profile, signal }); guard();
                    if (hashes.length) { await callService('deleteByHashes', { collectionId: retired, profile, hashes, signal }); guard(); }
                }
            }
            const items = [];
            const hashStarted = performance.now();
            const profileKey = JSON.stringify(profile);
            for (let start = 0; start < corpus.documents.length; start += 64) {
                const documents = corpus.documents.slice(start, start + 64);
                const ready = documents.map((doc, offset) => {
                    const item = reused.fingerprints?.get(doc)?.get(profileKey);
                    return item ? { ...item, index: start + offset } : null;
                });
                if (ready.every(Boolean)) {
                    work.hashReused += ready.length; items.push(...ready);
                    continue;
                }
                const chunk = await Promise.all(documents.map(async (doc, offset) => {
                    const memo = reused.fingerprints?.get(doc);
                    if (memo?.has(profileKey)) {
                        work.hashReused++;
                        return { ...memo.get(profileKey), index: start + offset };
                    }
                    const fingerprint = await digest(JSON.stringify([doc.id, doc.text, doc.status, doc.episodeIds, doc.providerRefs, doc.manualSources]));
                    work.documentsHashed++;
                    const item = { hash: parseInt(fingerprint.slice(0, 12), 16), text: doc.text, index: start + offset, metadata: { id: doc.id, fingerprint } };
                    if (reused.fingerprints) {
                        const next = memo ?? new Map();
                        if (!next.has(profileKey) && next.size >= 2) next.delete(next.keys().next().value);
                        next.set(profileKey, Object.freeze({ ...item, metadata: Object.freeze({ ...item.metadata }) })); reused.fingerprints.set(doc, next);
                    }
                    return item;
                }));
                guard(); items.push(...chunk);
                if (start + 64 < corpus.documents.length) { await new Promise(resolve => setTimeout(resolve, 0)); guard(); }
            }
            guard();
            work.hashMs += performance.now() - hashStarted;
            const desired = new Map(items.map(item => [item.hash, item]));
            if (desired.size !== items.length) throw new Error('Memory vector hash collision');
            const remote = new Set((await callService('listHashes', { collectionId, profile, signal })).map(Number));
            guard();
            const hashes = [...remote].filter(hash => rebuildVectors || !desired.has(hash));
            if (hashes.length) { await callService('deleteByHashes', { collectionId, profile, hashes, signal }); guard(); }
            const missing = items.filter(item => rebuildVectors || !remote.has(item.hash));
            for (let start = 0; start < missing.length; start += 64) {
                await callService('insert', { collectionId, profile, items: missing.slice(start, start + 64), signal,
                    ...(computeContext ? { computeContext } : {}) }); guard();
            }
            const response = await callService('query', { collectionId, profile, searchText: querySeeds.seedText, topK: RETRIEVAL_DEFAULTS.topK, threshold: 0.2, signal,
                ...(computeContext ? { computeContext } : {}) });
            guard();
            const valid = new Map(items.map(item => [item.metadata.id, item.metadata.fingerprint]));
            vectorIds = [...new Set((response?.metadata || []).filter(hit => valid.get(hit.id) === hit.fingerprint && typeof hit.fingerprint === 'string').map(hit => hit.id))];
        } catch (error) {
            guard();
            if (error?.name === 'AbortError') throw error;
            diagnostics.push('vector_unavailable');
        }
    } else diagnostics.push('vector_unconfigured');
    const vectorsReady = performance.now();
    const rankingStarted = performance.now();
    const result = rankMemory(query, corpus, vectorIds, { at, sceneText });
    result.candidates = result.candidates.filter(doc => !(doc.kind === 'state' && doc.type === 'provider'
        && doc.claims?.every(claim => stateClaimAlreadyPresent(claim, existingStateText))));
    const invocation = memoryInvocationDecision(result.plan, result.candidates, { configured: Boolean(service && rerankProfile), computeContext });
    const rankingMs = performance.now() - rankingStarted;
    const rerankStarted = performance.now();
    if (invocation.action === 'rerank') {
        try {
            const ranks = await callService('rerank', { profile: rerankProfile, query, signal, computeContext, topK: result.candidates.length,
                documents: result.candidates.map((doc, index) => ({ text: doc.text, index })) });
            guard();
            // A malformed response cannot be a successful ranking. Keep the
            // source-valid baseline intact; the attempted service work stays counted.
            if (!Array.isArray(ranks) || !ranks.length
                || ranks.some(hit => !Number.isInteger(hit?.index) || hit.index < 0 || hit.index >= result.candidates.length
                    || !Number.isFinite(hit.relevance_score ?? hit.score))
                || new Set(ranks.map(hit => hit.index)).size !== ranks.length) {
                throw Object.assign(new Error('Invalid Memory rerank response'), { code: 'memory_rerank_response_invalid' });
            }
            const scores = new Map(ranks.map(hit => [hit.index, hit.relevance_score ?? hit.score]));
            result.candidates = result.candidates.map((doc, index) => ({ ...doc, rerank: scores.get(index) ?? -Infinity }))
                .sort((a, b) => b.rerank - a.rerank || b.score - a.score);
            invocation.outcome = 'completed';
        } catch (error) {
            guard();
            if (error?.name === 'AbortError') throw error;
            diagnostics.push('rerank_unavailable');
            invocation.outcome = 'unavailable';
            invocation.stop = error.code || 'rerank_execution_failed';
        }
    }
    const rerankMs = performance.now() - rerankStarted;
    guard();
    const packingStarted = performance.now();
    const composition = packing === 'ranked'
        ? await composeMemory(result.candidates, { countTokens, budget, corePacket, at: result.plan.at, assertCurrent: guard })
        : await composeMemoryCoverage(memoryEvidenceGroups(result.candidates, corpus, snapshot.state, result.plan),
            { countTokens, budget, corePacket, assertCurrent: guard });
    const accessed = result.candidates.filter(doc => composition.selected.includes(doc.id)).flatMap(doc => doc.kind === 'fact'
        ? [doc.factId] : doc.kind === 'relation' ? doc.supports.map(ref => ref.factId) : []);
    if (accessed.length && snapshot.recordAccess) { await snapshot.recordAccess(accessed); guard(); }
    const selectedDocuments = result.candidates.filter(doc => composition.selected.includes(doc.id));
    const evidence = composition.admitted ? composition.admitted.map(group => ({ id: group.id, content: group.content,
        sourceMessageIds: group.sourceMessageIds, atomicGroup: group.atomicGroup, kind: 'source_group', eligibility: snapshot.eligibility?.identity,
        sourceRefs: group.sourceMessageIds.map(id => ({ messageId: id, content: snapshot.state.sources[id]?.content, revision: snapshot.state.sources[id]?.revision })) })) : selectedDocuments.map(doc => {
        const sourceMessageIds = [...new Set((doc.episodeIds || []).flatMap(id =>
            Array.isArray(snapshot.state?.episodes?.[id]?.messageIds)
                ? snapshot.state.episodes[id].messageIds
                : []))].filter(Boolean);
        return { id: doc.id, content: JSON.stringify(memoryEvidenceRecord(doc, result.plan.at)), sourceMessageIds, kind: doc.kind, type: doc.type,
            status: doc.status, validFrom: doc.validFrom, validUntil: doc.validUntil,
            sourceRefs: sourceMessageIds.map(id => ({ messageId: id, content: snapshot.state.sources[id]?.content,
                revision: snapshot.state.sources[id]?.revision })), eligibility: snapshot.eligibility?.identity };
    });
    const sourceMessageIds = [...new Set(evidence.flatMap(item => item.sourceMessageIds))];
    const packingMs = performance.now() - packingStarted;
    const proofStarted = performance.now();
    for (const item of evidence) {
        item.producer = 'hybrid-retrieval-v1';
        item.sourceRefs = await Promise.all(item.sourceMessageIds.map(async id => ({ messageId: id,
            contentHash: await digest(snapshot.state.sources[id].content), sourceRevision: snapshot.state.sources[id].revision })));
        guard();
    }
    if (!composition.selected.length) diagnostics.push('evidence_unknown');
    if (composition.missingGroups?.length || unavailableGroups.length) diagnostics.push('atomic_evidence_unavailable');
    const coverageGaps = result.plan.intent === 'cause' && !selectedDocuments.some(doc =>
        ['causes', 'motivated_by', 'explains'].includes(doc.predicate) || /因为|由于|\bbecause\b/iu.test(doc.text))
        ? [{ intent: 'cause', reason: 'causal_evidence_unknown' }] : [];
    return { ...composition, plan: result.plan, invocation, reuse: reused.decision, diagnostics, sourceMessageIds, evidence,
        producer: 'hybrid-retrieval-v1', coverageGaps, missingGroups: [...(composition.missingGroups || []), ...unavailableGroups],
        metrics: { corpusSize: corpus.documents.length, candidates: result.candidates.length, selected: composition.selected.length,
            corpusMs: corpusReady - started, vectorMs: vectorsReady - corpusReady, rankingMs, rerankMs, packingMs,
            proofMs: performance.now() - proofStarted, totalMs: performance.now() - started,
            work: { ...work, costStatus: work.embeddingTextsRequested || work.rerankRequests ? 'unknown' : 'not_requested',
                byteMeasurement: 'service_data_json_utf8', timingMeasurement: 'elapsed_ms' } },
        providers: corpus.providers.map(provider => ({ providerId: provider.providerId, status: provider.status })), assertCurrent: guard };
}
