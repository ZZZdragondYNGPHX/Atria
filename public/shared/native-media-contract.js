import { visualObject, visualId, visualHash, visualInteger, visualError, assertVisualSourceRef, nonSecretVisualJson } from './native-visual-contract.js';

export function assertMediaOperation(value) {
    visualObject(value, ['schemaVersion', 'mediaOperationId', 'kind', 'source', 'parentImageVersionIds', 'inputAssets', 'mask', 'geometry']);
    if (value.schemaVersion !== 2 || !['txt2img', 'regenerate', 'img2img', 'inpaint', 'outpaint', 'upscale'].includes(value.kind)) visualError('media_invalid');
    visualId(value.mediaOperationId, 'mediaop'); assertVisualSourceRef(value.source);
    if (!Array.isArray(value.parentImageVersionIds) || value.parentImageVersionIds.length > 32 || new Set(value.parentImageVersionIds).size !== value.parentImageVersionIds.length
        || !Array.isArray(value.inputAssets) || value.inputAssets.length > 64) visualError('media_invalid');
    value.parentImageVersionIds.forEach(id => visualId(id, 'imgv'));
    for (const ref of value.inputAssets) {
        visualObject(ref, ['assetId', 'contentHash', 'purpose']); visualId(ref.assetId, 'asset'); visualHash(ref.contentHash);
        if (!['base', 'mask', 'identity', 'outfit', 'style', 'structure', 'vibe'].includes(ref.purpose)) visualError('media_invalid');
    }
    if (['img2img', 'inpaint', 'outpaint', 'upscale'].includes(value.kind) && !value.parentImageVersionIds.length) visualError('parent_missing');
    if (value.mask !== null) {
        visualObject(value.mask, ['maskArtifactId', 'assetId', 'contentHash', 'baseHash', 'width', 'height', 'semantic']);
        visualId(value.mask.maskArtifactId, 'mask'); visualId(value.mask.assetId, 'asset'); visualHash(value.mask.contentHash); visualHash(value.mask.baseHash);
        visualInteger(value.mask.width, 1, 32768); visualInteger(value.mask.height, 1, 32768);
        if (value.mask.width * value.mask.height > 16777216 || value.mask.semantic !== 'gray8-0-preserve-255-edit') visualError('mask_invalid');
        if (!value.inputAssets.some(ref => ref.assetId === value.mask.assetId && ref.contentHash === value.mask.contentHash && ref.purpose === 'mask')) visualError('mask_invalid');
    }
    if (value.kind === 'inpaint' && !value.mask) visualError('mask_missing');
    if (value.geometry !== null) {
        visualObject(value.geometry, ['width', 'height', 'offsetX', 'offsetY']);
        visualInteger(value.geometry.width, 1, 32768); visualInteger(value.geometry.height, 1, 32768);
        visualInteger(value.geometry.offsetX); visualInteger(value.geometry.offsetY);
    }
    if (value.kind === 'outpaint' && !value.geometry) visualError('geometry_missing');
    return nonSecretVisualJson(value);
}
export function illustrationAssetIds(state) {
    return [...new Set(state.images.flatMap(image => [image.assetId, ...(image.mediaOperation?.inputAssets ?? []).map(ref => ref.assetId)]))];
}
export function assertMediaDag(images) {
    const byId = new Map(images.map(image => [image.imageVersionId, image])), visiting = new Set(), visited = new Set();
    const visit = image => {
        if (visiting.has(image.imageVersionId)) visualError('dag_cycle');
        if (visited.has(image.imageVersionId)) return;
        visiting.add(image.imageVersionId);
        if (image.mediaOperation) {
            const operation = assertMediaOperation(image.mediaOperation);
            if (operation.source.annotationId !== image.annotationId) visualError('media_source_invalid');
            for (const id of operation.parentImageVersionIds) {
                const parent = byId.get(id);
                if (!parent || parent.annotationId !== image.annotationId) visualError('parent_missing');
                visit(parent);
            }
        }
        visiting.delete(image.imageVersionId); visited.add(image.imageVersionId);
    };
    images.forEach(visit);
}
