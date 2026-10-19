import { NativeProjectCommitAuthority } from './native-project-commit-authority.js';
import { performance } from 'node:perf_hooks';
import { ProjectAgentService } from '../project-agent.js';
import { withRuntimeWrite } from '../model-prompt-runtime/runtime-write.js';
import { readProjectCommitDomain, readProjectCommitCompletion, projectCommitResult, projectCommitId } from './project-commit-contracts.js';
import { putImmutable, hashNativeDocument as hash } from '../repositories/common.js';
import { controlCommandId, controlRecordKey, readAttempt, runGuard } from './controller-common.js';
import { writeAttemptSettlement, attemptReceiptId } from './attempt-settlement.js';
import { TransitionController } from './transition-controller.js';
import { AttemptController } from './attempt-controller.js';

/** The existing Project/Studio writer is the only business commit producer. */
export class ProjectCommitPort {
    constructor({ authority }) {
        if (!(authority instanceof NativeProjectCommitAuthority)) throw new TypeError('Original Project commit producer required');
        this.authority = authority;
    }
    async execute(handle, { state, permit, dispatchToken }) {
        const authority = this.authority, { runs } = authority.execution, agent = authority.projectAgent;
        await authority.execution.assertDispatch({ handle, runId: state.runId, effectId: state.effectId, dispatchToken });
        const admitted = await authority.chargeWork(state, 1), started = performance.now(), cpu = process.cpuUsage();
        let outcome = 'failed';
        try {
            await runs.withSourceControl(handle, state.runId,
                async () => {
                    await authority.prepareCommitPreview(state, permit);
                    return ProjectAgentService.prototype.commit.call(agent, handle, state.input.projectId, state.input.taskId,
                        { expectedReviewHash: state.input.reviewHash, nativeCommitPermit: permit, effectPolicy: 'no-background-model' });
                },
                { withAuthority: operation => withRuntimeWrite(handle, () => ProjectAgentService.prototype.withTaskLock.call(agent, handle, state.input.projectId, state.input.taskId, operation)) });
            outcome = 'completed';
        } finally {
            const used = process.cpuUsage(cpu);
            await agent.settleLocalWork(handle, state.input.projectId, state.input.taskId, admitted.attemptId,
                { wallMs: performance.now() - started, cpuUserMicros: used.user, cpuSystemMicros: used.system, cpuScope: 'process', outcome });
        }
        const domain = await readProjectCommitDomain(agent, handle, state.input);
        if (!domain) throw Object.assign(new Error('Original Project commit receipt required'), { code: 'native_orchestration_project_commit_stale' });
        await authority.recordCompletion(state, domain);
        try { await this.finish(handle, state); } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            const saved = await authority.observe(handle, { runId: state.runId, effectId: state.effectId });
            if (saved.status !== 'completed') throw error;
            return saved;
        }
        return authority.observe(handle, { runId: state.runId, effectId: state.effectId });
    }

    async finish(handle, state) {
        const { authority } = this, { runs } = authority.execution, agent = authority.projectAgent;
        return runs.withSourceControl(handle, state.runId, () => runs.engine.withTransaction(handle, async tx => {
            const current = async () => {
                await authority.assertFinalization(state);
                const root = await runs.get(handle, state.runId), completed = await readProjectCommitCompletion(tx, handle, root, agent);
                if (!completed?.costs.closed) throw new Error('Original Project commit costs remain unresolved');
                return { root, completed };
            };
            let { root } = await current();
            await runs.control(handle, controlCommandId('project.commit.result', state.runId), { ...runGuard(root), operation: 'result.publish', detail: { effectId: state.effectId } },
                async ({ tx, root, now }) => {
                    const { completed } = await current(), record = await readAttempt(tx, handle, root, state.attemptId);
                    if (root.resultRefs.length || record.doc.status !== 'running') throw new Error('Project commit publication already consumed');
                    const result = projectCommitResult(root, completed, now), resultRef = { runId: root.runId, resultId: result.resultId };
                    await putImmutable(tx, controlRecordKey(handle, root.runId, 'result', result.resultId), result);
                    await putImmutable(tx, controlRecordKey(handle, root.runId, 'receipt', projectCommitId('publication', root.runId)), {
                        schemaVersion: 1, receiptKind: 'project_commit_publication', receiptId: projectCommitId('publication', root.runId), runId: root.runId,
                        epoch: root.epoch, resultRef, resultIntegrity: hash(result), effectId: state.effectId,
                        effectReceiptRef: { runId: root.runId, receiptId: completed.receipt.receiptId }, decisionSeq: root.eventSeq + 1, createdAt: now });
                    await writeAttemptSettlement({ tx, handle, root, record, outcome: 'completed', resultRefs: [resultRef],
                        effectReceiptRefs: [completed.receipt.receiptId], reasonCode: 'project_commit_confirmed', now });
                    root.resultRefs.push(resultRef); root.progress.steps++;
                    return { root, eventType: 'project_commit_published', reasonCode: 'project_commit_confirmed', outcome: { resultRef } };
                });
            ({ root } = await current());
            const edge = root.graph.edges[0], bindings = [{ edgeId: edge.edgeId, producerAttemptId: state.attemptId }];
            const advanced = await new TransitionController({ runs, authorizeTransition: async ({ root, target, producers }) => {
                const { completed } = await current();
                if (target.nodeId !== root.graph.outputContract.ownerNodeId || producers.length !== 1 || producers[0].attempt.attemptId !== completed.producer.attemptId)
                    throw new Error('Original Project commit recipient required');
                const inputRefs = [...root.resultRefs];
                return { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: completed.producer.effectiveGrantDigest, budgetRef: root.budgetAuthorityRef };
            } }).advance(handle, { ...runGuard(root), bindings, reservedAttemptId: null });
            const attemptId = advanced.outcome.attemptId;
            ({ root } = await current());
            await new AttemptController({ runs, authorizeAttempt: async ({ attempt }) => {
                await current(); if (attempt.attemptId !== attemptId) throw new Error('Original Project commit output Attempt required');
            } }).activate(handle, { ...runGuard(root), attemptId });
            ({ root } = await current());
            await runs.control(handle, controlCommandId('project.commit.output', state.runId), { ...runGuard(root), operation: 'output.publish', detail: { attemptId } },
                async ({ tx, root, now }) => {
                    const { completed } = await current(), record = await readAttempt(tx, handle, root, attemptId), resultRef = root.resultRefs[0];
                    if (root.outputClaims.length || record.doc.status !== 'running') throw new Error('Original Project commit output already consumed');
                    const claimId = projectCommitId('claim', root.runId), claimRef = { runId: root.runId, claimId };
                    const claim = { schemaVersion: 1, claimId, runId: root.runId, nodeAttemptId: attemptId,
                        outputKey: hash({ kind: 'native_project_commit', projectId: state.input.projectId, taskId: state.input.taskId, workspaceHash: state.input.workspaceHash }),
                        sourceBindingDigest: root.sourceBinding.bindingDigest, resultRef,
                        consumerRef: projectCommitResult(root, completed, now).envelope.audienceConstraint,
                        operationRef: completed.domain, status: 'committed', domainReceiptRef: completed.domain };
                    await putImmutable(tx, controlRecordKey(handle, root.runId, 'output', claimId), claim);
                    await putImmutable(tx, controlRecordKey(handle, root.runId, 'receipt', projectCommitId('output', root.runId)), {
                        schemaVersion: 1, receiptKind: 'project_commit_output', receiptId: projectCommitId('output', root.runId), runId: root.runId,
                        epoch: root.epoch, graphRevision: root.graphRevision, claimRef, claimIntegrity: hash(claim), resultRef,
                        publicationReceiptRef: { runId: root.runId, receiptId: projectCommitId('publication', root.runId) },
                        traversalReceiptRef: { runId: root.runId, receiptId: 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32) },
                        outputAttemptReceiptRef: { runId: root.runId, receiptId: attemptReceiptId(root.runId, attemptId) },
                        costs: completed.costs, decisionSeq: root.eventSeq + 1, createdAt: now });
                    await writeAttemptSettlement({ tx, handle, root, record, outcome: 'completed', resultRefs: [resultRef], effectReceiptRefs: [], reasonCode: 'project_commit_completed', now });
                    root.outputClaims.push(claimRef); root.status = 'completed'; root.progress.steps++;
                    return { root, eventType: 'project_commit_completed', reasonCode: 'project_commit_completed', outcome: { claimRef } };
                });
        }), { withAuthority: operation => withRuntimeWrite(handle,
            () => ProjectAgentService.prototype.withTaskLock.call(agent, handle, state.input.projectId, state.input.taskId, operation)) });
    }
}
