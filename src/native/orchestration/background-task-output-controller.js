import { ConflictError } from '../../storage/errors.js';
import { hashNativeDocument as hash, putImmutable, equalNativeDocuments as equal } from '../repositories/common.js';
import { controlCommandId, controlRecordKey, readAttempt, runGuard } from './controller-common.js';
import { writeAttemptSettlement } from './attempt-settlement.js';
import { TransitionController } from './transition-controller.js';
import { AttemptController } from './attempt-controller.js';
import { backgroundOutputId, backgroundTaskResult, readBackgroundTaskDelivery, readBackgroundTaskResult } from './background-task-output-contracts.js';

const fail = () => { throw new ConflictError('native_orchestration_background_completion_stale'); };

/** Metadata consumer of the original Task adoption. Never sends or adopts a Task. */
export class BackgroundTaskOutputController {
    constructor({ runs, budgetPort, authorize }) {
        if (typeof authorize !== 'function') throw new TypeError('Original live Task finalization required');
        Object.assign(this, { runs, budgetPort, authorize });
    }

    async #current(handle, tx, root, descriptor) {
        if (root.status !== 'running' || root.cancelRequested || root.parentRef || root.pendingEffectRefs.length || root.pendingApprovalRefs.length) fail();
        await this.authorize({ tx, root });
        const first = await readBackgroundTaskDelivery(tx, handle, root, descriptor.effectId, descriptor.domainRef);
        const costs = await this.budgetPort.observeEffectClosure(handle, { authorityRef: root.budgetAuthorityRef,
            effectIds: [descriptor.effectId, ...first.retrievalCompletions.map(item => item.effectId)] }, { tx });
        await this.authorize({ tx, root });
        const final = await readBackgroundTaskDelivery(tx, handle, root, descriptor.effectId, descriptor.domainRef);
        await this.authorize({ tx, root });
        if (!equal(root, await this.runs.get(handle, root.runId)) || !equal(first, final)) fail();
        return { delivery: final, costs };
    }

    /** Caller holds the original Session boundary and Engine transaction. */
    async complete(handle, runId, descriptor) {
        const { runs } = this;
        if (!runs.engine.hasActiveTransaction(handle)) fail();
        const step = async (operation, requireClosed = true) => runs.engine.withTransaction(handle, async tx => {
            const root = await runs.get(handle, runId), facts = await this.#current(handle, tx, root, descriptor);
            if (requireClosed && !facts.costs.closed) return null;
            return operation({ tx, root, ...facts });
        });
        const published = await step(({ root, delivery }) => runs.control(handle, controlCommandId('native.background.result', runId), {
            ...runGuard(root), operation: 'result.publish', detail: { effectId: descriptor.effectId } }, async ({ tx, root, now, deny }) => {
            if (root.resultRefs.length || root.progress.steps >= root.limits.maxSteps || now >= root.progress.deadlineAt) fail();
            const producer = await readAttempt(tx, handle, root, delivery.intent.nodeAttemptId);
            if (producer.doc.status !== 'running' || !equal(producer.doc.effectRefs, [descriptor.effectId, ...delivery.retrievalCompletions.map(item => item.effectId)])) fail();
            try { await this.#current(handle, tx, root, descriptor); } catch (error) { return deny(error); }
            const record = backgroundTaskResult(root, producer.doc, descriptor.effectId, delivery.model.receiptRef, descriptor.domainRef, now);
            const resultRef = { runId, resultId: record.resultId };
            const receipt = { schemaVersion: 1, receiptKind: 'background_task_publication', receiptId: backgroundOutputId('publication', runId),
                runId, epoch: root.epoch, effectId: descriptor.effectId, modelReceiptRef: delivery.model.receiptRef, resultRef,
                resultIntegrity: hash(record), decisionSeq: root.eventSeq + 1, createdAt: now };
            await putImmutable(tx, controlRecordKey(handle, runId, 'result', record.resultId), record);
            await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receipt.receiptId), receipt);
            await writeAttemptSettlement({ tx, handle, root, record: producer, outcome: 'completed', resultRefs: [resultRef],
                effectReceiptRefs: [delivery.model.receiptRef.receiptId, ...delivery.retrievalCompletions.map(item => item.receiptId)], reasonCode: 'background_task_adopted', now });
            root.resultRefs.push(resultRef); root.progress.steps++;
            return { root, eventType: 'background_task_published', reasonCode: null, outcome: { resultRef } };
        }), false);
        if (!published) return;
        const advanced = await step(({ root }) => new TransitionController({ runs, authorizeTransition: async ({ tx, root, target, producers }) => {
            const fact = await readBackgroundTaskResult(tx, handle, root);
            if (!fact || target.nodeId !== root.graph.outputContract.ownerNodeId || producers.length !== 1
                || producers[0].attempt.attemptId !== fact.producer.attemptId) fail();
            const inputRefs = [fact.receipt.resultRef];
            return { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: fact.producer.effectiveGrantDigest, budgetRef: root.budgetAuthorityRef };
        } }).advance(handle, { ...runGuard(root), reservedAttemptId: null, bindings: [{ edgeId: root.graph.edges[0].edgeId,
            producerAttemptId: (root.attemptRefs[0]) }] }));
        if (!advanced) return;
        const attemptId = advanced.outcome.attemptId;
        if (!await step(({ root }) => new AttemptController({ runs, authorizeAttempt: async ({ root, attempt }) => {
            if (attempt.attemptId !== attemptId || attempt.nodeId !== root.graph.outputContract.ownerNodeId) fail();
        } }).activate(handle, { ...runGuard(root), attemptId }))) return;
        await step(({ root, costs }) => runs.control(handle, controlCommandId('native.background.output', runId), {
            ...runGuard(root), operation: 'output.publish', detail: { attemptId } }, async ({ tx, root, now, deny }) => {
            if (root.outputClaims.length || root.progress.steps >= root.limits.maxSteps || now >= root.progress.deadlineAt) fail();
            const fact = await readBackgroundTaskResult(tx, handle, root), output = await readAttempt(tx, handle, root, attemptId);
            if (!fact || output.doc.status !== 'running') fail();
            try { await this.#current(handle, tx, root, descriptor); } catch (error) { return deny(error); }
            const claimId = backgroundOutputId('claim', runId), claimRef = { runId, claimId };
            const claim = { schemaVersion: 1, claimId, runId, nodeAttemptId: attemptId,
                outputKey: hash({ kind: 'native_background_task', runId, slot: root.graph.outputContract.slot }),
                sourceBindingDigest: root.sourceBinding.bindingDigest, resultRef: fact.receipt.resultRef,
                consumerRef: fact.record.envelope.audienceConstraint, operationRef: descriptor.domainRef, status: 'committed', domainReceiptRef: descriptor.domainRef };
            const bindings = [{ edgeId: root.graph.edges[0].edgeId, producerAttemptId: fact.producer.attemptId }];
            const receipt = { schemaVersion: 1, receiptKind: 'background_task_output', receiptId: backgroundOutputId('output', runId), runId,
                epoch: root.epoch, graphRevision: root.graphRevision, claimRef, claimIntegrity: hash(claim),
                traversalReceiptRef: { runId, receiptId: 'oreceipt_' + hash({ runId, bindings, reservedAttemptId: null }).slice(0, 32) },
                costs, decisionSeq: root.eventSeq + 1, createdAt: now };
            await putImmutable(tx, controlRecordKey(handle, runId, 'output', claimId), claim);
            await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receipt.receiptId), receipt);
            await writeAttemptSettlement({ tx, handle, root, record: output, outcome: 'completed', resultRefs: [claim.resultRef],
                effectReceiptRefs: [], reasonCode: 'background_task_committed', now });
            root.outputClaims.push(claimRef); root.status = 'completed'; root.progress.steps++;
            return { root, eventType: 'background_task_completed', reasonCode: 'background_task_committed', outcome: { claimRef } };
        }));
    }
}
