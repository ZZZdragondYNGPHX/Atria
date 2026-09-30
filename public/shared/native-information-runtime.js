import { INFORMATION_LIMITS, informationInteger } from './native-information-contract.js';

export const informationDefinition = snapshot => snapshot?.manifest?.runtime?.experienceContract?.informationRuntime;
const clone = value => structuredClone(value);
const read = (value, path) => path.reduce((item, key) => item && Object.hasOwn(item, key) ? item[key] : undefined, value);
const scopeState = (snapshot, id) => snapshot.states?.atri_lifecycle?.scopes?.[id];
export function actorAvailability(snapshot, actorId) {
    const actor = informationDefinition(snapshot)?.actors.find(actor => actor.id === actorId);
    if (!actor) return { actorId, available: false, reason: 'undeclared' };
    const scope = scopeState(snapshot, actor.scopeId);
    if (scope?.status !== 'active') return { actorId, available: false, reason: 'scope_inactive' };
    const predicate = actor.availability;
    const record = predicate && snapshot.states.atri_lifecycle.domains[predicate.domainId]?.records.find(record => record.id === predicate.recordId);
    const available = !predicate || (record?.status === 'active' && record.value[predicate.field] === true);
    return { actorId, available, reason: available ? 'available' : 'unavailable', scopeId: actor.scopeId, scopeEpoch: scope.epoch };
}

function anchor(snapshot) {
    return { sessionId: snapshot.session.sessionId, packageVersionId: snapshot.session.packageVersionId,
        revisionId: snapshot.revision.revisionId, branchId: snapshot.revision.branchId };
}
export function assertInformationAnchor(snapshot, expected) {
    if (!expected || Object.entries(anchor(snapshot)).some(([key, value]) => expected[key] !== value)
        || Object.entries(expected.scopeEpochs ?? {}).some(([id, epoch]) => scopeState(snapshot, id)?.status !== 'active' || scopeState(snapshot, id).epoch !== epoch)) throw new TypeError('Information result is stale');
}

// A projection reads the selected immutable snapshot only. It never mutates a
// World, discovers a second authority, or interprets package expressions.
export function projectInformation(snapshot, viewId, { purpose = 'display', includeRollups = true, onScan = null } = {}) {
    const def = informationDefinition(snapshot);
    const view = def?.views.find(view => view.id === viewId);
    if (!view || !['display', 'context'].includes(purpose) || !view.exposure.includes(purpose)) throw new TypeError('Information exposure denied');
    const result = { schemaVersion: 1, viewId, anchor: { ...anchor(snapshot), scopeEpochs: {} }, items: [], truncated: false, availability: [] };
    if (view.actorId) {
        const availability = actorAvailability(snapshot, view.actorId); result.availability.push(availability);
        if (!availability.available) return result;
        result.anchor.scopeEpochs[availability.scopeId] = availability.scopeEpoch;
    }
    let scanned = 0; let characters = 0;
    const append = item => {
        const length = JSON.stringify(item).length;
        if (result.items.length >= view.maxItems || characters + length > view.maxCharacters) { result.truncated = true; return; }
        characters += length; result.items.push(item);
    };
    for (const id of view.sources) {
        const source = def.sources.find(source => source.id === id); const scope = scopeState(snapshot, source.scopeId);
        if (scope?.status !== 'active') continue;
        result.anchor.scopeEpochs[source.scopeId] = scope.epoch;
        let records;
        if (source.kind === 'application') records = snapshot.states.atri_lifecycle.domains[source.domainId]?.records ?? [];
        else if (source.kind === 'world') {
            const value = snapshot.states.atri_world_state?.worlds[source.worldId]?.state;
            records = value ? [{ id: source.worldId, value }] : [];
        } else {
            if ((snapshot.timeline?.length ?? 0) + scanned > INFORMATION_LIMITS.records) throw new TypeError('Information scan budget exceeded');
            records = (snapshot.timeline ?? []).map(entry => ({ id: entry.messageId, value: entry, variantId: entry.activeVariantId }));
        }
        if (scanned + records.length > INFORMATION_LIMITS.records) throw new TypeError('Information scan budget exceeded');
        scanned += records.length;
        onScan?.(records.length);
        for (const record of records) {
            const value = record.value;
            if (view.actorId && source.actorField && value[source.actorField] !== view.actorId) continue;
            if (view.actorId && source.participantsField && !value[source.participantsField]?.includes(view.actorId)) continue;
            const status = source.statusField ? value[source.statusField] : undefined;
            if (source.semantic === 'open_loop' && status !== 'open') continue;
            if (source.semantic === 'belief' && (!['known', 'believed', 'suspected', 'disputed'].includes(status)
                || !['witnessed', 'direct_message', 'told_by', 'public_broadcast', 'surveillance', 'rumor', 'inference'].includes(value[source.channelField]))) throw new TypeError('Invalid epistemic record');
            const data = {};
            for (const path of source.fields) { const selected = read(value, path); if (selected !== undefined) data[path.join('.')] = clone(selected); }
            append({ id: source.id + ':' + record.id, sourceId: source.id, recordId: record.id, semantic: source.semantic, data,
                ...(record.variantId ? { variantId: record.variantId } : {}),
                ...(source.semantic === 'belief' ? { epistemicStatus: status, channel: value[source.channelField], actorId: value[source.actorField] } : {}),
                ...(source.semantic === 'open_loop' ? { status: 'open' } : {}) });
        }
    }
    if (includeRollups) {
        const artifacts = (snapshot.states.atri_context_derived?.narrative ?? []).filter(artifact => isInformationRollupCurrent(snapshot, artifact, result));
        const covered = new Set(artifacts.flatMap(artifact => artifact.childNarrativeIds));
        for (const artifact of artifacts.filter(artifact => !covered.has(artifact.narrativeId))) append({ id: 'rollup:' + artifact.narrativeId, semantic: 'rollup',
            data: { level: artifact.level, content: artifact.content,
                openLoopRefs: artifact.projection.openLoopRefs.map(id => ({ id, status: result.items.some(item => item.id === id && item.semantic === 'open_loop') ? 'open' : 'closed_or_unavailable' })) },
            sourceId: 'rollup', recordId: artifact.narrativeId });
    }
    return clone(result);
}

export function isInformationRollupCurrent(snapshot, artifact, projection) {
    const meta = artifact.projection;
    if (!meta || meta.viewId !== projection.viewId || artifact.branchId !== snapshot.revision.branchId
        || meta.packageVersionId !== snapshot.session.packageVersionId || meta.sessionId !== snapshot.session.sessionId) return false;
    if (Object.entries(meta.scopeEpochs).some(([id, epoch]) => scopeState(snapshot, id)?.status !== 'active' || scopeState(snapshot, id).epoch !== epoch)) return false;
    // Exact selected leaf content/Variant checks invalidate edits, retries,
    // compaction and changed visibility without requiring a parallel fact store.
    return meta.sources.every(source => projection.items.some(item => item.id === source.id && JSON.stringify(item) === source.fingerprint));
}

export function queryInformationGraph(snapshot, graphId, startId, { depth, expectedAnchor, purpose = 'display' } = {}) {
    const graph = informationDefinition(snapshot)?.graphs.find(graph => graph.id === graphId);
    if (!graph) throw new TypeError('Unknown bounded graph');
    if (expectedAnchor) assertInformationAnchor(snapshot, expectedAnchor);
    informationInteger(depth ?? graph.maxDepth, 0, graph.maxDepth);
    const projection = projectInformation(snapshot, graph.viewId, { purpose, includeRollups: false });
    const nodes = new Map(projection.items.filter(item => item.sourceId === graph.nodeSource).map(item => [item.recordId, item]));
    if (!nodes.has(startId)) return { anchor: projection.anchor, nodes: [], edges: [], truncated: projection.truncated };
    const edges = projection.items.filter(item => item.sourceId === graph.edgeSource);
    const visited = new Set([startId]); const selectedEdges = []; let frontier = [startId]; let scanned = 0; let truncated = projection.truncated;
    for (let level = 0; level < (depth ?? graph.maxDepth) && frontier.length; level++) {
        const next = [];
        for (const edge of edges) {
            if (++scanned > graph.maxEdges) { truncated = true; break; }
            const from = edge.data[graph.fromField]; const to = edge.data[graph.toField];
            if (!frontier.includes(from) || !nodes.has(from) || !nodes.has(to)) continue;
            selectedEdges.push(edge);
            if (!visited.has(to)) { visited.add(to); next.push(to); }
        }
        if (truncated && scanned > graph.maxEdges) break;
        frontier = next;
    }
    return { anchor: projection.anchor, nodes: [...visited].map(id => nodes.get(id)), edges: selectedEdges, truncated };
}

export function informationContext(snapshot, target, taskId, { onScan = null, includeRollups = true } = {}) {
    const def = informationDefinition(snapshot);
    if (!def) return null;
    const view = def.views.find(view => view.exposure.includes('context') && (taskId ? view.audience === 'task' && view.taskId === taskId
        : view.audience === target.kind && (target.kind !== 'actor' || view.actorId === target.id)));
    if (!view) return { items: [], knowledge: false };
    const projection = projectInformation(snapshot, view.id, { purpose: 'context', onScan, includeRollups });
    return { knowledge: view.knowledge && (!view.actorId || projection.availability[0]?.available), memory: view.memory === true, actorId: view.actorId, projection,
        items: projection.items.map(item => ({ contextItemId: 'projection:' + view.id + ':' + item.id,
            lane: item.semantic === 'open_loop' ? 'commitments' : item.semantic === 'memory' ? 'memory' : ['rollup', 'narrative'].includes(item.semantic) ? 'narrative_spine' : 'current_state_event',
            authority: item.semantic === 'truth' ? 'world_projection' : item.semantic === 'belief' ? 'actor_belief' : 'derived',
            authorityRank: item.semantic === 'truth' ? 100 : 10, priority: 0, content: JSON.stringify(item),
            sourceRefs: [{ kind: item.variantId ? 'timeline' : 'state', ...(item.variantId ? { messageId: item.recordId } : {}),
                revisionId: snapshot.revision.revisionId, branchId: snapshot.revision.branchId }],
        })) };
}

export function assertInformationActorAvailable(snapshot, taskId) {
    const def = informationDefinition(snapshot);
    const view = def?.views.find(view => view.exposure.includes('context') && (taskId ? view.audience === 'task' && view.taskId === taskId : view.audience === 'narrator'));
    if (view?.actorId && !actorAvailability(snapshot, view.actorId).available) throw new TypeError('Perspective Actor is unavailable');
}

export function validateInformationState(snapshot) {
    const def = informationDefinition(snapshot);
    if (!def) return;
    let count = 0;
    for (const source of def.sources.filter(source => source.kind === 'application')) {
        const records = snapshot.states.atri_lifecycle.domains[source.domainId]?.records ?? [];
        count += records.length;
        if (count > INFORMATION_LIMITS.records) throw new TypeError('Information scan budget exceeded');
        for (const { value } of records) {
            if (source.actorField && !snapshot.manifest.actors.some(actor => actor.actorId === value[source.actorField])) throw new TypeError('Unknown information Actor');
            if (source.participantsField && (!Array.isArray(value[source.participantsField]) || value[source.participantsField].some(id => !snapshot.manifest.actors.some(actor => actor.actorId === id)))) throw new TypeError('Unknown thread participant');
            if (source.semantic === 'belief' && (!['known', 'believed', 'suspected', 'disputed'].includes(value[source.statusField])
                || !['witnessed', 'direct_message', 'told_by', 'public_broadcast', 'surveillance', 'rumor', 'inference'].includes(value[source.channelField]))) throw new TypeError('Invalid epistemic record');
            if (source.semantic === 'open_loop' && !['open', 'closed', 'superseded'].includes(value[source.statusField])) throw new TypeError('Invalid Open Loop status');
        }
    }
}

export function displayInformation(snapshot) {
    if (!informationDefinition(snapshot)) return {};
    return Object.fromEntries(informationDefinition(snapshot).views.filter(view => view.exposure.includes('display'))
        .map(view => [view.id, projectInformation(snapshot, view.id)]));
}
