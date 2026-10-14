import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { createNativeId, assertNativeId } from './identity.js';
import { IllustrationImageService } from './illustration-image-service.js';
import { VisualContinuity, assertVisualDisclosure } from './visual-continuity.js';
import { resolveVisualSource } from './visual-source.js';
import { maskGeometry, replayMask, assertMaskCommand } from '../../public/shared/native-mask.js';
import { visualObject, visualError } from '../../public/shared/native-visual-contract.js';
import { assertWritable } from '../storage/read-only-mode.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export class MediaStudio {
    constructor({ host, images = new IllustrationImageService({ host }) }) { this.host = host; this.images = images; this.store = images.store; this.assets = host.packageInstaller._assetStore; }
    async image(handle, { sessionId, branchId, imageVersionId }) {
        assertNativeId(sessionId, 'session'); assertNativeId(branchId, 'branch'); assertNativeId(imageVersionId, 'imageVersion');
        const presentation = await this.host.sessionCore._sessions.getIllustrations(handle, sessionId, { branchId });
        const image = presentation.state.images.find(item => item.imageVersionId === imageVersionId), annotation = image && presentation.state.annotations.find(a => a.annotationId === image.annotationId);
        if (!image || !annotation) visualError('image_unavailable');
        const source = { kind: 'session', sessionId, branchId, revisionId: (annotation.originalAnchor ?? annotation.anchor).revisionId, annotationId: annotation.annotationId, anchor: annotation.originalAnchor ?? annotation.anchor,
            timeKind: annotation.timeKind ?? 'present', ...(annotation.sceneId ? { sceneId: annotation.sceneId, shotId: annotation.shotId } : {}) };
        const { view, frozen } = await resolveVisualSource(this.host.sessionCore, handle, source); if (!frozen) assertVisualDisclosure(view, source);
        const asset = await this.assets.getRef(handle, image.assetId); if (!asset) visualError('asset_missing');
        return { presentation, image, annotation, source, asset };
    }
    async createDraft(handle, input) {
        visualObject(input, ['sessionId', 'branchId', 'imageVersionId']); assertWritable();
        const base = await this.image(handle, input); maskGeometry(base.image.width, base.image.height);
        const bytes = Buffer.alloc(base.image.width * base.image.height), checkpoint = await this.putCheckpoint(handle, bytes);
        const draftId = createNativeId('maskDraft'), value = { schemaVersion: 2, draftId, source: base.source, imageVersionId: base.image.imageVersionId,
            baseAssetId: base.asset.assetId, baseHash: base.asset.contentHash, width: base.image.width, height: base.image.height,
            checkpoint, commands: [], cursor: 0, createdAt: Date.now(), updatedAt: Date.now() };
        return this.store.write(handle, 'draft', draftId, value, null);
    }
    async putCheckpoint(handle, bytes) {
        const compressed = deflateSync(bytes), ref = { assetId: createNativeId('asset'), contentHash: digest(compressed), size: compressed.length, mediaType: 'application/x-atria-mask-checkpoint' };
        await this.assets.put(handle, ref, compressed);
        return { assetId: ref.assetId, contentHash: ref.contentHash, rasterHash: digest(bytes), pixels: bytes.length };
    }
    async draft(handle, draftId, scope = null) {
        assertNativeId(draftId, 'maskDraft');
        const row = await this.store.read(handle, 'draft', draftId); if (!row.value) visualError('draft_missing');
        const value = row.value;
        if (scope && (scope.sessionId !== value.source.sessionId || scope.branchId !== value.source.branchId)) visualError('draft_scope_conflict');
        if (Date.now() - value.updatedAt > 30 * 86400000) visualError('draft_expired');
        const base = await this.image(handle, { sessionId: value.source.sessionId, branchId: value.source.branchId, imageVersionId: value.imageVersionId });
        if (base.asset.contentHash !== value.baseHash || base.image.width !== value.width || base.image.height !== value.height) visualError('draft_base_conflict');
        return row;
    }
    async raster(handle, draft) {
        const input = await this.assets.read(handle, draft.checkpoint.assetId);
        if (input.ref.contentHash !== draft.checkpoint.contentHash) visualError('checkpoint_corrupt');
        let checkpoint; try { checkpoint = inflateSync(input.bytes, { maxOutputLength: draft.width * draft.height }); } catch { visualError('checkpoint_corrupt'); }
        if (checkpoint.length !== draft.width * draft.height || digest(checkpoint) !== draft.checkpoint.rasterHash) visualError('checkpoint_corrupt');
        return Buffer.from(replayMask(checkpoint, draft.commands, draft.cursor, draft.width, draft.height));
    }
    async saveDraft(handle, input) {
        visualObject(input, ['sessionId', 'branchId', 'draftId', 'commands', 'cursor', 'expectedRevision']); assertWritable();
        const row = await this.draft(handle, input.draftId), draft = row.value;
        if (input.sessionId !== draft.source.sessionId || input.branchId !== draft.source.branchId) visualError('draft_scope_conflict');
        if (!Array.isArray(input.commands) || input.commands.length > 100 || input.commands.reduce((sum, command) => sum + (command.points?.length ?? 0), 0) > 8192) visualError('mask_command_limit');
        const commands = input.commands.map(command => assertMaskCommand(command, draft.width, draft.height));
        const next = { ...draft, commands, cursor: input.cursor, updatedAt: Date.now() }; const pixels = await this.raster(handle, next);
        if (commands.length >= (draft.recentCommandCount ?? 0) + 50) { next.recentCheckpoint = await this.putCheckpoint(handle, pixels); next.recentCommandCount = commands.length; }
        return this.store.write(handle, 'draft', input.draftId, next, input.expectedRevision);
    }
    async checkpoint(handle, input, bytes) {
        visualObject(input, ['sessionId', 'branchId', 'draftId', 'expectedRevision', 'commands', 'cursor']);
        assertWritable();
        const row = await this.draft(handle, input.draftId), draft = row.value;
        if (input.sessionId !== draft.source.sessionId || input.branchId !== draft.source.branchId || bytes.length !== draft.width * draft.height || input.expectedRevision !== row.revision) visualError('draft_conflict');
        const checkpoint = await this.putCheckpoint(handle, bytes);
        const commands = input.commands ?? [], cursor = input.cursor ?? 0;
        if (!Array.isArray(commands) || commands.length > 100 || commands.reduce((n, c) => n + (c.points?.length ?? 0), 0) > 8192) visualError('mask_command_limit');
        replayMask(bytes, commands, cursor, draft.width, draft.height);
        return this.store.write(handle, 'draft', draft.draftId, { ...draft, checkpoint, commands, cursor, recentCommandCount: 0, recentCheckpoint: null, updatedAt: Date.now() }, row.revision);
    }
    async freezeMask(handle, input) {
        visualObject(input, ['sessionId', 'branchId', 'imageVersionId', 'draftId', 'expectedRevision']);
        const row = await this.draft(handle, input.draftId, input); if (row.revision !== input.expectedRevision) visualError('draft_conflict');
        const draft = row.value, bytes = await this.raster(handle, draft), ref = { assetId: createNativeId('asset'), contentHash: digest(bytes), size: bytes.length, mediaType: 'application/x-atria-mask-gray8' };
        if (input.imageVersionId !== undefined && input.imageVersionId !== draft.imageVersionId) visualError('draft_scope_conflict');
        await this.assets.put(handle, ref, bytes);
        const mask = { maskArtifactId: createNativeId('maskArtifact'), assetId: ref.assetId, contentHash: ref.contentHash, baseHash: draft.baseHash,
            width: draft.width, height: draft.height, semantic: 'gray8-0-preserve-255-edit' };
        await this.store.write(handle, 'mask', mask.maskArtifactId, { ...mask, source: draft.source, imageVersionId: draft.imageVersionId, createdAt: Date.now() }, null);
        return mask;
    }
    async prepare(handle, input) {
        visualObject(input, ['sessionId', 'branchId', 'imageVersionId', 'operation', 'prompt', 'imageTargetId', 'imageRenderingId', 'maskArtifactId', 'referenceIds', 'omittedPreferred', 'preserveOutsideMask', 'expectedTargetFingerprint', 'expectedConnectionFingerprint']);
        const base = await this.image(handle, input);
        if (!['regenerate', 'img2img', 'inpaint', 'upscale'].includes(input.operation)) visualError('operation_invalid');
        const references = [], inputAssets = [], parents = [base.image.imageVersionId];
        if (input.operation !== 'regenerate') { references.push({ assetId: base.asset.assetId, contentHash: base.asset.contentHash, purpose: 'base', source: base.source, externalConnectionIds: [] }); inputAssets.push({ assetId: base.asset.assetId, contentHash: base.asset.contentHash, purpose: 'base' }); }
        let mask = null;
        if (input.operation === 'inpaint') {
            const stored = (await this.store.read(handle, 'mask', input.maskArtifactId)).value;
            if (!stored || stored.createdAt && Date.now() - stored.createdAt > 7 * 86400000 || stored.imageVersionId !== base.image.imageVersionId || stored.source.branchId !== input.branchId || stored.source.sessionId !== input.sessionId || stored.baseHash !== base.asset.contentHash
                || stored.width !== base.image.width || stored.height !== base.image.height) visualError('mask_base_conflict');
            const { source: _source, imageVersionId: _image, createdAt: _createdAt, ...artifact } = stored; mask = artifact;
            references.push({ assetId: mask.assetId, contentHash: mask.contentHash, purpose: 'mask', source: base.source, externalConnectionIds: [] }); inputAssets.push({ assetId: mask.assetId, contentHash: mask.contentHash, purpose: 'mask' });
        }
        if (!Array.isArray(input.referenceIds ?? []) || (input.referenceIds ?? []).length > 16) visualError('reference_invalid');
        const eligibleReferences = input.referenceIds?.length ? (await new VisualContinuity({ host: this.host }).references(handle, base.source, null, ['identity', 'outfit', 'style', 'structure', 'vibe'])).selected : [];
        const participantIds = new Set((base.image.requestSnapshot?.ir.participants ?? []).map(participant => participant.actorId ?? participant.provisionalId));
        for (const referenceId of input.referenceIds ?? []) {
            const reference = eligibleReferences.find(ref => ref.referenceId === referenceId);
            if (!reference) visualError('reference_unauthorized');
            if (['identity', 'outfit'].includes(reference.purpose) && !participantIds.has(reference.identity)) visualError('reference_identity_invalid');
            references.push({ assetId: reference.assetId, contentHash: reference.contentHash, purpose: reference.purpose, source: reference.source, externalConnectionIds: reference.externalConnectionIds });
            inputAssets.push({ assetId: reference.assetId, contentHash: reference.contentHash, purpose: reference.purpose });
        }
        const mediaOperation = { schemaVersion: 2, mediaOperationId: createNativeId('mediaOperation'), kind: input.operation, source: base.source,
            parentImageVersionIds: parents, inputAssets, mask, geometry: null };
        return this.images.prepare(handle, { sessionId: input.sessionId, branchId: input.branchId, annotationId: base.annotation.annotationId, expectedHead: base.presentation.head,
            ...(input.imageTargetId ? { imageTargetId: input.imageTargetId } : {}), ...(input.imageRenderingId ? { imageRenderingId: input.imageRenderingId } : {}), operation: input.operation,
            ...(input.expectedTargetFingerprint ? { expectedTargetFingerprint: input.expectedTargetFingerprint } : {}), ...(input.expectedConnectionFingerprint ? { expectedConnectionFingerprint: input.expectedConnectionFingerprint } : {}),
            omittedPreferred: input.omittedPreferred ?? [] }, { media: { mediaOperation, references, prompt: input.prompt ?? base.image.prompt,
            preserveOutsideMask: input.preserveOutsideMask === true } });
    }
}
