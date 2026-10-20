import { fields, json, text } from './native-values.js';
import { taskId } from './native-task-contract.js';

export const SUBJECT_NAMESPACE = 'atri_subjects';
export const SUBJECT_KINDS = Object.freeze(['person', 'organization', 'place', 'item', 'other']);
export const SUBJECT_ID_SCHEMA = Object.freeze({ type: 'string', minLength: 36, maxLength: 36 });

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
        fields(item, ['id', 'kind', 'actorId', 'localRef'], 'Subject definition');
        taskId(item.id); subjectKind(item.kind);
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
