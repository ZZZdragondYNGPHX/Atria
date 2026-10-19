import { ConflictError } from '../../storage/errors.js';
import { hashNativeDocument as hash, putImmutable, equalNativeDocuments as equal } from '../repositories/common.js';
import { controlCommandId, controlRecordKey, readAttempt, runGuard } from './controller-common.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { writeAttemptSettlement, attemptReceiptId } from './attempt-settlement.js';
import { TransitionController } from './transition-controller.js';
import { AttemptController } from './attempt-controller.js';
import { projectReviewId, projectReviewResult, projectReviewCosts, readProjectReviewResult, readProjectReviewOutput } from './project-review-output-contracts.js';

const fail = () => { throw new ConflictError('native_orchestration_project_review_stale'); };
const denials = new Set(['native_orchestration_project_review_stale', 'native_orchestration_project_selection_stale',
    'native_orchestration_source_stale', 'native_orchestration_project_producer_denied']);

/** Publishes original human Review preparation; never invokes a domain writer. */
export class ProjectReviewOutputController {
    constructor({ runs, sourcePort, budgetPort, authorize }) {
        if (typeof authorize !== 'function') throw new TypeError('Original live Project completion required');
        Object.assign(this, { runs, sourcePort, budgetPort, authorize });
    }

    async #current(handle, tx, root) {
        if (root.status !== 'running' || root.cancelRequested || root.parentRef || root.pendingEffectRefs.length || root.pendingApprovalRefs.length) fail();
        const first = await this.authorize({ tx, root });
        const costs = await this.budgetPort.observeEffectClosure(handle, {
            authorityRef: root.budgetAuthorityRef, effectIds: (await projectReviewCosts(tx, handle, root)).effectIds }, { tx });
        const current = await this.authorize({ tx, root });
        if (!equal(first, current) || !equal(root, await this.runs.get(handle, root.runId))
            || !equal(costs, await projectReviewCosts(tx, handle, root))) fail();
        return { descriptor: current, costs };
    }

    async #step(handle, runId, sourceBinding, operation, observe) {
        const { runs } = this;
        try {
            const result = await runs.withSourceControl(handle, runId, () => runs.engine.withTransaction(handle, async tx => {
                try {
                    const root = await runs.get(handle, runId), facts = await this.#current(handle, tx, root);
                    if (!facts.costs.closed) return { value: null };
                    return { value: await operation({ tx, root, ...facts }) };
                } catch (error) {
                    // Reentrant source edits/cancellation are committed before refusal.
                    if (denials.has(error.code)) return { error };
                    throw error;
                }
            }), { withAuthority: this.sourcePort.consumptionBoundary(handle, sourceBinding, { engine: runs.engine }) });
            if (result.error) throw result.error;
            return result.value;
        } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            const saved = await runs.engine.withTransaction(handle, async tx => observe(tx, await runs.get(handle, runId)));
            if (!saved) throw error;
            return saved;
        }
    }

    async complete(handle, root) {
        const { runId, sourceBinding } = root, { runs } = this;
        const published = await this.#step(handle, runId, sourceBinding, async ({ root, descriptor }) =>
            runs.control(handle, controlCommandId('project.review.result', runId), {
                ...runGuard(root), operation: 'result.publish', detail: { roundReceiptId: descriptor.receiptId } },
            async ({ tx, root, now }) => {
                if (root.resultRefs.some(ref => ref.resultId === projectReviewId('result', runId)) || root.progress.steps >= root.limits.maxSteps || now >= root.progress.deadlineAt) fail();
                for (const ref of root.resultRefs) if (!await readGraphNodeResult(tx, handle, root, ref.resultId)) fail();
                const producer = (await readAttempt(tx, handle, root, descriptor.nodeAttemptId)).doc;
                const record = projectReviewResult(root, descriptor, producer, now), resultRef = { runId, resultId: record.resultId };
                const receipt = { schemaVersion: 1, receiptKind: 'project_review_publication', receiptId: projectReviewId('publication', runId),
                    runId, epoch: root.epoch, roundReceiptRef: { runId, receiptId: descriptor.receiptId }, resultRef,
                    resultIntegrity: hash(record), grantDigest: producer.effectiveGrantDigest, decisionSeq: root.eventSeq + 1, createdAt: now };
                await putImmutable(tx, controlRecordKey(handle, runId, 'result', record.resultId), record);
                await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receipt.receiptId), receipt);
                root.resultRefs.push(resultRef); root.progress.steps++;
                return { root, eventType: 'project_review_published', reasonCode: null, outcome: { resultRef } };
            }), (tx, current) => readProjectReviewResult(tx, handle, current));
        if (!published) return;
        const transition = await this.#step(handle, runId, sourceBinding, async ({ tx, root }) =>
            new TransitionController({ runs, authorizeTransition: async ({ tx, root, target, producers }) => {
                const facts = await readProjectReviewResult(tx, handle, root);
                if (!facts || target.nodeId !== root.graph.outputContract.ownerNodeId || producers.length !== 1
                    || producers[0].attempt.attemptId !== facts.producer.attemptId) fail();
                const inputRefs = [facts.receipt.resultRef];
                return { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: facts.receipt.grantDigest, budgetRef: root.budgetAuthorityRef };
            } }).advance(handle, { ...runGuard(root), reservedAttemptId: null, bindings: [{
                edgeId: root.graph.edges.find(edge => !edge.loopBack && edge.to.nodeId === root.graph.outputContract.ownerNodeId).edgeId,
                producerAttemptId: (await readProjectReviewResult(tx, handle, root)).producer.attemptId,
            }] }), async (tx, current) => {
            const facts = await readProjectReviewResult(tx, handle, current);
            if (!facts) return null;
            for (const id of current.attemptRefs) {
                const attempt = (await readAttempt(tx, handle, current, id)).doc;
                if (attempt.nodeId === current.graph.outputContract.ownerNodeId) return { outcome: { attemptId: id } };
            }
            return null;
        });
        if (!transition) return;
        const attemptId = transition.outcome.attemptId;
        const activated = await this.#step(handle, runId, sourceBinding, ({ root }) =>
            new AttemptController({ runs, authorizeAttempt: async ({ attempt }) => {
                if (attempt.attemptId !== attemptId || attempt.nodeId !== root.graph.outputContract.ownerNodeId) fail();
            } }).activate(handle, { ...runGuard(root), attemptId }), async (tx, current) => {
            const attempt = (await readAttempt(tx, handle, current, attemptId)).doc;
            return attempt.status === 'running' ? attempt : null;
        });
        if (!activated) return;
        await this.#step(handle, runId, sourceBinding, ({ root, costs }) =>
            runs.control(handle, controlCommandId('project.review.output', runId), {
                ...runGuard(root), operation: 'output.publish', detail: { attemptId } },
            async ({ tx, root, now }) => {
                if (root.outputClaims.length || root.progress.steps >= root.limits.maxSteps || now >= root.progress.deadlineAt) fail();
                const facts = await readProjectReviewResult(tx, handle, root), record = await readAttempt(tx, handle, root, attemptId);
                if (!facts || record.doc.status !== 'running') fail();
                const claimId = projectReviewId('claim', runId), claimRef = { runId, claimId }, ref = receiptId => ({ runId, receiptId });
                const claim = { schemaVersion: 1, claimId, runId, nodeAttemptId: attemptId,
                    outputKey: hash({ kind: 'native_project_review', runId, slot: root.graph.outputContract.slot }),
                    sourceBindingDigest: root.sourceBinding.bindingDigest, resultRef: facts.receipt.resultRef,
                    consumerRef: facts.record.envelope.audienceConstraint, operationRef: facts.record.payload,
                    status: 'committed', domainReceiptRef: facts.round.receiptRef };
                const bindings = [{ edgeId: root.graph.edges.find(edge => !edge.loopBack && edge.to.nodeId === root.graph.outputContract.ownerNodeId).edgeId, producerAttemptId: facts.producer.attemptId }];
                const receipt = { schemaVersion: 1, receiptKind: 'project_review_output', receiptId: projectReviewId('output', runId),
                    runId, epoch: root.epoch, graphRevision: root.graphRevision, claimRef, claimIntegrity: hash(claim),
                    publicationReceiptRef: ref(facts.receipt.receiptId),
                    traversalReceiptRef: ref('oreceipt_' + hash({ runId, bindings, reservedAttemptId: null }).slice(0, 32)),
                    outputAttemptReceiptRef: ref(attemptReceiptId(runId, attemptId)), costs, decisionSeq: root.eventSeq + 1, createdAt: now };
                await putImmutable(tx, controlRecordKey(handle, runId, 'output', claimId), claim);
                await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receipt.receiptId), receipt);
                await writeAttemptSettlement({ tx, handle, root, record, outcome: 'completed', resultRefs: [claim.resultRef],
                    effectReceiptRefs: [], reasonCode: 'project_review_committed', now });
                root.outputClaims.push(claimRef); root.status = 'completed'; root.progress.steps++;
                return { root, eventType: 'project_review_completed', reasonCode: 'project_review_committed', outcome: { claimRef } };
            }), (tx, current) => readProjectReviewOutput(tx, handle, current));
    }
}
