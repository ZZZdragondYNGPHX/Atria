import { cloneNativeDocument, hashNativeDocument as hash, putImmutable } from '../repositories/common.js';
import { assertObject, assertResultPolicy } from '../../../public/shared/native-orchestration-contracts.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { ProjectQualityWork } from './project-quality-work.js';
import { inspectGraphReadiness } from './graph-work-readiness.js';
import { projectControlGraph, projectPlannerOutputContract, projectGraphReviewOutputContract } from './project-control-graph.js';
import { GraphController } from './graph-controller.js';
import { graphPatchHash } from './graph-revision-contracts.js';
import { graphPlannerControlRef, graphPlannerReceiptId, readGraphPlannerCompletion } from './graph-planner-completion.js';
import { assertProjectControlWork } from './project-quality-contracts.js';
import { readProjectControlInputs, projectControlItems } from './project-control-input-contracts.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { checkedRecord } from './plan-repository.js';
import { ReviewController, reviewReceiptId } from './review-controller.js';
import { graphReviewModelReceiptId, graphReviewControlRef, readGraphReviewCompletion } from './graph-review-completion.js';
import { PROJECT_QUALITY_REASONS } from './project-quality-profile.js';
import { writeAttemptSettlement } from './attempt-settlement.js';
import { controlCommandId, controlRecordKey, readAttempt, runGuard, graphReachable } from './controller-common.js';

const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const equal = (a, b) => hash(a) === hash(b);
const readerOptions = { verifyControlWork: assertProjectControlWork };

/** One domain consumer of original Graph/Transition/Model controllers. Ready
 * ordering is shared and read-only; this class owns no durable execution state. */
export class ProjectControlGraphWork {
    constructor(args) {
        Object.assign(this, args); this.records = new Map(); this.lastOperations = new Map();
        this.models = new ProjectQualityWork({ ...args, readControls: (tx, root, recipient, controlRefs) =>
            projectControlItems(tx, this.state.handle, root, recipient, { controlRefs }) });
    }

    #bundle(edges) {
        const evidenceRefs = [], controlRefs = [], bindings = [];
        for (const edge of edges) {
            const fact = this.records.get(edge.from.nodeId);
            if (!fact) fail('native_orchestration_project_control_dependency_missing');
            bindings.push({ edgeId: edge.edgeId, producerAttemptId: fact.attemptId });
            if (fact.resultRef && !evidenceRefs.some(ref => equal(ref, fact.resultRef))) evidenceRefs.push(fact.resultRef);
            if (fact.controlRef && !controlRefs.some(ref => equal(ref, fact.controlRef))) controlRefs.push(fact.controlRef);
        }
        return { evidenceRefs, controlRefs, bindings };
    }

    async #authorizeInputs(bundle, { tx, root, target, producers }) {
        await this.current();
        const facts = await readProjectControlInputs(tx, this.state.handle, root, null, bundle);
        if (producers.length !== bundle.bindings.length || producers.some(item => !bundle.bindings.some(binding =>
            binding.edgeId === item.edge.edgeId && binding.producerAttemptId === item.attempt.attemptId))
            || producers.some(item => !facts.some(fact => fact.producer.attemptId === item.attempt.attemptId))) fail('native_orchestration_project_control_stale');
        for (const fact of facts.filter(fact => fact.record)) {
            if (!fact.record.envelope.audienceConstraint.nodeIds.includes(target.nodeId)) fail('native_orchestration_project_control_audience_denied');
        }
    }

    async #planner(stage, { result, proof, send, limits }) {
        const { handle, operation: { runId } } = this.state, { runs, sourcePort, budgetPort } = this.service;
        const rows = [], work = this.models.controlWork(stage, send, limits, rows), responseText = result.generated.response.text;
        const parsed = await work('graph_control_parse', responseText, async () => {
            if (Buffer.byteLength(responseText) > assertResultPolicy(stage.selected.plan.definition.outputContract).maxBytes) fail('native_orchestration_project_planner_response_invalid');
            const value = JSON.parse(responseText); assertObject(value, ['operations'], 'Graph Planner response');
            if (!Array.isArray(value.operations) || !value.operations.length) fail('native_orchestration_project_planner_response_invalid');
            return immutable(value);
        });
        if (this.lastOperations.get(stage.selected.node.nodeId) === hash(parsed.operations)) fail('native_orchestration_project_planner_no_progress');
        const root = await runs.get(handle, runId), patch = { schemaVersion: 1, patchId: 'opatch_' + hash({ runId, attemptId: stage.attemptId }).slice(0, 32),
            runId, producerAttemptId: stage.attemptId, expectedEpoch: root.epoch, expectedGraphRevision: root.graphRevision,
            operations: parsed.operations, reasonRefs: [{ kind: 'source', bindingDigest: root.sourceBinding.bindingDigest },
                ...stage.decision.inputRef.acceptedGraphResultRefs.map(ref => ({ kind: 'result', resultId: ref.resultId }))], payloadHash: '' };
        patch.payloadHash = graphPatchHash(patch);
        const boundary = sourcePort.consumptionBoundary(handle, root.sourceBinding, { engine: runs.engine });
        const proposed = await work('graph_control_adopt', patch, () => runs.withSourceControl(handle, runId, async () => {
            try {
                return await new GraphController({ runs, authorizePatch: async ({ tx, root: active, producer, patch: actual }) => {
                    await this.current();
                    const completion = await this.port.inspectResultCompletion(handle, { result, runId, effectId: stage.effectId });
                    if (!equal(completion, proof) || producer.attemptId !== stage.attemptId || !equal(actual, patch)) fail('native_orchestration_project_planner_denied');
                    const candidate = cloneNativeDocument(active.graph);
                    for (const operation of actual.operations) {
                        if (operation.op === 'addNode') candidate.nodes.push(operation.node);
                        if (operation.op === 'addEdge') candidate.edges.push(operation.edge);
                    }
                    const admission = projectControlGraph({ ...stage.selected.plan, definition: candidate });
                    for (const control of admission.pure) await this.state.selected.resolveControlModel(control);
                    if (!equal(admission.worker, active.graph.nodes.find(node => node.nodeId === this.state.selected.node.nodeId))) fail('native_orchestration_project_planner_writer_denied');
                    // An added edge cannot retroactively expand a published Result's audience.
                    for (const operation of actual.operations.filter(operation => operation.op === 'addEdge')) {
                        const source = this.records.get(operation.edge.from.nodeId);
                        if (source?.resultRef) {
                            const fact = await readGraphNodeResult(tx, handle, active, source.resultRef.resultId);
                            if (!fact.record.envelope.audienceConstraint.nodeIds.includes(operation.edge.to.nodeId)) fail('native_orchestration_project_control_audience_denied');
                        }
                    }
                    const capacity = await budgetPort.observeCapacity(handle, { authorityRef: active.budgetAuthorityRef, reservationId: null }, { tx });
                    const required = admission.pure.filter(node => !this.records.has(node.nodeId) && node.nodeId !== producer.nodeId).length + 1;
                    if (!capacity || capacity.overrun || capacity.remaining.requests < required) fail('native_orchestration_project_graph_budget_unavailable');
                    await sourcePort.revalidate(handle, active.sourceBinding, { tx, root: active });
                } }).propose(handle, { expectedStateVersion: root.stateVersion, patch });
            } catch (error) {
                if (error.code !== 'storage_commit_unknown') throw error;
                const saved = await runs.engine.withTransaction(handle, tx => checkedRecord(tx, controlRecordKey(handle, runId, 'patch', patch.patchId)));
                if (!saved || saved.doc.payloadHash !== patch.payloadHash) throw error;
                return { outcome: { patchReceipt: saved.doc } };
            }
        }, { withAuthority: boundary }));
        const accepted = proposed.outcome.patchReceipt;
        if (!accepted.accepted) fail('native_orchestration_project_graph_patch_rejected');
        const receiptId = graphPlannerReceiptId(runId, stage.attemptId);
        try {
            await runs.withSourceControl(handle, runId, async () => runs.control(handle, controlCommandId('graph.planner.settle', stage.attemptId), {
                ...runGuard(await runs.get(handle, runId)), operation: 'attempt.settle', detail: { attemptId: stage.attemptId, patchId: patch.patchId } }, async ({ tx, root: active, now }) => {
                await this.current();
                if (!equal(proof, await this.port.inspectResultCompletion(handle, { result, runId, effectId: stage.effectId }))) fail('native_orchestration_project_planner_denied');
                const record = await readAttempt(tx, handle, active, stage.attemptId);
                if (record.doc.status !== 'running' || !equal(record.doc.effectRefs, [stage.effectId]) || !equal(active, await runs.get(handle, runId))) fail('native_orchestration_project_planner_denied');
                const receipt = { schemaVersion: 1, receiptKind: 'graph_planner_model', receiptId, runId, epoch: active.epoch, producerAttemptId: stage.attemptId,
                    sourceBindingDigest: active.sourceBinding.bindingDigest, grantDigest: stage.decision.grantDigest, modelEffectId: stage.effectId,
                    modelReceiptRef: proof.receiptRef, modelPayloadHash: proof.payloadHash, responseText, patchId: patch.patchId, patchIntegrity: hash(accepted),
                    localWork: rows, decisionSeq: active.eventSeq + 1, createdAt: now };
                await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), receipt);
                await writeAttemptSettlement({ tx, handle, root: active, record, outcome: 'completed', resultRefs: [],
                    effectReceiptRefs: [proof.receiptRef.receiptId], reasonCode: 'graph_planner_patch_accepted', now });
                active.progress.steps++;
                return { root: active, eventType: 'graph_planner_completed', reasonCode: 'graph_planner_patch_accepted', outcome: { controlRef: graphPlannerControlRef(runId, stage.attemptId) } };
            }), { withAuthority: boundary });
        } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            const saved = await runs.engine.withTransaction(handle, async tx => readGraphPlannerCompletion(tx, handle, await runs.get(handle, runId), stage.attemptId, readerOptions));
            if (!saved || !equal(saved.patch, accepted)) throw error;
        }
        this.lastOperations.set(stage.selected.node.nodeId, hash(parsed.operations));
        return { attemptId: stage.attemptId, controlRef: graphPlannerControlRef(runId, stage.attemptId), requests: accepted.requests };
    }

    #task(node, root) {
        const planner = node.kind === 'planner', review = node.kind === 'review';
        return { kind: planner ? 'native_project_graph_planner' : review ? 'native_project_graph_review' : 'native_project_graph_work', authoredTask: node.label,
            instruction: planner ? 'Propose structured GraphPatch operations from the current graph and evidence. This is advisory Host control only. Never add tool authority or report domain changes.'
                : review ? 'Review the explicitly supplied typed advisory results. Return decision, reasonCode and exact targetAttemptIds from their evidence identities. A rerun never authorizes tools or formal Commit.'
                    : 'Perform this declared advisory Project task using only the explicitly supplied source and results. No tools or domain writes are available.',
            ...(planner ? { graphView: { graphRevision: root.graphRevision, graph: root.graph, nodeControl: root.nodeControl,
                dependencyPins: this.state.selected.plan.dependencyPins.filter(pin => pin.port === 'model') } } : {}) };
    }

    async #review(stage, { result, proof, send, limits }, bundle) {
        const { handle, operation: { runId } } = this.state, { runs, sourcePort, budgetPort } = this.service;
        const rows = [], work = this.models.controlWork(stage, send, limits, rows), responseText = result.generated.response.text;
        const parsed = await work('graph_control_parse', responseText, async () => {
            if (Buffer.byteLength(responseText) > assertResultPolicy(stage.selected.plan.definition.outputContract).maxBytes) fail('native_orchestration_project_quality_response_invalid');
            const value = JSON.parse(responseText); assertObject(value, ['decision', 'reasonCode', 'targetAttemptIds'], 'Graph Review response');
            if (!['approve', 'rerun'].includes(value.decision) || !PROJECT_QUALITY_REASONS.includes(value.reasonCode)
                || (value.decision === 'approve') !== (value.reasonCode === 'quality_ready') || !Array.isArray(value.targetAttemptIds)
                || !value.targetAttemptIds.length || new Set(value.targetAttemptIds).size !== value.targetAttemptIds.length) fail('native_orchestration_project_quality_response_invalid');
            return immutable(value);
        });
        const reruns = [], boundary = sourcePort.consumptionBoundary(handle, stage.sourceBinding, { engine: runs.engine });
        const controller = new ReviewController({ runs, authorizeReview: async ({ tx, root, reviewer, targets, decision, reasonCode, evidenceRefs }) => {
            await this.current();
            const actual = await this.port.inspectResultCompletion(handle, { result, runId, effectId: stage.effectId });
            const facts = await readProjectControlInputs(tx, handle, root, null, bundle), evidence = facts.filter(fact => fact.record);
            if (!equal(actual, proof) || reviewer.attemptId !== stage.attemptId || decision !== parsed.decision || reasonCode !== parsed.reasonCode
                || !equal([...parsed.targetAttemptIds].sort(), targets.map(target => target.attemptId).sort()) || !equal(evidenceRefs, bundle.evidenceRefs)
                || targets.some(target => !evidence.some(fact => fact.producer.attemptId === target.attemptId)
                    || root.graph.nodes.find(node => node.nodeId === target.nodeId).kind !== 'agent')) fail('native_orchestration_project_quality_stale');
            for (const fact of evidence) {
                if (!fact.record.envelope.audienceConstraint.nodeIds.includes(reviewer.nodeId)) fail('native_orchestration_project_control_audience_denied');
            }
            // Graph control decisions cannot be repeated as local Model redo.
            // Keep every already-published GraphPatch receipt authoritative.
            if (decision === 'rerun' && [...this.records.entries()].some(([nodeId, fact]) => fact.controlRef?.kind === 'graph_planner_control' && fact.attemptId !== reviewer.attemptId
                && targets.some(target => graphReachable(root.graph, target.nodeId, nodeId)))) fail('native_orchestration_review_irreversible_dependency');
        }, admitRerun: async ({ tx, root, reviewer, target, attemptId, invalidatedAttemptIds }) => {
            const capacity = await budgetPort.observeCapacity(handle, { authorityRef: root.budgetAuthorityRef, reservationId: null }, { tx });
            const affected = [...this.records.values()].filter(fact => invalidatedAttemptIds.includes(fact.attemptId)).length;
            if (!capacity || capacity.overrun || capacity.remaining.requests < affected + 2 || root.progress.reviews >= root.graph.nodes.find(node => node.nodeId === reviewer.nodeId).policy.maxRounds)
                fail('native_orchestration_project_quality_rerun_limit');
            const node = root.graph.nodes.find(node => node.nodeId === target.nodeId), dependencies = this.#bundle(root.graph.edges.filter(edge => edge.to.nodeId === node.nodeId && !edge.loopBack));
            const feedback = { reviewReceiptRef: { runId, receiptId: reviewReceiptId(runId, reviewer.attemptId) }, reasonCode: parsed.reasonCode };
            const controlTask = this.#task(node, root), spec = await this.models.prepareStageInput(node, attemptId, { ...dependencies, feedback, controlTask });
            const inputRefs = [spec.input, ...dependencies.evidenceRefs, ...dependencies.controlRefs];
            reruns.push({ nodeId: node.nodeId, attemptId, bundle: dependencies, feedback, controlTask });
            return { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: spec.grantDigest, budgetRef: root.budgetAuthorityRef };
        } });
        const decided = await work('graph_control_adopt', parsed, () => runs.withSourceControl(handle, runId, async () => controller.decide(handle, {
            ...runGuard(await runs.get(handle, runId)), reviewAttemptId: stage.attemptId, decision: parsed.decision, targetAttemptIds: parsed.targetAttemptIds,
            reasonCode: parsed.reasonCode, evidenceRefs: bundle.evidenceRefs }), { withAuthority: boundary }));
        const review = decided.outcome.reviewReceipt, receiptId = graphReviewModelReceiptId(runId, stage.attemptId);
        try {
            await runs.withSourceControl(handle, runId, async () => runs.control(handle, controlCommandId('graph.review.settle', stage.attemptId), {
                ...runGuard(await runs.get(handle, runId)), operation: 'attempt.settle', detail: { attemptId: stage.attemptId, reviewReceiptId: review.receiptId } },
            async ({ tx, root, now }) => {
                await this.current();
                if (!equal(proof, await this.port.inspectResultCompletion(handle, { result, runId, effectId: stage.effectId }))) fail('native_orchestration_project_quality_stale');
                const record = await readAttempt(tx, handle, root, stage.attemptId);
                if (record.doc.status !== 'running' || !equal(record.doc.effectRefs, [stage.effectId]) || !equal(root, await runs.get(handle, runId))) fail('native_orchestration_project_quality_stale');
                const receipt = { schemaVersion: 1, receiptKind: 'graph_review_model', receiptId, runId, epoch: root.epoch, producerAttemptId: stage.attemptId,
                    sourceBindingDigest: root.sourceBinding.bindingDigest, grantDigest: stage.decision.grantDigest, modelEffectId: stage.effectId, modelReceiptRef: proof.receiptRef,
                    modelPayloadHash: proof.payloadHash, responseText, reviewReceiptRef: { runId, receiptId: review.receiptId }, reviewIntegrity: hash(review),
                    localWork: rows, decisionSeq: root.eventSeq + 1, createdAt: now };
                await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), receipt);
                await writeAttemptSettlement({ tx, handle, root, record, outcome: 'completed', resultRefs: [], effectReceiptRefs: [proof.receiptRef.receiptId], reasonCode: 'graph_review_decided', now });
                root.progress.steps++;
                return { root, eventType: 'graph_review_completed', reasonCode: parsed.reasonCode, outcome: { controlRef: graphReviewControlRef(runId, stage.attemptId) } };
            }), { withAuthority: boundary });
        } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            const saved = await runs.engine.withTransaction(handle, async tx => readGraphReviewCompletion(tx, handle, await runs.get(handle, runId), stage.attemptId,
                { ...readerOptions, reasonCodes: PROJECT_QUALITY_REASONS }));
            if (!saved || !equal(saved.review, review)) throw error;
        }
        return { attemptId: stage.attemptId, controlRef: graphReviewControlRef(runId, stage.attemptId), review, reruns };
    }

    async run() {
        const { handle, operation: { runId } } = this.state, handledReplans = new Set();
        while (true) {
            await this.current();
            const root = await this.service.runs.get(handle, runId), profile = projectControlGraph({ ...this.state.selected.plan, definition: root.graph });
            const completion = Object.fromEntries([...this.records].map(([id]) => [id, 'completed']));
            const replan = [...this.records.entries()].find(([, fact]) => fact.requests?.replan && !handledReplans.has(fact.attemptId));
            let selected, bundle, token;
            if (replan) {
                const [nodeId, previous] = replan, node = root.graph.nodes.find(node => node.nodeId === nodeId);
                const loop = root.graph.edges.find(edge => edge.loopBack && edge.from.nodeId === nodeId && edge.to.nodeId === nodeId);
                if (!loop || previous.requests.finalize) fail('native_orchestration_project_replan_unavailable');
                bundle = this.#bundle(root.graph.edges.filter(edge => edge.to.nodeId === nodeId && !edge.loopBack));
                bundle.bindings.push({ edgeId: loop.edgeId, producerAttemptId: previous.attemptId });
                if (!bundle.controlRefs.some(ref => equal(ref, previous.controlRef))) bundle.controlRefs.push(previous.controlRef);
                selected = node; token = previous.attemptId; handledReplans.add(previous.attemptId);
            } else {
                const observed = inspectGraphReadiness(root.graph, root.nodeControl, completion, { excludeNodeIds: [profile.worker.nodeId, profile.output.nodeId] });
                if (!observed.ready.length) {
                    const unfinished = profile.pure.filter(node => !this.records.has(node.nodeId) && root.nodeControl[node.nodeId].disposition !== 'cancelled');
                    if (unfinished.length) fail('native_orchestration_project_graph_blocked');
                    const final = inspectGraphReadiness(root.graph, root.nodeControl, completion, { excludeNodeIds: profile.pure.map(node => node.nodeId) }).ready.find(item => item.node.nodeId === profile.worker.nodeId);
                    if (!final) fail('native_orchestration_project_graph_blocked');
                    return this.#bundle(final.edges);
                }
                selected = observed.ready[0].node; bundle = this.#bundle(observed.ready[0].edges); token = 'initial';
            }
            const planner = selected.kind === 'planner', review = selected.kind === 'review';
            const prepared = this.prepared?.get(selected.nodeId), controlTask = prepared?.controlTask ?? this.#task(selected, root);
            const result = await this.models.generateStage(selected, prepared?.attemptId ?? token, { ...(prepared?.bundle ?? bundle), controlTask,
                ...(prepared ? { preparedAttemptId: prepared.attemptId, feedback: prepared.feedback } : {}),
                authorizeInputs: args => this.#authorizeInputs(bundle, args), outputContract: planner ? projectPlannerOutputContract : review ? projectGraphReviewOutputContract : null,
                ...(planner ? { complete: (stage, args) => this.#planner(stage, args) } : review ? { complete: (stage, args) => this.#review(stage, args, bundle) } : {}) });
            this.prepared?.delete(selected.nodeId);
            if (result.review?.decision === 'rerun') {
                for (const [nodeId, fact] of this.records) if (result.review.invalidatedAttemptIds.includes(fact.attemptId)) this.records.delete(nodeId);
                this.records.delete(selected.nodeId); this.prepared ??= new Map();
                for (const item of result.reruns) this.prepared.set(item.nodeId, item);
                continue;
            }
            this.records.set(selected.nodeId, result);
        }
    }
}
