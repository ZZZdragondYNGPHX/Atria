import { ConflictError } from '../../storage/errors.js';
import { fields } from '../../../public/shared/native-values.js';
import { ProjectAgentService } from '../project-agent.js';
import { StudioService } from '../authoring/studio-service.js';
import { ProjectTaskRepository, assertProjectTask } from '../agent-intelligence/project-task-repository.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { readEffect, readApproval, currentApprovalBinding } from './effect-contracts.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { controlRecordKey, readAttempt, controlCommandId } from './controller-common.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { assertResultRecord, resultDependencyDigest } from './result-contracts.js';
import { effectBudgetClosure, localWorkAttemptId } from './budget-port.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { inspectComputeEffectClosure } from '../../../public/shared/native-compute-budget.js';
import { readReadyEffectResume } from './effect-recovery-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const fail = () => { throw new ConflictError('native_orchestration_project_commit_stale'); };
export const projectCommitReviewHash = task => hash({ workspace: task.workspace, review: task.review, validation: task.validation });
export const projectCommitId = (kind, runId) => (kind === 'result' ? 'oresult_' : kind === 'claim' ? 'oclaim_' : 'oreceipt_')
    + hash({ kind: 'native_project_commit_' + kind, runId }).slice(0, 32);

// These three original Actor fields are the authored (not expression/scopedRaw)
// data consumed by projectActorDefinition. The other admitted edit is content
// of an existing assistant opening consumed by SessionCore._newEntry.
function narrativeSourceChanges(original, proposed) {
    const restored = structuredClone(proposed), changes = [];
    const change = (target, field, before, after) => {
        if (typeof after !== 'string' || before !== undefined && typeof before !== 'string') fail();
        changes.push({ target, field, before: before ?? null, after });
    };
    if (original.project.displayName !== proposed.project.displayName)
        change({ kind: 'project', projectId: original.project.projectId }, 'displayName', original.project.displayName, proposed.project.displayName);
    restored.project.displayName = original.project.displayName; restored.project.updatedAt = original.project.updatedAt;
    if (proposed.package.actors.length !== original.package.actors.length || proposed.package.entryPoints.length !== original.package.entryPoints.length) fail();
    for (const [index, before] of original.package.actors.entries()) {
        const after = proposed.package.actors[index], target = restored.package.actors[index];
        if (after.actorId !== before.actorId) fail();
        for (const field of ['description', 'personality', 'scenario']) {
            if (equal(before.profile?.[field] ?? null, after.profile?.[field] ?? null)) continue;
            change({ kind: 'actor_profile', actorId: before.actorId }, field, before.profile?.[field], after.profile?.[field]);
            if (Object.hasOwn(before.profile ?? {}, field)) target.profile[field] = before.profile[field];
            else delete target.profile[field];
        }
    }
    for (const [index, before] of original.package.entryPoints.entries()) {
        const after = proposed.package.entryPoints[index], target = restored.package.entryPoints[index];
        if (after.entryPointId !== before.entryPointId) fail();
        if (equal(before.initialTimeline ?? null, after.initialTimeline ?? null)) continue;
        if (!Array.isArray(before.initialTimeline) || !Array.isArray(after.initialTimeline) || before.initialTimeline.length !== after.initialTimeline.length) fail();
        for (const [position, prior] of before.initialTimeline.entries()) {
            const next = after.initialTimeline[position];
            if (prior.content === next?.content) continue;
            if (prior.role !== 'assistant' || next?.role !== 'assistant' || prior.actorId !== next.actorId
                || prior.actorId !== undefined && !before.actorIds.includes(prior.actorId)) fail();
            change({ kind: 'initial_narration', entryPointId: before.entryPointId, index: position, actorId: prior.actorId ?? null }, 'content', prior.content, next.content);
            if (Object.hasOwn(prior, 'content')) target.initialTimeline[position].content = prior.content;
            else delete target.initialTimeline[position].content;
        }
    }
    // Permissions, runtime, dependencies, assets, resources, files, identities,
    // timeline metadata/roles and every unclassified field remain exact.
    if (!changes.length || !equal(restored, original)) fail();
    return changes;
}

export function projectCommitNarrativeReviewInput(input, changes) {
    return JSON.stringify({ projectId: input.projectId, taskId: input.taskId, baseRevision: input.revision,
        workspaceHash: input.workspaceHash, reviewHash: input.reviewHash, changeSetId: input.changeSetId, changes });
}

/** One original, reversible Source action. A descriptor is never a grant. */
async function captureProjectCommitSource(handle, ref, agent) {
    fields(ref, ['kind', 'projectId', 'taskId'], 'Project commit capability');
    if (ref.kind !== 'native_project_commit' || !(agent instanceof ProjectAgentService)
        || !(agent._studio instanceof StudioService) || !(agent._repository instanceof ProjectTaskRepository)
        || agent._studio.storageEngine !== agent._repository.engine) fail();
    const { task } = await ProjectAgentService.prototype.observeComputeSource.call(agent, handle, ref.projectId, ref.taskId);
    const project = await StudioService.prototype.observeProject.call(agent._studio, handle, ref.projectId);
    const workspace = task.workspace, operations = workspace?.operations;
    if (task.status !== 'review' || task.review?.required !== true || task.review.highImpact !== false || task.validation?.status !== 'passed'
        || task.projectId !== ref.projectId || task.taskId !== ref.taskId || workspace?.projectId !== task.projectId
        || workspace.baseRevision !== task.baseRevision || project.revision.revision !== task.baseRevision
        || operations?.length !== 1 || operations[0].operationType !== 'project.save') fail();
    const proposed = operations[0].input?.source, original = project.source;
    if (!proposed?.project || proposed.project.projectId !== task.projectId || typeof proposed.project.displayName !== 'string'
        || !proposed.project.displayName.trim()) fail();
    const changes = narrativeSourceChanges(original, proposed), narrative = changes.some(change => change.target.kind !== 'project');
    const descriptor = { schemaVersion: 1, kind: 'native_project_commit', projectId: task.projectId, taskId: task.taskId,
        revision: task.baseRevision, executionFingerprint: task.executionFingerprint, reviewHash: projectCommitReviewHash(task), workspaceHash: hash(workspace),
        operation: 'commit', risk: 'R2', requiresApproval: true, ...narrative ? { title: 'Edit Project narrative source',
            changeKind: 'native_narrative_content', changeDigest: hash(changes) }
            : { title: 'Rename Project', fromName: original.project.displayName, toName: proposed.project.displayName } };
    // Use the existing trusted Review field limit, before any Effect or charge.
    // Fixed-size receipt/ChangeSet identities make this the actual future input.
    if (narrative && projectCommitNarrativeReviewInput({ ...descriptor, changeSetId: 'changeset_' + '0'.repeat(64) }, changes).length > 32768) fail();
    return { descriptor, changes };
}

export async function readProjectCommitDescriptor(handle, ref, agent) {
    return (await captureProjectCommitSource(handle, ref, agent)).descriptor;
}

/** Re-read original data solely for the authenticated isolated Review surface. */
export async function readProjectCommitReview(handle, ref, agent) {
    return captureProjectCommitSource(handle, ref, agent);
}

/** The original Studio Git receipt is the business truth, including after ACK loss. */
export async function readProjectCommitDomain(agent, handle, input) {
    const stored = await agent._repository.get(handle, input.projectId, input.taskId);
    if (!stored) return null;
    const task = assertProjectTask(stored);
    if (task.status !== 'completed' || task.baseRevision !== input.revision || hash(task.workspace) !== input.workspaceHash) return null;
    const change = task.changeSets.find(item => item.changeSetId === input.changeSetId);
    if (!change || change.validation.status !== 'passed' || !change.resultingRevision) return null;
    const original = await StudioService.prototype.observeWorkspaceReceipt.call(agent._studio, handle, task.workspace, input.changeSetId);
    if (!original || !equal(original, change) || original.baseRevision !== input.revision) return null;
    return { kind: 'native_project_commit', projectId: input.projectId, taskId: input.taskId, changeSetId: input.changeSetId,
        baseRevision: input.revision, resultingRevision: original.resultingRevision, workspaceHash: input.workspaceHash, receiptHash: hash(original) };
}

export async function projectCommitCosts(tx, handle, root, effectId, agent) {
    const task = await agent._repository.get(handle, root.sourceBinding.sourceRef.projectId, root.sourceBinding.sourceRef.taskId);
    return effectBudgetClosure(root.budgetAuthorityRef, inspectComputeEffectClosure({ compute: task.compute }, [effectId]));
}

export async function readProjectCommitCompletion(tx, handle, root, agent) {
    const ids = root.attemptRefs;
    for (const id of ids) {
        const producer = (await readAttempt(tx, handle, root, id)).doc;
        for (const effectId of producer.effectRefs) {
            const intent = (await readEffect(tx, handle, root, effectId)).doc, input = intent.inputRef;
            if (input.kind !== 'native_project_commit') continue;
            await readReadyEffectResume(tx, handle, root, intent);
            const source = root.sourceBinding;
            if (root.ownerRef.handle !== handle || root.parentRef !== null || source.sourceAuthority !== 'project'
                || source.sourceRequest.purpose !== 'formal_commit' || input.projectId !== source.sourceRef.projectId || input.taskId !== source.sourceRef.taskId
                || input.revision !== source.sourceRef.revision || input.reviewHash !== source.sourceRequest.reviewHash
                || input.sourceBindingDigest !== source.bindingDigest || intent.inputHash !== hash(input)
                || intent.capability !== 'project.commit' || intent.risk !== 'R2' || !intent.requiresApproval
                || intent.status !== 'confirmed' || !equal(producer.effectRefs, [effectId])) fail();
            const plan = await readPlanRevision(tx, handle, root.planRef), pin = plan.dependencyPins.find(pin => pin.pinId === root.graph.nodes.find(node => node.nodeId === producer.nodeId)?.policy.actionPinId);
            if (!equal(plan.definition, root.graph) || !pin || pin.port !== 'project' || !equal(pin.resourceRef, { kind: 'native_project_commit', projectId: input.projectId, taskId: input.taskId })
                || pin.integrity !== input.descriptorIntegrity || !root.graph.nodes.find(node => node.nodeId === producer.nodeId)?.capabilities.includes('project.commit')
                || intent.budgetEnvelopeDigest !== hash(input.computeBudget)
                || intent.grantDigest !== hash({ principal: 'original_user_project_commit', logical: input })
                || !equal(intent.actionRef, { kind: 'native_project_commit', operation: 'commit' }) || !equal(intent.targetRef, pin.resourceRef)
                || intent.endpointBindingDigest !== hash(pin.resourceRef) || intent.egressDigest !== hash({ domain: 'local_project', projectId: input.projectId })
                || !equal(intent.dispatchPolicy, { idempotency: 'domain_key', operationKey: input.changeSetId, reconcile: 'domain_status' })) fail();
            const approval = (await readApproval(tx, handle, root, intent.approvalRef)).doc;
            const decision = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'approval', approval.decisionRef)))?.doc;
            if (approval.status !== 'consumed' || approval.bindingHash !== currentApprovalBinding(intent, approval) || approval.effectId !== effectId
                || !decision || decision.decision !== 'approve' || decision.bindingHash !== approval.bindingHash || decision.principalRef.handle !== handle
                || decision.authenticationContextRef.authority !== 'native_user_reauthentication') fail();
            const receiptId = 'oreceipt_' + hash({ effectId, observationId: 'project.commit:' + effectId }).slice(0, 32);
            const receipt = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId)))?.doc;
            const domain = await readProjectCommitDomain(agent, handle, input);
            if (!receipt || !domain || receipt.outcome !== 'confirmed' || receipt.effectId !== effectId || receipt.runId !== root.runId
                || !equal(receipt.domainReceiptRef, domain) || receipt.dispatchEvidence.reference?.domainReceiptHash !== hash(domain)) fail();
            const stored = await agent._repository.get(handle, input.projectId, input.taskId);
            const rows = stored.compute?.localWork?.filter(row => row.orchestration?.effectId === effectId) ?? [];
            if (stored.compute?.attempts.some(row => row.orchestration?.effectId === effectId) || rows.length !== 2
                || rows.some((row, ordinal) => row.orchestration.kind !== 'local_work' || row.orchestration.ordinal !== ordinal
                    || row.attemptId !== localWorkAttemptId(effectId, ordinal) || row.requestId !== input.requestId || row.kind !== 'project_tool'
                    || row.targetFingerprint !== hash(input) || row.status !== 'settled' || row.usage?.outcome !== 'completed')
                || producer.epoch !== root.epoch || producer.sourceBindingDigest !== source.bindingDigest
                || producer.effectiveGrantDigest !== intent.grantDigest || !equal(producer.inputRefs, [input]) || producer.inputDigest !== hash([input])) fail();
            const costs = await projectCommitCosts(tx, handle, root, effectId, agent);
            if (!equal(receipt.budgetObservationRef, costs)) fail();
            return { producer, intent, receipt, domain, costs };
        }
    }
    return null;
}

export function projectCommitResult(root, completion, now) {
    const resultId = projectCommitId('result', root.runId), domain = completion.domain;
    const envelope = { schemaVersion: 1, runId: root.runId, resultId, producerAttemptId: completion.producer.attemptId, outputType: 'json',
        outputSchemaRef: { kind: 'native_builtin', schema: 'json' },
        payloadRef: { kind: 'orchestration_result_payload', runId: root.runId, resultId, integrity: hash(domain) },
        sourceRefs: [{ kind: 'run_source', runId: root.runId, epoch: root.epoch, sourceBindingDigest: root.sourceBinding.bindingDigest,
            sourceAuthority: 'project', sourceRef: root.sourceBinding.sourceRef },
        { kind: 'effect_receipt', runId: root.runId, effectId: completion.intent.effectId, receiptId: completion.receipt.receiptId, observedEpoch: root.epoch }],
        dependencyDigest: '', audienceConstraint: { kind: 'project_commit', projectId: domain.projectId, taskId: domain.taskId, runId: root.runId,
            nodeId: root.graph.outputContract.ownerNodeId, epoch: root.epoch, sourceBindingDigest: root.sourceBinding.bindingDigest,
            grantDigest: completion.producer.effectiveGrantDigest, taskPurpose: 'original_native_project_commit' },
        disclosureConstraint: { kind: 'same_source_project_commit_only' }, qualityRefs: [], status: 'complete', createdAt: now };
    envelope.dependencyDigest = resultDependencyDigest(envelope);
    return assertResultRecord({ schemaVersion: 1, runId: root.runId, resultId, envelope, payload: domain }, { outputContract: root.graph.outputContract });
}

export async function readProjectCommitOutput(tx, handle, root, agent, { pendingCommand = false } = {}) {
    const claimId = projectCommitId('claim', root.runId), row = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'output', claimId));
    if (!row && !root.outputClaims.length) return null;
    const completion = await readProjectCommitCompletion(tx, handle, root, agent);
    const output = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', projectCommitId('output', root.runId))))?.doc;
    const result = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'result', projectCommitId('result', root.runId)));
    if (!completion || !output || !result || !row || !completion.costs.closed || !equal(root.outputClaims, [{ runId: root.runId, claimId }])) fail();
    const publication = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', projectCommitId('publication', root.runId))))?.doc;
    if (!publication) fail();
    const claim = row.doc, attempt = (await readAttempt(tx, handle, root, claim.nodeAttemptId)).doc;
    const settled = await readAttemptSettlement(tx, handle, root, attempt), producerSettled = await readAttemptSettlement(tx, handle, root, completion.producer);
    if (root.status !== 'completed' || completion.producer.status !== 'completed' || attempt.status !== 'completed'
        || attempt.nodeId !== root.graph.outputContract.ownerNodeId || !equal(claim.domainReceiptRef, completion.domain)
        || claim.status !== 'committed' || claim.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || !equal(output.costs, completion.costs) || output.claimIntegrity !== row.integrity || !equal(output.resultRef, root.resultRefs[0])
        || !equal(root.resultRefs, [{ runId: root.runId, resultId: result.doc.resultId }])
        || !equal(result.doc, projectCommitResult(root, completion, result.doc.envelope.createdAt))
        || !equal(producerSettled.effectReceiptRefs, [completion.receipt.receiptId]) || settled.effectReceiptRefs.length
        || settled.reasonCode !== 'project_commit_completed' || producerSettled.reasonCode !== 'project_commit_confirmed') fail();
    fields(claim, ['schemaVersion', 'claimId', 'runId', 'nodeAttemptId', 'outputKey', 'sourceBindingDigest', 'resultRef', 'consumerRef', 'operationRef', 'status', 'domainReceiptRef'], 'Project commit claim');
    fields(output, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'graphRevision', 'claimRef', 'claimIntegrity', 'resultRef',
        'publicationReceiptRef', 'traversalReceiptRef', 'outputAttemptReceiptRef', 'costs', 'decisionSeq', 'createdAt'], 'Project commit output');
    fields(publication, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'resultRef', 'resultIntegrity', 'effectId', 'effectReceiptRef', 'decisionSeq', 'createdAt'], 'Project commit publication');
    if (claim.schemaVersion !== 1 || claim.claimId !== claimId || claim.runId !== root.runId || !equal(claim.resultRef, root.resultRefs[0])
        || !equal(claim.consumerRef, result.doc.envelope.audienceConstraint) || !equal(claim.operationRef, completion.domain)
        || claim.outputKey !== hash({ kind: 'native_project_commit', projectId: completion.domain.projectId, taskId: completion.domain.taskId, workspaceHash: completion.domain.workspaceHash })
        || output.schemaVersion !== 1 || output.receiptKind !== 'project_commit_output' || output.receiptId !== projectCommitId('output', root.runId)
        || output.runId !== root.runId || output.epoch !== root.epoch || output.graphRevision !== root.graphRevision
        || !equal(output.claimRef, root.outputClaims[0]) || !equal(output.publicationReceiptRef, { runId: root.runId, receiptId: publication.receiptId })
        || output.outputAttemptReceiptRef.receiptId !== settled.receiptId || settled.decisionSeq !== output.decisionSeq || settled.createdAt !== output.createdAt
        || publication.schemaVersion !== 1 || publication.receiptKind !== 'project_commit_publication' || publication.runId !== root.runId
        || publication.receiptId !== projectCommitId('publication', root.runId) || publication.resultIntegrity !== result.integrity
        || !equal(publication.resultRef, root.resultRefs[0]) || publication.effectId !== completion.intent.effectId
        || !equal(publication.effectReceiptRef, { runId: root.runId, receiptId: completion.receipt.receiptId })
        || producerSettled.decisionSeq !== publication.decisionSeq || producerSettled.createdAt !== publication.createdAt
        || !equal(completion.producer.resultRefs, root.resultRefs) || !equal(attempt.inputRefs, root.resultRefs) || !equal(attempt.resultRefs, root.resultRefs)
        || attempt.inputDigest !== hash(root.resultRefs) || attempt.effectRefs.length || attempt.epoch !== root.epoch
        || root.pendingEffectRefs.length || root.pendingApprovalRefs.length || output.decisionSeq > root.eventSeq) fail();
    await assertOutputTransition(tx, handle, root, { published: { producer: completion.producer, receipt: publication, settlement: producerSettled }, output: attempt, receipt: output });
    const commands = [
        ['project.commit.result', 'result.publish', { effectId: completion.intent.effectId }, { resultRef: root.resultRefs[0] }],
        ...pendingCommand ? [] : [['project.commit.output', 'output.publish', { attemptId: attempt.attemptId }, { claimRef: root.outputClaims[0] }]],
    ];
    for (const [namespace, operation, detail, expected] of commands) {
        const commandId = controlCommandId(namespace, root.runId);
        const command = (await checkedRecord(tx, { kind: K.orchestrationCommand, handle, commandId }))?.doc;
        if (!command || command.commandId !== commandId || command.operation !== 'runs.control.' + operation || command.target !== root.runId
            || command.payloadHash !== hash({ operation: command.operation, body: { runId: root.runId, operation, detail } })
            || command.outcome.versions?.epoch !== root.epoch || Object.entries(expected).some(([key, value]) => !equal(command.outcome[key], value))) fail();
    }
    return { claim, output, result: result.doc, completion };
}
