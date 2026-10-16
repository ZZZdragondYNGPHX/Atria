import { ConflictError } from '../storage/errors.js';
import { assertTurnEnvelope } from './contracts.js';
import { assertNativeId } from './identity.js';
import { SessionRepo } from './repositories/session-repo.js';
import { hashNativeDocument as hash } from './repositories/common.js';

const invalid = () => { throw new ConflictError('native_session_turn_receipt_invalid'); };
const equal = (a, b) => hash(a) === hash(b);

/** Original Session publication identity. It grants no output or execution scope. */
export function sessionTurnCommitIdentity({ sessionId, branchId, expectedRevisionId, invocationId, requestHash, fingerprint }) {
    assertNativeId(sessionId, 'session'); assertNativeId(branchId, 'branch'); assertNativeId(expectedRevisionId, 'revision');
    if (typeof invocationId !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(invocationId)
        || requestHash !== null && (typeof requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(requestHash))
        || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) invalid();
    const operation = { kind: 'native_session_turn', sessionId, branchId, expectedRevisionId, invocationId };
    return { commitId: 'turn:' + hash(operation), requestFingerprint: hash({ ...operation, requestHash, fingerprint }) };
}

/** Read the exact original commit, Task record and immutable assistant Variant.
 * Historical evidence is independent of current Source authorization. */
export async function readSessionTurnOutput(repo, handle, { sessionId, branchId, expectedRevisionId, invocationId, requestHash, envelope: raw, provenance }) {
    if (!(repo instanceof SessionRepo)) throw new TypeError('Original Session repository required');
    const envelope = assertTurnEnvelope(raw), fingerprint = hash(envelope);
    const identity = sessionTurnCommitIdentity({ sessionId, branchId, expectedRevisionId, invocationId, requestHash, fingerprint });
    return repo._engine.withTransaction(handle, async () => {
        const receipt = await SessionRepo.prototype.getCommitReceipt.call(repo, handle, sessionId, identity.commitId);
        if (!receipt) return null;
        if (receipt.schemaVersion !== 1 || receipt.status !== 'committed' || receipt.commitId !== identity.commitId
            || receipt.fingerprint !== identity.requestFingerprint || receipt.sessionId !== sessionId
            || receipt.branchId !== branchId || receipt.expectedRevisionId !== expectedRevisionId) invalid();
        const snapshot = await SessionRepo.prototype.loadSnapshot.call(repo, handle, sessionId, { revisionId: receipt.revisionId });
        const records = snapshot.states.atri_task_results?.records.filter(record => record.invocationId === invocationId) ?? [];
        const record = records[0], entry = snapshot.timeline.at(-1);
        if (records.length !== 1 || snapshot.revision.revisionId !== receipt.revisionId || snapshot.revision.branchId !== branchId
            || snapshot.core.parentRevisionId !== expectedRevisionId || record.kind !== 'turn' || record.status !== 'applied'
            || record.fingerprint !== fingerprint || record.requestHash !== requestHash || record.anchorRevisionId !== expectedRevisionId
            || record.branchId !== branchId || record.storedRevisionId !== receipt.revisionId || !equal(record.outcomes, envelope.outcomes)
            || !equal(record.provenance, provenance) || record.authorityReceipt?.kind !== 'authority'
            || !entry || entry.role !== 'assistant' || entry.branchId !== branchId || entry.content !== envelope.narrative
            || entry.messageId !== record.authorityReceipt.messageId) invalid();
        const variant = snapshot.variants.find(variant => variant.messageId === entry.messageId && variant.variantId === entry.activeVariantId);
        if (!variant || variant.content !== envelope.narrative || !equal(variant.projection ?? null, envelope.projection ?? null)
            || !equal(variant.metadata?.atri_turn_diagnostics ?? [], envelope.diagnostics)) invalid();
        if (record.authorityReceipt.authorityId !== undefined) {
            const matches = snapshot.states.atri_action_receipts?.receipts.filter(action => action.idempotencyKey === 'authority:' + invocationId) ?? [];
            const action = matches[0];
            if (matches.length !== 1 || action.status !== 'committed' || action.assistantMessageId !== entry.messageId
                || action.baseRevisionId !== expectedRevisionId || action.expectedRevisionId !== expectedRevisionId || action.branchId !== branchId
                || action.committedRevisionId !== receipt.revisionId || action.authorityId !== record.authorityReceipt.authorityId
                || action.inputHash !== record.authorityReceipt.inputHash) invalid();
        }
        return { domainReceiptRef: { domain: 'native_session', sessionId, branchId, commitId: identity.commitId, revisionId: receipt.revisionId },
            receipt, snapshot, record, entry };
    });
}
