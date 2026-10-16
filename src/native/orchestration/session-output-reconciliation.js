import { ConflictError } from '../../storage/errors.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { readSessionTurnOutput } from '../session-turn-output.js';
import { SessionRepo } from '../repositories/session-repo.js';
import { readSessionOutputDescriptor, sessionOutputKey } from './session-output-contracts.js';
import { readEffect } from './effect-contracts.js';
import { readAttempt } from './controller-common.js';
import { observeReconciledEffect } from './effect-reconciliation.js';

const fail = () => { throw new ConflictError('native_orchestration_session_reconciliation_unavailable'); };
const equal = (left, right) => hash(left) === hash(right);

async function observationFor(execution, sessionCore, handle, tx, root, intent) {
    const { runs, budgetPort } = execution, fence = await runs.engine.nativeHostLifecycle.assertWriter(handle, tx);
    if (!(sessionCore?._sessions instanceof SessionRepo) || sessionCore._sessions._engine !== runs.engine
        || sessionCore.runs?.repo !== sessionCore._sessions || budgetPort.sessionCore !== sessionCore
        || root.hostBootId !== fence.hostBootId || root.hostGeneration !== fence.generation
        || !['dispatching', 'unknown', 'confirmed'].includes(intent.status) || !intent.dispatchToken
        || intent.capability !== 'chat.output' || intent.risk !== 'R2' || intent.requiresApproval || intent.approvalRef !== null) fail();
    const descriptor = await readSessionOutputDescriptor(tx, handle, root);
    if (!descriptor) fail();
    const { published, expected, identity } = descriptor, outputKey = sessionOutputKey(root), sessionId = expected.sessionId;
    const output = (await readAttempt(tx, handle, root, intent.nodeAttemptId)).doc;
    if (intent.effectId !== 'oeffect_' + hash({ runId: root.runId, outputKey, commitId: identity.commitId }).slice(0, 32)
        || intent.epoch !== published.receipt.epoch || output.epoch !== intent.epoch || intent.graphRevision !== output.graphRevision
        || output.nodeId !== root.graph.outputContract.ownerNodeId || output.effectiveGrantDigest !== published.receipt.grantDigest
        || intent.grantDigest !== output.effectiveGrantDigest || !equal(output.inputRefs, [published.receipt.resultRef])
        || output.inputDigest !== hash(output.inputRefs) || !equal(output.effectRefs, [intent.effectId]) || !equal(output.budgetRef, root.budgetAuthorityRef)
        || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest || intent.inputHash !== hash(intent.inputRef)
        || !equal(intent.actionRef, { kind: 'native_session_output', sessionId })
        || !equal(intent.targetRef, { kind: 'native_session', sessionId, outputKey })
        || intent.endpointBindingDigest !== hash({ domain: 'native_session', sessionId }) || intent.egressDigest !== hash({ domain: 'local_session', outputKey })
        || intent.budgetEnvelopeDigest !== published.modelIntent.budgetEnvelopeDigest
        || !equal(intent.inputRef, { kind: 'native_session_output', resultRef: published.receipt.resultRef, outputKey,
            invocationId: expected.invocationId, requestHash: expected.requestHash, fingerprint: hash(expected.envelope), ...identity, sourceRef: root.sourceBinding.sourceRef })
        || !equal(intent.dispatchPolicy, { idempotency: 'domain_key', operationKey: identity.commitId, reconcile: 'domain_status' })) fail();
    await budgetPort.verifyBudgetAttempt({ handle, tx, root, intent, budgetAttemptRef: intent.budgetAttemptRef });
    const work = await budgetPort.observeAttempt(handle, intent.budgetAttemptRef);
    if (intent.budgetAttemptRef.kind !== 'local_work' || intent.budgetAttemptRef.localWorkOrdinal !== 0
        || intent.budgetAttemptRef.reservationId !== null || work.kind !== 'session_output') fail();
    const original = await readSessionTurnOutput(sessionCore._sessions, handle, expected);
    if (!original) return null;
    const budgetObservationRef = work.status === 'settled'
        ? { ...intent.budgetAttemptRef, status: work.status, usageHash: hash(work.usage) } : null;
    return { observationId: 'session.output.reconcile:' + hash({ effectId: intent.effectId, receipt: hash(original.receipt), budgetObservationRef }),
        observedEpoch: intent.epoch, outcome: 'confirmed',
        dispatchEvidence: { kind: 'original_domain_receipt', reference: { ...original.domainReceiptRef, receiptIntegrity: hash(original.receipt) } },
        remoteOperationRef: null, domainReceiptRef: original.domainReceiptRef, budgetObservationRef,
        resultRefs: [published.receipt.resultRef], sourceRefs: [root.sourceBinding.sourceRef], reasonCode: 'session_output_reconciled' };
}

export async function verifySessionOutputReconciliation(execution, sessionCore, { handle, tx, root, intent, observation }) {
    const expected = await observationFor(execution, sessionCore, handle, tx, root, intent);
    if (!expected || !equal(expected, observation)) fail();
}

/** Read the original immutable commit. Never invokes a Session writer or Model. */
export async function reconcileSessionOutputEffect(execution, sessionCore, handle, request) {
    assertObject(request, ['runId', 'effectId'], 'Session output Effect reconciliation');
    const { runs, effects } = execution;
    if (effects.runs !== runs || runs.engine.hasActiveTransaction(handle)) fail();
    const current = await runs.engine.withTransaction(handle, async tx => {
        const root = await runs.get(handle, request.runId), intent = (await readEffect(tx, handle, root, request.effectId)).doc;
        return { root, observation: await observationFor(execution, sessionCore, handle, tx, root, intent) };
    });
    return observeReconciledEffect(execution, handle, { ...current, effectId: request.effectId });
}
