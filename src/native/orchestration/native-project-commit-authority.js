import { ConflictError } from '../../storage/errors.js';
import { performance } from 'node:perf_hooks';
import { fields } from '../../../public/shared/native-values.js';
import { assertComputeBudget } from '../../../public/shared/native-compute-budget.js';
import { assertNativeId, createNativeId } from '../identity.js';
import { ProjectAgentService } from '../project-agent.js';
import { hashNativeDocument as hash, serializeNativeDocument, withNativeResourceWrite } from '../repositories/common.js';
import { createOrchestrationExecutionService } from './execution-service.js';
import { createOrchestrationAuthoringService } from './authoring-service.js';
import { checkedRecord } from './plan-repository.js';
import { readEffect, effectDecision, readApproval } from './effect-contracts.js';
import { AttemptController } from './attempt-controller.js';
import { controlCommandId, controlRecordKey, runGuard, readAttempt } from './controller-common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { localWorkAttemptId } from './budget-port.js';
import { getNativeReviewOrigin } from './review-origin.js';
import { readProjectCommitDescriptor, projectCommitReviewHash, readProjectCommitDomain, readProjectCommitOutput } from './project-commit-contracts.js';
import { ProjectCommitPort } from './project-commit-port.js';

const commitPermits = new WeakMap(), workPermits = new WeakMap(), observations = new WeakMap();
const fail = () => { throw new ConflictError('native_orchestration_project_commit_stale'); };
const equal = (a, b) => hash(a) === hash(b);
const usage = (started, cpu, outcome) => {
    const used = process.cpuUsage(cpu); return { wallMs: performance.now() - started,
        cpuUserMicros: used.user, cpuSystemMicros: used.system, cpuScope: 'process', outcome };
};

function permitFrame(value, expected) {
    if (!value || value.agent !== expected.agent || value.handle !== expected.handle || value.input.projectId !== expected.projectId || value.input.taskId !== expected.taskId) fail();
    return value;
}

export async function consumeNativeProjectCommitPermit(permit, expected) {
    const value = permitFrame(commitPermits.get(permit), expected);
    if (value.consumed) fail();
    await value.current(); value.consumed = true; return value.input.changeSetId;
}

export function nativeProjectCommitChangeSet(permit, expected) {
    const value = permitFrame(commitPermits.get(permit), expected);
    if (!value.consumed) fail(); return value.input.changeSetId;
}

export async function assertNativeProjectCommitWrite(permit, { task, receipt, ...expected }) {
    const value = permitFrame(commitPermits.get(permit), expected);
    if (!value.consumed || task.status !== 'committing' || task.commitIntent?.changeSetId !== value.input.changeSetId
        || hash(task.workspace) !== value.input.workspaceHash || receipt.changeSetId !== value.input.changeSetId
        || receipt.baseRevision !== value.input.revision) fail();
    await value.beforeWrite();
    if (hash(task.workspace) !== value.input.workspaceHash || task.commitIntent?.changeSetId !== value.input.changeSetId) fail();
}

export async function assertNativeProjectCommitWork(permit, { task, attempt, ...expected }) {
    const value = permitFrame(workPermits.get(permit), expected);
    if (task.status !== 'review' || projectCommitReviewHash(task) !== value.input.reviewHash
        || task.baseRevision !== value.input.revision || attempt.orchestration?.effectId !== value.effectId
        || attempt.orchestration.kind !== 'local_work' || ![0, 1].includes(attempt.orchestration.ordinal)
        || attempt.kind !== 'project_tool' || attempt.targetFingerprint !== hash(value.input)
        || attempt.attemptId !== localWorkAttemptId(value.effectId, attempt.orchestration.ordinal)) fail();
    await value.current();
    if (task.status !== 'review' || projectCommitReviewHash(task) !== value.input.reviewHash) fail();
}

/** A real user command and a fresh trusted Review are the only producer. */
export class NativeProjectCommitAuthority {
    #states = new Map();
    #execution;
    constructor({ engine, projectAgent, plans = null }) {
        if (!(projectAgent instanceof ProjectAgentService) || projectAgent._repository.engine !== engine) throw new TypeError('Original Project commit authority required');
        Object.assign(this, { engine, projectAgent, plans });
    }
    get execution() {
        return this.#execution ??= createOrchestrationExecutionService({ engine: this.engine,
            projectAgent: this.projectAgent, projectRepository: this.projectAgent._repository, effectAuthority: this });
    }
    #key(handle, runId) { return hash({ handle, runId }); }
    #state(handle, root) { const state = this.#states.get(this.#key(handle, root.runId)); if (!state) fail(); return state; }
    async #current(state) {
        const descriptor = await readProjectCommitDescriptor(state.handle, state.ref, this.projectAgent);
        if (!equal(descriptor, state.descriptor)) fail();
        const root = await this.execution.runs.get(state.handle, state.runId);
        if (root.cancelRequested || !['admitted', 'running', 'waiting_approval'].includes(root.status) || root.epoch !== state.epoch) fail();
        return root;
    }
    async authorize({ handle, root, proposal, intent, attempt }) {
        const state = this.#state(handle, root); await this.#current(state);
        if (!equal(root.sourceBinding, state.sourceBinding) || !equal(root.planRef, state.planRef)
            || intent && !equal(effectDecision(intent), state.decision)
            || proposal && !equal(proposal, Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, state.decision[key]])))
            || attempt && attempt.nodeId !== state.nodeId) fail();
        return structuredClone(state.decision);
    }
    verifySend() { fail(); }
    async verifyApproval(args) { await this.authorize(args); }
    async describeReview({ handle, root, intent }) {
        await this.authorize({ handle, root, intent });
        const state = this.#state(handle, root);
        return { title: state.descriptor.title, input: JSON.stringify({ projectId: state.input.projectId, taskId: state.input.taskId,
            fromName: state.descriptor.fromName, toName: state.descriptor.toName, baseRevision: state.input.revision,
            workspaceHash: state.input.workspaceHash, reviewHash: state.input.reviewHash, changeSetId: state.input.changeSetId }),
        impact: 'Rename this Project metadata through its original reviewed Workspace. No resource, permission, file or code changes.' };
    }
    async verifyObservation({ handle, tx, root, intent, observation }) {
        const proof = observations.get(observation);
        if (!proof || proof.handle !== handle || proof.runId !== root.runId || proof.effectId !== intent.effectId
            || intent.inputRef.kind !== 'native_project_commit' || !equal(intent.inputRef, proof.input)) fail();
        const domain = await readProjectCommitDomain(this.projectAgent, handle, intent.inputRef);
        if (!domain || !equal(domain, observation.domainReceiptRef) || observation.dispatchEvidence.reference.domainReceiptHash !== hash(domain)) fail();
        await this.execution.budgetPort.verifyBudgetAttempt({ handle, tx, root, intent, budgetAttemptRef: intent.budgetAttemptRef });
    }
    async #replay(handle, input) {
        return this.engine.withTransaction(handle, async tx => {
            const saved = (await checkedRecord(tx, { kind: K.orchestrationCommand, handle, commandId: input.commandId }))?.doc;
            if (!saved) return null;
            if (saved.operation !== 'runs.start') throw new ConflictError('native_orchestration_command_conflict');
            const root = await this.execution.runs.get(handle, saved.target);
            if (root.ownerRef.handle !== handle || root.sourceBinding.sourceRequest.purpose !== 'formal_commit'
                || root.sourceBinding.sourceRequest.requestHash !== hash(input)) throw new ConflictError('native_orchestration_command_conflict');
            for (const id of root.attemptRefs) {
                const record = (await readAttempt(tx, handle, root, id)).doc;
                for (const effectId of record.effectRefs) {
                    const intent = (await readEffect(tx, handle, root, effectId)).doc;
                    if (intent.inputRef.kind !== 'native_project_commit') continue;
                    const live = this.#states.has(this.#key(handle, root.runId));
                    return { runId: root.runId, effectId, approvalId: intent.approvalRef,
                        status: root.status === 'completed' ? 'completed' : live && intent.approvalRef ? root.status : 'recovery_required' };
                }
            }
            return { runId: root.runId, effectId: null, approvalId: null, status: 'recovery_required' };
        });
    }
    async prepare(handle, input) {
        assertNativeId(input?.commandId, 'orchestrationCommand');
        return withNativeResourceWrite(handle, input.commandId, () => this.#prepare(handle, input));
    }
    async #prepare(handle, input) {
        fields(input, ['commandId', 'planRef', 'projectId', 'taskId', 'expectedSequence', 'expectedReviewHash', 'computeBudget'], 'Project commit request');
        assertNativeId(input.commandId, 'orchestrationCommand');
        const replay = await this.#replay(handle, input); if (replay) return replay;
        const limits = assertComputeBudget(input.computeBudget); if (!limits.localWork) fail();
        const ref = { kind: 'native_project_commit', projectId: input.projectId, taskId: input.taskId };
        const descriptor = await readProjectCommitDescriptor(handle, ref, this.projectAgent);
        const task = await this.projectAgent.observeTask(handle, input.projectId, input.taskId);
        if (task.sequence !== input.expectedSequence || descriptor.reviewHash !== input.expectedReviewHash) fail();
        this.plans ??= createOrchestrationAuthoringService(this.engine, { projectAgent: this.projectAgent, studio: this.projectAgent._studio }).plans;
        const plan = await this.plans.getRevision(handle, input.planRef), graph = plan.definition;
        const node = graph.nodes.find(item => item.kind === 'effect'), output = graph.nodes.find(item => item.kind === 'output');
        const pin = plan.dependencyPins.find(item => item.pinId === node?.policy.actionPinId);
        if (graph.nodes.length !== 2 || !node || !output || graph.edges.length !== 1 || graph.graphChangePolicy.allowedOperations.length
            || !equal(graph.capabilityCeiling, ['project.commit']) || !equal(node.capabilities, ['project.commit']) || node.inputs.length
            || node.outputs.length !== 1 || node.outputs[0].type !== 'json' || !node.outputs[0].required
            || output.capabilities.length || output.dependencyPinIds.length || output.outputs.length || output.inputs.length !== 1
            || output.inputs[0].type !== 'json' || !output.inputs[0].required || !equal(graph.entryNodeIds, [node.nodeId])
            || !equal(node.dependencyPinIds, [pin?.pinId]) || plan.dependencyPins.length !== 1 || pin.port !== 'project'
            || !equal(pin.resourceRef, ref) || pin.integrity !== hash(descriptor) || graph.outputContract.kind !== 'result'
            || graph.outputContract.allowPartial || graph.outputContract.resultPolicy?.outputType !== 'json' || graph.outputContract.resultPolicy.maxBytes > 16384
            || graph.outputContract.ownerNodeId !== output.nodeId || graph.edges[0].from.nodeId !== node.nodeId || graph.edges[0].to.nodeId !== output.nodeId
            || graph.edges[0].condition !== 'always' || graph.edges[0].loopBack || graph.edges[0].maxVisits !== 1) fail();
        const service = this.execution, sourceRequest = { domain: 'project', purpose: 'formal_commit', projectId: input.projectId, taskId: input.taskId,
            revision: descriptor.revision, executionFingerprint: descriptor.executionFingerprint, reviewHash: descriptor.reviewHash, requestHash: hash(input) };
        const root = await service.runs.start(handle, input.commandId, { planRef: input.planRef, sourceRequest, retentionPolicyRef: { policyId: 'native_project_commit' } });
        if (root.recovered) fail();
        const logical = { kind: 'native_project_commit', projectId: input.projectId, taskId: input.taskId,
            revision: descriptor.revision, reviewHash: descriptor.reviewHash, workspaceHash: descriptor.workspaceHash,
            changeSetId: 'changeset_' + hash({ handle, commandId: input.commandId, projectId: input.projectId, taskId: input.taskId }),
            sourceBindingDigest: root.sourceBinding.bindingDigest, requestId: input.commandId, descriptorIntegrity: pin.integrity, computeBudget: limits };
        // Both revisions use original Git SHA-1 identities. Capacity is proven
        // before approval or any business writer, never by increasing policy.
        const capacity = { kind: 'native_project_commit', projectId: logical.projectId, taskId: logical.taskId, changeSetId: logical.changeSetId,
            baseRevision: logical.revision, resultingRevision: logical.revision, workspaceHash: logical.workspaceHash, receiptHash: '0'.repeat(64) };
        if (Buffer.byteLength(serializeNativeDocument(capacity)) > graph.outputContract.resultPolicy.maxBytes)
            throw new ConflictError('native_orchestration_project_commit_result_bound');
        const decision = { actionRef: { kind: 'native_project_commit', operation: 'commit' }, targetRef: ref, inputRef: logical, inputHash: hash(logical),
            capability: 'project.commit', risk: 'R2', requiresApproval: true, grantDigest: hash({ principal: 'original_user_project_commit', logical }),
            endpointBindingDigest: hash(ref), egressDigest: hash({ domain: 'local_project', projectId: input.projectId }), budgetEnvelopeDigest: hash(limits),
            dispatchPolicy: { idempotency: 'domain_key', operationKey: logical.changeSetId, reconcile: 'domain_status' } };
        const state = { handle, ref, descriptor, input: logical, limits, runId: root.runId, epoch: root.epoch, sourceBinding: root.sourceBinding,
            planRef: input.planRef, nodeId: node.nodeId, decision };
        this.#states.set(this.#key(handle, root.runId), state);
        const { attemptId } = await service.runs.beginAttempt(handle, controlCommandId('project.commit.attempt', root.runId), { ...runGuard(root),
            nodeId: node.nodeId, inputRefs: [logical], inputDigest: hash([logical]), effectiveGrantDigest: decision.grantDigest, budgetRef: root.budgetAuthorityRef });
        state.attemptId = attemptId;
        await new AttemptController({ runs: service.runs, authorizeAttempt: args => this.authorize(args) }).activate(handle,
            { ...runGuard(await service.runs.get(handle, root.runId)), attemptId });
        state.effectId = 'oeffect_' + hash({ runId: root.runId, attemptId, kind: 'project_commit' }).slice(0, 32);
        await service.effects.prepare(handle, { ...runGuard(await service.runs.get(handle, root.runId)), effectId: state.effectId, nodeAttemptId: attemptId,
            proposal: Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, decision[key]])) });
        const workPermit = Object.freeze({}); state.workPermit = workPermit;
        workPermits.set(workPermit, { agent: this.projectAgent, handle, input: logical, effectId: state.effectId, current: () => this.#current(state) });
        const started = performance.now(), cpu = process.cpuUsage();
        const refBudget = await this.chargeWork(state, 0);
        hash(JSON.stringify(descriptor));
        await this.projectAgent.settleLocalWork(handle, input.projectId, input.taskId, refBudget.attemptId, usage(started, cpu, 'completed'));
        await service.effects.ready(handle, { ...runGuard(await service.runs.get(handle, root.runId)), effectId: state.effectId, budgetAttemptRef: refBudget });
        state.approvalId = createNativeId('orchestrationApproval');
        const current = await service.runs.get(handle, root.runId);
        await service.approvals.request(handle, { ...runGuard(current), effectId: state.effectId, approvalId: state.approvalId,
            expiresAt: Math.min(current.progress.deadlineAt, Date.now() + 300000) });
        return { runId: root.runId, effectId: state.effectId, approvalId: state.approvalId, status: 'waiting_approval' };
    }
    async chargeWork(state, ordinal) {
        const root = await this.execution.runs.get(state.handle, state.runId); if (this.#state(state.handle, root) !== state) fail();
        const attemptId = localWorkAttemptId(state.effectId, ordinal);
        await this.projectAgent.chargeNativeCommitWork(state.handle, state.input.projectId, state.input.taskId, state.workPermit, state.limits, {
            attemptId, requestId: state.input.requestId, kind: 'project_tool', targetFingerprint: hash(state.input), estimatedItems: 1,
            estimatedInputBytes: Buffer.byteLength(JSON.stringify(ordinal ? (await this.projectAgent.observeTask(state.handle, state.input.projectId, state.input.taskId)).workspace : state.descriptor)),
            orchestration: { kind: 'local_work', effectId: state.effectId, ordinal } });
        return { kind: 'local_work', authorityRef: root.budgetAuthorityRef, effectId: state.effectId, localWorkOrdinal: ordinal, attemptId, reservationId: null };
    }
    async #dispatched(state, confirmed = false) {
        return this.engine.withTransaction(state.handle, async tx => {
            const root = await this.execution.runs.get(state.handle, state.runId), intent = (await readEffect(tx, state.handle, root, state.effectId)).doc;
            const fence = await this.engine.nativeHostLifecycle.assertWriter(state.handle, tx);
            if (root.cancelRequested || root.status !== 'running' || root.epoch !== state.epoch || intent.status !== (confirmed ? 'confirmed' : 'dispatching')
                || root.hostBootId !== fence.hostBootId || root.hostGeneration !== fence.generation || !equal(effectDecision(intent), state.decision)) fail();
            const approval = (await readApproval(tx, state.handle, root, intent.approvalRef)).doc;
            const decision = (await checkedRecord(tx, controlRecordKey(state.handle, root.runId, 'approval', approval.decisionRef))).doc;
            if (approval.status !== 'consumed' || decision.decision !== 'approve' || approval.expiresAt <= Date.now()) fail();
            await getNativeReviewOrigin(this.engine).authority.verifyApproval({ handle: state.handle, root, intent, approval, decision });
            if (!equal(root, await this.execution.runs.get(state.handle, state.runId))) fail();
        });
    }
    async dispatch(handle, input, target) {
        fields(input, ['runId', 'effectId'], 'Project commit dispatch');
        const root = await this.execution.runs.get(handle, input.runId);
        this.#target(root, handle, target);
        const persisted = await this.engine.withTransaction(handle, async tx => (await readEffect(tx, handle, root, input.effectId)).doc);
        if (persisted.status !== 'ready') return this.observe(handle, input, target);
        const state = this.#state(handle, root); if (state.effectId !== input.effectId) fail();
        const claim = await this.execution.effects.claim(handle, { ...runGuard(root), effectId: input.effectId });
        if (!claim.claimed) return this.observe(handle, input, target);
        const permit = Object.freeze({});
        commitPermits.set(permit, { agent: this.projectAgent, handle, input: state.input, consumed: false,
            current: async () => { await this.#current(state); await this.#dispatched(state); }, beforeWrite: () => this.#dispatched(state) });
        try { return await new ProjectCommitPort({ authority: this }).execute(handle, { state, permit, dispatchToken: claim.dispatchToken }); } finally {
            this.#states.delete(this.#key(handle, root.runId)); workPermits.delete(state.workPermit); commitPermits.delete(permit);
        }
    }
    #target(root, handle, target) {
        if (root.ownerRef.handle !== handle || root.sourceBinding.sourceRequest.purpose !== 'formal_commit'
            || target && (target.projectId !== root.sourceBinding.sourceRef.projectId || target.taskId !== root.sourceBinding.sourceRef.taskId)) fail();
    }
    async assertFinalization(state) { await this.#dispatched(state, true); }
    async recordCompletion(state, domain) {
        if (this.#states.get(this.#key(state.handle, state.runId)) !== state) fail();
        const { root, costs } = await this.engine.withTransaction(state.handle, async tx => {
            const root = await this.execution.runs.get(state.handle, state.runId);
            const costs = await this.execution.budgetPort.observeEffectClosure(state.handle,
                { authorityRef: root.budgetAuthorityRef, effectIds: [state.effectId] }, { tx });
            return { root, costs };
        });
        const observation = { observationId: 'project.commit:' + state.effectId, observedEpoch: state.epoch, outcome: 'confirmed',
            dispatchEvidence: { kind: 'original_port_observation', reference: { protocol: 'native_project', domainReceiptHash: hash(domain) } },
            remoteOperationRef: null, domainReceiptRef: domain, budgetObservationRef: costs, resultRefs: [], sourceRefs: [root.sourceBinding.sourceRef], reasonCode: 'project_commit_confirmed' };
        observations.set(observation, { handle: state.handle, runId: state.runId, effectId: state.effectId, input: state.input });
        try { await this.execution.effects.observe(state.handle, { ...runGuard(root), effectId: state.effectId, observation }); } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            const saved = await this.engine.withTransaction(state.handle, async tx => {
                const root = await this.execution.runs.get(state.handle, state.runId);
                const receiptId = 'oreceipt_' + hash({ effectId: state.effectId, observationId: observation.observationId }).slice(0, 32);
                return (await checkedRecord(tx, controlRecordKey(state.handle, root.runId, 'receipt', receiptId)))?.doc;
            });
            if (!saved || Object.entries(observation).some(([key, value]) => !equal(saved[key], value))) throw error;
        }
    }
    async observe(handle, input, target) {
        fields(input, ['runId', 'effectId'], 'Project commit observation');
        const root = await this.execution.runs.get(handle, input.runId); this.#target(root, handle, target);
        return this.engine.withTransaction(handle, async tx => {
            const intent = (await readEffect(tx, handle, root, input.effectId)).doc;
            if (intent.inputRef.kind !== 'native_project_commit' || intent.targetRef.projectId !== root.sourceBinding.sourceRef.projectId) fail();
            const domainReceiptRef = await readProjectCommitDomain(this.projectAgent, handle, intent.inputRef);
            const output = await readProjectCommitOutput(tx, handle, root, this.projectAgent);
            return { runId: root.runId, effectId: intent.effectId, status: output ? 'completed' : domainReceiptRef ? 'committed_pending_output' : intent.status,
                domainReceiptRef, claimRef: output ? root.outputClaims[0] : null };
        });
    }
}
