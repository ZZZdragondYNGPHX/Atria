// Presentation data only: an illustration never changes committed narrative.
export const ILLUSTRATION_NAMESPACE = 'atri_illustrations';
export const emptyIllustrations = () => ({ schemaVersion: 1, annotations: [], images: [] });

function record(value, keys) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') throw new TypeError('Invalid illustration record');
    for (const key of Reflect.ownKeys(value)) {
        const property = Object.getOwnPropertyDescriptor(value, key);
        if (!keys.includes(key) || !property.enumerable || !Object.hasOwn(property, 'value')) throw new TypeError('Unsupported illustration field');
    }
}
function id(value, prefix) {
    if (typeof value !== 'string' || !new RegExp('^' + prefix + '_[a-f0-9]{32}$').test(value)) throw new TypeError('Invalid illustration identity');
    return value;
}
function text(value, max = 65536) {
    if (typeof value !== 'string' || value.length > max) throw new TypeError('Invalid illustration text');
    return value;
}
function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError('Invalid illustration number');
    return value;
}
export function assertIllustrationHead(value) {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new TypeError('Invalid illustration head');
    return value;
}
export function assertIllustrationAnchor(value) {
    record(value, ['messageId', 'variantId', 'revisionId', 'contentHash', 'start', 'end', 'quote']);
    const anchor = { messageId: id(value.messageId, 'msg'), variantId: id(value.variantId, 'var'), revisionId: id(value.revisionId, 'rev'),
        contentHash: assertIllustrationHead(value.contentHash), start: integer(value.start), end: integer(value.end), quote: text(value.quote) };
    if (anchor.end <= anchor.start || anchor.end - anchor.start !== anchor.quote.length || !anchor.quote.trim()) throw new TypeError('Invalid illustration range');
    return anchor;
}
export function illustrationAnchorMatches(anchor, content) {
    const splitPair = offset => offset > 0 && offset < content.length && /[\uD800-\uDBFF]/.test(content[offset - 1]) && /[\uDC00-\uDFFF]/.test(content[offset]);
    return typeof content === 'string' && anchor.end <= content.length && content.slice(anchor.start, anchor.end) === anchor.quote
        && !splitPair(anchor.start) && !splitPair(anchor.end);
}
function parameters(value) {
    let nodes = 0;
    function visit(item, depth) {
        if (++nodes > 1024 || depth > 8) throw new TypeError('Illustration parameters exceed budget');
        if (item === null || typeof item === 'boolean') return item;
        if (typeof item === 'number' && Number.isFinite(item)) return item;
        if (typeof item === 'string') return text(item, 4096);
        if (Array.isArray(item)) return item.map(child => visit(child, depth + 1));
        if (!item || Object.prototype.toString.call(item) !== '[object Object]') throw new TypeError('Invalid illustration parameters');
        const out = {};
        for (const key of Reflect.ownKeys(item)) {
            const property = Object.getOwnPropertyDescriptor(item, key);
            if (typeof key !== 'string' || /^(?:__proto__|prototype|constructor)$/i.test(key)
                || /(?:secret|token|password|authorization|api.?key|endpoint|url)/i.test(key)
                || !property.enumerable || !Object.hasOwn(property, 'value')) throw new TypeError('Unsupported illustration parameter');
            out[key] = visit(property.value, depth + 1);
        }
        return out;
    }
    record(value, Object.keys(value ?? {}));
    return visit(value, 0);
}
export function assertIllustrationImage(value) {
    record(value, ['imageVersionId', 'annotationId', 'assetId', 'width', 'height', 'alt', 'prompt', 'negativePrompt', 'parameters', 'createdAt']);
    return { imageVersionId: id(value.imageVersionId, 'imgv'), annotationId: id(value.annotationId, 'ann'), assetId: id(value.assetId, 'asset'),
        width: integer(value.width, 1, 32768), height: integer(value.height, 1, 32768), alt: text(value.alt, 2048),
        prompt: text(value.prompt), negativePrompt: text(value.negativePrompt), parameters: parameters(value.parameters), createdAt: integer(value.createdAt) };
}
export function assertIllustrationState(value) {
    record(value, ['schemaVersion', 'annotations', 'images']);
    if (value.schemaVersion !== 1 || !Array.isArray(value.annotations) || value.annotations.length > 2048
        || !Array.isArray(value.images) || value.images.length > 8192) throw new TypeError('Invalid illustration state');
    const annotations = value.annotations.map(item => {
        record(item, ['annotationId', 'anchor', 'selectedImageVersionId', 'createdAt', 'deletedAt']);
        return { annotationId: id(item.annotationId, 'ann'), anchor: assertIllustrationAnchor(item.anchor),
            selectedImageVersionId: item.selectedImageVersionId === null ? null : id(item.selectedImageVersionId, 'imgv'),
            createdAt: integer(item.createdAt), ...(item.deletedAt === undefined ? {} : { deletedAt: integer(item.deletedAt) }) };
    });
    const images = value.images.map(assertIllustrationImage);
    const byAnnotation = new Map(annotations.map(item => [item.annotationId, item]));
    const byImage = new Map(images.map(item => [item.imageVersionId, item]));
    if (byAnnotation.size !== annotations.length || byImage.size !== images.length) throw new TypeError('Duplicate illustration identity');
    for (const image of images) if (!byAnnotation.has(image.annotationId)) throw new TypeError('Missing illustration annotation');
    for (const item of annotations) {
        if (item.selectedImageVersionId && byImage.get(item.selectedImageVersionId)?.annotationId !== item.annotationId) throw new TypeError('Illustration image belongs to another annotation');
        if (item.deletedAt !== undefined && item.selectedImageVersionId !== null) throw new TypeError('Deleted annotation cannot display an image');
    }
    const state = { schemaVersion: 1, annotations, images };
    if (JSON.stringify(state).length > 8 * 1024 * 1024) throw new TypeError('Illustration state exceeds budget');
    return state;
}
export function selectIllustrations(state, variants) {
    const contents = new Map(variants.map(item => [item.variantId, item]));
    const annotations = state.annotations.filter(item => {
        const variant = contents.get(item.anchor.variantId);
        return variant?.messageId === item.anchor.messageId && illustrationAnchorMatches(item.anchor, variant.content);
    });
    const ids = new Set(annotations.map(item => item.annotationId));
    return { schemaVersion: 1, annotations, images: state.images.filter(item => ids.has(item.annotationId)) };
}
