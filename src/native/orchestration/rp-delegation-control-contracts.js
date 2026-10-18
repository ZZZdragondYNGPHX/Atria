import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { assertRpControlWork } from './rp-control-work-contracts.js';
import { readRpDelegatedInputFacts } from './rp-delegated-quality-contracts.js';

export { readRpDelegatedGraphHistory } from './rp-delegated-quality-contracts.js';

const invalid = () => { throw new TypeError('Invalid RP delegated control facts'); };
export const isRpDelegatedControlGraph = root => root.sourceBinding.sourceAuthority === 'rp_chat' && !!root.parentRef
    && (root.graph.nodes.some(node => ['planner', 'review', 'judge'].includes(node.kind))
        || root.graph.nodes.filter(node => node.kind === 'agent').length >= 2);
export const rpDelegatedPlannerReaderOptions = { verifyControlWork: assertRpControlWork };

/** Public reads always start a new full fact boundary. No caller can supply
 * an input proof or a previously checked Model/Result/Review snapshot. */
export function readRpDelegatedControlInput(tx, handle, child, producer, intent, publicationSeq = child.eventSeq + 1) {
    return readRpDelegatedInputFacts(tx, handle, child, producer, intent, publicationSeq);
}


export function assertRpDelegatedClosure(child, history, closure) {
    if (history.rootDigest !== hash(child) || !history.settled
        || !equal(closure.reservationRefs, [{ reservationId: child.runId, parentReservationId: child.parentRef.depth === 1 ? null : history.lineage.parent.runId, status: 'released' }])
        || closure.budgetAttemptRefs.length !== history.budgetAttemptIds.length
        || new Set(closure.budgetAttemptRefs.map(ref => ref.attemptId)).size !== history.budgetAttemptIds.length
        || closure.budgetAttemptRefs.some(ref => !history.budgetAttemptIds.includes(ref.attemptId)
            || ref.reservationId !== child.runId || !equal(ref.authorityRef, child.budgetAuthorityRef))) invalid();
}
