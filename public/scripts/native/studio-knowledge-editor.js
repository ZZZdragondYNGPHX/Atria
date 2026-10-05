import { translateShellText as t } from '../atria-shell/localization.js';
import { validateKnowledgeEditorValue } from './knowledge-contracts.js';
import { mountKnowledgeEditor } from './knowledge-editor.js';
import { mountStudioValueEditor } from './studio-value-editor.js';

const object = (value, keys, path) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(path + ' ' + t('Use a JSON object.'));
    for (const key of Object.keys(value)) if (keys && !keys.includes(key)) throw new TypeError(path + '.' + key + ' ' + t('is unsupported'));
};
const id = (value, prefix, path) => { if (typeof value !== 'string' || !new RegExp('^' + prefix + '_[0-9a-f]{32}$').test(value)) throw new TypeError(path + ' ' + t('Use an exact Native ID.')); };

export function validateKnowledgeSnapshot(value) {
    object(value, ['knowledgeBase', 'revision', 'entries'], 'Knowledge snapshot');
    const base = value.knowledgeBase, rev = value.revision;
    object(base, ['knowledgeBaseId', 'displayName', 'currentRevisionId', 'createdAt', 'updatedAt'], 'knowledgeBase');
    object(rev, ['knowledgeBaseId', 'knowledgeRevisionId', 'entryIds', 'metadata', 'createdAt'], 'revision');
    id(base.knowledgeBaseId, 'kb', 'knowledgeBaseId'); id(base.currentRevisionId, 'kbv', 'currentRevisionId');
    id(rev.knowledgeBaseId, 'kb', 'revision.knowledgeBaseId'); id(rev.knowledgeRevisionId, 'kbv', 'knowledgeRevisionId');
    if (base.knowledgeBaseId !== rev.knowledgeBaseId || base.currentRevisionId !== rev.knowledgeRevisionId) throw new TypeError(t('Knowledge snapshot identities and revision pin must match.'));
    if (typeof base.displayName !== 'string' || !base.displayName.length || base.displayName.length > 256) throw new TypeError(t('Knowledge name must contain 1–256 characters.'));
    for (const object of [base, rev]) for (const key of ['createdAt', 'updatedAt']) if (object[key] != null && (!Number.isSafeInteger(object[key]) || object[key] < 0)) throw new TypeError(key + ' ' + t('Use a non-negative epoch-millisecond integer.'));
    if (rev.metadata !== undefined) object(rev.metadata, null, 'revision.metadata');
    validateKnowledgeEditorValue(value, { complete: true });
    for (const entry of value.entries) if (entry.metadata !== undefined) object(entry.metadata, null, 'entry.metadata');
    const ids = value.entries.map(entry => entry.knowledgeEntryId);
    if (!Array.isArray(rev.entryIds) || new Set(rev.entryIds).size !== ids.length || rev.entryIds.length !== ids.length || rev.entryIds.some(ref => !ids.includes(ref))) throw new TypeError(t('Revision entryIds must exactly match the entries. Repair Source explicitly.'));
}

export function patchStudioKnowledge(source, selectedId, value, collection = false) {
    const next = JSON.parse(JSON.stringify(source));
    if (collection) next.knowledge = value;
    else {
        const matches = next.knowledge.map((item, index) => item.knowledgeBase.knowledgeBaseId === selectedId ? index : -1).filter(index => index >= 0);
        if (matches.length !== 1) throw new TypeError(t('Knowledge identity is ambiguous. Repair collection Source.'));
        next.knowledge[matches[0]] = value;
    }
    if (!Array.isArray(next.knowledge)) throw new TypeError(t('Knowledge must be an array.'));
    const ids = new Set(), pins = new Set((next.dependencies.knowledge || []).map(ref => ref.knowledgeBaseId + '@' + ref.knowledgeRevisionId));
    for (const item of next.knowledge) {
        validateKnowledgeSnapshot(item);
        const baseId = item.knowledgeBase.knowledgeBaseId;
        if (ids.has(baseId) || next.dependencies.knowledge.some(ref => ref.knowledgeBaseId === baseId)) throw new TypeError(t('Duplicate or attached Knowledge ID. Repair collection Source before review.') + ' ' + baseId);
        ids.add(baseId); pins.add(baseId + '@' + item.revision.knowledgeRevisionId);
    }
    for (const binding of next.knowledgeBindings) if (!pins.has(binding.source.knowledgeBaseId + '@' + binding.source.knowledgeRevisionId)) throw new TypeError(t('Knowledge is still referenced by a binding:') + ' ' + binding.knowledgeBindingId);
    return next;
}

export function mountStudioKnowledgeEditor({ document, root, value, projectSource, collection, onReview, isCurrent }) {
    const validate = parsed => patchStudioKnowledge(projectSource, value?.knowledgeBase?.knowledgeBaseId, parsed, collection);
    if (collection) return mountStudioValueEditor({ document, root, value, label: 'Knowledge collection JSON', startSource: true, validate, onReview });
    return mountKnowledgeEditor({ document, root, value, label: 'Knowledge resource JSON', validate, onReview, isCurrent });
}
