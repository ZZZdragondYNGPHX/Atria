import { assertIllustrationDraft } from './illustration-plugin-contract.js';
import { renderNovelaiIllustration } from './novelai-illustration.js';
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
        if (typeof item === 'string') return text(item);
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
    record(value, ['imageVersionId', 'annotationId', 'assetId', 'width', 'height', 'alt', 'prompt', 'negativePrompt', 'parameters', 'requestSnapshot', 'createdAt']);
    return { imageVersionId: id(value.imageVersionId, 'imgv'), annotationId: id(value.annotationId, 'ann'), assetId: id(value.assetId, 'asset'),
        width: integer(value.width, 1, 32768), height: integer(value.height, 1, 32768), alt: text(value.alt, 2048),
        prompt: text(value.prompt), negativePrompt: text(value.negativePrompt), parameters: parameters(value.parameters),
        ...(value.requestSnapshot === undefined ? {} : { requestSnapshot: assertImageRequestSnapshot(value.requestSnapshot, value) }), createdAt: integer(value.createdAt) };
}

function assertImageRequestSnapshot(value, image) {
    const snapshot = requestEvidence(value);
    record(snapshot, ['schemaVersion', 'requestId', 'source', 'connection', 'capabilities', 'promptMode', 'request', 'draft']);
    record(snapshot.source, ['kind', 'sessionId', 'branchId', 'revisionId', 'annotationId']);
    record(snapshot.connection, ['connectionProfileId', 'displayName', 'providerAdapter', 'fingerprint']);
    record(snapshot.request, ['action', 'input', 'model', 'parameters']);
    if (snapshot.schemaVersion !== 1 || snapshot.requestId !== image.imageVersionId || snapshot.source.kind !== 'session'
        || snapshot.source.annotationId !== image.annotationId || snapshot.request.action !== 'generate'
        || !['characters', 'direct'].includes(snapshot.promptMode)) throw new TypeError('Invalid image request snapshot');
    id(snapshot.source.sessionId, 'ses'); id(snapshot.source.branchId, 'br'); id(snapshot.source.revisionId, 'rev');
    id(snapshot.connection.connectionProfileId, 'conn'); assertIllustrationHead(snapshot.connection.fingerprint);
    text(snapshot.connection.displayName, 256); text(snapshot.connection.providerAdapter, 128);
    text(snapshot.request.input); text(snapshot.request.model, 128);
    const draft = assertIllustrationDraft(snapshot.draft);
    const rendered = renderNovelaiIllustration(draft, snapshot.capabilities, snapshot.request.parameters.seed);
    if (draft.prompt !== image.prompt || draft.preset.negativePrompt !== image.negativePrompt
        || rendered.promptMode !== snapshot.promptMode || JSON.stringify(rendered.body) !== JSON.stringify(snapshot.request)
        || JSON.stringify(parameters(snapshot.request.parameters)) !== JSON.stringify(parameters(image.parameters))) throw new TypeError('Image request evidence mismatch');
    return snapshot;
}
export function assertIllustrationState(value) {
    record(value, ['schemaVersion', 'annotations', 'images']);
    if (value.schemaVersion !== 1 || !Array.isArray(value.annotations) || value.annotations.length > 2048
        || !Array.isArray(value.images) || value.images.length > 8192) throw new TypeError('Invalid illustration state');
    const annotations = value.annotations.map(item => {
        record(item, ['annotationId', 'anchor', 'selectedImageVersionId', 'createdAt', 'deletedAt', 'draft', 'promptVersions', 'promptContext']);
        return { annotationId: id(item.annotationId, 'ann'), anchor: assertIllustrationAnchor(item.anchor),
            selectedImageVersionId: item.selectedImageVersionId === null ? null : id(item.selectedImageVersionId, 'imgv'),
            createdAt: integer(item.createdAt), ...(item.draft === undefined ? {} : { draft: assertIllustrationDraft(item.draft) }),
            ...(item.promptVersions === undefined ? {} : { promptVersions: assertIllustrationPromptVersions(item.promptVersions) }),
            ...(item.promptContext === undefined ? {} : { promptContext: assertIllustrationPromptContext(item.promptContext) }),
            ...(item.deletedAt === undefined ? {} : { deletedAt: integer(item.deletedAt) }) };
    });
    const images = value.images.map(assertIllustrationImage);
    const byAnnotation = new Map(annotations.map(item => [item.annotationId, item]));
    const byImage = new Map(images.map(item => [item.imageVersionId, item]));
    if (byAnnotation.size !== annotations.length || byImage.size !== images.length) throw new TypeError('Duplicate illustration identity');
    for (const image of images) if (!byAnnotation.has(image.annotationId)) throw new TypeError('Missing illustration annotation');
    for (const image of images) if (image.requestSnapshot && image.requestSnapshot.source.revisionId !== byAnnotation.get(image.annotationId).anchor.revisionId) throw new TypeError('Image source mismatch');
    for (const item of annotations) {
        if (item.selectedImageVersionId && byImage.get(item.selectedImageVersionId)?.annotationId !== item.annotationId) throw new TypeError('Illustration image belongs to another annotation');
        if (item.deletedAt !== undefined && item.selectedImageVersionId !== null) throw new TypeError('Deleted annotation cannot display an image');
    }
    const state = { schemaVersion: 1, annotations, images };
    if (JSON.stringify(state).length > 8 * 1024 * 1024) throw new TypeError('Illustration state exceeds budget');
    return state;
}

// Non-secret request evidence is frozen with each generated version. It belongs
// to the existing presentation/save closure, never to narrative state.
function requestEvidence(value) {
    let nodes = 0;
    const visit = (item, depth) => {
        if (++nodes > 16000 || depth > 24) throw new TypeError('Illustration evidence exceeds budget');
        if (item === null || typeof item === 'boolean') return item;
        if (typeof item === 'number' && Number.isFinite(item)) return item;
        if (typeof item === 'string') return text(item, 256 * 1024);
        if (Array.isArray(item)) return item.map(child => visit(child, depth + 1));
        record(item, Object.keys(item ?? {}));
        const out = {};
        for (const [key, child] of Object.entries(item)) {
            if (/^(?:__proto__|prototype|constructor|secretRef|secret|api.?key|password|authorization|credentials|accessToken|refreshToken)$/i.test(key)) throw new TypeError('Secret evidence forbidden');
            out[key] = visit(child, depth + 1);
        }
        return out;
    };
    const result = visit(value, 0);
    if (JSON.stringify(result).length > 512 * 1024) throw new TypeError('Illustration evidence exceeds budget');
    return result;
}
export function assertIllustrationPromptVersions(value) {
    if (!Array.isArray(value) || value.length > 128) throw new TypeError('Invalid illustration prompt history');
    const versions = value.map(item => {
        record(item, ['promptVersionId', 'createdAt', 'draft', 'requestSnapshot', 'template', 'settingsRevision']);
        const promptVersionId = id(item.promptVersionId, 'prmv'), snapshot = requestEvidence(item.requestSnapshot);
        record(snapshot, Object.keys(snapshot ?? {}));
        if (snapshot.schemaVersion !== 1 || snapshot.requestId !== promptVersionId || snapshot.contextPlan?.requestId !== promptVersionId
            || snapshot.contextPlan.schemaVersion !== 1 || snapshot.promptIr?.requestId !== promptVersionId || snapshot.promptIr.schemaVersion !== 1) throw new TypeError('Invalid illustration request snapshot');
        id(snapshot.runtimeRouteId, 'route'); id(snapshot.modelProfileId, 'model'); id(snapshot.connectionProfileId, 'conn');
        const source = snapshot.contextPlan.source;
        record(source, ['kind', 'sessionId', 'branchId', 'revisionId']);
        if (source.kind !== 'session') throw new TypeError('Invalid illustration request source');
        id(source.sessionId, 'ses'); id(source.branchId, 'br'); id(source.revisionId, 'rev');
        return { promptVersionId, createdAt: integer(item.createdAt), draft: assertIllustrationDraft(item.draft),
            requestSnapshot: snapshot, template: text(item.template), settingsRevision: assertIllustrationHead(item.settingsRevision) };
    });
    if (new Set(versions.map(item => item.promptVersionId)).size !== versions.length) throw new TypeError('Duplicate prompt version');
    return versions;
}

export function assertIllustrationPromptContext(value) {
    record(value, ['schemaVersion', 'source', 'items']);
    record(value.source, ['kind', 'sessionId', 'branchId', 'revisionId']);
    if (value.schemaVersion !== 1 || value.source.kind !== 'session' || !Array.isArray(value.items) || value.items.length > 1024) throw new TypeError('Invalid illustration context');
    const source = { kind: 'session', sessionId: id(value.source.sessionId, 'ses'), branchId: id(value.source.branchId, 'br'), revisionId: id(value.source.revisionId, 'rev') };
    const normalized = requestEvidence(value);
    const ids = new Set();
    for (const item of normalized.items) {
        record(item, ['id', 'kind', 'content', 'provenance']);
        if (!['context.history', 'context.fact'].includes(item.kind) || !text(item.id, 256) || ids.has(item.id) || !Array.isArray(item.provenance)) throw new TypeError('Invalid illustration context item');
        ids.add(item.id);
        if (item.kind === 'context.fact') text(item.content, 256 * 1024);
        else { record(item.content, ['role', 'content']); if (item.content.role !== 'user') throw new TypeError('Invalid illustration history'); text(item.content.content, 256 * 1024); }
        for (const ref of item.provenance) { record(ref, ['source', 'ref']); text(ref.source, 192); if (ref.ref !== undefined) text(ref.ref, 512); }
    }
    return { schemaVersion: 1, source, items: normalized.items };
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
