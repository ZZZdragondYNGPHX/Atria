import { assertMediaOperation, assertMediaDag } from './native-media-contract.js';
import { assertIllustrationDraft } from './illustration-plugin-contract.js';
import { assertCompilationEvidence, assertVisualSourceRef, visualFingerprint } from './native-visual-contract.js';
// Presentation data only: an illustration never changes committed narrative.
export const ILLUSTRATION_NAMESPACE = 'atri_illustrations';
export const emptyIllustrations = () => ({ schemaVersion: 2, annotations: [], images: [], references: [] });
export function assertIllustrationImageSelection(value) {
    record(value, ['imageTargetId', 'imageRenderingId']);
    return {
        imageTargetId: value.imageTargetId == null ? null : id(value.imageTargetId, 'imgtarget'),
        imageRenderingId: value.imageRenderingId == null ? null : id(value.imageRenderingId, 'imgrender'),
    };
}

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
    record(value, ['imageVersionId', 'annotationId', 'assetId', 'width', 'height', 'alt', 'prompt', 'negativePrompt', 'parameters', 'requestSnapshot', 'mediaOperation', 'createdAt']);
    return { imageVersionId: id(value.imageVersionId, 'imgv'), annotationId: id(value.annotationId, 'ann'), assetId: id(value.assetId, 'asset'),
        width: integer(value.width, 1, 32768), height: integer(value.height, 1, 32768), alt: text(value.alt, 2048),
        prompt: text(value.prompt), negativePrompt: text(value.negativePrompt), parameters: parameters(value.parameters),
        ...(value.requestSnapshot === undefined ? {} : { requestSnapshot: assertImageRequestSnapshot(value.requestSnapshot, value) }),
        ...(value.mediaOperation === undefined ? {} : { mediaOperation: assertMediaOperation(value.mediaOperation) }), createdAt: integer(value.createdAt) };
}

function assertImageRequestSnapshot(value, image) {
    const snapshot = assertCompilationEvidence(value);
    if (snapshot.requestId !== image.imageVersionId || snapshot.source.annotationId !== image.annotationId
        || snapshot.ir.prompt !== image.prompt || snapshot.ir.negativePrompt !== image.negativePrompt
        || visualFingerprint(snapshot.target.executionParameters) !== visualFingerprint(image.parameters)) throw new TypeError('Image request evidence mismatch');
    return snapshot;
}
export function assertIllustrationState(value) {
    record(value, ['schemaVersion', 'annotations', 'images', 'references']);
    if (value.schemaVersion !== 2 || !Array.isArray(value.annotations) || value.annotations.length > 2048
        || !Array.isArray(value.images) || value.images.length > 8192) throw new TypeError('Invalid illustration state');
    const annotations = value.annotations.map(item => {
        record(item, ['annotationId', 'anchor', 'selectedImageVersionId', 'createdAt', 'deletedAt', 'draft', 'promptVersions', 'promptContext', 'sceneId', 'shotId', 'timeKind', 'originalAnchor', 'sourceProof', 'imageSelection']);
        return { annotationId: id(item.annotationId, 'ann'), anchor: assertIllustrationAnchor(item.anchor),
            selectedImageVersionId: item.selectedImageVersionId === null ? null : id(item.selectedImageVersionId, 'imgv'),
            createdAt: integer(item.createdAt), ...(item.originalAnchor === undefined ? {} : { originalAnchor: assertIllustrationAnchor(item.originalAnchor), sourceProof: requestEvidence(item.sourceProof) }), ...(item.sceneId === undefined ? {} : { sceneId: id(item.sceneId, 'scene'), shotId: id(item.shotId, 'shot'), timeKind: ['present', 'flashback', 'dream'].includes(item.timeKind) ? item.timeKind : (() => { throw new TypeError('Invalid visual frame'); })() }), ...(item.draft === undefined ? {} : { draft: assertIllustrationDraft(item.draft) }),
            ...(item.promptVersions === undefined ? {} : { promptVersions: assertIllustrationPromptVersions(item.promptVersions) }),
            ...(item.promptContext === undefined ? {} : { promptContext: assertIllustrationPromptContext(item.promptContext) }),
            ...(item.imageSelection === undefined ? {} : { imageSelection: assertIllustrationImageSelection(item.imageSelection) }),
            ...(item.deletedAt === undefined ? {} : { deletedAt: integer(item.deletedAt) }) };
    });
    const images = value.images.map(assertIllustrationImage);
    assertMediaDag(images);
    const byAnnotation = new Map(annotations.map(item => [item.annotationId, item]));
    const byImage = new Map(images.map(item => [item.imageVersionId, item]));
    if (byAnnotation.size !== annotations.length || byImage.size !== images.length) throw new TypeError('Duplicate illustration identity');
    for (const image of images) if (!byAnnotation.has(image.annotationId)) throw new TypeError('Missing illustration annotation');
    for (const image of images) if (image.requestSnapshot && image.requestSnapshot.source.revisionId !== (byAnnotation.get(image.annotationId).originalAnchor ?? byAnnotation.get(image.annotationId).anchor).revisionId) throw new TypeError('Image source mismatch');
    for (const item of annotations) {
        if (item.originalAnchor) {
            record(item.sourceProof, ['kind', 'originalBranchId', 'presentationRevisionId', 'originalAnchorHash']);
            if (item.sourceProof.kind !== 'native-checkpoint-alias' || item.sourceProof.presentationRevisionId !== item.anchor.revisionId
                || item.sourceProof.originalAnchorHash !== visualFingerprint(item.originalAnchor)
                || ['messageId', 'variantId', 'contentHash', 'start', 'end', 'quote'].some(key => item.anchor[key] !== item.originalAnchor[key])) throw new TypeError('Invalid immutable source checkpoint alias');
            id(item.sourceProof.originalBranchId, 'br');
        }

        if (item.selectedImageVersionId && byImage.get(item.selectedImageVersionId)?.annotationId !== item.annotationId) throw new TypeError('Illustration image belongs to another annotation');
        if (item.deletedAt !== undefined && item.selectedImageVersionId !== null) throw new TypeError('Deleted annotation cannot display an image');
    }
    const references = requestEvidence(value.references ?? []);
    if (!Array.isArray(references) || references.length > 1024) throw new TypeError('Invalid visual reference catalog');
    for (const ref of references) {
        record(ref, ['referenceId', 'source', 'imageVersionId', 'assetId', 'contentHash', 'sessionId', 'identity', 'purpose', 'standard', 'allowedBranches', 'externalConnectionIds', 'revoked', 'createdAt']);
        assertVisualSourceRef(ref.source); id(ref.sessionId, 'ses'); text(ref.identity, 2048); integer(ref.createdAt);
        for (const branch of ref.allowedBranches ?? []) id(branch, 'br');
        for (const connection of ref.externalConnectionIds ?? []) id(connection, 'conn');
        if (ref.sessionId !== ref.source.sessionId) throw new TypeError('Reference source mismatch');
        id(ref.referenceId, 'vref'); id(ref.imageVersionId, 'imgv'); id(ref.assetId, 'asset'); assertIllustrationHead(ref.contentHash);
        if (!images.some(image => image.imageVersionId === ref.imageVersionId && image.assetId === ref.assetId) || !Array.isArray(ref.allowedBranches) || !Array.isArray(ref.externalConnectionIds)
            || !['identity', 'outfit', 'style', 'structure', 'vibe'].includes(ref.purpose) || typeof ref.standard !== 'boolean' || typeof ref.revoked !== 'boolean') throw new TypeError('Invalid visual reference binding');
    }
    if (new Set(references.map(ref => ref.referenceId)).size !== references.length) throw new TypeError('Duplicate visual reference binding');
    const state = { schemaVersion: 2, annotations, images, references };
    if (JSON.stringify({ annotations, imageVersionIds: images.map(image => image.imageVersionId), references }).length > 8 * 1024 * 1024) throw new TypeError('Illustration state exceeds budget');
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
    return { schemaVersion: 2, annotations, images: state.images.filter(item => ids.has(item.annotationId)), references: (state.references ?? []).filter(ref => state.images.some(image => image.imageVersionId === ref.imageVersionId && ids.has(image.annotationId))) };
}
