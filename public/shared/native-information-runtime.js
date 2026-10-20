import { queryHistory } from './native-history-runtime.js';
import { SUBJECT_NAMESPACE, hasPerspectiveIdentity, resolvePerspectiveView } from './native-subject-contract.js';
import { INFORMATION_LIMITS, informationInteger } from './native-information-contract.js';
import { isCognitionSource, assertCognitionValue, assertCognitionBasis, projectCognitionItems } from './native-cognition-runtime.js';
import { hasInformationBasis, isManagedMemory, assertMemoryValue } from './native-memory-contract.js';

export const informationDefinition = snapshot => snapshot?.manifest?.runtime?.experienceContract?.informationRuntime;
const clone = value => structuredClone(value);
const read = (value, path) => path.reduce((item, key) => item && Object.hasOwn(item, key) ? item[key] : undefined, value);
const scopeState = (snapshot, id) => snapshot.states?.atri_lifecycle?.scopes?.[id];
export function actorAvailability(snapshot, actorId) {
    const subject = snapshot.states[SUBJECT_NAMESPACE]?.subjects.find(subject => subject.subjectId === actorId && subject.kind === 'person' && subject.perspective);
    const actor = subject ? { id: actorId, scopeId: subject.perspective.scopeId } : informationDefinition(snapshot)?.actors.find(actor => actor.id === actorId);
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
    const view = resolvePerspectiveView(snapshot, viewId);
    if (!view || !['display', 'context'].includes(purpose) || !view.exposure.includes(purpose)) throw new TypeError('Information exposure denied');
    const result = { schemaVersion: 1, viewId, anchor: { ...anchor(snapshot), scopeEpochs: {} }, items: [], truncated: false, availability: [] };
    if (view.actorId) {
        const availability = actorAvailability(snapshot, view.actorId); result.availability.push(availability);
        if (!availability.available) return result;
        result.anchor.scopeEpochs[availability.scopeId] = availability.scopeEpoch;
    }
    let scanned = 0; let characters = 0;
    const cognitionValues = new Map();
    const append = item => {
        // Reserve the bounded derived status before adding a cognitive item.
        const source = def.sources.find(source => source.id === item.sourceId);
        const length = JSON.stringify(item).length + (hasInformationBasis(source) ? 256 : isCognitionSource(item) ? item.semantic === 'theory_of_mind' ? 128 : 96 : 0);
        if (result.items.length >= view.maxItems || characters + length > view.maxCharacters) { result.truncated = true; return; }
        characters += length; result.items.push(item);
    };
    for (const id of view.sources) {
        const source = def.sources.find(source => source.id === id); const scope = scopeState(snapshot, source.scopeId);
        if (scope?.status !== 'active') continue;
        result.anchor.scopeEpochs[source.scopeId] = scope.epoch;
        let records;
        if (source.kind === 'history') records = queryHistory(snapshot, { limit: 8, memory: true }).items.map(item => ({ id: item.id, value: item }));
        else if (source.kind === 'application') records = snapshot.states.atri_lifecycle.domains[source.domainId]?.records ?? [];
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
            const itemId = source.id + ':' + record.id;
            if (isCognitionSource(source)) { assertCognitionValue(source, value); cognitionValues.set(itemId, value); }
            if (hasInformationBasis(source)) { assertCognitionBasis(value); cognitionValues.set(itemId, value); }
            append({ id: itemId, sourceId: source.id, recordId: record.id, semantic: source.semantic, data,
                ...(record.variantId ? { variantId: record.variantId } : {}),
                ...(source.semantic === 'belief' ? { epistemicStatus: status, channel: value[source.channelField], actorId: value[source.actorField] } : {}),
                ...(isCognitionSource(source) ? { actorId: value.actor, ...(['emotion', 'relationship', 'theory_of_mind'].includes(source.semantic) ? { appraisalStatus: value.status } : { intentStatus: value.status }) } : {}),
                ...(hasInformationBasis(source) ? { actorId: value.actor } : {}),
                ...(source.semantic === 'open_loop' ? { status: 'open' } : {}) });
        }
    }
    projectCognitionItems(snapshot, result, cognitionValues);
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

// Recovery may change only cognitive basis metadata on the already granted
// immutable leaf set. Re-evaluate those leaves without rescanning Timeline or
// broadening the view; field selection and status use the original projector.
export function refreshInformationCognition(snapshot, projection) {
    const result = clone(projection), def = informationDefinition(snapshot), values = new Map();
    result.anchor = { ...result.anchor, ...anchor(snapshot) };
    for (const item of result.items) {
        const source = def.sources.find(source => source.id === item.sourceId);
        if (!isCognitionSource(source) && !hasInformationBasis(source)) continue;
        const value = snapshot.states.atri_lifecycle.domains[source.domainId].records.find(record => record.id === item.recordId).value;
        const data = {};
        for (const path of source.fields) { const selected = read(value, path); if (selected !== undefined) data[path.join('.')] = clone(selected); }
        item.data = data;
        delete item.cognition; delete item.memory; delete item.causality;
        values.set(item.id, value);
    }
    projectCognitionItems(snapshot, result, values);
    return result;
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
    const narration = !taskId && target.kind === 'narrator' ? def.narration : null;
    const subject = target.kind === 'actor' && !taskId ? snapshot.states[SUBJECT_NAMESPACE]?.subjects.find(subject => subject.subjectId === target.id) : null;
    const view = subject ? resolvePerspectiveView(snapshot, subject.perspective?.viewId)
        : def.views.find(view => !view.subjectScopeId && view.exposure.includes('context') && (!narration || view.id === narration.contextViewId) && (taskId ? view.audience === 'task' && view.taskId === taskId
            : view.audience === target.kind && (target.kind !== 'actor' || view.actorId === target.id)));
    if (view && !view.exposure.includes('context')) throw new TypeError('Perspective Context exposure denied');
    if (!view) return { items: [], knowledge: false };
    const projection = projectInformation(snapshot, view.id, { purpose: 'context', onScan, includeRollups });
    const disclosure = narration ? projectInformation(snapshot, narration.disclosureViewId, { purpose: 'display', onScan, includeRollups: false }) : null;
    // Bind each context record to its independently projected display grant.
    // A source/record match grants only that display item's selected fields;
    // context-only records and rollups do not gain disclosure by being read.
    const displayItems = new Map((disclosure?.items ?? []).map(item => [item.id, item]));
    return { knowledge: view.knowledge && (!view.actorId || projection.availability[0]?.available), memory: view.memory === true, actorId: view.actorId, projection,
        ...(narration ? { narration: clone(narration), disclosure } : {}),
        items: projection.items.map(item => ({ contextItemId: 'projection:' + view.id + ':' + item.id,
            lane: ['open_loop', 'intention'].includes(item.semantic) ? 'commitments' : item.semantic === 'memory' ? 'memory' : ['rollup', 'narrative'].includes(item.semantic) ? 'narrative_spine' : 'current_state_event',
            authority: item.semantic === 'truth' ? 'world_projection' : item.semantic === 'belief' ? 'actor_belief' : isCognitionSource(item) ? 'actor_cognition' : 'derived',
            authorityRank: item.semantic === 'truth' ? 100 : 10, priority: item.semantic === 'intention' ? item.data.priority : 0,
            content: JSON.stringify(disclosure ? { ...item, displayGrant: { viewId: disclosure.viewId, item: displayItems.get(item.id) ?? null } } : item),
            sourceRefs: [{ kind: item.variantId ? 'timeline' : 'state', ...(item.variantId ? { messageId: item.recordId } : {}),
                revisionId: snapshot.revision.revisionId, branchId: snapshot.revision.branchId }],
        })) };
}

/** Exact complete source exposures; a summary/reference alone grants no raw history. */
export function informationSourceMessageIds(snapshot, information) {
    const timeline = new Map((snapshot.timeline || []).map(entry => [entry.messageId, entry]));
    const ids = new Set();
    for (const item of information?.projection?.items || []) {
        if (item.variantId && timeline.get(item.recordId)?.activeVariantId === item.variantId) ids.add(item.recordId);
        for (const id of Array.isArray(item.data?.sourceMessageIds) ? item.data.sourceMessageIds : []) {
            const entry = timeline.get(id);
            if (entry && typeof item.data.text === 'string' && entry.content === item.data.text) ids.add(id);
        }
    }
    return [...ids];
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
            if (source.actorField && !hasPerspectiveIdentity(snapshot, value[source.actorField])) throw new TypeError('Unknown information Actor');
            if (source.participantsField && (!Array.isArray(value[source.participantsField]) || value[source.participantsField].some(id => !hasPerspectiveIdentity(snapshot, id)))) throw new TypeError('Unknown thread participant');
            if (source.semantic === 'belief' && (!['known', 'believed', 'suspected', 'disputed'].includes(value[source.statusField])
                || !['witnessed', 'direct_message', 'told_by', 'public_broadcast', 'surveillance', 'rumor', 'inference'].includes(value[source.channelField]))) throw new TypeError('Invalid epistemic record');
            if (source.semantic === 'open_loop' && !['open', 'closed', 'superseded'].includes(value[source.statusField])) throw new TypeError('Invalid Open Loop status');
            if (isCognitionSource(source)) assertCognitionValue(source, value);
            if (isCognitionSource(source) && value.deadline && !snapshot.manifest.runtime.experienceContract.lifecycleRuntime.clocks.some(clock => clock.id === value.deadline.clockId)) throw new TypeError('Cognition deadline requires a declared Domain Clock');
            if (hasInformationBasis(source)) assertCognitionBasis(value);
            if (isManagedMemory(source)) assertMemoryValue(source, value);
        }
    }
}

export function displayInformation(snapshot) {
    if (!informationDefinition(snapshot)) return {};
    return Object.fromEntries(informationDefinition(snapshot).views.filter(view => !view.subjectScopeId && view.audience !== 'inspector' && view.exposure.includes('display'))
        .map(view => [view.id, projectInformation(snapshot, view.id)]));
}

// Post-retrieval admission uses the exact consumer projection, never index hits
// as cognitive updates. Legacy works without a Memory policy retain their path.
export function memoryEvidenceApplicability(snapshot, information, packet) {
    const def = informationDefinition(snapshot);
    const view = resolvePerspectiveView(snapshot, information?.projection?.viewId);
    const managed = def?.sources.filter(source => view?.sources.includes(source.id) && isManagedMemory(source)) ?? [];
    if (!managed.length) return { status: 'legacy', memories: [] };
    const refs = packet.sourceRefs ?? [];
    const items = information.projection.items;
    const memories = items.filter(item => managed.some(source => source.id === item.sourceId));
    const selected = [];
    for (const ref of refs) {
        const timelineIds = new Set(items.filter(item => item.recordId === ref.messageId
            && def.sources.find(source => source.id === item.sourceId)?.kind === 'timeline').map(item => item.id));
        const eligible = memories.filter(item => {
            const source = managed.find(source => source.id === item.sourceId);
            const value = snapshot.states.atri_lifecycle.domains[source.domainId].records.find(record => record.id === item.recordId)?.value;
            return value?.basis.sourceRefs.some(basis => timelineIds.has(basis.itemId));
        });
        const current = eligible.filter(item => item.memory?.status === 'active' && item.memory.applicability === 'applicable' && item.memory.use && item.memory.use !== 'unavailable');
        if (!current.length) return { status: eligible.some(item => item.memory?.applicability === 'inapplicable' || item.memory?.use === 'unavailable') ? 'inapplicable' : 'unknown', memories: [] };
        selected.push(...current);
    }
    return { status: refs.length ? 'applicable' : 'unknown', memories: [...new Map(selected.map(item => [item.id, item])).values()] };
}
