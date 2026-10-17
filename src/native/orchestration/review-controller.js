import { ConflictError } from '../../storage/errors.js';
import { cloneNativeDocument, hashNativeDocument as hash, putImmutable } from '../repositories/common.js';
import { assertNativeId } from '../identity.js';
import { assertObject, assertDigest, assertToken } from '../../../public/shared/native-orchestration-contracts.js';
import { controlCommandId, controlRecordKey, graphReachable, readAttempt, assertAttemptCurrent, readAttemptInvalidation, attemptInvalidationId, graphReviewReceiptId, readGraphReviewReceipt } from './controller-common.js';
import { readAttemptSettlement, SETTLED_ATTEMPT_STATUSES } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';

const deny = code => { throw new ConflictError(code); };
export const reviewReceiptId = graphReviewReceiptId;

/** Host decisions only. Model review never approves an Effect or writes a domain. */
export class ReviewController {
    constructor({ runs, authorizeReview, admitRerun }) {
        if (!runs || typeof authorizeReview !== 'function' || typeof admitRerun !== 'function') throw new TypeError('Review requires original producer, Source, Result and budget authorities');
        Object.assign(this, { runs, authorizeReview, admitRerun });
    }

    async decide(handle, input) {
        assertObject(input, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'reviewAttemptId', 'decision', 'targetAttemptIds', 'reasonCode', 'evidenceRefs'], 'graph review');
        const { reviewAttemptId, decision, targetAttemptIds, reasonCode, evidenceRefs, ...guard } = cloneNativeDocument(input);
        assertNativeId(reviewAttemptId, 'orchestrationAttempt'); assertToken(reasonCode, 'reasonCode');
        if (!['approve', 'rerun'].includes(decision) || !Array.isArray(targetAttemptIds) || !targetAttemptIds.length
            || new Set(targetAttemptIds).size !== targetAttemptIds.length || !Array.isArray(evidenceRefs) || !evidenceRefs.length) throw new TypeError('Review requires exact targets and evidence');
        for (const id of targetAttemptIds) assertNativeId(id, 'orchestrationAttempt');
        for (const ref of evidenceRefs) { assertObject(ref, ['runId', 'resultId'], 'review evidence'); assertNativeId(ref.runId, 'orchestrationRun'); assertNativeId(ref.resultId, 'orchestrationResult'); }
        if (new Set(evidenceRefs.map(hash)).size !== evidenceRefs.length) throw new TypeError('Duplicate review evidence');
        targetAttemptIds.sort();
        const receiptId = reviewReceiptId(guard.runId, reviewAttemptId);
        return this.runs.control(handle, controlCommandId('review.decide', receiptId), { ...guard, operation: 'review.decide',
            detail: { reviewAttemptId, decision, targetAttemptIds, reasonCode, evidenceRefs } }, async ({ tx, root, now }) => {
            const { doc: reviewer } = await readAttempt(tx, handle, root, reviewAttemptId);
            await assertAttemptCurrent(tx, handle, root, reviewer);
            const node = root.graph.nodes.find(item => item.nodeId === reviewer.nodeId);
            if (root.cancelRequested || root.status !== 'running' || node.kind !== 'review' || reviewer.status !== 'running'
                || reviewer.epoch !== root.epoch || reviewer.sourceBindingDigest !== root.sourceBinding.bindingDigest
                || root.outputClaims.length) deny('native_orchestration_review_not_admitted');
            let rounds = 0;
            const attempts = [];
            for (const id of root.attemptRefs) {
                const { doc } = await readAttempt(tx, handle, root, id); attempts.push(doc);
                if (doc.nodeId === node.nodeId && await readGraphReviewReceipt(tx, handle, root, doc)) rounds++;
            }
            if (now >= root.progress.deadlineAt || root.progress.steps >= root.limits.maxSteps || root.progress.reviews >= root.limits.maxReviews
                || rounds >= node.policy.maxRounds) deny('native_orchestration_limit_exhausted');
            const targets = [];
            for (const id of targetAttemptIds) {
                const target = attempts.find(item => item.attemptId === id);
                if (!target || id === reviewAttemptId || target.epoch !== root.epoch || target.sourceBindingDigest !== root.sourceBinding.bindingDigest
                    || !SETTLED_ATTEMPT_STATUSES.includes(target.status) || root.graph.nodes.find(item => item.nodeId === target.nodeId).kind === 'output') deny('native_orchestration_review_target_invalid');
                await assertAttemptCurrent(tx, handle, root, target);
                await readAttemptSettlement(tx, handle, root, target); targets.push(target);
            }
            // The original producer verifies the actual JSON Model completion,
            // recipient disclosure and current source, not a caller boolean.
            await this.authorizeReview({ handle, tx, root, reviewer, targets, decision, reasonCode, evidenceRefs });
            const invalidated = [], replacements = [];
            if (decision === 'rerun') {
                if (targets.some(a => targets.some(b => a !== b && graphReachable(root.graph, a.nodeId, b.nodeId)))) deny('native_orchestration_review_redundant_targets');
                for (const attempt of attempts) {
                    if (attempt.attemptId === reviewAttemptId || !targets.some(target => graphReachable(root.graph, target.nodeId, attempt.nodeId))) continue;
                    if (await readAttemptInvalidation(tx, handle, root, attempt)) continue;
                    // Old settled history remains immutable. Active work needs
                    // its own cancellation/reconciliation before local redo.
                    if (!SETTLED_ATTEMPT_STATUSES.includes(attempt.status)) deny('native_orchestration_review_active_dependency');
                    await assertAttemptCurrent(tx, handle, root, attempt);
                    await readAttemptSettlement(tx, handle, root, attempt);
                    for (const effectId of attempt.effectRefs) {
                        const { doc: effect } = await readEffect(tx, handle, root, effectId);
                        if (root.pendingEffectRefs.includes(effectId) || !['confirmed', 'failed', 'not_dispatched'].includes(effect.status)
                            || effect.status !== 'not_dispatched' && (effect.capability !== 'generation.send' || effect.risk !== 'R1' || effect.requiresApproval))
                            deny('native_orchestration_review_irreversible_dependency');
                    }
                    invalidated.push(attempt.attemptId);
                }
                if (root.progress.attempts + targets.length > root.limits.maxAttempts) deny('native_orchestration_limit_exhausted');
                for (const target of targets) {
                    const attemptId = 'oattempt_' + hash({ receiptId, targetAttemptId: target.attemptId }).slice(0, 32);
                    const admission = cloneNativeDocument(await this.admitRerun({ handle, tx, root, reviewer, target, attemptId, invalidatedAttemptIds: invalidated }));
                    assertObject(admission, ['inputRefs', 'inputDigest', 'effectiveGrantDigest', 'budgetRef'], 'review rerun admission');
                    assertDigest(admission.inputDigest, 'inputDigest'); assertDigest(admission.effectiveGrantDigest, 'effectiveGrantDigest');
                    const staleResults = new Set(attempts.filter(item => invalidated.includes(item.attemptId)).flatMap(item => item.resultRefs).map(hash));
                    if (!Array.isArray(admission.inputRefs) || hash(admission.inputRefs) !== admission.inputDigest || hash(admission.budgetRef) !== hash(root.budgetAuthorityRef)
                        || admission.inputRefs.some(ref => staleResults.has(hash(ref)))
                        || root.nodeControl[target.nodeId].disposition !== 'eligible') deny('native_orchestration_review_rerun_denied');
                    const next = { ...target, attemptId, attemptNumber: Math.max(...attempts.filter(item => item.nodeId === target.nodeId).map(item => item.attemptNumber)) + 1,
                        epoch: root.epoch, graphRevision: root.graphRevision, inputState: 'prepared', reservationRef: null, ...admission,
                        sourceBindingDigest: root.sourceBinding.bindingDigest, status: 'pending', effectRefs: [], resultRefs: [], startedAt: null, endedAt: null, reasonCode: null };
                    await putImmutable(tx, controlRecordKey(handle, root.runId, 'attempt', attemptId), next);
                    root.attemptRefs.push(attemptId); replacements.push({ targetAttemptId: target.attemptId, attemptId });
                }
            }
            invalidated.sort();
            const receipt = { schemaVersion: 1, receiptKind: 'graph_review', receiptId, runId: root.runId, epoch: root.epoch, graphRevision: root.graphRevision,
                reviewAttemptId, reviewerNodeId: node.nodeId, producerInputDigest: reviewer.inputDigest, sourceBindingDigest: root.sourceBinding.bindingDigest,
                decision, targetAttemptIds, reasonCode, evidenceRefs, invalidatedAttemptIds: invalidated, replacements, decisionSeq: root.eventSeq + 1, createdAt: now };
            await putImmutable(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId), receipt);
            for (const attemptId of invalidated) await putImmutable(tx, controlRecordKey(handle, root.runId, 'receipt', attemptInvalidationId(root.runId, attemptId)), {
                schemaVersion: 1, receiptKind: 'attempt_invalidation', runId: root.runId, attemptId, reviewReceiptId: receiptId, reviewIntegrity: hash(receipt) });
            root.progress.steps++; root.progress.reviews++; root.progress.attempts += replacements.length;
            return { root, eventType: 'graph_review_decided', reasonCode, outcome: { reviewReceipt: receipt } };
        });
    }
}
