import { assertIllustrationDraft } from '../../public/shared/illustration-plugin-contract.js';
import { createNativeId } from './identity.js';
import { illustrationContentHash } from './session-illustrations.js';
import { assertIllustrationImage, assertIllustrationAnchor } from '../../public/shared/native-illustration-contract.js';
import { ConflictError, NotFoundError } from '../storage/errors.js';
import { hashNativeDocument } from './repositories/common.js';
import { assertIllustrationPromptVersions } from '../../public/shared/native-illustration-contract.js';
import { captureIllustrationContext } from './illustration-context.js';

// Both UI and future generation adapters write through the same SessionRepo.
export class IllustrationService {
    constructor({ sessionRepo, sessionCore }) { this.sessions = sessionRepo; this.core = sessionCore; }

    async createAnnotation(handle, sessionId, { revisionId, messageId, variantId, start, end, quote, draft, expectedHead, branchId }) {
        const snapshot = await this.sessions.loadSnapshot(handle, sessionId, { revisionId });
        const entry = snapshot.timeline.find(item => item.messageId === messageId && item.activeVariantId === variantId);
        if (!entry || !['assistant', 'user'].includes(entry.role)) throw new TypeError('Illustration requires committed narrative');
        if (branchId !== undefined && branchId !== snapshot.revision.branchId) throw new ConflictError('native_illustration_branch_conflict');
        const anchor = assertIllustrationAnchor({ revisionId, messageId, variantId, start, end, quote, contentHash: illustrationContentHash(entry.content) });
        const annotation = { annotationId: createNativeId('annotation'), anchor, selectedImageVersionId: null, createdAt: Date.now(), ...(draft === undefined ? {} : { draft: assertIllustrationDraft(draft) }) };
        if (this.core) {
            try { annotation.promptContext = await captureIllustrationContext(this.core, handle, sessionId, anchor); } catch (error) {
                // A legacy head-only save can lack this source's history. Manual
                // prompting remains available; generation must not invent facts.
                if (error.code !== 'native_illustration_source_unavailable') throw error;
            }
        }
        return this.sessions.updateIllustrations(handle, sessionId, state => ({ ...state, annotations: [...state.annotations, annotation] }), { expectedHead, branchId: snapshot.revision.branchId });
    }

    _annotation(state, annotationId) {
        const annotation = state.annotations.find(item => item.annotationId === annotationId);
        if (!annotation) throw new NotFoundError('illustration annotation', { annotationId });
        return annotation;
    }

    updateAnnotation(handle, sessionId, { annotationId, draft, expectedHead, branchId }) {
        const normalized = assertIllustrationDraft(draft);
        return this.sessions.updateIllustrations(handle, sessionId, state => {
            const annotation = this._annotation(state, annotationId);
            if (annotation.deletedAt !== undefined) throw new ConflictError('native_illustration_deleted');
            return { ...state, annotations: state.annotations.map(item => item !== annotation ? item : { ...item, draft: normalized }) };
        }, { expectedHead, branchId });
    }

    addPromptVersion(handle, sessionId, { annotationId, version, baseDraftHash, branchId }) {
        version = assertIllustrationPromptVersions([version])[0];
        return this.sessions.updateIllustrations(handle, sessionId, state => {
            const annotation = this._annotation(state, annotationId);
            if (annotation.deletedAt !== undefined) throw new ConflictError('native_illustration_deleted');
            if ((annotation.promptVersions ?? []).some(item => item.promptVersionId === version.promptVersionId)) throw new ConflictError('native_illustration_version_conflict');
            return { ...state, annotations: state.annotations.map(item => item !== annotation ? item : {
                ...item, promptVersions: [...(item.promptVersions ?? []), version],
                ...(hashNativeDocument(item.draft ?? null) === baseDraftHash ? { draft: version.draft } : {}),
            }) };
        }, { branchId });
    }

    deleteAnnotation(handle, sessionId, { annotationId, expectedHead, branchId }) {
        return this.sessions.updateIllustrations(handle, sessionId, state => {
            const annotation = this._annotation(state, annotationId);
            return { ...state, annotations: state.annotations.map(item => item !== annotation ? item : { ...item, deletedAt: item.deletedAt ?? Date.now(), selectedImageVersionId: null }) };
        }, { expectedHead, branchId });
    }

    addImageVersion(handle, sessionId, { annotationId, imageVersionId = createNativeId('imageVersion'), assetId, width, height, alt,
        prompt = '', negativePrompt = '', parameters = {}, requestSnapshot, expectedHead, branchId }) {
        const image = assertIllustrationImage({ annotationId, imageVersionId, assetId, width, height, alt, prompt, negativePrompt, parameters,
            ...(requestSnapshot === undefined ? {} : { requestSnapshot }), createdAt: Date.now() });
        return this.sessions.updateIllustrations(handle, sessionId, state => {
            const annotation = this._annotation(state, annotationId);
            if (state.images.some(item => item.imageVersionId === imageVersionId)) throw new ConflictError('native_illustration_version_conflict');
            // A late result may enter history, but never resurrect a deleted mark.
            return { ...state, images: [...state.images, image], annotations: state.annotations.map(item => item !== annotation || item.deletedAt !== undefined
                ? item : { ...item, selectedImageVersionId: imageVersionId }) };
        }, { expectedHead, branchId });
    }

    selectImageVersion(handle, sessionId, { annotationId, imageVersionId, expectedHead, branchId }) {
        return this.sessions.updateIllustrations(handle, sessionId, state => {
            const annotation = this._annotation(state, annotationId);
            if (annotation.deletedAt !== undefined) throw new ConflictError('native_illustration_deleted');
            if (imageVersionId !== null && !state.images.some(item => item.annotationId === annotationId && item.imageVersionId === imageVersionId)) throw new TypeError('Image version belongs to another annotation');
            return { ...state, annotations: state.annotations.map(item => item !== annotation ? item : { ...item, selectedImageVersionId: imageVersionId }) };
        }, { expectedHead, branchId });
    }
}
