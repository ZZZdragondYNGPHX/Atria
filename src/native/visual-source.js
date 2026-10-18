import { hashNativeDocument } from './repositories/common.js';
import { assertVisualSourceRef, visualError } from '../../public/shared/native-visual-contract.js';
import { illustrationAnchorMatches } from '../../public/shared/native-illustration-contract.js';
import { illustrationContentHash } from './session-illustrations.js';

// SessionCore is the sole narrative authority. A source must be a committed
// ancestor of the requested Branch, never merely a readable sibling revision.
export async function resolveVisualSource(core, handle, sourceValue) {
    const source = assertVisualSourceRef(sourceValue);
    await core.runs.assert(handle, source.sessionId, 'inspect');
    const current = await core.load(handle, source.sessionId);
    const branch = current.graph.find(item => item.branchId === source.branchId);
    if (!branch) visualError('source_unreachable');
    let revisionId = source.branchId === current.revision.branchId ? current.revision.revisionId : branch.headRevisionId;
    const seen = new Set();
    while (revisionId && !seen.has(revisionId)) {
        seen.add(revisionId);
        if (revisionId === source.revisionId) {
            const view = await core.load(handle, source.sessionId, { revisionId, illustrationAnchor: source.anchor });
            const entry = view.timeline.find(item => item.messageId === source.anchor.messageId && item.activeVariantId === source.anchor.variantId);
            if (!entry || !illustrationAnchorMatches(source.anchor, entry.content) || illustrationContentHash(entry.content) !== source.anchor.contentHash) visualError('source_mismatch');
            return { source, view, entry };
        }
        const revision = await core._sessions.getRevision(handle, source.sessionId, revisionId);
        const head = revision?.stateHeads.atri_session_core;
        const state = head && await core._sessions.getState(handle, source.sessionId, 'atri_session_core', head);
        if (!state) visualError('source_missing');
        revisionId = state.parentRevisionId;
    }
    // An ironman checkpoint keeps an immutable visual source packet while its
    // narrative history remains head-only. The explicit presentation alias may
    // grant that frozen packet only, never a read of missing/private World data.
    const presentation = await core._sessions.getIllustrations(handle, source.sessionId, { branchId: source.branchId });
    const annotation = presentation.state.annotations.find(a => a.annotationId === source.annotationId);
    const entry = current.timeline.find(e => e.messageId === source.anchor.messageId && e.activeVariantId === source.anchor.variantId);
    if (annotation?.originalAnchor && annotation.sourceProof.originalBranchId === source.branchId
        && hashNativeDocument(annotation.originalAnchor) === hashNativeDocument(source.anchor) && entry
        && illustrationAnchorMatches(source.anchor, entry.content) && illustrationContentHash(entry.content) === source.anchor.contentHash) {
        const packets = presentation.state.images.filter(image => image.annotationId === annotation.annotationId && image.requestSnapshot?.source.revisionId === source.revisionId);
        return { source, view: null, entry, frozen: { sourceProof: annotation.sourceProof, packets, promptContext: annotation.promptContext ?? null } };
    }
    visualError('source_unreachable');
}
