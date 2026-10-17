import { assertObject, assertCounter, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { assertNativeId } from '../identity.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { assertSessionTurnOutput, sessionTurnCommitIdentity } from '../session-turn-output.js';
import { readSessionSnapshot } from '../session-snapshot.js';
import { checkedRecord } from './plan-repository.js';
import { controlRecordKey, readAttempt, readAttemptInvalidation } from './controller-common.js';
import { readSessionNarrationResult, sessionOutputKey } from './session-narration-result-contracts.js';
import { readModelCompletionReceipt, readModelTerminalFact } from './model-port.js';
import { readEffect } from './effect-contracts.js';
import { attemptReceiptId, readAttemptSettlement } from './attempt-settlement.js';
import { assertBudgetAttemptRef, assertBudgetAuthorityRef, sendAttemptId } from './budget-port.js';
import { readRunControl } from '../run-control.js';
import { hasRetainedOrchestrationCompute } from '../../../public/shared/native-compute-budget.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid Session output completion facts'); };
export { sessionOutputKey };
export const sessionOutputClaimId = root => 'oclaim_' + hash({ kind: 'session_output_claim', runId: root.runId, outputKey: sessionOutputKey(root) }).slice(0, 32);
export const sessionOutputReceiptId = runId => 'oreceipt_' + hash({ kind: 'session_output', runId }).slice(0, 32);
export const sessionOutputClosureId = runId => 'oreceipt_' + hash({ kind: 'session_output_costs_closed', runId }).slice(0, 32);
export const sessionOutputConsumer = root => ({ kind: 'native_session', sessionId: root.sourceBinding.sourceRef.sessionId,
    nodeId: root.graph.outputContract.ownerNodeId, slot: 'assistant' });

/** Reconstruct the one original Turn descriptor from verified publication facts. */
export async function readSessionOutputDescriptor(tx, handle, root) {
    if (root.graph.outputContract.kind !== 'rp_narration' || root.sourceBinding.sourceAuthority !== 'native_session' || root.parentRef !== null) return null;
    const published = await readSessionNarrationResult(tx, handle, root);
    if (!published) return null;
    const modelInput = published.modelIntent.inputRef;
    const model = await readModelCompletionReceipt(handle, tx, root, published.modelIntent);
    if (!model) invalid();
    const envelope = { schemaVersion: 1, narrative: published.record.payload, outcomes: [], diagnostics: [] };
    const expected = { ...root.sourceBinding.sourceRef, expectedRevisionId: root.sourceBinding.sourceRef.revisionId,
        invocationId: modelInput.invocationId, requestHash: modelInput.requestHash, envelope,
        provenance: [{ taskId: 'narrator', requestSnapshotHash: model.observation.dispatchEvidence.reference.finalRequestHash,
            deliveryReceipt: { kind: 'model_delivery', invocationId: modelInput.invocationId, delivered: true } }] };
    return { published, expected, identity: sessionTurnCommitIdentity({ ...expected, fingerprint: hash(envelope) }) };
}

/** Historical consistency only; it issues no current body or execution capability. */
export async function readSessionOutput(tx, handle, root) {
    if (root.graph.outputContract.kind !== 'rp_narration' || root.sourceBinding.sourceAuthority !== 'native_session' || root.parentRef !== null) return null;
    const claimId = sessionOutputClaimId(root), claimRow = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'output', claimId));
    const receiptRow = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', sessionOutputReceiptId(root.runId)));
    const closureRow = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', sessionOutputClosureId(root.runId)));
    if (!claimRow && !receiptRow && !closureRow && !root.outputClaims.length) return null;
    if (!claimRow || !receiptRow || !closureRow || !equal(root.outputClaims, [{ runId: root.runId, claimId }])) invalid();
    const claim = claimRow.doc, receipt = receiptRow.doc, closure = closureRow.doc, domainRef = claimRow.doc.domainReceiptRef;
    assertObject(domainRef, ['domain', 'sessionId', 'branchId', 'commitId', 'revisionId'], 'Session domain receipt ref');
    if (domainRef.domain !== 'native_session' || domainRef.sessionId !== root.sourceBinding.sourceRef.sessionId || domainRef.branchId !== root.sourceBinding.sourceRef.branchId) invalid();
    assertNativeId(domainRef.revisionId, 'revision');
    assertObject(claim, ['schemaVersion', 'claimId', 'runId', 'nodeAttemptId', 'outputKey', 'sourceBindingDigest', 'resultRef',
        'consumerRef', 'operationRef', 'status', 'domainReceiptRef'], 'Session OutputClaim');
    if (claim.schemaVersion !== 1 || claim.runId !== root.runId || claim.claimId !== claimId || claim.outputKey !== sessionOutputKey(root)
        || claim.sourceBindingDigest !== root.sourceBinding.bindingDigest || claim.status !== 'committed'
        || !equal(claim.consumerRef, sessionOutputConsumer(root)) || !equal(claim.operationRef, { kind: 'native_session_output', ...domainRef, outputKey: claim.outputKey })
        || !equal(claim.domainReceiptRef, domainRef)) invalid();
    assertNativeId(claim.nodeAttemptId, 'orchestrationAttempt');
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'graphRevision', 'claimRef', 'claimIntegrity',
        'publicationReceiptRef', 'producerReceiptRef', 'traversalReceiptRef', 'outputAttemptReceiptRef', 'outputEffectId', 'outputEffectReceiptRef',
        'domainReceiptIntegrity', 'budgetClosureReceiptRef', 'decisionSeq', 'createdAt'], 'Session output receipt');
    assertObject(closure, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'authorityRef', 'effectIds',
        'budgetAttemptRefs', 'snapshotDigest', 'decisionSeq', 'createdAt'], 'Session output cost closure');
    for (const row of [receipt, closure]) {
        assertCounter(row.epoch, 'epoch'); assertCounter(row.decisionSeq, 'decisionSeq', 1); assertCounter(row.createdAt, 'createdAt');
        if (row.schemaVersion !== 1 || row.runId !== root.runId || row.epoch > root.epoch || row.decisionSeq > root.eventSeq) invalid();
    }
    assertCounter(receipt.graphRevision, 'graphRevision'); assertDigest(closure.snapshotDigest, 'snapshotDigest');
    assertDigest(receipt.claimIntegrity, 'claimIntegrity'); assertDigest(receipt.domainReceiptIntegrity, 'domainReceiptIntegrity');
    for (const field of ['publicationReceiptRef', 'producerReceiptRef', 'traversalReceiptRef', 'outputAttemptReceiptRef', 'outputEffectReceiptRef', 'budgetClosureReceiptRef']) {
        assertObject(receipt[field], ['runId', 'receiptId'], field); assertNativeId(receipt[field].receiptId, 'orchestrationReceipt');
        if (receipt[field].runId !== root.runId) invalid();
    }
    if (receipt.receiptKind !== 'session_output' || receipt.receiptId !== sessionOutputReceiptId(root.runId) || receipt.graphRevision > root.graphRevision
        || !equal(receipt.claimRef, { runId: root.runId, claimId }) || receipt.claimIntegrity !== claimRow.integrity
        || closure.receiptKind !== 'session_output_costs_closed' || closure.receiptId !== sessionOutputClosureId(root.runId)
        || receipt.budgetClosureReceiptRef.receiptId !== closure.receiptId || closure.epoch !== receipt.epoch
        || closure.decisionSeq !== receipt.decisionSeq || closure.createdAt !== receipt.createdAt || !equal(closure.authorityRef, root.budgetAuthorityRef)) invalid();
    assertBudgetAuthorityRef(closure.authorityRef);
    const descriptor = await readSessionOutputDescriptor(tx, handle, root);
    if (!descriptor) invalid();
    const { published, expected, identity } = descriptor, { envelope } = expected;
    if (!equal(claim.resultRef, published.receipt.resultRef) || published.receipt.epoch !== receipt.epoch
        || receipt.publicationReceiptRef.receiptId !== published.receipt.receiptId || receipt.producerReceiptRef.receiptId !== published.settlement.receiptId) invalid();
    const output = (await readAttempt(tx, handle, root, claim.nodeAttemptId)).doc;
    const settlement = await readAttemptSettlement(tx, handle, root, output);
    if (output.nodeId !== root.graph.outputContract.ownerNodeId || output.status !== 'completed' || output.epoch !== receipt.epoch
        || output.graphRevision !== receipt.graphRevision || output.effectiveGrantDigest !== published.receipt.grantDigest
        || !equal(output.inputRefs, [claim.resultRef]) || output.inputDigest !== hash([claim.resultRef]) || !equal(output.resultRefs, [claim.resultRef])
        || !equal(output.budgetRef, root.budgetAuthorityRef) || !equal(output.effectRefs, [receipt.outputEffectId])
        || settlement.reasonCode !== 'session_output_committed' || settlement.decisionSeq !== receipt.decisionSeq || settlement.createdAt !== receipt.createdAt
        || !equal(settlement.effectReceiptRefs, [receipt.outputEffectReceiptRef.receiptId])
        || receipt.outputAttemptReceiptRef.receiptId !== attemptReceiptId(root.runId, output.attemptId)) invalid();
    const intent = (await readEffect(tx, handle, root, receipt.outputEffectId)).doc;
    const input = intent.inputRef;
    const originalRow = await checkedRecord(tx, { kind: K.commitReceipt, handle, sessionId: expected.sessionId, commitId: identity.commitId });
    const sessionRow = await checkedRecord(tx, { kind: K.session, handle, sessionId: expected.sessionId });
    const revisionRow = await checkedRecord(tx, { kind: K.sessionRevision, handle, sessionId: expected.sessionId, revisionId: domainRef.revisionId });
    if (!originalRow || !sessionRow || !revisionRow) invalid();
    const snapshot = await readSessionSnapshot(tx, handle, sessionRow.doc, revisionRow.doc);
    const original = assertSessionTurnOutput(expected, originalRow.doc, snapshot);
    if (!equal(original.domainReceiptRef, domainRef) || hash(original.receipt) !== receipt.domainReceiptIntegrity) invalid();
    if (intent.status !== 'confirmed' || intent.nodeAttemptId !== output.attemptId || intent.epoch !== receipt.epoch || intent.graphRevision !== receipt.graphRevision
        || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest || intent.grantDigest !== output.effectiveGrantDigest
        || intent.capability !== 'chat.output' || intent.risk !== 'R2' || intent.requiresApproval || intent.approvalRef !== null || !intent.dispatchToken
        || !equal(intent.actionRef, { kind: 'native_session_output', sessionId: domainRef.sessionId })
        || !equal(intent.targetRef, { kind: 'native_session', sessionId: domainRef.sessionId, outputKey: claim.outputKey })
        || intent.inputHash !== hash(input) || input.kind !== 'native_session_output' || !equal(input.resultRef, claim.resultRef)
        || !equal(input.sourceRef, root.sourceBinding.sourceRef) || input.outputKey !== claim.outputKey
        || input.invocationId !== expected.invocationId || input.requestHash !== expected.requestHash || input.fingerprint !== hash(envelope)
        || input.commitId !== identity.commitId || input.requestFingerprint !== identity.requestFingerprint
        || !equal(intent.dispatchPolicy, { idempotency: 'domain_key', operationKey: identity.commitId, reconcile: 'domain_status' })) invalid();
    const host = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receipt.outputEffectReceiptRef.receiptId)))?.doc;
    if (!host) invalid();
    assertObject(host, ['schemaVersion', 'receiptId', 'effectId', 'runId', 'observationId', 'observedEpoch', 'outcome', 'dispatchEvidence', 'remoteOperationRef',
        'domainReceiptRef', 'budgetObservationRef', 'resultRefs', 'sourceRefs', 'reasonCode', 'observedAt'], 'Session Host Effect receipt');
    assertCounter(host.observedAt, 'observedAt');
    const hostReceiptId = 'oreceipt_' + hash({ effectId: intent.effectId, observationId: 'session.output:' + intent.effectId }).slice(0, 32);
    if (host.schemaVersion !== 1 || host.receiptId !== hostReceiptId || receipt.outputEffectReceiptRef.receiptId !== hostReceiptId
        || host.runId !== root.runId || host.effectId !== intent.effectId || host.observationId !== 'session.output:' + intent.effectId || host.observedEpoch !== receipt.epoch
        || host.outcome !== 'confirmed' || host.remoteOperationRef !== null || !equal(host.domainReceiptRef, domainRef)
        || !equal(host.dispatchEvidence, { kind: 'original_domain_receipt', reference: { ...domainRef, receiptIntegrity: hash(original.receipt) } })
        || !equal(host.sourceRefs, [root.sourceBinding.sourceRef]) || !equal(host.resultRefs, [claim.resultRef]) || host.reasonCode !== 'session_output_committed'
        || host.observedAt > receipt.createdAt || host.budgetObservationRef.status !== 'settled'
        || !equal(Object.fromEntries(Object.keys(intent.budgetAttemptRef).map(field => [field, host.budgetObservationRef[field]])), intent.budgetAttemptRef)) invalid();
    const retrieval = published.retrievalCompletions, retrievalIds = new Set(retrieval.map(item => item.effectId));
    const modelIds = [], effectIds = [], nodes = new Set();
    if (root.attemptRefs.length < root.graph.nodes.length) invalid();
    for (const ref of root.attemptRefs) {
        const attempt = (await readAttempt(tx, handle, root, ref)).doc;
        const fanoutGroup = published.fanoutCompletions.find(item => item.allMembers.some(member => member.attempt.attemptId === attempt.attemptId));
        const fanoutMember = fanoutGroup?.allMembers.find(item => item.attempt.attemptId === attempt.attemptId);
        if ((attempt.status !== 'completed' && (!fanoutMember || !['failed', 'cancelled'].includes(attempt.status))) || attempt.epoch !== receipt.epoch
            || attempt.sourceBindingDigest !== root.sourceBinding.bindingDigest || !equal(attempt.budgetRef, root.budgetAuthorityRef)) invalid();
        if (nodes.has(attempt.nodeId) && (attempt.nodeId === output.nodeId || attempt.nodeId === published.producer.nodeId
            || !published.graphResults.some(result => result.producer.nodeId === attempt.nodeId)
                && !published.reviewCompletions.some(result => result.producer.nodeId === attempt.nodeId))) invalid();
        nodes.add(attempt.nodeId);
        const settled = await readAttemptSettlement(tx, handle, root, attempt);
        if (attempt.nodeId !== output.nodeId && attempt.nodeId !== published.producer.nodeId) {
            const graphResult = published.graphResults.find(result => result.producer.attemptId === attempt.attemptId);
            const reviewed = published.reviewCompletions.find(result => result.producer.attemptId === attempt.attemptId);
            const resolverInput = attempt.inputRefs[0];
            const control = published.fanoutCompletions.find(item => [item.producer.attemptId, item.fanout.attemptId].includes(attempt.attemptId));
            if (control) {
                if (attempt.effectRefs.length || !['fanout', 'join'].includes(root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind)) invalid();
            } else if (fanoutMember && attempt.status !== 'completed') {
                if (!equal(fanoutMember.attempt, attempt) || (fanoutMember.receipt ? !equal(fanoutMember.receipt, settled)
                    : settled.decisionSeq <= fanoutGroup.joinReceipt.cutoffSeq)) invalid();
            } else if (reviewed) {
                if (settled.reasonCode !== 'session_graph_review_decided') invalid();
            } else if (graphResult) {
                const newer = published.graphResults.some(result => result.producer.nodeId === attempt.nodeId && result.producer.attemptNumber > attempt.attemptNumber);
                if (newer && !await readAttemptInvalidation(tx, handle, root, attempt)) invalid();
                if (resolverInput.kind !== 'native_turn_intent' || resolverInput.role !== 'narrator' || resolverInput.nodeId !== attempt.nodeId
                    || !equal(resolverInput.planRef, root.planRef) || resolverInput.invocationId !== expected.invocationId || resolverInput.requestHash !== expected.requestHash
                    || resolverInput.grantDigest !== attempt.effectiveGrantDigest || settled.reasonCode !== 'graph_result_published') invalid();
            } else {
                if (root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind !== 'agent' || attempt.inputRefs.length !== 1
                || attempt.inputDigest !== hash(attempt.inputRefs) || !equal(resolverInput.planRef, root.planRef)) invalid();
                if (!attempt.effectRefs.length) {
                    const operation = (await readRunControl(tx, handle, expected.sessionId))?.operations[root.budgetAuthorityRef.operationId];
                    if (resolverInput.kind !== 'native_authority_selection_reuse' || settled.reasonCode !== 'original_selection_reused'
                    || resolverInput.sourceBindingDigest !== root.sourceBinding.bindingDigest || resolverInput.ownerRef.handle !== handle
                    || resolverInput.nodeId !== attempt.nodeId || settled.effectReceiptRefs.length || attempt.resultRefs.length
                    || resolverInput.operationRef.operationId !== root.budgetAuthorityRef.operationId || !operation
                    || resolverInput.operationRef.fingerprint !== operation.fingerprint || resolverInput.operationRef.selectionDigest !== hash(operation.selection)
                    || resolverInput.operationRef.retainedCompute !== true || !hasRetainedOrchestrationCompute(operation.compute)) invalid();
                } else if (attempt.effectRefs.length !== 1 || resolverInput.kind !== 'native_turn_intent' || resolverInput.role !== 'intent_resolver'
                || resolverInput.invocationId !== expected.invocationId || resolverInput.requestHash !== expected.requestHash
                || resolverInput.grantDigest !== attempt.effectiveGrantDigest) invalid();
            }
        }
        for (const effectId of attempt.effectRefs) {
            effectIds.push(effectId);
            if (effectId === intent.effectId) continue;
            if (retrievalIds.has(effectId)) { if (attempt.attemptId !== published.producer.attemptId) invalid(); continue; }
            const generation = (await readEffect(tx, handle, root, effectId)).doc;
            const completion = await readModelCompletionReceipt(handle, tx, root, generation) ?? await readModelTerminalFact(handle, tx, root, generation);
            if (generation.capability !== 'generation.send' || !completion || generation.nodeAttemptId !== attempt.attemptId
                || generation.epoch !== receipt.epoch || generation.sourceBindingDigest !== root.sourceBinding.bindingDigest
                || !equal(settled.effectReceiptRefs, [completion.receiptRef.receiptId, ...(attempt.attemptId === published.producer.attemptId ? retrieval.map(item => item.receiptId) : [])])) invalid();
            modelIds.push(effectId);
        }
    }
    if (nodes.size !== root.graph.nodes.length) invalid();
    if (!equal(closure.effectIds, effectIds.sort()) || !Array.isArray(closure.budgetAttemptRefs)) invalid();
    const ids = new Set();
    for (const ref of closure.budgetAttemptRefs) {
        assertBudgetAttemptRef(ref);
        if (!equal(ref.authorityRef, root.budgetAuthorityRef) || !closure.effectIds.includes(ref.effectId) || ref.reservationId !== null || ids.has(ref.attemptId)) invalid();
        ids.add(ref.attemptId);
    }
    const sends = closure.budgetAttemptRefs.filter(ref => ref.kind !== 'local_work');
    const local = closure.budgetAttemptRefs.filter(ref => ref.kind === 'local_work');
    const expectedSends = [...retrievalIds].map(effectId => sends.find(ref => ref.effectId === effectId && ref.providerSendOrdinal === 0));
    if (expectedSends.some(ref => !ref)) invalid();
    for (const effectId of modelIds) {
        const generation = (await readEffect(tx, handle, root, effectId)).doc;
        const completed = await readModelCompletionReceipt(handle, tx, root, generation) ?? await readModelTerminalFact(handle, tx, root, generation);
        const attempts = completed?.observation.dispatchEvidence.reference.attempts;
        if (!Array.isArray(attempts) || !attempts.length) invalid();
        for (const [ordinal, attempt] of attempts.entries()) {
            const ref = attempt.budgetAttemptRef; assertBudgetAttemptRef(ref);
            if (ref.effectId !== effectId || ref.providerSendOrdinal !== ordinal || ref.attemptId !== sendAttemptId(effectId, ordinal)) invalid();
            expectedSends.push(ref);
        }
    }
    if (!equal(sends.map(hash).sort(), expectedSends.map(hash).sort()) || modelIds.some(effectId => !local.some(ref => ref.effectId === effectId && ref.localWorkOrdinal === 0))
        || local.filter(ref => ref.effectId === intent.effectId).length !== 1 || !local.some(ref => equal(ref, intent.budgetAttemptRef))) invalid();
    const edge = root.graph.edges.find(item => item.from.nodeId === published.producer.nodeId && item.to.nodeId === output.nodeId);
    const bindings = edge ? [{ edgeId: edge.edgeId, producerAttemptId: published.producer.attemptId }] : [];
    const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
    const traversal = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', traversalId)))?.doc;
    if (!traversal || !edge || receipt.traversalReceiptRef.receiptId !== traversalId) invalid();
    assertObject(traversal, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'graphRevision', 'bindings', 'producerReceiptRefs',
        'nodeAttemptId', 'inputDigest', 'edgeAdmissionRefs', 'edgeVisits', 'loopIterations', 'decisionSeq', 'createdAt'], 'Session output traversal');
    const edgeId = 'oreceipt_' + hash({ kind: 'edge_admission', runId: root.runId, edgeId: edge.edgeId,
        producerAttemptId: published.producer.attemptId, nodeAttemptId: output.attemptId }).slice(0, 32);
    const admission = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', edgeId)))?.doc;
    if (!admission) invalid();
    assertObject(admission, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'graphRevision', 'edgeId', 'producerAttemptId',
        'nodeAttemptId', 'sourceBindingDigest', 'edgeVisit', 'loopIteration', 'decisionSeq', 'createdAt'], 'Session edge admission');
    if (traversal.schemaVersion !== 1 || traversal.receiptKind !== 'graph_transition' || traversal.receiptId !== traversalId
        || traversal.runId !== root.runId || traversal.epoch !== receipt.epoch || traversal.graphRevision !== receipt.graphRevision
        || !equal(traversal.bindings, bindings) || traversal.nodeAttemptId !== output.attemptId || traversal.inputDigest !== output.inputDigest
        || !equal(traversal.producerReceiptRefs, [published.settlement.receiptId]) || !equal(traversal.edgeAdmissionRefs, [edgeId])
        || traversal.decisionSeq <= published.receipt.decisionSeq || traversal.decisionSeq >= receipt.decisionSeq
        || admission.schemaVersion !== 1 || admission.receiptKind !== 'edge_admission' || admission.receiptId !== edgeId
        || admission.runId !== root.runId || admission.epoch !== receipt.epoch || admission.graphRevision !== receipt.graphRevision
        || admission.producerAttemptId !== published.producer.attemptId || admission.nodeAttemptId !== output.attemptId || admission.edgeId !== edge.edgeId
        || admission.sourceBindingDigest !== root.sourceBinding.bindingDigest || admission.decisionSeq !== traversal.decisionSeq
        || admission.createdAt !== traversal.createdAt || admission.edgeVisit !== 1 || admission.loopIteration !== 0
        || root.progress.edgeVisitCounts[edge.edgeId] !== 1 || traversal.edgeVisits[edge.edgeId] !== 1 || traversal.loopIterations !== 0) invalid();
    return { claim, receipt, closure, published, output, domainReceipt: original.receipt };
}
