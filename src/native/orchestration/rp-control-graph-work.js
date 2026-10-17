import { hashNativeDocument as hash, cloneNativeDocument, putImmutable } from '../repositories/common.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { assertObject, assertResultPolicy } from '../../../public/shared/native-orchestration-contracts.js';
import { inspectGraphReadiness } from './graph-work-readiness.js';
import { rpControlGraph, rpControlPlannerTask } from './rp-control-graph.js';
import { readRpControlInputs, rpPlannerReaderOptions, rpReviewReaderOptions, rpJudgeReaderOptions } from './rp-control-input-contracts.js';
import { GraphController } from './graph-controller.js';
import { graphPatchHash } from './graph-revision-contracts.js';
import { graphPlannerControlRef, graphPlannerReceiptId, readGraphPlannerCompletion } from './graph-planner-completion.js';
import { controlCommandId, controlRecordKey, runGuard, readAttempt, graphReachable, readReviewAdmission } from './controller-common.js';
import { ReviewController, reviewReceiptId } from './review-controller.js';
import { graphReviewModelReceiptId, graphReviewControlRef, readGraphReviewCompletion } from './graph-review-completion.js';
import { RP_REVIEW_REASON_CODES } from './rp-review-profile.js';
import { graphJudgeModelReceiptId, graphJudgeControlRef, readGraphJudgeCompletion } from './graph-judge-completion.js';
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
    constructor(args) { Object.assign(this, args); this.records = new Map(); this.lastOperations = new Map(); this.reruns = new Map(); }

    bundle(edges, graph) {
        const evidenceRefs = [], controlRefs = [], bindings = [];
        const judges = edges.map(edge => this.records.get(edge.from.nodeId)).filter(fact => fact?.controlRef?.kind === 'graph_judge_control');
        for (const edge of edges) {
            const fact = this.records.get(edge.from.nodeId);
            if (!fact) fail('native_orchestration_graph_dependency_unavailable');
            if (fact.resultRef && judges.some(judge => judge.candidateRefs.some(ref => equal(ref, fact.resultRef)) && !equal(judge.selectedResultRef, fact.resultRef))) {
                if (graph.nodes.find(node => node.nodeId === edge.to.nodeId).inputs.find(port => port.name === edge.to.port).required)
                    fail('native_orchestration_judge_required_input');
                continue;
            }
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
        { targetNodeId: (this.state.activeSelection ?? this.state.selected).node.nodeId, live: true, checkSelections: false });
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
                // A GraphPatch is control, not a disclosure grant. A model's
                // free task text can only become a task in a readable scope.
                const creator = active.graph.nodes.find(node => node.nodeId === producer.nodeId);
                for (const operation of actual.operations.filter(operation => operation.op === 'addNode')) {
                    if (!await this.canReadControl(creator, operation.node)) fail('native_orchestration_result_consume_denied');
                }
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

    async completeReview({ root, port, result, send, limits, signal }) {
        const { state, service } = this, { handle, attemptId, effectId } = state, runId = root.runId;
        const proof = await port.inspectResultCompletion(handle, { result, runId, effectId }), rows = [];
        const work = this.controlWork({ root, send, limits, signal }, rows), responseText = result.generated.response.text;
        const parsed = await work('graph_control_parse', responseText, async () => {
            if (Buffer.byteLength(responseText) > assertResultPolicy(root.graph.outputContract).maxBytes) fail('native_orchestration_review_response_invalid');
            const value = JSON.parse(responseText); assertObject(value, ['decision', 'reasonCode', 'targetAttemptIds'], 'Graph Review response');
            if (!['approve', 'rerun'].includes(value.decision) || !RP_REVIEW_REASON_CODES.includes(value.reasonCode)
                || (value.decision === 'approve') !== (value.reasonCode === 'quality_ready') || !Array.isArray(value.targetAttemptIds)
                || !value.targetAttemptIds.length || new Set(value.targetAttemptIds).size !== value.targetAttemptIds.length) fail('native_orchestration_review_response_invalid');
            return immutable(value);
        });
        const replacements = [], boundary = service.sourcePort.consumptionBoundary(handle, root.sourceBinding, { engine: service.runs.engine });
        const controller = new ReviewController({ runs: service.runs,
            authorizeReview: async ({ tx, root: active, reviewer, targets, decision, reasonCode, evidenceRefs }) => {
                await this.current();
                const facts = await this.inputs(tx, active), evidence = facts.filter(fact => fact.record);
                if (!equal(proof, await port.inspectResultCompletion(handle, { result, runId, effectId })) || reviewer.attemptId !== attemptId
                    || decision !== parsed.decision || reasonCode !== parsed.reasonCode || !equal(evidenceRefs, state.controlBundle.evidenceRefs)
                    || !equal([...parsed.targetAttemptIds].sort(), targets.map(target => target.attemptId).sort())
                    || targets.some(target => !evidence.some(fact => fact.producer.attemptId === target.attemptId)
                        || active.graph.nodes.find(node => node.nodeId === target.nodeId).kind !== 'agent')) fail('native_orchestration_review_producer_denied');
                if (decision === 'rerun' && [...this.records.entries()].some(([nodeId, fact]) => fact.controlRef?.kind === 'graph_planner_control'
                    && targets.some(target => graphReachable(active.graph, target.nodeId, nodeId)))) fail('native_orchestration_review_irreversible_dependency');
                await this.current();
            },
            admitRerun: async ({ tx, root: active, reviewer, target, attemptId: replacementId, invalidatedAttemptIds }) => {
                await this.current();
                const capacity = await service.budgetPort.observeCapacity(handle, { authorityRef: active.budgetAuthorityRef, reservationId: null }, { tx });
                const affected = [...this.records.values()].filter(fact => invalidatedAttemptIds.includes(fact.attemptId)).length;
                const admission = await readReviewAdmission(tx, handle, active, reviewer);
                if (!capacity || capacity.overrun || capacity.remaining.requests < affected + 2
                    || !admission || admission.round >= active.graph.nodes.find(node => node.nodeId === reviewer.nodeId).policy.maxRounds
                    || active.progress.reviews >= active.limits.maxReviews)
                    fail('native_orchestration_review_rerun_budget_unavailable');
                const bundle = this.bundle(active.graph.edges.filter(edge => !edge.loopBack && edge.to.nodeId === target.nodeId), active.graph);
                const feedback = { reviewReceiptRef: { runId, receiptId: reviewReceiptId(runId, reviewer.attemptId) }, reasonCode: parsed.reasonCode };
                const spec = await this.prepareRerun(active, target, replacementId, bundle, feedback);
                const inputRefs = [spec.input, ...bundle.evidenceRefs, ...bundle.controlRefs];
                replacements.push({ nodeId: target.nodeId, attemptId: replacementId, bundle, feedback, request: spec.request });
                await this.current();
                return { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: spec.grantDigest, budgetRef: active.budgetAuthorityRef };
            } });
        const decided = await work('graph_control_adopt', parsed, () => service.runs.withSourceControl(handle, runId, async () => controller.decide(handle, {
            ...runGuard(await service.runs.get(handle, runId)), reviewAttemptId: attemptId, decision: parsed.decision,
            targetAttemptIds: parsed.targetAttemptIds, reasonCode: parsed.reasonCode, evidenceRefs: state.controlBundle.evidenceRefs }), { withAuthority: boundary }));
        const review = decided.outcome.reviewReceipt, receiptId = graphReviewModelReceiptId(runId, attemptId);
        try {
            await service.runs.withSourceControl(handle, runId, async () => service.runs.control(handle, controlCommandId('graph.review.settle', attemptId), {
                ...runGuard(await service.runs.get(handle, runId)), operation: 'attempt.settle', detail: { attemptId, reviewReceiptId: review.receiptId } },
            async ({ tx, root: active, now, deny }) => {
                let record, retrieval;
                try {
                    const stamp = hash(active);
                    await this.current();
                    if (!equal(proof, await port.inspectResultCompletion(handle, { result, runId, effectId }))) fail('native_orchestration_review_producer_denied');
                    record = await readAttempt(tx, handle, active, attemptId);
                    retrieval = await readContextRetrievalCompletions(tx, handle, active, (await readEffect(tx, handle, active, effectId)).doc, record.doc);
                    if (record.doc.status !== 'running' || !equal(record.doc.effectRefs, [effectId, ...retrieval.map(item => item.effectId)])) fail('native_orchestration_review_producer_denied');
                    // A rerun has already invalidated its old evidence. Its
                    // durable decision is checked, without restoring a read.
                    if (review.decision === 'approve') await this.inputs(tx, active);
                    await this.current();
                    if (stamp !== hash(await service.runs.get(handle, runId))) return deny(new ConflictError('native_orchestration_review_producer_denied'));
                } catch (error) {
                    if (error instanceof ConflictError || error.code === 'native_rp_source_missing') return deny(error);
                    throw error;
                }
                const receipt = { schemaVersion: 1, receiptKind: 'graph_review_model', receiptId, runId, epoch: active.epoch, producerAttemptId: attemptId,
                    sourceBindingDigest: active.sourceBinding.bindingDigest, grantDigest: state.decision.grantDigest, modelEffectId: effectId,
                    modelReceiptRef: proof.receiptRef, modelPayloadHash: proof.payloadHash, responseText,
                    reviewReceiptRef: { runId, receiptId: review.receiptId }, reviewIntegrity: hash(review), localWork: rows, decisionSeq: active.eventSeq + 1, createdAt: now };
                await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), receipt);
                await writeAttemptSettlement({ tx, handle, root: active, record, outcome: 'completed', resultRefs: [],
                    effectReceiptRefs: [proof.receiptRef.receiptId, ...retrieval.map(item => item.receiptId)], reasonCode: 'graph_review_decided', now });
                active.progress.steps++;
                return { root: active, eventType: 'graph_review_completed', reasonCode: parsed.reasonCode, outcome: { controlRef: graphReviewControlRef(runId, attemptId) } };
            }), { withAuthority: boundary });
        } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            const observed = await service.runs.engine.withTransaction(handle, async tx => readGraphReviewCompletion(tx, handle,
                await service.runs.get(handle, runId), attemptId, rpReviewReaderOptions));
            if (!observed || !equal(observed.review, review)) throw error;
        }
        return { attemptId, controlRef: graphReviewControlRef(runId, attemptId), status: 'completed', review, replacements };
    }

    async completeJudge({ root, port, result, send, limits, signal }) {
        const { state, service } = this, { handle, attemptId, effectId } = state, runId = root.runId;
        const proof = await port.inspectResultCompletion(handle, { result, runId, effectId }), rows = [];
        const work = this.controlWork({ root, send, limits, signal }, rows), responseText = result.generated.response.text;
        const parsed = await work('graph_control_parse', responseText, async () => {
            if (Buffer.byteLength(responseText) > assertResultPolicy(root.graph.outputContract).maxBytes) fail('native_orchestration_judge_response_invalid');
            const value = JSON.parse(responseText); assertObject(value, ['selectedResultRef', 'reasonCode'], 'Graph Judge response');
            if (value.reasonCode !== 'candidate_selected' || !state.controlBundle.evidenceRefs.some(ref => equal(ref, value.selectedResultRef)))
                fail('native_orchestration_judge_response_invalid');
            return immutable(value);
        });
        const candidateRefs = state.controlBundle.evidenceRefs, selectedResultRef = parsed.selectedResultRef;
        const receiptId = graphJudgeModelReceiptId(runId, attemptId), boundary = service.sourcePort.consumptionBoundary(handle, root.sourceBinding, { engine: service.runs.engine });
        const adopted = await work('graph_control_adopt', parsed, () => service.runs.engine.withTransaction(handle, async tx => {
            try {
                const active = await service.runs.get(handle, runId);
                await this.current();
                if (!equal(proof, await port.inspectResultCompletion(handle, { result, runId, effectId }))) fail('native_orchestration_judge_producer_denied');
                await this.inputs(tx, active);
                const record = await readAttempt(tx, handle, active, attemptId);
                for (const ref of candidateRefs) await this.revalidateResult(tx, active, record.doc, ref);
                await service.sourcePort.revalidate(handle, active.sourceBinding, { tx, root: active });
                await service.budgetPort.assertCurrent(handle, active.budgetAuthorityRef, { tx });
                await this.current();
                return { denied: false };
            } catch (error) {
                // Commit an independently withdrawn Source/binding before
                // rejecting this read-only adoption. No decision is written.
                if (error instanceof ConflictError || ['native_rp_source_missing', 'native_orchestration_source_stale'].includes(error.code))
                    return { denied: true, code: error.code ?? 'native_orchestration_judge_producer_denied' };
                throw error;
            }
        }));
        if (adopted.denied) fail(adopted.code);
        try {
            await service.runs.withSourceControl(handle, runId, async () => service.runs.control(handle,
                controlCommandId('graph.judge.settle', attemptId), { ...runGuard(await service.runs.get(handle, runId)), operation: 'attempt.settle', detail: { attemptId, selectedResultRef } },
                async ({ tx, root: active, now, deny }) => {
                    let record, retrieval;
                    try {
                        const stamp = hash(active);
                        await this.current();
                        if (!equal(proof, await port.inspectResultCompletion(handle, { result, runId, effectId }))) fail('native_orchestration_judge_producer_denied');
                        record = await readAttempt(tx, handle, active, attemptId);
                        retrieval = await readContextRetrievalCompletions(tx, handle, active, (await readEffect(tx, handle, active, effectId)).doc, record.doc);
                        const facts = await this.inputs(tx, active);
                        if (record.doc.status !== 'running' || !equal(record.doc.effectRefs, [effectId, ...retrieval.map(item => item.effectId)])
                            || !candidateRefs.length || facts.filter(fact => fact.record).length !== candidateRefs.length) fail('native_orchestration_judge_producer_denied');
                        // Current Result access remains separate from a durable
                        // choice. A choice never declassifies another Actor.
                        for (const ref of candidateRefs) await this.revalidateResult(tx, active, record.doc, ref);
                        await this.current();
                        if (stamp !== hash(await service.runs.get(handle, runId))) return deny(new ConflictError('native_orchestration_judge_producer_denied'));
                    } catch (error) {
                        if (error instanceof ConflictError || ['native_rp_source_missing', 'native_orchestration_source_stale'].includes(error.code)) return deny(error);
                        throw error;
                    }
                    const receipt = { schemaVersion: 1, receiptKind: 'graph_judge_model', receiptId, runId, epoch: active.epoch, producerAttemptId: attemptId,
                        sourceBindingDigest: active.sourceBinding.bindingDigest, grantDigest: state.decision.grantDigest, modelEffectId: effectId,
                        modelReceiptRef: proof.receiptRef, modelPayloadHash: proof.payloadHash, responseText, candidateRefs, selectedResultRef,
                        localWork: rows, decisionSeq: active.eventSeq + 1, createdAt: now };
                    await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), receipt);
                    await writeAttemptSettlement({ tx, handle, root: active, record, outcome: 'completed', resultRefs: [],
                        effectReceiptRefs: [proof.receiptRef.receiptId, ...retrieval.map(item => item.receiptId)], reasonCode: 'graph_judge_selected', now });
                    active.progress.steps++;
                    return { root: active, eventType: 'graph_judge_completed', reasonCode: 'candidate_selected', outcome: { judgeReceiptRef: { runId, receiptId } } };
                }), { withAuthority: boundary });
        } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            const fact = await service.runs.engine.withTransaction(handle, async tx => readGraphJudgeCompletion(tx, handle,
                await service.runs.get(handle, runId), attemptId, rpJudgeReaderOptions));
            if (!fact || !equal(fact.selectedResultRef, selectedResultRef) || fact.receipt.modelPayloadHash !== proof.payloadHash) throw error;
        }
        return { attemptId, controlRef: graphJudgeControlRef(runId, attemptId), candidateRefs, selectedResultRef, status: 'completed' };
    }

    async plannerTask(root, recipient) {
        const graph = cloneNativeDocument(root.graph);
        // Preserve the authoritative GraphRevision and receipts. This is only
        // the model's inventory: dynamic free metadata retains its creator's
        // original Source scope even when control dependencies are readable.
        for (const record of this.records.values()) {
            if (record.controlRef?.kind !== 'graph_planner_control') continue;
            const fact = await this.service.runs.engine.withTransaction(this.state.handle, tx =>
                readGraphPlannerCompletion(tx, this.state.handle, root, record.attemptId, rpPlannerReaderOptions));
            if (!fact) fail('native_orchestration_rp_control_stale');
            const creator = root.graph.nodes.find(node => node.nodeId === fact.producer.nodeId);
            if (await this.canReadControl(creator, recipient)) continue;
            for (const operation of fact.patch.appliedOperations) {
                if (operation.op === 'addNode') {
                    const index = graph.nodes.findIndex(node => node.nodeId === operation.node.nodeId);
                    if (index < 0) fail('native_orchestration_rp_control_stale');
                    graph.nodes[index] = { nodeId: operation.node.nodeId, kind: operation.node.kind, disclosure: 'reference-only' };
                } else if (operation.op === 'addEdge') {
                    const index = graph.edges.findIndex(edge => edge.edgeId === operation.edge.edgeId);
                    if (index < 0) fail('native_orchestration_rp_control_stale');
                    const edge = operation.edge;
                    graph.edges[index] = { edgeId: edge.edgeId, from: { nodeId: edge.from.nodeId }, to: { nodeId: edge.to.nodeId }, disclosure: 'reference-only' };
                }
            }
        }
        return rpControlPlannerTask(graph, this.state.selected.plan.dependencyPins);
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
            const rerun = this.reruns.get(next.node.nodeId);
            state.activeSelection = selected; state.controlBundle = rerun?.bundle ?? this.bundle(next.edges, root.graph);
            state.controlFeedback = rerun?.feedback; state.controlRequest = rerun?.request; state.controlOrdinal = root.attemptRefs.length;
            const facts = await service.runs.engine.withTransaction(handle, tx => this.inputs(tx, root));
            const controls = [];
            for (const fact of facts.filter(fact => fact.controlRef)) {
                const readable = !fact.patch || await this.canReadControl(root.graph.nodes.find(node => node.nodeId === fact.producer.nodeId), next.node);
                controls.push({ controlRef: fact.controlRef,
                    ...(fact.patch ? readable ? { operations: fact.patch.appliedOperations }
                        : { disclosure: 'reference-only', operationKinds: fact.patch.appliedOperations.map(operation => operation.op) }
                        : fact.review ? { decision: fact.review.decision, reasonCode: fact.review.reasonCode, targetAttemptIds: fact.review.targetAttemptIds }
                            : { selectedResultRef: fact.selectedResultRef, reasonCode: 'candidate_selected' }) });
            }
            const planner = next.node.kind === 'planner', review = next.node.kind === 'review', judge = next.node.kind === 'judge', final = next.node.nodeId === state.selected.node.nodeId;
            const controlTask = planner ? await this.plannerTask(root, next.node)
                : review ? { kind: 'native_rp_graph_review', instruction: 'Review only the supplied direct Result evidence. Return decision approve or rerun, a fixed quality reasonCode, and exact targetAttemptIds from this evidence. This never approves permissions or domain Effects.',
                    evidence: facts.filter(fact => fact.record).map(fact => ({ attemptId: fact.producer.attemptId, resultRef: fact.receipt.resultRef })) }
                    : judge ? { kind: 'native_rp_graph_judge', instruction: 'Select exactly one of the supplied direct typed candidate Result references. Return selectedResultRef and reasonCode candidate_selected. This quality choice never grants permissions or changes any Audience.',
                        candidates: facts.filter(fact => fact.record).map(fact => ({ resultRef: fact.receipt.resultRef, attemptId: fact.producer.attemptId })) }
                        : { kind: final ? 'native_rp_graph_narration' : 'native_rp_graph_draft', instruction: 'Perform the current declared task using only authorized direct predecessor evidence. Advisory results and graph control are not official facts, permission or a domain commit.' };
            controlTask.controls = controls;
            if (rerun) controlTask.feedback = rerun.feedback;
            const result = await this.withCapture(selected, controlTask, () => this.generate({ planner, review, judge, graphNode: !planner && !review && !judge && !final,
                graphRunId: root.runId, preparedAttemptId: rerun?.attemptId ?? null }));
            this.reruns.delete(next.node.nodeId);
            if (final) return result;
            if (result.review?.decision === 'rerun') {
                for (const [nodeId, fact] of this.records) if (result.review.invalidatedAttemptIds.includes(fact.attemptId)) this.records.delete(nodeId);
                for (const replacement of result.replacements) this.reruns.set(replacement.nodeId, replacement);
            } else this.records.set(next.node.nodeId, planner || review || judge ? result : { attemptId: state.attemptId, resultRef: result.resultRef, status: 'completed' });
        }
    }
}
