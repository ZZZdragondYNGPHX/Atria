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
        const view = await core.load(handle, source.sessionId, { revisionId });
        if (revisionId === source.revisionId) {
            const entry = view.timeline.find(item => item.messageId === source.anchor.messageId && item.activeVariantId === source.anchor.variantId);
            if (!entry || !illustrationAnchorMatches(source.anchor, entry.content) || illustrationContentHash(entry.content) !== source.anchor.contentHash) visualError('source_mismatch');
            return { source, view, entry };
        }
        revisionId = view.core.parentRevisionId;
    }
    visualError('source_unreachable');
}
