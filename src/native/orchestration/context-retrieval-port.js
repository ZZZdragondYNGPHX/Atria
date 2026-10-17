import { ConflictError } from '../../storage/errors.js';
import { NativeRetrievalPersistence } from '../retrieval-persistence.js';
import { executeNativeEmbedding, resolveRetrievalSecret } from '../retrieval-execution.js';
import { retrievalSendIdentity, retrievalPostTarget } from '../retrieval-send-contracts.js';
import { retrievalRef } from '../../../public/scripts/native/retrieval-contracts.js';
import { hashNativeDocument as hash, cloneNativeDocument } from '../repositories/common.js';
import { rpAgentGraphProfile } from './rp-agent-graph-profile.js';
import { rpJudgeProfile } from './rp-judge-profile.js';
import { ContextPort } from './context-port.js';
import { assertOriginalSendBank, BudgetPort } from './budget-port.js';
import { readEffect, effectDecision } from './effect-contracts.js';
import { runGuard, readAttempt, controlRecordKey } from './controller-common.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { createNativeId } from '../identity.js';
import { rerank } from '../../vectors/rerank.js';
import { buildMemoryCorpus, applyMemoryCorpusEligibility, memoryVectorCollectionId, retiredMemoryVectorCollectionIds, RETRIEVAL_DEFAULTS } from '../../../public/scripts/agents/memory/hybrid-retrieval.js';
import { contextRetrievalDecision, contextRetrievalCompletionBinding as completionBinding, contextRetrievalReceiptId } from './context-retrieval-contracts.js';
import { NativeModelPromptPersistence } from '../model-prompt-runtime/persistence.js';
import { optionalComputeOptions } from '../../../public/shared/native-compute-budget.js';
import { getOpenAIBatchVector, openAIEmbeddingBody, supportsOpenAIEmbeddingSource } from '../../vectors/openai-vectors.js';

import { memoryQuerySeeds } from '../../../public/scripts/agents/memory/query-plan.js';
import { nativeRetrievalIndexPath } from '../vector-index-work.js';

const fail = (code = 'native_orchestration_context_retrieval_denied') => { throw new ConflictError(code); };
const equal = (a, b) => hash(a) === hash(b);
const binding = root => hash({ runId: root.runId, ownerRef: root.ownerRef, epoch: root.epoch, hostBootId: root.hostBootId,
    hostGeneration: root.hostGeneration, planRef: root.planRef, sourceBinding: root.sourceBinding, budgetAuthorityRef: root.budgetAuthorityRef });
const proposalOf = value => Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(field => [field, value[field]]));

/** Original Context compiler → exact Profile/protocol → original Effect/bank.
 * Tokens and response proofs are instance-private and never restored from JSON.
 */
export class ContextRetrievalPort {
    #scopes = new WeakMap();
    #models = new Map();
    #effects = new Map();
    #observations = new WeakMap();
    #proofs = new WeakMap();
    #skips = new WeakSet();
    constructor({ runs, effects, budgetPort, sourcePort, authorizeModel, transport = null }) {
        Object.assign(this, { runs, effects, budgetPort, sourcePort, authorizeModel, transport });
        this.retrieval = new NativeRetrievalPersistence({ engine: runs.engine });
        this.persistence = new NativeModelPromptPersistence({ engine: runs.engine });
    }

    async #current(scope, { tx, allowSent = false } = {}) {
        if (scope.closed) fail();
        const root = await this.runs.get(scope.handle, scope.runId);
        if (root.cancelRequested || root.status !== 'running' || binding(root) !== scope.rootBinding) fail();
        const read = async active => {
            const parent = (await readEffect(active, scope.handle, root, scope.modelEffectId)).doc;
            if (parent.nodeAttemptId !== scope.attemptId || parent.capability !== 'generation.send'
                || !(allowSent ? ['prepared', 'ready', 'dispatching', 'confirmed'] : ['prepared']).includes(parent.status)
                || parent.epoch !== root.epoch || parent.grantDigest !== scope.request.grantDigest
                || !allowSent && (parent.budgetAttemptRef !== null || parent.dispatchToken !== null)) fail();
            await this.sourcePort.revalidate(scope.handle, root.sourceBinding, { tx: active, root });
            const decision = await this.authorizeModel({ handle: scope.handle, tx: active, root, intent: parent, phase: 'context_retrieval' });
            if (!equal(decision, effectDecision(parent))) fail();
            if (!equal(await this.runs.get(scope.handle, scope.runId), root)) fail();
            return { root, parent };
        };
        return tx ? read(tx) : this.runs.engine.withTransaction(scope.handle, read);
    }

    async createCompilation(handle, { port, request, bank, root, modelEffectId, limits, actualInput, signal }) {
        if (this.runs.engine.hasActiveTransaction(handle)) fail('native_orchestration_context_retrieval_ambient_transaction');
        if (!(port instanceof ContextPort) || !(this.budgetPort instanceof BudgetPort) || root.ownerRef.handle !== handle
            || root.sourceBinding.sourceAuthority !== 'rp_chat' || root.parentRef !== null
            || !equal(root.sourceBinding, request.sourceBinding)) fail();
        assertOriginalSendBank(bank, { budgetPort: this.budgetPort, handle, authorityRef: root.budgetAuthorityRef, effectId: modelEffectId });
        if (!equal(await ContextPort.prototype.compilationDescriptor.call(port, handle, request), actualInput)) fail();
        const key = hash({ handle, runId: root.runId, modelEffectId });
        if (this.#models.has(key)) fail('native_orchestration_context_retrieval_replayed');
        const scope = { handle, runId: root.runId, rootBinding: binding(root), modelEffectId, request: cloneNativeDocument(request),
            memoryDescriptorDigest: hash(actualInput.memoryDescriptor), limits: cloneNativeDocument(limits), signal, bank, used: false, effectIds: [], localJobs: [], unresolvedLocal: false };
        const { parent, plan } = await this.runs.engine.withTransaction(handle, async tx => ({ parent: (await readEffect(tx, handle, root, modelEffectId)).doc,
            plan: await readPlanRevision(tx, handle, root.planRef) }));
        if (root.graphRevision !== 0 || !equal(plan.definition, root.graph) || root.graph.nodes.length !== 2 && !rpJudgeProfile(plan) && !rpAgentGraphProfile(plan)) fail();
        scope.attemptId = parent.nodeAttemptId;
        if (parent.budgetEnvelopeDigest !== hash(limits)) fail();
        const route = await this.persistence.getRuntimeRoute(handle, parent.actionRef.runtimeRouteId);
        if (!route?.executionPolicy || !equal(route.executionPolicy.computeBudget, limits)) fail();
        scope.computeOptions = cloneNativeDocument(optionalComputeOptions(route.executionPolicy, 'rerank'));
        const node = root.graph.nodes.find(node => node.nodeId === request.inputRefs[0]?.nodeId);
        if (!node?.capabilities.includes('memory.retrieve') || node.nodeId !== (await this.runs.engine.withTransaction(handle, tx => readAttempt(tx, handle, root, parent.nodeAttemptId))).doc.nodeId) fail();
        await this.#current(scope);
        const token = Object.freeze({}); this.#scopes.set(token, scope); this.#models.set(key, scope); return token;
    }

    /** End the original producer's private lifetime without changing durable
     * Effects, fees, reservations or unknown observations. */
    releaseCompilation(handle, { runId, modelEffectId }) {
        const key = hash({ handle, runId, modelEffectId }), scope = this.#models.get(key);
        if (!scope) return;
        scope.closed = true;
        for (const effectId of scope.effectIds) this.#effects.delete(effectId);
        this.#models.delete(key);
    }

    async openRecall(handle, token, { descriptor, legal, query, assertCurrent }) {
        const scope = this.#scopes.get(token), settings = descriptor.settings.value;
        const requested = { ...(settings.nativeRetrieval?.embed ? { embed: settings.nativeRetrieval.embed } : {}),
            ...(settings.rerankEnabled && settings.nativeRetrieval?.rerank ? { rerank: settings.nativeRetrieval.rerank } : {}) };
        if (!scope || scope.handle !== handle || scope.used || scope.memoryDescriptorDigest !== hash(descriptor) || !Object.keys(requested).length) fail();
        scope.used = true;
        const { root } = await this.#current(scope);
        const plan = await this.runs.engine.withTransaction(handle, tx => readPlanRevision(tx, handle, root.planRef));
        const node = root.graph.nodes.find(node => node.nodeId === scope.request.inputRefs[0].nodeId);
        const pins = plan.dependencyPins.filter(pin => pin.port === 'context' && node.dependencyPinIds.includes(pin.pinId)), profiles = {};
        for (const [mode, ref] of Object.entries(requested)) {
            const profile = await this.retrieval.getExact(handle, ref), owned = pins.filter(pin => equal(pin.resourceRef, ref));
            if (profile.mode !== mode || owned.length !== 1 || owned[0].integrity !== hash(profile)
                || mode === 'embed' && !supportsOpenAIEmbeddingSource(profile.source)) fail();
            profiles[mode] = profile;
        }
        const corpus = buildMemoryCorpus(legal), seeds = memoryQuerySeeds(query, corpus.entities,
            legal.chat.filter(message => message.mes).slice(-2).map(message => message.mes).join('\n'));
        applyMemoryCorpusEligibility(legal, corpus, seeds);
        const permitted = new Set(corpus.documents.map(doc => doc.text));
        const descriptorDigest = hash(descriptor), corpusDigest = hash({ key: legal.key, state: legal.state, chat: legal.chat, eligibility: legal.eligibility?.identity ?? null });
        const current = async () => { scope.signal?.throwIfAborted(); await assertCurrent(); await this.#current(scope); };
        await current();
        let invoked = false, completed = false, queried = false;
        const service = { admitCorpus: async () => { await current(); return { admitted: true, metered: false }; } };
        const profile = profiles.embed ? { nativeRetrievalRef: requested.embed } : undefined;
        if (profile) {
            const collectionId = await memoryVectorCollectionId(legal.key, profile, legal.eligibility?.identity ?? null);
            const allowed = new Set([collectionId, ...legal.eligibility ? await retiredMemoryVectorCollectionIds(legal.key, profile) : []]);
            const listed = new Map(), embed = profiles.embed, directories = this.runs.engine._directoriesByHandle(handle);
            const execute = async (operation, input) => {
                if (!equal(input.profile, profile) || !allowed.has(input.collectionId)) fail();
                await current();
                const indexPath = nativeRetrievalIndexPath(directories, input.collectionId, embed.retrievalProfileId + '_' + embed.revision);
                return executeNativeEmbedding({ directories, profile: embed, signal: scope.signal,
                    compute: this.#indexCompute(scope, { current, indexPath, kind: 'index_' + operation, descriptorDigest }),
                    embedBatch: texts => this.#provider(scope, { profile: embed, body: openAIEmbeddingBody(texts, embed.source, embed.model),
                        current, descriptorDigest, corpusDigest }) }, operation, input);
            };
            service.listHashes = async input => {
                if (!equal(input.profile, profile) || !allowed.has(input.collectionId)) fail();
                await current();
                if (!listed.size) {
                    const collectionIds = [...allowed], indexPath = collectionIds.map(id => nativeRetrievalIndexPath(directories, id,
                        embed.retrievalProfileId + '_' + embed.revision)).sort();
                    const hashes = await executeNativeEmbedding({ directories, profile: embed, signal: scope.signal,
                        compute: this.#indexCompute(scope, { current, indexPath, kind: 'index_list', descriptorDigest }) }, 'list', { collectionIds });
                    for (const id of collectionIds) listed.set(id, new Set(hashes[id]));
                }
                await current(); return [...listed.get(input.collectionId)];
            };
            service.deleteByHashes = input => {
                if (!Array.isArray(input.hashes) || input.hashes.some(value => !listed.get(input.collectionId)?.has(value))) fail();
                return execute('delete', input);
            };
            service.insert = input => {
                if (input.collectionId !== collectionId || !Array.isArray(input.items) || !input.items.length || input.items.length > 64
                    || input.items.some(item => !permitted.has(item.text) || !Number.isFinite(item.hash))) fail();
                return execute('insert', input);
            };
            service.query = input => {
                if (queried || input.collectionId !== collectionId || input.searchText !== seeds.seedText || input.topK !== RETRIEVAL_DEFAULTS.topK
                    || input.threshold !== 0.2 || input.includeVectors) fail();
                queried = true; return execute('query', input);
            };
        }
        const rerankProfile = profiles.rerank ? { nativeRetrievalRef: requested.rerank } : undefined;
        if (rerankProfile) service.rerank = async ({ query: actualQuery, documents, topK, profile: actualProfile }) => {
            if (invoked || actualQuery !== query || !equal(actualProfile, rerankProfile)
                || !Array.isArray(documents) || !documents.length || documents.length > 64
                || documents.some(doc => !permitted.has(doc.text)) || topK !== documents.length) fail();
            invoked = true; await current();
            try {
                const response = await this.#provider(scope, { profile: profiles.rerank,
                    body: { model: profiles.rerank.model, query, documents: documents.map(doc => doc.text), top_n: topK },
                    current, descriptorDigest, corpusDigest });
                completed = true; return response;
            } catch (error) {
                // Only this instance's pre-Effect, zero-send decision can
                // retain the original optional lexical fallback.
                if (this.#skips.has(error)) completed = true;
                throw error;
            }
        };
        return { service, profile, rerankProfile, finish: async () => {
            await current(); if (invoked && !completed) fail('native_orchestration_context_retrieval_unresolved');
            await this.#assertIndexJobs(scope);
            for (const effectId of scope.effectIds) if (this.#effects.get(effectId)?.observation?.outcome !== 'confirmed') fail('native_orchestration_context_retrieval_unresolved');
            const proof = Object.freeze({}); this.#proofs.set(proof, { scope, effectIds: [...scope.effectIds] }); return proof;
        } };
    }

    #indexCompute(scope, { current, indexPath, kind, descriptorDigest }) {
        const tickets = new WeakMap();
        return {
            beforeLocalWork: async input => {
                if (input.kind !== kind || !equal(input.indexPath, ['index_list', 'index_query'].includes(kind) ? Array.isArray(indexPath) ? indexPath : [indexPath] : indexPath)) fail();
                await current();
                const attemptId = scope.bank.nextLocalWorkAttemptId();
                try {
                    const row = await scope.bank.chargeLocalWork(scope.limits, { attemptId, requestId: 'context-index:' + attemptId, kind,
                        estimatedItems: input.items, estimatedInputBytes: input.inputBytes, targetFingerprint: hash({ indexPath, kind, descriptorDigest }) });
                    if (!row || row.attemptId !== attemptId || row.orchestration?.effectId !== scope.modelEffectId) fail();
                    const job = { ref: { kind: 'local_work', authorityRef: scope.bank.authorityRef, effectId: scope.modelEffectId,
                        localWorkOrdinal: row.orchestration.ordinal, attemptId, reservationId: row.reservationId ?? null }, usageHash: null };
                    scope.localJobs.push(job); const ticket = Object.freeze({}); tickets.set(ticket, job); return ticket;
                } catch (error) { scope.unresolvedLocal = true; throw error; }
            },
            settleLocalWork: async (ticket, usage) => {
                if (ticket === undefined) return;
                const job = tickets.get(ticket); if (!job || job.usageHash !== null) fail();
                try {
                    await scope.bank.settleLocalWork(job.ref.attemptId, usage);
                    const row = await this.budgetPort.observeAttempt(scope.handle, job.ref);
                    if (row.status !== 'settled' || !equal(row.usage, usage)) fail();
                    job.usageHash = hash(row.usage);
                } catch (error) { scope.unresolvedLocal = true; throw error; }
            },
            publishLocalIndex: publish => this.runs.withConsumption(scope.handle, scope.runId, async ({ tx, root }) => {
                await current(); await this.#current(scope, { tx });
                // Final authority check and bounded synchronous publication share
                // the original Run/Source permits. No provider I/O occurs here.
                if (binding(root) !== scope.rootBinding) fail();
                scope.signal?.throwIfAborted(); return publish();
            }, { withAuthority: this.sourcePort.consumptionBoundary(scope.handle, scope.request.sourceBinding, { engine: this.runs.engine }) }),
        };
    }

    async #assertIndexJobs(scope) {
        if (scope.unresolvedLocal) fail('native_orchestration_context_retrieval_unresolved');
        for (const job of scope.localJobs) {
            const row = await this.budgetPort.observeAttempt(scope.handle, job.ref);
            if (!job.usageHash || row.status !== 'settled' || hash(row.usage) !== job.usageHash) fail('native_orchestration_context_retrieval_unresolved');
        }
    }

    async authorize({ handle, tx, root, proposal, intent }) {
        const value = proposal ?? intent, state = this.#effects.get(value.inputRef.retrievalEffectId);
        if (!state || state.scope.handle !== handle || root.runId !== state.scope.runId || !equal(proposalOf(value), proposalOf(state.decision))) fail();
        await state.current(); await this.#current(state.scope, { tx });
        if (!equal(await this.retrieval.getExact(handle, retrievalRef(state.profile)), state.profile)) fail();
        if (intent && !equal(effectDecision(intent), state.decision)) fail();
        return cloneNativeDocument(state.decision);
    }

    async #provider(scope, { profile, body, current, descriptorDigest, corpusDigest }) {
        const handle = scope.handle, effectId = createNativeId('orchestrationEffect');
        if (this.runs.engine.hasActiveTransaction(handle)) fail('native_orchestration_context_retrieval_ambient_transaction');
        const upperBound = Math.max(1, Buffer.byteLength(JSON.stringify(body), 'utf8'));
        const computeOptions = profile.mode === 'rerank' ? scope.computeOptions : {};
        const reserve = computeOptions.reserve;
        if (reserve !== undefined) {
            const root = await this.runs.get(handle, scope.runId);
            const capacity = reserve === null ? null : await this.runs.engine.withTransaction(handle, tx => this.budgetPort.observeCapacity(handle,
                { authorityRef: root.budgetAuthorityRef, reservationId: null }, { tx }));
            const code = reserve === null || !capacity ? 'native_generation_required_budget_unknown'
                : capacity.overrun || capacity.remaining.requests < reserve.maxRequests + 1 || capacity.remaining.tokens < reserve.maxTokens + upperBound
                    ? 'native_generation_required_budget_reserved' : null;
            if (code) { const error = new ConflictError(code); this.#skips.add(error); throw error; }
        }
        const target = retrievalPostTarget(profile), expectedSend = retrievalSendIdentity(profile, body, { endpoint: target.endpoint, method: target.method });
        const decision = contextRetrievalDecision({ sourceBindingDigest: scope.request.sourceBinding.bindingDigest, parentGrantDigest: scope.request.grantDigest,
            budgetEnvelopeDigest: hash(scope.limits), effectId, modelEffectId: scope.modelEffectId, profile, descriptorDigest, corpusDigest, inputFingerprint: expectedSend.inputFingerprint });
        const state = { scope, profile, current, decision, expectedSend, budgetAttemptRef: null, observation: null };
        this.#effects.set(effectId, state);
        scope.effectIds.push(effectId);
        await this.effects.prepareContextRetrieval(handle, { ...runGuard(await this.runs.get(handle, scope.runId)), effectId, nodeAttemptId: scope.attemptId, proposal: proposalOf(decision) });
        const bank = this.budgetPort.sendBank(handle, { authorityRef: (await this.runs.get(handle, scope.runId)).budgetAuthorityRef,
            limits: scope.limits, effectId, firstOrdinal: 0, assertCurrent: current });
        let ticket, dispatchToken;
        const compute = { beforeSend: async (actualBody, transport) => {
            if (ticket || !equal(retrievalSendIdentity(profile, actualBody, transport), expectedSend)) fail();
            await current();
            const receipt = await bank.admit({ requestId: 'retrieval:' + effectId, ...expectedSend, ...computeOptions,
                upperBound });
            state.budgetAttemptRef = receipt.budgetAttemptRef; ticket = Object.freeze({});
            await this.effects.ready(handle, { ...runGuard(await this.runs.get(handle, scope.runId)), effectId, budgetAttemptRef: receipt.budgetAttemptRef });
            const claim = await this.effects.claim(handle, { ...runGuard(await this.runs.get(handle, scope.runId)), effectId });
            if (!claim.claimed || !claim.dispatchToken) fail('native_orchestration_context_retrieval_unresolved');
            dispatchToken = claim.dispatchToken; await current(); return ticket;
        }, settle: async (usage, actualTicket) => {
            if (actualTicket === undefined) return;
            if (actualTicket !== ticket || !state.budgetAttemptRef) fail();
            await bank.settle(state.budgetAttemptRef.attemptId, usage);
        } };
        const dirs = this.runs.engine._directoriesByHandle(handle), secret = this.transport ? 'parent-transport-placeholder' : resolveRetrievalSecret(dirs, profile.secretRef);
        let response;
        try {
            const carrier = { nativeRetrieval: { profile, compute, signal: scope.signal, ...(this.transport ? { fetch: (endpoint, options) =>
                this.transport.fetch({ profile, endpoint: new URL(endpoint).href, method: options.method, body: JSON.parse(options.body), signal: scope.signal,
                    effectRef: { runId: scope.runId, effectId, nodeAttemptId: scope.attemptId, modelEffectId: scope.modelEffectId } }) } : {}) } };
            response = profile.mode === 'embed' ? await getOpenAIBatchVector(body.input, profile.source, dirs, profile.model,
                { reverseProxy: profile.endpoint, proxyPassword: secret }, carrier)
                : await rerank(profile.source, { model: profile.model, reverseProxy: profile.endpoint, proxyPassword: secret,
                    apiUrl: profile.endpoint, apiKey: secret }, body.query, body.documents.map((text, index) => ({ text, index })), body.top_n, dirs, carrier);
            if (profile.mode === 'embed' && (!Array.isArray(response) || response.length !== body.input.length
                || response.some(vector => !Array.isArray(vector) || !vector.length || vector.length > 65536
                    || vector.length !== response[0].length || vector.some(value => !Number.isFinite(value))))) fail('native_orchestration_context_retrieval_unresolved');
        } catch (error) {
            if (state.budgetAttemptRef) await this.#observe(state, null, dispatchToken);
            throw error;
        }
        await this.#observe(state, response, dispatchToken);
        await current(); return response;
    }

    async #observe(state, response, dispatchToken) {
        const { scope, budgetAttemptRef } = state, handle = scope.handle, effectId = state.decision.inputRef.retrievalEffectId;
        const root = await this.runs.get(handle, scope.runId), row = await this.budgetPort.observeAttempt(handle, budgetAttemptRef);
        const intent = await this.runs.engine.withTransaction(handle, async tx => (await readEffect(tx, handle, root, effectId)).doc);
        const confirmed = response !== null && row.status === 'settled' && dispatchToken && intent.dispatchToken === dispatchToken;
        const observation = { observationId: 'retrieval.completed:' + effectId, observedEpoch: intent.epoch, outcome: confirmed ? 'confirmed' : 'unknown',
            dispatchEvidence: { kind: 'original_port_observation', reference: { protocol: 'retrieval', completionBindingDigest: completionBinding(intent),
                responseHash: hash(response), expectedSend: state.expectedSend } }, remoteOperationRef: null, domainReceiptRef: null,
            budgetObservationRef: { budgetAttemptRef, status: row.status, usageHash: hash(row.usage) }, resultRefs: [], sourceRefs: [root.sourceBinding.sourceRef],
            reasonCode: confirmed ? 'retrieval_response_validated' : 'retrieval_response_unresolved' };
        this.#observations.set(observation, state); state.observation = observation;
        await this.effects.observe(handle, { ...runGuard(root), effectId, observation });
        if (!confirmed) fail('native_orchestration_context_retrieval_unresolved');
    }

    async verifyObservation({ handle, tx, root, intent, observation }) {
        const state = this.#observations.get(observation);
        if (!state || state.scope.handle !== handle || state.scope.runId !== root.runId || state.observation !== observation
            || intent.inputRef.retrievalEffectId !== state.decision.inputRef.retrievalEffectId || !equal(effectDecision(intent), state.decision)
            || observation.dispatchEvidence.reference.completionBindingDigest !== completionBinding(intent)) fail();
        await this.budgetPort.verifyBudgetAttempt({ handle, tx, root, intent, budgetAttemptRef: state.budgetAttemptRef,
            expectedSend: { requestId: 'retrieval:' + intent.effectId, ...state.expectedSend } });
        const row = await this.budgetPort.observeAttempt(handle, state.budgetAttemptRef);
        if (!equal(observation.budgetObservationRef, { budgetAttemptRef: state.budgetAttemptRef, status: row.status, usageHash: hash(row.usage) })) fail();
    }

    async assertRecall(handle, proof) {
        const value = this.#proofs.get(proof);
        if (!value || value.scope.handle !== handle) fail();
        const { root } = await this.#current(value.scope, { allowSent: true });
        await this.#assertIndexJobs(value.scope);
        for (const effectId of value.effectIds) {
            const state = this.#effects.get(effectId), row = await this.budgetPort.observeAttempt(handle, state.budgetAttemptRef);
            if (!state.observation || state.observation.outcome !== 'confirmed' || row.status !== 'settled'
                || state.observation.budgetObservationRef.usageHash !== hash(row.usage)) fail();
            await this.runs.engine.withTransaction(handle, async tx => {
                const intent = (await readEffect(tx, handle, root, effectId)).doc;
                const receipt = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', contextRetrievalReceiptId(effectId))))?.doc;
                if (!receipt || intent.status !== 'confirmed' || !equal(effectDecision(intent), state.decision)
                    || intent.nodeAttemptId !== value.scope.attemptId || intent.epoch !== root.epoch || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest
                    || completionBinding(intent) !== state.observation.dispatchEvidence.reference.completionBindingDigest
                    || !equal(intent.budgetAttemptRef, state.budgetAttemptRef)) fail();
                const { schemaVersion: _schema, receiptId: _id, runId: _run, effectId: _effect, observedAt: _at, ...observation } = receipt;
                if (!equal(observation, state.observation)) fail();
                await this.budgetPort.verifyBudgetAttempt({ handle, tx, root, intent, budgetAttemptRef: state.budgetAttemptRef,
                    expectedSend: { requestId: 'retrieval:' + effectId, ...state.expectedSend } });
            });
        }
        await this.#current(value.scope, { allowSent: true });
        return [...value.effectIds];
    }
}
