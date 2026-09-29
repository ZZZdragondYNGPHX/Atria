import { fields } from '../../public/shared/native-values.js';
import { informationList, boundedInformationText, INFORMATION_LIMITS } from '../../public/shared/native-information-contract.js';
import { projectInformation, assertInformationAnchor, isInformationRollupCurrent } from '../../public/shared/native-information-runtime.js';
import { CONTEXT_DERIVED_NAMESPACE, normalizeContextDerivedState, assertNarrativeArtifact, NARRATIVE_LEVELS } from '../../public/scripts/native/context-derived.js';
import { taskId } from '../../public/shared/native-task-contract.js';

// Derived recall is written through the existing lifecycle transaction and
// context-derived namespace. It cannot write World facts or Memory evidence.
export function prepareInformationRollup(base, action) {
    fields(action, ['kind', 'id', 'viewId', 'anchor', 'level', 'sourceIds', 'childIds', 'openLoopRefs', 'content', 'taskInvocationId'], 'Narrative rollup');
    taskId(action.id); taskId(action.viewId); boundedInformationText(action.content);
    if (!action.content.trim()) throw new TypeError('Empty Narrative rollup');
    assertInformationAnchor(base, action.anchor);
    const view = base.manifest.runtime.experienceContract.informationRuntime?.views.find(view => view.id === action.viewId);
    if (!view) throw new TypeError('Undeclared rollup Perspective');
    const projection = projectInformation(base, view.id, { purpose: view.exposure.includes('context') ? 'context' : 'display', includeRollups: false });
    if (Object.keys(action.anchor.scopeEpochs ?? {}).length !== Object.keys(projection.anchor.scopeEpochs).length
        || Object.entries(projection.anchor.scopeEpochs).some(([id, epoch]) => action.anchor.scopeEpochs[id] !== epoch)) throw new TypeError('Rollup scope anchor mismatch');
    const derived = normalizeContextDerivedState(base.states[CONTEXT_DERIVED_NAMESPACE]);
    if (derived.narrative.length >= INFORMATION_LIMITS.rollups || derived.narrative.some(item => item.narrativeId === action.id)) throw new TypeError('Rollup retention or duplicate identity');
    const level = NARRATIVE_LEVELS.indexOf(action.level);
    if (level < 0) throw new TypeError('Unknown rollup level');
    const ids = informationList(action.sourceIds, 64, value => boundedInformationText(value));
    const children = informationList(action.childIds, 32, taskId);
    const loops = informationList(action.openLoopRefs, 64, value => boundedInformationText(value));
    if (level === 0 ? !ids.length || children.length : !children.length || ids.length) throw new TypeError('Rollup requires leaves or previous-level children');
    const sources = new Map();
    for (const id of ids) {
        const item = projection.items.find(item => item.id === id);
        if (!item || item.semantic === 'open_loop') throw new TypeError('Rollup leaf is unavailable or an Open Loop');
        sources.set(id, { id, sourceId: item.sourceId, recordId: item.recordId, fingerprint: JSON.stringify(item) });
    }
    for (const id of children) {
        const child = derived.narrative.find(item => item.narrativeId === id);
        if (!child || NARRATIVE_LEVELS.indexOf(child.level) !== level - 1 || !isInformationRollupCurrent(base, child, projection)) throw new TypeError('Rollup child is stale or outside Perspective');
        for (const source of child.projection.sources) sources.set(source.id, source);
        for (const loop of child.projection.openLoopRefs) if (!loops.includes(loop)) throw new TypeError('Rollup must preserve child Open Loop references');
    }
    if (sources.size > 64 || JSON.stringify([...sources.values()]).length > INFORMATION_LIMITS.characters) throw new TypeError('Rollup source budget exceeded');
    for (const id of loops) if (!projection.items.some(item => item.id === id && item.semantic === 'open_loop')) throw new TypeError('Open Loop reference is not currently open');
    let producer = { kind: 'host' };
    if (action.taskInvocationId !== undefined) {
        const record = base.states.atri_task_results?.records.find(record => record.invocationId === action.taskInvocationId);
        if (!record || record.storedRevisionId !== base.revision.revisionId || record.branchId !== base.revision.branchId
            || record.resultClass !== 'presentation' || (record.payload?.text ?? record.payload) !== action.content) throw new TypeError('Compression Task result is stale or incompatible');
        const taskView = base.manifest.runtime.experienceContract.informationRuntime.views.find(item => item.audience === 'task' && item.taskId === record.taskId && item.exposure.includes('context'));
        if (!taskView || taskView.actorId !== view.actorId || taskView.sources.some(id => !view.sources.includes(id))
            || (taskView.knowledge && !view.knowledge) || (taskView.memory && !view.memory)) throw new TypeError('Compression Task exceeds destination Perspective');
        producer = { kind: 'task', invocationId: record.invocationId, taskId: record.taskId, variantId: record.variantId,
            runtimeRouteId: record.runtimeRouteId ?? null, promptProgramRef: record.promptProgramRef ?? null,
            generationProfileRef: record.generationProfileRef ?? null, contextHash: record.contextHash ?? null,
            requestSnapshotHash: record.requestSnapshotHash ?? null };
    }
    const sequences = base.timeline.filter(entry => [...sources.keys()].some(id => id.endsWith(':' + entry.messageId))).map(entry => entry.sequence);
    const fromSequence = sequences.length ? Math.min(...sequences) : 0;
    const toSequence = sequences.length ? Math.max(...sequences) : -1;
    const artifact = assertNarrativeArtifact({ narrativeId: action.id, level: action.level, branchId: base.revision.branchId,
        revisionId: base.revision.revisionId, content: action.content, childNarrativeIds: children,
        sourceRefs: [{ kind: 'state', branchId: base.revision.branchId, revisionId: base.revision.revisionId },
            ...base.timeline.filter(entry => sequences.includes(entry.sequence)).map(entry => ({ kind: 'timeline', messageId: entry.messageId,
                branchId: base.revision.branchId, revisionId: base.revision.revisionId, sequence: entry.sequence }))],
        coverage: { fromSequence, toSequence, messageIds: base.timeline.filter(entry => sequences.includes(entry.sequence)).map(entry => entry.messageId), eventIds: [] },
        projection: { schemaVersion: 1, viewId: view.id, sessionId: base.session.sessionId, packageVersionId: base.session.packageVersionId,
            scopeEpochs: projection.anchor.scopeEpochs, sources: [...sources.values()], openLoopRefs: loops, producer } });
    derived.narrative.push(artifact);
    // Coverage is diagnostic only; never advance raw-history or Memory cursors.
    base.states[CONTEXT_DERIVED_NAMESPACE] = normalizeContextDerivedState(derived);
}
