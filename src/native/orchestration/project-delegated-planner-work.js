import { cloneNativeDocument, hashNativeDocument as hash, putImmutable } from '../repositories/common.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { assertObject, assertResultPolicy } from '../../../public/shared/native-orchestration-contracts.js';
import { runGenerationLocalWork } from './generation-local-work.js';
import { GraphController } from './graph-controller.js';
import { graphPatchHash } from './graph-revision-contracts.js';
import { graphPlannerReceiptId, readGraphPlannerCompletion } from './graph-planner-completion.js';
import { assertProjectControlWork } from './project-quality-contracts.js';
import { projectDelegatedGraphProfile } from './project-delegated-graph-profile.js';
import { projectReplanScope, projectPlannerProgressFingerprint } from './project-replan-contracts.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { readProjectDelegatedModelInput } from './project-delegation-contracts.js';
import { controlCommandId, controlRecordKey, readAttempt, runGuard } from './controller-common.js';
import { readEffect } from './effect-contracts.js';
import { writeAttemptSettlement } from './attempt-settlement.js';

import { assertProjectFanoutPlannerPatch, readProjectFanoutPaidModelNodes } from './project-fanout-planner-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const fail = code => { throw Object.assign(new TypeError(code), { code }); };

/** Domain callback for the original GraphController; all work is charged to
 * the already held child reservation in the original Project Task bank. */
export async function completeProjectDelegatedPlanner({ state, service, port, result, send, limits, current, progress, engine }) {
    const { handle } = state, runId = state.identity.childRunId, { nodeAttemptId: attemptId, effectId } = state.activeNode;
    const proof = await port.inspectResultCompletion(handle, { result, runId, effectId }), rows = [];
    const work = async (kind, input, operation) => {
        const attempt = { attemptId: send.bank.nextLocalWorkAttemptId(), requestId: state.request.requestId, kind, estimatedItems: 1,
            estimatedInputBytes: Buffer.byteLength(JSON.stringify(input)), targetFingerprint: hash({ runId, effectId, kind, inputHash: hash(input) }) };
        let admitted;
        const value = await runGenerationLocalWork({ signal: state.signal, attempt, requireAdmission: true, assertCurrent: current,
            admit: item => send.bank.chargeLocalWork(limits, item), settle: ({ attempt, usage }) => send.bank.settleLocalWork(attempt.attemptId, usage),
            onAdmitted: row => { admitted = row; } }, operation);
        const observed = await service.budgetPort.observeAttempt(handle, { kind: 'local_work', authorityRef: state.root.budgetAuthorityRef,
            effectId, localWorkOrdinal: admitted.orchestration.ordinal, attemptId: admitted.attemptId, reservationId: runId });
        if (observed.status !== 'settled' || observed.usage?.outcome !== 'completed') fail('native_orchestration_control_work_unsettled');
        rows.push({ kind, attemptId: observed.attemptId, ordinal: observed.orchestration.ordinal, targetFingerprint: observed.targetFingerprint, rowHash: hash(observed) });
        return value;
    };
    const responseText = result.generated.response.text;
    const parsed = await work('graph_control_parse', responseText, async () => {
        if (Buffer.byteLength(responseText) > assertResultPolicy(state.root.graph.outputContract).maxBytes) fail('native_orchestration_planner_response_invalid');
        const value = JSON.parse(responseText); assertObject(value, ['operations'], 'Project child Planner response');
        if (!Array.isArray(value.operations) || !value.operations.length) fail('native_orchestration_planner_response_invalid');
        return immutable(value);
    });
    if (parsed.operations.some(operation => !['setPendingPriority', 'requestFinalize', 'requestReplan', 'addNode', 'addEdge'].includes(operation.op))) fail('native_orchestration_planner_patch_rejected');
    const evidence = await engine.withTransaction(handle, async tx => {
        const root = await service.runs.get(handle, runId), facts = [];
        for (const ref of state.decision.inputRef.acceptedGraphResultRefs) facts.push(await readGraphNodeResult(tx, handle, root, ref.resultId));
        if (facts.some(fact => !fact)) fail('native_orchestration_graph_result_required');
        return facts;
    });
    const progressKey = projectPlannerProgressFingerprint(parsed.operations, state.root.sourceBinding, evidence);
    if (state.plannerOperations.get(state.model.node.nodeId)?.has(progressKey)) fail('native_orchestration_planner_no_progress');
    const root = await service.runs.get(handle, runId), patch = { schemaVersion: 1, patchId: 'opatch_' + hash({ runId, attemptId }).slice(0, 32), runId,
        producerAttemptId: attemptId, expectedEpoch: root.epoch, expectedGraphRevision: root.graphRevision, operations: parsed.operations,
        reasonRefs: [{ kind: 'source', bindingDigest: root.sourceBinding.bindingDigest }, ...state.decision.inputRef.acceptedGraphResultRefs.map(ref => ({ kind: 'result', resultId: ref.resultId }))], payloadHash: '' };
    patch.payloadHash = graphPatchHash(patch);
    const withAuthority = service.sourcePort.consumptionBoundary(handle, root.sourceBinding, { engine });
    const proposed = await work('graph_control_adopt', patch, () => service.runs.withSourceControl(handle, runId, async () => new GraphController({ runs: service.runs,
        authorizePatch: async ({ tx, root: active, producer, patch: actual }) => {
            await current();
            if (producer.attemptId !== attemptId || !equal(actual, patch) || !equal(proof, await port.inspectResultCompletion(handle, { result, runId, effectId })))
                fail('native_orchestration_planner_producer_denied');
            if (producer.inputRefs[0].fanoutAttemptId) await assertProjectFanoutPlannerPatch(tx, handle, active, producer, actual);
            const candidate = cloneNativeDocument(active.graph);
            for (const operation of actual.operations) {
                if (operation.op === 'addNode') candidate.nodes.push(operation.node);
                if (operation.op === 'addEdge') {
                    if (operation.edge.loopBack) fail('native_orchestration_planner_patch_rejected');
                    candidate.edges.push(operation.edge);
                }
            }
            const profile = projectDelegatedGraphProfile({ ...state.child.plan, definition: candidate });
            if (profile.terminalNodeId !== state.child.topology.terminalNodeId || !equal(profile.output, state.child.topology.output))
                fail('native_orchestration_planner_producer_denied');
            for (const node of profile.models) await state.child.resolveModel(node);
            for (const operation of actual.operations.filter(operation => operation.op === 'addEdge')) {
                const source = progress.get(operation.edge.from.nodeId);
                if (source?.resultRef) {
                    const fact = await readGraphNodeResult(tx, handle, active, source.resultRef.resultId);
                    if (!fact || !fact.record.envelope.audienceConstraint.nodeIds.includes(operation.edge.to.nodeId))
                        fail('native_orchestration_result_audience_denied');
                }
            }
            const repeating = actual.operations.some(operation => operation.op === 'requestReplan');
            const scope = repeating ? projectReplanScope(candidate, producer.nodeId) : null;
            if (repeating && (!progress.has(scope.target.nodeId) && scope.target.nodeId !== producer.nodeId
                || actual.operations.some(operation => operation.op === 'requestFinalize'))) fail('native_orchestration_planner_replan_pending');
            const paid = producer.inputRefs[0].fanoutAttemptId ? await readProjectFanoutPaidModelNodes(tx, handle, active) : null;
            const required = profile.models.filter(node => scope?.affectedNodeIds.includes(node.nodeId)
                || node.nodeId !== producer.nodeId && !progress.has(node.nodeId) && !paid?.has(node.nodeId)).length;
            const capacity = await service.budgetPort.observeCapacity(handle, { authorityRef: active.budgetAuthorityRef, reservationId: runId }, { tx });
            if (!capacity || capacity.overrun || capacity.remaining.requests < required) fail('native_orchestration_graph_budget_unavailable');
            if (repeating && active.progress.attempts + required + 1 > active.limits.maxAttempts) fail('native_orchestration_limit_exhausted');
            const effect = (await readEffect(tx, handle, active, effectId)).doc;
            await readProjectDelegatedModelInput(tx, handle, active, producer, effect);
            await current();
        } }).propose(handle, { expectedStateVersion: state.decision.inputRef.fanoutAttemptId ? (await service.runs.get(handle, runId)).stateVersion : root.stateVersion, patch }), { withAuthority }));
    const accepted = proposed.outcome.patchReceipt;
    if (!accepted.accepted) fail('native_orchestration_planner_patch_rejected');
    if (accepted.requests.replan && accepted.requests.finalize) fail('native_orchestration_planner_replan_pending');
    const receiptId = graphPlannerReceiptId(runId, attemptId);
    await service.runs.withSourceControl(handle, runId, async () => service.runs.control(handle, controlCommandId('graph.planner.settle', attemptId), {
        ...runGuard(root), expectedGraphRevision: accepted.newGraphRevision, expectedStateVersion: state.decision.inputRef.fanoutAttemptId ? (await service.runs.get(handle, runId)).stateVersion : proposed.outcome.versions.stateVersion,
        operation: 'attempt.settle', detail: { attemptId, patchId: patch.patchId } }, async ({ tx, root: active, now }) => {
        await current();
        const record = await readAttempt(tx, handle, active, attemptId);
        if (record.doc.status !== 'running' || !equal(record.doc.effectRefs, [effectId]) || !equal(proof, await port.inspectResultCompletion(handle, { result, runId, effectId })))
            fail('native_orchestration_planner_producer_denied');
        await readProjectDelegatedModelInput(tx, handle, active, record.doc, (await readEffect(tx, handle, active, effectId)).doc);
        const receipt = { schemaVersion: 1, receiptKind: 'graph_planner_model', receiptId, runId, epoch: active.epoch, producerAttemptId: attemptId,
            sourceBindingDigest: active.sourceBinding.bindingDigest, grantDigest: state.identity.grantDigest, modelEffectId: effectId,
            modelReceiptRef: proof.receiptRef, modelPayloadHash: proof.payloadHash, responseText, patchId: patch.patchId,
            patchIntegrity: hash(accepted), localWork: rows, decisionSeq: active.eventSeq + 1, createdAt: now };
        await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), receipt);
        await writeAttemptSettlement({ tx, handle, root: active, record, outcome: 'completed', resultRefs: [], effectReceiptRefs: [proof.receiptRef.receiptId],
            reasonCode: 'graph_planner_patch_accepted', now });
        active.progress.steps++;
        return { root: active, eventType: 'graph_planner_completed', reasonCode: 'graph_planner_patch_accepted', outcome: {} };
    }), { withAuthority });
    const saved = await engine.withTransaction(handle, async tx => readGraphPlannerCompletion(tx, handle, await service.runs.get(handle, runId), attemptId, { verifyControlWork: assertProjectControlWork }));
    if (!saved) fail('native_orchestration_planner_producer_denied');
    const priorKeys = state.plannerOperations.get(state.model.node.nodeId) ?? new Set(); priorKeys.add(progressKey); state.plannerOperations.set(state.model.node.nodeId, priorKeys);
    return { attemptId, controlRef: saved.controlRef, requests: saved.patch.requests };
}
