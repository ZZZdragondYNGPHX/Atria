import { hashNativeDocument } from './repositories/common.js';
import { MediaStudio } from './media-studio.js';
import { IllustrationService } from './illustration-service.js';
import { VisualStore } from './visual-store.js';
import { createNativeId } from './identity.js';
import { visualObject, visualError, visualFingerprint } from '../../public/shared/native-visual-contract.js';
import { withNativeResourceWrite } from './repositories/common.js';
import { assertWritable } from '../storage/read-only-mode.js';
import { resolveVisualSource } from './visual-source.js';
import { assertVisualDisclosure } from './visual-continuity.js';

export class VisualGallery {
    constructor({ host }) { this.host = host; this.media = new MediaStudio({ host }); this.store = this.media.store; this.assets = this.media.assets; }
    metadataId(input) { return visualFingerprint({ sessionId: input.sessionId, branchId: input.branchId, imageVersionId: input.imageVersionId }); }
    async query(handle, input) {
        visualObject(input, ['sessionId', 'branchId', 'offset', 'limit', 'annotationId', 'provider', 'operation', 'includeHidden', 'includeDeleted']);
        const offset = input.offset ?? 0, limit = input.limit ?? 24;
        if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) visualError('gallery_page_invalid');
        const presentation = await this.host.sessionCore._sessions.getIllustrations(handle, input.sessionId, { branchId: input.branchId });
        const all = presentation.state.images.filter(image => (!input.annotationId || image.annotationId === input.annotationId)
            && (!input.provider || image.requestSnapshot?.connection.providerAdapter === input.provider) && (!input.operation || image.mediaOperation?.kind === input.operation));
        const metadata = new Map((await this.store.list(handle, 'gallery')).map(row => [row.id, row]));
        const assets = new Set((await this.assets.listRefs(handle)).map(ref => ref.assetId));
        const current = await this.host.sessionCore.load(handle, input.sessionId);
        const actors = new Map(current.manifest.actors.map(actor => [actor.actorId, actor.displayName]));
        const annotations = new Map(presentation.state.annotations.map(annotation => [annotation.annotationId, annotation]));
        const reachable = new Map(), visible = [];
        for (const image of all.sort((a, b) => a.createdAt - b.createdAt || a.imageVersionId.localeCompare(b.imageVersionId))) {
            const id = this.metadataId({ ...input, imageVersionId: image.imageVersionId }), state = metadata.get(id) ?? { id, hidden: false, removed: false, deletedAt: null };
            if ((!input.includeHidden && (state.hidden || state.removed)) || (!input.includeDeleted && state.deletedAt)) continue;
            if (!assets.has(image.assetId)) continue;
            if (!reachable.has(image.annotationId)) {
                const annotation = annotations.get(image.annotationId);
                reachable.set(image.annotationId, (async () => {
                    if (!annotation) return false;
                    const anchor = annotation.originalAnchor ?? annotation.anchor;
                    const source = { kind: 'session', sessionId: input.sessionId, branchId: input.branchId, revisionId: anchor.revisionId, annotationId: annotation.annotationId,
                        anchor, timeKind: annotation.timeKind ?? 'present', ...(annotation.sceneId ? { sceneId: annotation.sceneId, shotId: annotation.shotId } : {}) };
                    try { const resolved = await resolveVisualSource(this.host.sessionCore, handle, source); if (!resolved.frozen) assertVisualDisclosure(resolved.view, source); return true; } catch { return false; }
                })());
            }
            if (!await reachable.get(image.annotationId)) continue;
            visible.push({ image, id, state });
        }
        const items = visible.slice(offset, offset + limit).map(({ image, id, state }) => ({ imageVersionId: image.imageVersionId, annotationId: image.annotationId, assetId: image.assetId, width: image.width, height: image.height,
            alt: image.alt, createdAt: image.createdAt, sceneId: image.mediaOperation?.source.sceneId ?? null, shotId: image.mediaOperation?.source.shotId ?? null,
            identities: (image.requestSnapshot?.ir.participants ?? []).map(p => ({ id: p.participantId ?? p.actorId ?? p.provisionalId, name: p.evidence?.speaker?.displayName ?? actors.get(p.actorId) ?? p.provisionalId?.split(':').at(-1) ?? '角色' })),
            operation: image.mediaOperation?.kind ?? 'txt2img', provider: image.requestSnapshot?.connection.providerAdapter ?? '',
            metadataRevision: metadata.has(id) ? hashNativeDocument(state) : null, selected: annotations.get(image.annotationId)?.selectedImageVersionId === image.imageVersionId, metadata: state }));
        return { head: presentation.head, total: visible.length, items, nextOffset: offset + limit < visible.length ? offset + limit : null };
    }
    async history(handle, input) {
        const base = await this.media.image(handle, input);
        return { image: base.image, head: base.presentation.head, parents: base.image.mediaOperation?.parentImageVersionIds ?? [],
            children: base.presentation.state.images.filter(image => image.mediaOperation?.parentImageVersionIds.includes(base.image.imageVersionId)).map(image => image.imageVersionId),
            references: await this.assets.getReferences(handle, base.image.assetId), referenceBindings: base.presentation.state.references.filter(ref => !ref.revoked) };
    }
    async select(handle, input) {
        const base = await this.media.image(handle, input);
        if (input.expectedHead !== base.presentation.head) visualError('head_conflict');
        return new IllustrationService({ sessionRepo: this.host.sessionCore._sessions }).selectImageVersion(handle, input.sessionId,
            { branchId: input.branchId, annotationId: base.image.annotationId, imageVersionId: input.imageVersionId, expectedHead: input.expectedHead });
    }
    async mark(handle, input) {
        visualObject(input, ['sessionId', 'branchId', 'imageVersionId', 'action', 'expectedRevision']);
        if (!['hide', 'show', 'remove', 'restore', 'soft-delete'].includes(input.action)) visualError('gallery_action_invalid');
        await this.media.image(handle, input);
        const id = this.metadataId(input), row = await this.store.read(handle, 'gallery', id), previous = row.value ?? { id, sessionId: input.sessionId, branchId: input.branchId, imageVersionId: input.imageVersionId, hidden: false, removed: false, deletedAt: null };
        const next = { ...previous, ...(input.action === 'hide' ? { hidden: true } : input.action === 'show' ? { hidden: false } : input.action === 'remove' ? { removed: true }
            : input.action === 'restore' ? { hidden: false, removed: false, deletedAt: null } : { deletedAt: Date.now() }) };
        return this.store.write(handle, 'gallery', id, next, input.expectedRevision);
    }
    async promote(handle, input) {
        visualObject(input, ['sessionId', 'branchId', 'imageVersionId', 'purpose', 'identity', 'standard', 'allowedBranches', 'externalConnectionIds']);
        const base = await this.media.image(handle, input), current = await this.host.sessionCore.load(handle, input.sessionId);
        if (!['identity', 'outfit', 'style', 'structure', 'vibe'].includes(input.purpose) || typeof input.standard !== 'boolean' || !Array.isArray(input.allowedBranches)
            || !input.allowedBranches.length || !Array.isArray(input.externalConnectionIds) || input.standard && input.purpose !== 'identity') visualError('reference_invalid');
        if (input.allowedBranches.some(id => !current.graph.some(node => node.branchId === id)) || !input.standard && input.allowedBranches.some(id => id !== input.branchId)) visualError('reference_scope_invalid');
        const identities = base.image.requestSnapshot?.ir.participants.map(p => p.participantId ?? p.actorId ?? p.provisionalId) ?? [];
        if (input.purpose === 'identity' && !identities.includes(input.identity)) visualError('reference_identity_invalid');
        for (const connectionId of input.externalConnectionIds) await this.host.persistence.getConnectionProfile(handle, connectionId);
        const referenceId = createNativeId('visualReference'), value = { referenceId, source: base.source, imageVersionId: base.image.imageVersionId,
            assetId: base.asset.assetId, contentHash: base.asset.contentHash, sessionId: input.sessionId, identity: input.identity ?? '', purpose: input.purpose,
            standard: input.standard, allowedBranches: input.allowedBranches, externalConnectionIds: input.externalConnectionIds, revoked: false, createdAt: Date.now() };
        return this.host.sessionCore._sessions.updateIllustrations(handle, input.sessionId, state => ({ ...state, references: [...(state.references ?? []), value] }), { branchId: input.branchId, expectedHead: base.presentation.head });
    }
    async revoke(handle, input) {
        const presentation = await this.host.sessionCore._sessions.getIllustrations(handle, input.sessionId, { branchId: input.branchId });
        if (!presentation.state.references.some(ref => ref.referenceId === input.referenceId)) visualError('reference_unavailable');
        return this.host.sessionCore._sessions.updateIllustrations(handle, input.sessionId, state => ({ ...state, references: state.references.map(ref => ref.referenceId === input.referenceId ? { ...ref, revoked: true } : ref) }),
            { branchId: input.branchId, expectedHead: input.expectedHead });
    }
}
export class VisualMediaGc {
    constructor({ host, now = Date.now }) { this.store = new VisualStore({ engine: host.persistence._engine, now }); this.assets = host.packageInstaller._assetStore; this.now = now; }
    async preview(handle, { offset = 0, limit = 32 } = {}) {
        if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 128) visualError('gc_page_invalid');
        const refs = await this.assets.listRefs(handle), items = [];
        for (const ref of refs.slice(offset, offset + limit)) items.push({ assetId: ref.assetId, contentHash: ref.contentHash, references: await this.assets.getReferences(handle, ref.assetId) });
        return { total: refs.length, items, nextOffset: offset + limit < refs.length ? offset + limit : null };
    }
    async mark(handle, assetId, { graceDays = 7, category = 'temporary' } = {}) {
        assertWritable();
        if (!['temporary', 'soft-deleted'].includes(category) || !Number.isFinite(graceDays) || graceDays < (category === 'soft-deleted' ? 30 : 7)) visualError('gc_grace_invalid');
        const ref = await this.assets.getRef(handle, assetId); if (!ref) visualError('asset_missing');
        const references = await this.assets.getReferences(handle, assetId);
        if (references.length) return { assetId, blocked: references };
        const row = await this.store.read(handle, 'gc', assetId);
        if (row.value?.contentHash === ref.contentHash) return row;
        return this.store.write(handle, 'gc', assetId, { assetId, contentHash: ref.contentHash, markedAt: this.now(), eligibleAt: this.now() + graceDays * 86400000, category, phase: 'quarantined' }, row.revision);
    }
    async sweep(handle, assetId) {
        assertWritable(); const row = await this.store.read(handle, 'gc', assetId);
        if (!row.value || row.value.eligibleAt > this.now() || row.value.phase !== 'quarantined') visualError('gc_not_due');
        return withNativeResourceWrite(handle, 'asset:' + assetId, async () => {
            const ref = await this.assets.getRef(handle, assetId), references = await this.assets.getReferences(handle, assetId);
            if (!ref || ref.contentHash !== row.value.contentHash || references.length) return { assetId, blocked: references, changed: !ref || ref.contentHash !== row.value.contentHash };
            await this.assets._deleteRef(handle, assetId);
            // Blob collection still uses AssetStore's lease-aware two-scan
            // maintenance. Removing the ref alone never bypasses Blob roots.
            return this.store.write(handle, 'gc', assetId, { ...row.value, phase: 'swept', sweptAt: this.now() }, row.revision);
        });
    }
}
