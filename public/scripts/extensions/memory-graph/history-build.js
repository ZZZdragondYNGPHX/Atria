// SPDX-License-Identifier: AGPL-3.0-or-later
import { applyFactOperations } from './atomic-facts.js';
import { applyTemporalOperations } from './temporal-graph.js';
import { sourceContent } from './source-provenance.js';
import { computeInspector } from './inspector-compute.js';

export const HISTORY_FIELDS = ['facts', 'entities', 'relations', 'entityPending', 'predicates', 'corrections', 'dependencies'];
const running = new Set();
const abort = () => Object.assign(new Error('History build cancelled'), { name: 'AbortError' });
export const historyData = state => Object.fromEntries(HISTORY_FIELDS.map(key => [key, structuredClone(state[key] || (key === 'dependencies' ? [] : {}))]));

export async function historyHash(state) {
    const data = historyData(state);
    // Read-time projections/access counters must not disable undo.
    for (const collection of ['facts', 'entities', 'relations']) for (const record of Object.values(data[collection])) {
        for (const key of ['status', 'confidence', 'accessCount', 'lastAccessedAt']) delete record[key];
        if (collection === 'facts') delete record.episodeIds;
    }
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
}

/** Retain user-touched records and their referential closure, not fabricated replacements. */
export function rebuildSeed(ledger) {
    const state = structuredClone(ledger);
    const kept = Object.fromEntries(['facts', 'entities', 'relations', 'entityPending'].map(key => [key, new Set()]));
    const manual = value => value && typeof value === 'object' && (value.manualId || value.manualDisabled || Object.values(value).some(manual));
    for (const key of Object.keys(kept)) for (const item of Object.values(state[key] || {})) if (manual(item)) kept[key].add(item.id);
    let changed = true;
    const keep = (key, id) => { if (state[key]?.[id] && !kept[key].has(id)) { kept[key].add(id); changed = true; } };
    while (changed) {
        changed = false;
        for (const id of kept.relations) {
            const edge = state.relations[id]; keep('entities', edge.sourceEntityId); keep('entities', edge.targetEntityId);
            edge.supports.forEach(ref => keep('facts', ref.factId));
            (edge.supersededBy || []).forEach(ref => keep('relations', ref.relationId));
            (edge.conflictIds || []).forEach(other => keep('relations', other));
            (edge.resolutions || []).forEach(ref => ref.loserIds.forEach(other => keep('relations', other)));
        }
        for (const id of kept.entities) (state.entities[id].merges || []).forEach(ref => keep('entities', ref.targetId));
        for (const id of kept.facts) {
            const fact = state.facts[id]; keep('facts', fact.mergedInto);
            (fact.supersededBy || []).forEach(other => keep('facts', other));
        }
        for (const id of kept.entityPending) {
            const item = state.entityPending[id]; keep('entities', item.resolvedTo);
            (item.candidateIds || []).forEach(other => keep('entities', other));
        }
    }
    for (const key of Object.keys(kept)) state[key] = Object.fromEntries(Object.entries(state[key] || {}).filter(([id]) => kept[key].has(id)));
    const retained = new Set(Object.entries(kept).flatMap(([key, ids]) => [...ids].map(id => `${{ facts: 'fact', entities: 'entity', relations: 'relation', entityPending: 'pending' }[key]}:${id}`)));
    state.dependencies = (state.dependencies || []).filter(edge => !/^(fact|entity|relation|pending):/.test(edge.child) || retained.has(edge.child));
    return state;
}

export function applyHistoryBatch(state, batch, ticket, chat, newId) {
    if (!batch || !Array.isArray(batch.facts) || !Array.isArray(batch.graph)) throw new Error('History extraction requires facts and graph arrays');
    if (batch.graph.some(op => !['entity', 'alias', 'relation'].includes(op.action))) throw new Error('History extraction may only create/resolve entities, add aliases and record relations; keep user corrections unchanged');
    if (batch.facts.some(op => [op.targetId, op.sourceId].some(id => state.facts?.[id]?.manualDisabled || state.facts?.[id]?.supports?.some(ref => ref.manualId)))) throw new Error('History extraction cannot modify a user-corrected Fact');
    const facts = applyFactOperations(state, batch.facts, ticket, chat, newId);
    const result = applyTemporalOperations(facts.state, batch.graph, ticket, chat, facts.results, newId).state;
    // Rebuilding must not revive the exact assertion the user explicitly rejected.
    const key = (collection, item) => JSON.stringify(collection === 'facts'
        ? [item.text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase(), item.type, item.validFrom, item.validUntil]
        : [item.sourceEntityId, item.targetEntityId, item.predicate, item.validFrom, item.validUntil, item.timeOrder, item.untilOrder]);
    for (const collection of ['facts', 'relations']) {
        const rejected = new Map(Object.values(state[collection] || {}).filter(item => item.manualDisabled).map(item => [key(collection, item), item.manualDisabled]));
        for (const item of Object.values(result[collection] || {})) if (rejected.has(key(collection, item))) item.manualDisabled = rejected.get(key(collection, item));
    }
    for (const entity of Object.values(result.entities || {})) {
        const removed = new Map((state.entities?.[entity.id]?.names || []).filter(name => name.manualDisabled).map(name => [name.name, name.manualDisabled]));
        for (const name of entity.names) if (removed.has(name.name)) name.manualDisabled = removed.get(name.name);
    }
    return result;
}

export function historyFloors(chat, { range = '50', from = 0, to = chat.length - 1 } = {}) {
    if (!['50', '100', '500', 'all', 'custom'].includes(range)) throw new Error('Invalid history range');
    if (range !== 'custom') { from = range === 'all' ? 0 : Math.max(0, chat.length - Number(range)); to = chat.length - 1; }
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to >= chat.length || from > to) throw new Error('Invalid history message range');
    return chat.map((message, floor) => ({ message, floor })).filter(({ message, floor }) => floor >= from && floor <= to
        && !message.is_system && String(message.mes || '').trim()).map(({ floor }) => floor);
}

export function computeHistoryBatch(state, batch, ticket, chat, signal, newId) {
    return computeInspector({ state, chat, assertCurrent() {} }, { mode: 'batch', batch,
        ticket: { scopeId: ticket.scopeId, episodeIds: ticket.episodeIds }, signal,
        fallback: () => applyHistoryBatch(state, batch, ticket, chat, newId) });
}

export function createHistoryBuilder({ lifecycle, extract, newId = () => crypto.randomUUID() }) {
    async function run(context, { floors, mode = 'append', signal, onProgress = () => {} }) {
        if (!['append', 'rebuild'].includes(mode)) throw new Error('Invalid history mode');
        const initial = await lifecycle.retrievalSnapshot(context);
        if (running.has(initial.key)) throw new Error('History build already running for this chat');
        if (!Array.isArray(floors) || !floors.length || floors.some(floor => !Number.isInteger(floor) || !initial.chat[floor] || initial.chat[floor].is_system)) throw new Error('No valid history messages selected');
        running.add(initial.key);
        const progress = { status: 'capturing', total: 0, completed: 0, skipped: 0, errors: [] };
        const report = () => onProgress(structuredClone(progress));
        const checkAbort = () => { if (signal?.aborted) throw abort(); };
        try {
            checkAbort(); initial.assertCurrent(); report();
            const ticket = await lifecycle.capture(context, [...new Set(floors)].sort((a, b) => a - b), initial.chat.map(sourceContent));
            const snapshot = await lifecycle.retrievalSnapshot(context);
            const guard = () => { checkAbort(); snapshot.assertCurrent(); lifecycle.assertTicket(ticket, context); };
            guard();
            let draft = mode === 'rebuild' ? rebuildSeed(snapshot.state) : structuredClone(snapshot.state);
            const processed = new Set(mode === 'append' ? snapshot.state.historyBuild?.processed || [] : []);
            const batches = []; let batch = []; let size = 0;
            for (const source of ticket.sources) {
                if (processed.has(source.episodeId)) { progress.skipped++; continue; }
                if (source.content.length > 120000) throw new Error('A history message exceeds 120000 characters; narrow or edit the source before building');
                if (batch.length && (batch.length >= 6 || size + source.content.length > 24000)) { batches.push(batch); batch = []; size = 0; }
                batch.push(source); size += source.content.length;
            }
            if (batch.length) batches.push(batch);
            progress.total = batches.length; progress.status = 'extracting'; report();
            if (!batches.length && mode === 'append') { progress.status = 'unchanged'; report(); return progress; }
            for (const sources of batches) {
                guard();
                const part = { ...ticket, sources, episodeIds: sources.map(source => source.episodeId) };
                try {
                    const result = await extract(context, { state: structuredClone(draft), ticket: part, signal });
                    guard(); draft = await computeHistoryBatch(draft, result, part, snapshot.chat, signal, newId); guard();
                    part.episodeIds.forEach(id => processed.add(id));
                } catch (error) {
                    guard();
                    progress.errors.push({ batch: progress.completed + 1, message: String(error.message).slice(0, 500) });
                }
                progress.completed++; report();
            }
            guard();
            if (progress.errors.length) { progress.status = 'failed'; report(); return progress; }
            progress.status = 'committing'; report();
            const historyBuild = { id: newId(), mode, completedAt: Date.now(), processed: [...processed],
                before: historyData(snapshot.state), afterHash: await historyHash(draft) };
            guard(); await lifecycle.publishHistory(context, draft, historyBuild, snapshot, checkAbort);
            progress.status = 'completed'; report(); return progress;
        } catch (error) {
            progress.status = error.name === 'AbortError' ? 'cancelled' : 'failed';
            if (error.name !== 'AbortError') progress.errors.push({ message: String(error.message).slice(0, 500) });
            else progress.reason = String(error.message).slice(0, 500);
            report(); return progress;
        } finally { running.delete(initial.key); }
    }
    async function rollback(context) {
        const snapshot = await lifecycle.retrievalSnapshot(context);
        if (running.has(snapshot.key)) throw new Error('Cancel the running history build first');
        const checkpoint = snapshot.state.historyBuild;
        if (!checkpoint?.before || checkpoint.rolledBackAt) throw new Error('No history checkpoint available');
        if (await historyHash(snapshot.state) !== checkpoint.afterHash) throw new Error('Memory changed since this build; rollback would overwrite newer edits');
        snapshot.assertCurrent();
        const draft = { ...snapshot.state, ...structuredClone(checkpoint.before) };
        await lifecycle.publishHistory(context, draft, { ...checkpoint, processed: [], before: null, rolledBackAt: Date.now() }, snapshot);
    }
    return { run, rollback };
}
