import { el, action, field, feedback, disclosure } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';
import { nativeStudioClient } from './studio-client.js';
import { createStudioNativeId, createAuthoringOperation, projectSaveOperation, sourceWriteOperation, sourceDeleteOperation } from './studio-authoring.js';
import { renderResourceReferenceRows } from './resource-reference-rows.js';

export function validateAssetPath(path, files, assets, current = null) {
    if (!path.startsWith('assets/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..') || /[\x00-\x1f<>:"|?*]/.test(path)) throw new Error(tl('Choose a valid path inside assets/.'));
    if (path !== current?.path && [...files, ...assets.filter(item => item.assetId !== current?.assetId)].some(item => item.path.toLowerCase() === path.toLowerCase())) throw new Error(tl('This path already exists. Choose another path or replace the existing asset.'));
    return path;
}

function encode(bytes) { let value = ''; for (const byte of new Uint8Array(bytes)) value += String.fromCharCode(byte); return btoa(value); }

export function mountAssetEditor({ document: doc, root, source, projectId, stageOperations, host, client = nativeStudioClient }) {
    const assets = source.assetFiles || [];
    const editor = el(doc, 'div', 'atri-asset-editor', undefined, root); editor.dataset.atriaAssetEditor = 'true';
    const clone = () => JSON.parse(JSON.stringify(source));
    async function references(asset, parent) {
        const refs = (await client.getResourceReferences({ scope: 'project/' + projectId, resourceType: 'core.asset', resourceId: asset.assetId }, { reverse: true })).filter(item => item.edge?.kind !== 'contains');
        parent.replaceChildren(); renderResourceReferenceRows({ document: doc, root: parent, references: refs, host }); return refs;
    }
    async function preview(asset, parent) {
        const file = await client.readSource(projectId, asset.path); parent.replaceChildren();
        el(doc, 'p', 'atri-library-meta', `${asset.mediaType || tl('Unknown file type')} · ${file.size ?? atob(file.content).length} ${tl('bytes')}`, parent);
        const media = String(asset.mediaType || '').toLowerCase();
        const tag = /^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(media) ? 'img' : /^audio\/(mpeg|ogg|wav|webm|mp4)$/.test(media) ? 'audio' : /^video\/(mp4|webm|ogg)$/.test(media) ? 'video' : null;
        if (tag) {
            const node = el(doc, tag, 'atri-asset-preview', undefined, parent); node.src = `data:${media};base64,${file.content}`;
            if (tag === 'img') node.alt = asset.logicalName || asset.path; else { node.controls = true; node.preload = 'metadata'; }
        } else if (/^(text\/|application\/(json|xml))/.test(media)) {
            try { const text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(file.content), char => char.charCodeAt(0))); el(doc, 'pre', 'atri-asset-text-preview', text.slice(0, 20000), parent); } catch { el(doc, 'p', '', tl('Binary file. Use Replace to change its contents.'), parent); }
        } else el(doc, 'p', '', tl('Preview is unavailable for this file type.'), parent);
    }
    function form(parent, asset = null) {
        const box = el(doc, 'div', 'atri-asset-form', undefined, parent);
        const name = field(doc, box, 'Asset name', asset?.logicalName || '');
        const path = field(doc, box, 'Asset path', asset?.path || 'assets/');
        const media = field(doc, box, 'Media type', asset?.mediaType || '');
        const details = disclosure(doc, box, 'Asset metadata');
        const metadata = el(doc, 'textarea', '', undefined, details); metadata.setAttribute('aria-label', tl('Asset metadata')); metadata.value = JSON.stringify(asset?.metadata || {}, null, 2);
        const file = field(doc, box, asset ? 'Replace asset file' : 'Import project asset', '', 'file');
        file.addEventListener('change', () => { const selected = file.files?.[0]; if (!selected) return; if (!asset) { name.value = selected.name; path.value = 'assets/' + selected.name.replace(/[\\/<>:"|?*\x00-\x1f]/g, '_'); } media.value = selected.type; });
        action(doc, box, 'Review asset changes', async () => {
            const selected = file.files?.[0];
            if (!asset && !selected) throw new Error(tl('Choose an asset file first.'));
            if (!name.value.trim()) throw new Error(tl('Enter an asset name.'));
            const nextPath = validateAssetPath(path.value.trim(), await client.listSources(projectId), assets, asset);
            const extra = JSON.parse(metadata.value);
            if (!extra || typeof extra !== 'object' || Array.isArray(extra)) throw new Error(tl('Asset metadata must be a JSON object.'));
            const updated = { ...(asset || { assetId: createStudioNativeId('asset') }), path: nextPath, logicalName: name.value.trim(), metadata: extra };
            if (media.value.trim()) updated.mediaType = media.value.trim(); else delete updated.mediaType;
            const next = clone(); next.assetFiles = asset ? assets.map(item => item.assetId === asset.assetId ? updated : item) : [...assets, updated];
            const operations = [];
            if (asset && nextPath !== asset.path) operations.push(createAuthoringOperation({ operationType: 'source.move', target: { path: asset.path }, input: { toPath: nextPath } }));
            if (selected) operations.push(sourceWriteOperation(nextPath, encode(await selected.arrayBuffer()), { encoding: 'base64' }));
            operations.push(projectSaveOperation(projectId, next));
            await stageOperations(operations, tl('Update project assets'));
        }, { primary: true });
        if (asset) action(doc, box, 'Cancel', () => box.remove());
    }
    for (const asset of assets) {
        const row = el(doc, 'article', 'atri-library-version', undefined, editor); row.dataset.atriaAssetId = asset.assetId;
        el(doc, 'h4', '', asset.logicalName || asset.assetId, row); el(doc, 'p', 'atri-library-meta', asset.path, row);
        const previewBox = el(doc, 'div', '', undefined, row);
        action(doc, row, 'Preview asset', () => preview(asset, previewBox));
        action(doc, row, 'Edit asset', () => { row.querySelector('.atri-asset-form')?.remove(); form(row, asset); });
        const refsBox = el(doc, 'div', '', undefined, row);
        action(doc, row, 'Used By', () => references(asset, refsBox));
        action(doc, row, 'Remove', async () => {
            row.querySelector('[data-asset-removal]')?.remove();
            if ((await references(asset, refsBox)).length) { feedback(doc, row, tl('Remove the references before deleting this asset.'), true); return; }
            const confirm = el(doc, 'div', '', undefined, row); confirm.dataset.assetRemoval = 'true';
            el(doc, 'p', '', tl('Remove this asset and its project file? Installed Works are unchanged.'), confirm);
            action(doc, confirm, 'Review asset removal', async () => {
                if ((await references(asset, refsBox)).length) throw new Error(tl('Remove the references before deleting this asset.'));
                const next = clone(); next.assetFiles = assets.filter(item => item.assetId !== asset.assetId);
                await stageOperations([sourceDeleteOperation(asset.path), projectSaveOperation(projectId, next)], tl('Remove project asset'));
            }, { danger: true });
            action(doc, confirm, 'Cancel', () => confirm.remove());
        });
    }
    el(doc, 'h4', '', tl('Import asset'), editor); form(editor);
}
