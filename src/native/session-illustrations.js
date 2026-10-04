import { createHash } from 'node:crypto';
import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';
import { hashNativeDocument } from './repositories/common.js';
import { ILLUSTRATION_NAMESPACE, emptyIllustrations, assertIllustrationState, illustrationAnchorMatches } from '../../public/shared/native-illustration-contract.js';

export const illustrationContentHash = content => createHash('sha256').update(content).digest('hex');

export async function readIllustrationState(tx, handle, sessionId, head) {
    if (!head) return emptyIllustrations();
    const record = await tx.getResource({ kind: K.sessionState, handle, sessionId, namespace: ILLUSTRATION_NAMESPACE, head });
    if (!record || record.integrity !== head || hashNativeDocument(record.doc) !== head) throw new TypeError('Illustration state integrity mismatch');
    return assertIllustrationState(record.doc);
}

export async function validateIllustrationDependencies(tx, handle, sessionId, state) {
    for (const item of state.annotations) {
        if ((item.promptContext && item.promptContext.source.sessionId !== sessionId)
            || item.promptVersions?.some(version => version.requestSnapshot.contextPlan.source.sessionId !== sessionId)) throw new TypeError('Illustration context belongs to another session');
        const { anchor } = item;
        const variant = (await tx.getResource({ kind: K.timelineVariant, handle, sessionId, messageId: anchor.messageId, variantId: anchor.variantId }))?.doc;
        const revision = (await tx.getResource({ kind: K.sessionRevision, handle, sessionId, revisionId: anchor.revisionId }))?.doc;
        const timeline = revision && (await tx.getResource({ kind: K.sessionState, handle, sessionId, namespace: 'atri_timeline', head: revision.stateHeads.atri_timeline }))?.doc;
        if (!variant || !illustrationAnchorMatches(anchor, variant.content) || illustrationContentHash(variant.content) !== anchor.contentHash
            || !timeline?.some(entry => entry.messageId === anchor.messageId && entry.activeVariantId === anchor.variantId)) throw new TypeError('Illustration anchor dependency mismatch');
    }
    for (const image of state.images) {
        if (image.requestSnapshot && image.requestSnapshot.source.sessionId !== sessionId) throw new TypeError('Illustration image belongs to another session');
        const ref = (await tx.getResource({ kind: K.assetRef, handle, assetId: image.assetId }))?.doc;
        if (!ref || !['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(ref.mediaType)) throw new TypeError('Illustration image asset is unavailable');
    }
}
