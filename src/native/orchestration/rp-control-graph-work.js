import { hashNativeDocument as hash, cloneNativeDocument, putImmutable } from '../repositories/common.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { assertObject, assertResultPolicy } from '../../../public/shared/native-orchestration-contracts.js';
import { inspectGraphReadiness } from './graph-work-readiness.js';
import { rpControlGraph, rpControlPlannerTask } from './rp-control-graph.js';
import { readRpControlInputs, rpPlannerReaderOptions } from './rp-control-input-contracts.js';
import { GraphController } from './graph-controller.js';
import { graphPatchHash } from './graph-revision-contracts.js';
import { graphPlannerControlRef, graphPlannerReceiptId, readGraphPlannerCompletion } from './graph-planner-completion.js';
import { controlCommandId, controlRecordKey, runGuard, readAttempt } from './controller-common.js';
import { readEffect } from './effect-contracts.js';
import { readContextRetrievalCompletions } from './context-retrieval-contracts.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { writeAttemptSettlement } from './attempt-settlement.js';
import { ConflictError } from '../../storage/errors.js';

const equal = (a, b) => hash(a) === hash(b);
const fail = code => { throw Object.assign(new TypeError(code), { code }); };

/** RP consumer of the original Scheduler/Graph/Transition/Model/Output ports.
 * This map holds only references to durable facts, never an authority or bank. */
export class RpControlGraphWork {
    constructor(args) { Object.assign(this, args); this.records = new Map(); this.lastOperations = new Map(); }

    bundle(edges) {
        const evidenceRefs = [], controlRefs = [], bindings = [];
        for (const edge of edges) {
            const fact = this.records.get(edge.from.nodeId);
            if (!fact) fail('native_orchestration_graph_dependency_unavailable');
            bindings.push({ edgeId: edge.edgeId, producerAttemptId: fact.attemptId });
            if (fact.resultRef && !evidenceRefs.some(ref => equal(ref, fact.resultRef))) evidenceRefs.push(fact.resultRef);
            if (fact.controlRef && !controlRefs.some(ref => equal(ref, fact.controlRef))) controlRefs.push(fact.controlRef);
        }
        return { evidenceRefs, controlRefs, bindings };
    }

    async inputs(tx, root, { live = true } = {}) {
        const selected = this.state.activeSelection ?? this.state.selected;
        return readRpControlInputs(tx, this.state.handle, root, this.state.controlBundle,
            { targetNodeId: selected.node.nodeId, live });
    }

    async currentInputs(tx, root) {
        const bundle = this.state.controlBundle;
        if (!bundle.controlRefs.length) return [];
        const producers = new Set(bundle.controlRefs.map(ref => ref.attemptId));
        return readRpControlInputs(tx, this.state.handle, root, { evidenceRefs: [], controlRefs: bundle.controlRefs,
            bindings: bundle.bindings.filter(binding => producers.has(binding.producerAttemptId)) },
        { targetNodeId: (this.state.activeSelection ?? this.state.selected).node.nodeId, live: true });
    }

    async authorizeTransition({ tx, root, target, producers }, inputRefs, grantDigest) {
        await this.current();
        const facts = await this.inputs(tx, root);
        const bindings = this.state.controlBundle.bindings;
        if (target.nodeId !== (this.state.activeSelection ?? this.state.selected).node.nodeId || producers.length !== bindings.length
            || producers.some(item => !bindings.some(binding => binding.edgeId === item.edge.edgeId && binding.producerAttemptId === item.attempt.attemptId)
                || !facts.some(fact => fact.producer.attemptId === item.attempt.attemptId))) fail('native_orchestration_rp_control_stale');
        return { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: grantDigest, budgetRef: root.budgetAuthorityRef };
    }

    async completePlanner({ root, port, result, send, limits, signal }) {
        const { state, service } = this, { handle, attemptId, effectId } = state, runId = root.runId;
        const proof = await port.inspectResultCompletion(handle, { result, runId, effectId }), rows = [];
        const work = this.controlWork({ root, send, limits, signal }, rows), responseText = result.generated.response.text;
        const parsed = await work('graph_control_parse', responseText, async () => {
            if (Buffer.byteLength(responseText) > assertResultPolicy(root.graph.outputContract).maxBytes) fail('native_orchestration_planner_response_invalid');
            const value = JSON.parse(responseText); assertObject(value, ['operations'], 'Planner response');
            if (!Array.isArray(value.operations) || !value.operations.length) fail('native_orchestration_planner_response_invalid');
            return immutable(value);
        });
        const nodeId = state.activeSelection.node.nodeId;
        if (this.lastOperations.get(nodeId) === hash(parsed.operations)) fail('native_orchestration_planner_no_progress');
        const current = await service.runs.get(handle, runId), patch = { schemaVersion: 1,
            patchId: 'opatch_' + hash({ runId, attemptId }).slice(0, 32), runId, producerAttemptId: attemptId, expectedEpoch: current.epoch,
            expectedGraphRevision: current.graphRevision, operations: parsed.operations,
            reasonRefs: [{ kind: 'source', bindingDigest: current.sourceBinding.bindingDigest },
                ...state.controlBundle.evidenceRefs.map(ref => ({ kind: 'result', resultId: ref.resultId }))], payloadHash: '' };
        patch.payloadHash = graphPatchHash(patch);
        const boundary = service.sourcePort.consumptionBoundary(handle, root.sourceBinding, { engine: service.runs.engine });
        const proposed = await work('graph_control_adopt', patch, () => service.runs.withSourceControl(handle, runId, () => new GraphController({ runs: service.runs,
            authorizePatch: async ({ tx, root: active, producer, patch: actual }) => {
                await this.current();
                if (!equal(proof, await port.inspectResultCompletion(handle, { result, runId, effectId }))
                    || producer.attemptId !== attemptId || !equal(actual, patch)) fail('native_orchestration_planner_producer_denied');
                const candidate = cloneNativeDocument(active.graph);
                for (const operation of actual.operations) {
                    if (operation.op === 'addNode') candidate.nodes.push(operation.node);
                    if (operation.op === 'addEdge') candidate.edges.push(operation.edge);
                }
                const admission = rpControlGraph({ ...state.selected.plan, definition: candidate }, { force: true });
                for (const node of admission.models) await state.selected.resolveGraphModel(node);
                if (admission.narrator.nodeId !== state.selected.node.nodeId) fail('native_orchestration_rp_control_writer_denied');
                for (const operation of actual.operations.filter(operation => operation.op === 'addEdge')) {
                    const published = this.records.get(operation.edge.from.nodeId);
                    if (published?.resultRef) {
                        const fact = await readGraphNodeResult(tx, handle, active, published.resultRef.resultId);
                        if (!fact.record.envelope.audienceConstraint.nodeIds.includes(operation.edge.to.nodeId)) fail('native_orchestration_result_consume_denied');
                    }
                }
                const capacity = await service.budgetPort.observeCapacity(handle, { authorityRef: active.budgetAuthorityRef, reservationId: null }, { tx });
                const required = admission.models.filter(node => !this.records.has(node.nodeId) && node.nodeId !== nodeId).length;
                if (!capacity || capacity.overrun || capacity.remaining.requests < required) fail('native_orchestration_graph_budget_unavailable');
                await this.inputs(tx, active);
                await this.current();
            } }).propose(handle, { expectedStateVersion: current.stateVersion, patch }), { withAuthority: boundary }));
        const accepted = proposed.outcome.patchReceipt;
        if (!accepted.accepted) fail('native_orchestration_planner_patch_rejected');
        if (accepted.requests.replan) fail('native_orchestration_planner_replan_pending');
        const receiptId = graphPlannerReceiptId(runId, attemptId);
        await service.runs.withSourceControl(handle, runId, () => service.runs.control(handle, controlCommandId('graph.planner.settle', attemptId), {
            ...runGuard(current), expectedGraphRevision: accepted.newGraphRevision, expectedStateVersion: proposed.outcome.versions.stateVersion,
            operation: 'attempt.settle', detail: { attemptId, patchId: patch.patchId } }, async ({ tx, root: active, now, deny }) => {
            const stamp = hash(active);
            try {
                await this.current();
                if (!equal(proof, await port.inspectResultCompletion(handle, { result, runId, effectId }))) fail('native_orchestration_planner_producer_denied');
                const record = await readAttempt(tx, handle, active, attemptId);
                const retrieval = await readContextRetrievalCompletions(tx, handle, active, (await readEffect(tx, handle, active, effectId)).doc, record.doc);
                if (record.doc.status !== 'running' || !equal(record.doc.effectRefs, [effectId, ...retrieval.map(item => item.effectId)])) fail('native_orchestration_planner_producer_denied');
                await this.inputs(tx, active);
                await this.current();
                if (hash(await service.runs.get(handle, runId)) !== stamp) return deny(new ConflictError('native_orchestration_planner_producer_denied'));
                const receipt = { schemaVersion: 1, receiptKind: 'graph_planner_model', receiptId, runId, epoch: active.epoch, producerAttemptId: attemptId,
                    sourceBindingDigest: active.sourceBinding.bindingDigest, grantDigest: state.decision.grantDigest, modelEffectId: effectId,
                    modelReceiptRef: proof.receiptRef, modelPayloadHash: proof.payloadHash, responseText, patchId: patch.patchId, patchIntegrity: hash(accepted),
                    localWork: rows, decisionSeq: active.eventSeq + 1, createdAt: now };
                await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), receipt);
                await writeAttemptSettlement({ tx, handle, root: active, record, outcome: 'completed', resultRefs: [],
                    effectReceiptRefs: [proof.receiptRef.receiptId, ...retrieval.map(item => item.receiptId)], reasonCode: 'graph_planner_patch_accepted', now });
                active.progress.steps++;
                return { root: active, eventType: 'graph_planner_completed', reasonCode: 'graph_planner_patch_accepted', outcome: { controlRef: graphPlannerControlRef(runId, attemptId) } };
            } catch (error) {
                if (error instanceof ConflictError || error.code === 'native_rp_source_missing') return deny(error);
                throw error;
            }
        }), { withAuthority: boundary });
        this.lastOperations.set(nodeId, hash(parsed.operations));
        const fact = await service.runs.engine.withTransaction(handle, async tx => readGraphPlannerCompletion(tx, handle,
            await service.runs.get(handle, runId), attemptId, rpPlannerReaderOptions));
        if (!fact) fail('native_orchestration_rp_control_stale');
        return { attemptId, controlRef: fact.controlRef, status: 'completed' };
    }

    async run() {
        const { state, service } = this, { handle } = state;
        const identity = await this.identity(), captured = await service.sourcePort.capture(handle, identity.sourceRequest);
        const command = { controlId: identity.sourceRequest.controlId, input: identity.sourceRequest.source.input, requestId: state.input.requestId };
        const started = await service.runs.start(handle, controlCommandId('native.rp.start', command), { planRef: state.selected.binding.planRef,
            sourceRequest: identity.sourceRequest, retentionPolicyRef: { policyId: 'retain_native_rp_until_explicit_release' } });
        let root = await service.runs.get(handle, started.runId);
        if (root.status !== 'admitted' || root.attemptRefs.length) fail('native_orchestration_rp_request_replayed');
        state.graphRunId = root.runId; state.sourceBinding = captured.sourceBinding; this.register(root.runId);
        for (;;) {
            root = await service.runs.get(handle, root.runId);
            rpControlGraph({ ...state.selected.plan, definition: root.graph }, { force: true });
            const readiness = inspectGraphReadiness(root.graph, root.nodeControl,
                Object.fromEntries([...this.records].map(([id, fact]) => [id, fact.status])), { excludeNodeIds: [root.graph.outputContract.ownerNodeId] });
            const next = readiness.ready[0];
            if (!next) fail('native_orchestration_graph_dependency_unavailable');
            const selected = await state.selected.resolveGraphModel(next.node);
            state.activeSelection = selected; state.controlBundle = this.bundle(next.edges);
            const facts = await service.runs.engine.withTransaction(handle, tx => this.inputs(tx, root));
            const controls = facts.filter(fact => fact.controlRef).map(fact => ({ controlRef: fact.controlRef, operations: fact.patch.appliedOperations }));
            const planner = next.node.kind === 'planner', final = next.node.nodeId === state.selected.node.nodeId;
            const controlTask = planner ? rpControlPlannerTask(root.graph, state.selected.plan.dependencyPins)
                : { kind: final ? 'native_rp_graph_narration' : 'native_rp_graph_draft', instruction: 'Perform the current declared task using only authorized direct predecessor evidence. Advisory results and graph control are not official facts, permission or a domain commit.' };
            controlTask.controls = controls;
            const result = await this.withCapture(selected, controlTask, () => this.generate({ planner, graphNode: !planner && !final, graphRunId: root.runId }));
            if (final) return result;
            this.records.set(next.node.nodeId, planner ? result : { attemptId: state.attemptId, resultRef: result.resultRef, status: 'completed' });
        }
    }
}
