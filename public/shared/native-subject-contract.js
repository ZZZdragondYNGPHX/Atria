import { fields, json, text } from './native-values.js';
import { taskId } from './native-task-contract.js';
import { contentSha256 } from './content-sha256.js';

export const SUBJECT_NAMESPACE = 'atri_subjects';
export const SUBJECT_KINDS = Object.freeze(['person', 'organization', 'place', 'item', 'other']);
export const SUBJECT_ID_SCHEMA = Object.freeze({ type: 'string', minLength: 36, maxLength: 36 });
export const isPerspectiveIdentity = value => typeof value === 'string' && /^(actor|sub)_[a-f0-9]{32}$/.test(value);
export const subjectPerspectiveId = (subjectId, templateId) => 'perspective.' + contentSha256(JSON.stringify([subjectId, templateId])).slice(0, 32);
export function hasPerspectiveIdentity(snapshot, id) {
    return snapshot.manifest.actors.some(actor => actor.actorId === id)
        || snapshot.states[SUBJECT_NAMESPACE]?.subjects.some(subject => subject.subjectId === id && subject.kind === 'person') === true;
}
export function resolvePerspectiveView(snapshot, id) {
    if (typeof id !== 'string') return undefined;
    const views = snapshot.manifest.runtime?.experienceContract?.informationRuntime?.views ?? [];
    const fixed = views.find(view => view.id === id && !view.subjectScopeId);
    if (fixed) return fixed;
    const subject = snapshot.states[SUBJECT_NAMESPACE]?.subjects.find(subject => subject.perspective?.viewId === id);
    if (!subject) return undefined;
    const template = views.find(view => view.id === subject.perspective.templateId && view.subjectScopeId === subject.perspective.scopeId && view.audience === 'actor');
    return template ? { ...template, id, actorId: subject.subjectId } : undefined;
}

export function subjectKind(value) {
    if (!SUBJECT_KINDS.includes(value)) throw new TypeError('Invalid Subject kind');
    return value;
}

// Identity and optional expression sources; business values and grants remain
// in their original domains.
export function subjectDefinitions(value = []) {
    if (!Array.isArray(value) || value.length > 4096) throw new TypeError('Invalid Subject definitions');
    const seen = new Set();
    for (const item of value) {
        fields(item, ['id', 'kind', 'actorId', 'localRef', 'perspective'], 'Subject definition');
        taskId(item.id); subjectKind(item.kind);
        if (item.perspective !== undefined) taskId(item.perspective);
        if (seen.has(item.id)) throw new TypeError('Duplicate Subject definition');
        seen.add(item.id);
        if (item.actorId !== undefined && !/^actor_[a-f0-9]{32}$/.test(text(item.actorId, 38))) throw new TypeError('Invalid Subject expression Actor');
        if (item.localRef !== undefined) {
            fields(item.localRef, ['domainId', 'recordId'], 'Subject local reference');
            taskId(item.localRef.domainId); taskId(item.localRef.recordId);
        }
    }
    return json(value);
}
