import { translateShellText as t } from '../atria-shell/localization.js';
import { mountStudioValueEditor } from './studio-value-editor.js';
import { mountWorldEditor, validateWorldEditorValue } from './world-editor.js';

export function patchStudioWorlds(source, worldId, value, collection = false) {
    const next = JSON.parse(JSON.stringify(source));
    if (collection) next.worlds = value;
    else {
        const matches = next.worlds.map((item, index) => item.world?.worldId === worldId ? index : -1).filter(index => index >= 0);
        if (matches.length !== 1) throw new TypeError(t('World identity is ambiguous. Repair collection Source.'));
        next.worlds[matches[0]] = value;
    }
    if (!Array.isArray(next.worlds)) throw new TypeError(t('Worlds must be an array.'));
    const ids = new Set(), external = new Set((next.dependencies?.worlds || []).map(item => item.worldId));
    const bindings = new Set([...(next.knowledgeBindings || []).map(item => item.knowledgeBindingId), ...(next.dependencies?.knowledgeBindings || [])]);
    const assets = new Set([...(next.assetFiles || []).map(item => item.assetId), ...(next.dependencies?.assets || []).map(item => item.assetId)]);
    for (const item of next.worlds) {
        validateWorldEditorValue(item, true);
        const id = item.world.worldId;
        if (ids.has(id) || external.has(id)) throw new TypeError(t('Duplicate or attached World ID. Repair collection Source before review.') + ' ' + id);
        ids.add(id);
        for (const [key, declared] of [['knowledgeBindingIds', bindings], ['assetIds', assets]]) for (const ref of item.revision[key] || []) {
            if (!declared.has(ref)) throw new TypeError(key + ' ' + t('References must be declared in the project before review:') + ' ' + ref);
        }
    }
    for (const entry of next.package.entryPoints || []) for (const id of entry.worldIds || []) {
        if (!ids.has(id) && !external.has(id)) throw new TypeError(t('World is still referenced by an EntryPoint:') + ' ' + entry.entryPointId + ' · ' + id);
    }
    return next;
}

export function mountStudioWorldsEditor({ document, root, value, projectSource, onReview, collection, library, isCurrent }) {
    const validate = parsed => patchStudioWorlds(projectSource, value?.world?.worldId, parsed, collection);
    if (collection) return mountStudioValueEditor({ document, root, value, label: 'Worlds collection JSON', startSource: true, validate, onReview });
    return mountWorldEditor({ document, root, value, label: 'Worlds resource JSON', projectSource, library, validate, onReview, isCurrent });
}
