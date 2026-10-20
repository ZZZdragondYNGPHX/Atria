import { SUBJECT_NAMESPACE, subjectKind, subjectPerspectiveId } from '../../public/shared/native-subject-contract.js';
import { fields } from '../../public/shared/native-values.js';
import { taskId } from '../../public/shared/native-task-contract.js';
import { assertNativeId } from './identity.js';
import { hashNativeDocument, equalNativeDocuments } from './repositories/common.js';
import { actorAvailability } from '../../public/shared/native-information-runtime.js';

function subjectId(sessionId, origin) {
    return 'sub_' + hashNativeDocument({ sessionId, origin }).slice(0, 32);
}
function assertScope(base, worldId) {
    if (worldId === null) return;
    assertNativeId(worldId, 'world');
    if (!base.states.atri_world_state?.worlds[worldId]) throw new TypeError('Subject World scope unavailable');
}
function expression(base, actorId) {
    if (actorId === undefined) return;
    assertNativeId(actorId, 'actor');
    if (!base.manifest.actors.some(item => item.actorId === actorId)) throw new TypeError('Subject expression unavailable');
}
function perspective(base, id, kind, templateId, localRef) {
    if (templateId === undefined) return undefined;
    const view = base.manifest.runtime?.experienceContract?.informationRuntime?.views.find(view => view.id === templateId);
    if (kind !== 'person' || !view?.subjectScopeId || view.audience !== 'actor') throw new TypeError('Subject Perspective template unavailable');
    if (view.subjectAvailability && localRef?.domainId !== view.subjectAvailability.domainId) throw new TypeError('Subject availability requires its original Domain reference');
    return { viewId: subjectPerspectiveId(id, templateId), templateId, scopeId: view.subjectScopeId };
}

// Resolve only the explicit matter's identity. This is a private Host binding,
// not a population query or permission for a model-selected record path.
export function resolveSimulationSubject(base, job, evaluate, context, budget) {
    if (!job.subject) return undefined;
    const id = evaluate(job.subject.id, context);
    const subjects = base.states[SUBJECT_NAMESPACE]?.subjects ?? [];
    budget.scan(subjects.length);
    const selected = subjects.find(subject => subject.subjectId === id);
    // The shared availability reader resolves the identity and own record too;
    // charge those lookups before inspecting their values.
    budget.scan(subjects.length + (base.states.atri_lifecycle.domains[job.subject.domainId]?.records.length ?? 0));
    if (!selected || selected.kind !== 'person' || selected.perspective?.templateId !== job.subject.perspective
        || selected.perspective.scopeId !== job.scopeId || selected.localRef?.domainId !== job.subject.domainId
        || !actorAvailability(base, id).available) return null;
    return { id, recordId: selected.localRef.recordId, viewId: selected.perspective.viewId };
}

export function subjectTaskContext(taskPlan) {
    const binding = taskPlan?.variant.resultBinding;
    if (!binding?.subjectPerspective) return null;
    const subject = taskPlan.intent?.simulation?.subject;
    if (!subject?.id || !subject.recordId || !subject.viewId) throw new TypeError('Subject Task requires its original Host binding');
    return { audience: { kind: 'actor', id: subject.id }, viewId: subject.viewId };
}

export function validateSubjects(base) {
    const state = base.states[SUBJECT_NAMESPACE];
    if (!state) return;
    fields(state, ['schemaVersion', 'subjects'], 'Subject state');
    if (state.schemaVersion !== 1 || !Array.isArray(state.subjects)) throw new TypeError('Invalid Subject state');
    const seen = new Set(); const local = new Set();
    for (const item of state.subjects) {
        fields(item, ['subjectId', 'kind', 'worldId', 'origin', 'admission', 'actorId', 'localRef', 'perspective'], 'Subject');
        assertNativeId(item.subjectId, 'subject'); subjectKind(item.kind); expression(base, item.actorId);
        if (item.worldId !== null) assertNativeId(item.worldId, 'world');
        if (seen.has(item.subjectId)) throw new TypeError('Duplicate Subject identity');
        seen.add(item.subjectId);
        if (item.perspective && !equalNativeDocuments(item.perspective, perspective(base, item.subjectId, item.kind, item.perspective.templateId, item.localRef))) throw new TypeError('Subject Perspective binding mismatch');
        fields(item.origin, ['kind', 'packageVersionId', 'worldRevisionId', 'definitionId', 'entryPointId', 'authorityId', 'bindingId'], 'Subject origin');
        if (!['authored', 'emergent'].includes(item.origin.kind)) throw new TypeError('Invalid Subject origin');
        assertNativeId(item.origin.packageVersionId, 'packageVersion');
        if (item.origin.kind === 'authored') {
            taskId(item.origin.definitionId);
            if (item.origin.entryPointId !== undefined) assertNativeId(item.origin.entryPointId, 'entryPoint');
            if (item.origin.worldRevisionId !== undefined) assertNativeId(item.origin.worldRevisionId, 'worldRevision');
        } else {
            if (typeof item.origin.authorityId !== 'string' || !item.origin.authorityId) throw new TypeError('Missing Subject authority');
            taskId(item.origin.bindingId);
        }
        fields(item.admission, ['branchId', 'revisionId'], 'Subject admission');
        assertNativeId(item.admission.branchId, 'branch'); assertNativeId(item.admission.revisionId, 'revision');
        if (item.localRef) {
            fields(item.localRef, ['domainId', 'recordId'], 'Subject local reference');
            taskId(item.localRef.domainId); taskId(item.localRef.recordId);
            const key = JSON.stringify([item.worldId, item.localRef.domainId, item.localRef.recordId]);
            if (local.has(key)) throw new TypeError('Ambiguous Subject local reference');
            local.add(key);
        }
    }
}

export function initialSubjects(base, worlds) {
    const subjects = [];
    const sources = [...worlds.map(world => ({ worldId: world.world.worldId, worldRevisionId: world.revision.worldRevisionId, definitions: world.revision.subjects ?? [] })),
        { worldId: null, entryPointId: base.entryPoint.entryPointId, definitions: base.entryPoint.subjects ?? [] }];
    for (const source of sources) for (const definition of source.definitions) {
        expression(base, definition.actorId);
        const origin = { kind: 'authored', packageVersionId: base.session.packageVersionId,
            ...(source.worldRevisionId ? { worldRevisionId: source.worldRevisionId } : { entryPointId: source.entryPointId }), definitionId: definition.id };
        const id = subjectId(base.session.sessionId, origin), view = perspective(base, id, definition.kind, definition.perspective, definition.localRef);
        subjects.push({ subjectId: id, kind: definition.kind,
            worldId: source.worldId, origin, admission: null,
            ...(definition.actorId ? { actorId: definition.actorId } : {}), ...(definition.localRef ? { localRef: definition.localRef } : {}), ...(view ? { perspective: view } : {}) });
    }
    return { schemaVersion: 1, subjects };
}

// Called only by the pinned transaction preparer. Its private candidate is
// published with the original domain effects under the same Session CAS.
export function prepareSubjects(candidate, declarations, evaluate, context, authorityId) {
    if (!declarations?.length) return {};
    const state = structuredClone(candidate.states[SUBJECT_NAMESPACE] ?? { schemaVersion: 1, subjects: [] });
    const refs = {};
    for (const item of declarations ?? []) {
        if (item.when !== undefined && !evaluate.predicate(item.when, context)) continue;
        const worldId = item.worldId ?? null;
        assertScope(candidate, worldId); expression(candidate, item.actorId ?? undefined);
        const localRef = item.localRef ? { domainId: item.localRef.domainId, recordId: taskId(evaluate.template(item.localRef.recordId, context)) } : null;
        const explicitId = item.subjectId === undefined ? null : assertNativeId(evaluate.template(item.subjectId, context), 'subject');
        const existing = explicitId ? state.subjects.find(s => s.subjectId === explicitId) : localRef
            ? state.subjects.find(s => s.worldId === worldId && equalNativeDocuments(s.localRef ?? null, localRef)) : null;
        if (explicitId && !existing) throw new TypeError('Subject is not present in this Revision');
        if (existing) {
            if (existing.kind !== item.kind || existing.worldId !== worldId || (localRef && !equalNativeDocuments(existing.localRef ?? null, localRef))) throw new TypeError('Subject binding mismatch');
            if (item.actorId === null) delete existing.actorId;
            else if (item.actorId !== undefined) existing.actorId = item.actorId;
            if (item.perspective !== undefined) existing.perspective = perspective(candidate, existing.subjectId, existing.kind, item.perspective, existing.localRef);
            refs[item.id] = existing.subjectId; continue;
        }
        const origin = { kind: 'emergent', packageVersionId: candidate.session.packageVersionId, authorityId, bindingId: item.id };
        const id = subjectId(candidate.session.sessionId, origin);
        const view = perspective(candidate, id, item.kind, item.perspective, localRef);
        if (!state.subjects.some(s => s.subjectId === id)) state.subjects.push({ subjectId: id, kind: item.kind, worldId, origin, admission: null,
            ...(localRef ? { localRef } : {}), ...(item.actorId ? { actorId: item.actorId } : {}), ...(view ? { perspective: view } : {}) });
        refs[item.id] = id;
    }
    candidate.states[SUBJECT_NAMESPACE] = state;
    return refs;
}

export function publishSubjects(base, states, revisionId, branchId) {
    const state = states[SUBJECT_NAMESPACE];
    if (!state) return states;
    const next = { ...states, [SUBJECT_NAMESPACE]: { ...state, subjects: state.subjects.map(item => item.admission !== null ? item
        : { ...item, admission: { revisionId, branchId } }) } };
    validateSubjects({ ...base, states: next });
    return next;
}
