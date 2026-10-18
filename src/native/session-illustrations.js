import { materializeIllustrations, IMAGE_VERSION_NAMESPACE } from '../../public/shared/native-illustration-storage.js';
import { createHash } from 'node:crypto';
import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';
import { readTimelineIndex } from './timeline-index.js';
import { ILLUSTRATION_NAMESPACE, emptyIllustrations, illustrationAnchorMatches } from '../../public/shared/native-illustration-contract.js';

export const illustrationContentHash = content => createHash('sha256').update(content).digest('hex');

export async function readIllustrationState(tx, handle, sessionId, head) {
    if (!head) return emptyIllustrations();
    const record = await tx.getResource({ kind: K.sessionState, handle, sessionId, namespace: ILLUSTRATION_NAMESPACE, head });
    if (!record || record.integrity !== head) throw new TypeError('Illustration state integrity mismatch');
    const artifacts = new Map();
    for (const ref of record.doc.imageRefs ?? []) {
        const artifact = await tx.getResource({ kind: K.sessionState, handle, sessionId, namespace: IMAGE_VERSION_NAMESPACE, head: ref.head });
        if (!artifact || artifact.integrity !== ref.head) throw new TypeError('Image artifact integrity mismatch');
        artifacts.set(ref.head, artifact.doc);
    }
    return materializeIllustrations(record.doc, head => artifacts.get(head));
}

export async function validateIllustrationDependencies(tx, handle, sessionId, state) {
    for (const item of state.annotations) {
        if ((item.promptContext && item.promptContext.source.sessionId !== sessionId)
            || item.promptVersions?.some(version => version.requestSnapshot.contextPlan.source.sessionId !== sessionId)) throw new TypeError('Illustration context belongs to another session');
        const { anchor } = item;
        const variant = (await tx.getResource({ kind: K.timelineVariant, handle, sessionId, messageId: anchor.messageId, variantId: anchor.variantId }))?.doc;
        const revision = (await tx.getResource({ kind: K.sessionRevision, handle, sessionId, revisionId: anchor.revisionId }))?.doc;
        const timeline = revision && (await tx.getResource({ kind: K.sessionState, handle, sessionId, namespace: 'atri_timeline', head: revision.stateHeads.atri_timeline }))?.doc;
        const selections = timeline && await readTimelineIndex(tx, handle, sessionId, timeline);
        if (!variant || !illustrationAnchorMatches(anchor, variant.content) || illustrationContentHash(variant.content) !== anchor.contentHash
            || !selections?.some(entry => entry.messageId === anchor.messageId && entry.activeVariantId === anchor.variantId)) throw new TypeError('Illustration anchor dependency mismatch');
    }
    for (const image of state.images) {
        if (image.requestSnapshot && image.requestSnapshot.source.sessionId !== sessionId) throw new TypeError('Illustration image belongs to another session');
        const ref = (await tx.getResource({ kind: K.assetRef, handle, assetId: image.assetId }))?.doc;
        if (!ref || !['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(ref.mediaType)) throw new TypeError('Illustration image asset is unavailable');
        for (const input of image.mediaOperation?.inputAssets ?? []) {
            const asset = (await tx.getResource({ kind: K.assetRef, handle, assetId: input.assetId }))?.doc;
            if (!asset || asset.contentHash !== input.contentHash) throw new TypeError('Media input asset integrity mismatch');
        }
        if (image.mediaOperation?.mask) {
            const mask = image.mediaOperation.mask, parent = state.images.find(item => item.imageVersionId === image.mediaOperation.parentImageVersionIds[0]);
            const base = parent && (await tx.getResource({ kind: K.assetRef, handle, assetId: parent.assetId }))?.doc;
            const raster = (await tx.getResource({ kind: K.assetRef, handle, assetId: mask.assetId }))?.doc;
            if (!base || base.contentHash !== mask.baseHash || mask.width !== parent.width || mask.height !== parent.height || raster.size !== mask.width * mask.height
                || raster.mediaType !== 'application/x-atria-mask-gray8') throw new TypeError('Media Mask/base geometry mismatch');
        }
    }
}
