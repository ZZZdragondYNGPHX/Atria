import { hashNativeDocument as hash, cloneNativeDocument, putImmutable, equalNativeDocuments as equal } from '../repositories/common.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { assertObject, assertResultPolicy } from '../../../public/shared/native-orchestration-contracts.js';
import { inspectGraphReadiness } from './graph-work-readiness.js';
import { rpControlGraph, rpControlPlannerTask, rpControlReplanScope } from './rp-control-graph.js';
import { readRpControlInputs, rpPlannerReaderOptions, rpReviewReaderOptions, rpJudgeReaderOptions } from './rp-control-input-contracts.js';
import { AttemptController } from './attempt-controller.js';
import { TransitionController } from './transition-controller.js';
import { FanoutController, readFanoutFrame, readFanoutMembership, readFanoutReviewScope, readFanoutReplanScope } from './fanout-controller.js';
import { JoinController, joinIdForAttempt } from './join-controller.js';
import { readRpControlFanoutCompletion } from './rp-control-fanout-contracts.js';
import { GraphController } from './graph-controller.js';
import { graphPatchHash } from './graph-revision-contracts.js';
import { graphPlannerControlRef, graphPlannerReceiptId, readGraphPlannerCompletion, graphPlannerProgressFingerprint } from './graph-planner-completion.js';
import { controlCommandId, controlRecordKey, runGuard, readAttempt, graphReachable, readReviewAdmission,
    readGraphReviewReceipt, readAttemptInvalidation, assertAttemptConsumable, assertAttemptCurrent } from './controller-common.js';
import { ReviewController, reviewReceiptId } from './review-controller.js';
import { graphReviewModelReceiptId, graphReviewControlRef, readGraphReviewCompletion, readReviewablePlannerCompletion, readReviewableFanoutCompletion, readReviewableDelegationCompletion } from './graph-review-completion.js';
import { RP_REVIEW_REASON_CODES } from './rp-review-profile.js';
import { graphJudgeModelReceiptId, graphJudgeControlRef, readGraphJudgeCompletion } from './graph-judge-completion.js';
import { readEffect } from './effect-contracts.js';
import { readContextRetrievalCompletions } from './context-retrieval-contracts.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { writeAttemptSettlement } from './attempt-settlement.js';
import { ConflictError } from '../../storage/errors.js';

import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { assertRpFanoutPlannerPatch, readRpFanoutPaidModelNodes } from './rp-fanout-planner-contracts.js';

const fail = code => { throw Object.assign(new TypeError(code), { code }); };

/** RP consumer of the original Scheduler/Graph/Transition/Model/Output ports.
 * This map holds only references to durable facts, never an authority or bank. */
export class RpControlGraphWork {
    constructor(args) { Object.assign(this, args); this.records = new Map(); this.plannerHistory = []; this.lastOperations = new Map(); this.reruns = new Map(); }

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
            for (const ref of fact.evidenceRefs ?? []) if (!evidenceRefs.some(existing => equal(existing, ref))) evidenceRefs.push(ref);
            if (fact.controlRef && !controlRefs.some(ref => equal(ref, fact.controlRef))) controlRefs.push(fact.controlRef);
        }
        return { evidenceRefs, controlRefs, bindings };
    }

    async inputs(tx, root, { live = true } = {}) {
        const selected = this.state.activeSelection ?? this.state.selected;
        const actual = this.state.fanoutParent && this.state.attemptId ? (await readAttempt(tx, this.state.handle, root, this.state.attemptId)).doc : null;
        const recipient = actual?.nodeId === selected.node.nodeId && (!live || ['running', 'waiting_effect'].includes(actual.status)) ? actual : null;
        return readRpControlInputs(tx, this.state.handle, root, this.state.controlBundle,
            { targetNodeId: selected.node.nodeId, live, recipient, fanoutAttemptId: this.state.fanoutParent?.fanoutAttemptId });
    }

    async currentInputs(tx, root) {
        const bundle = this.state.controlBundle;
        if (!bundle.controlRefs.length) return [];

        const producers = new Set(bundle.controlRefs.map(ref => ref.attemptId));
        const selected = this.state.activeSelection ?? this.state.selected, handle = this.state.handle;
        const controls = { evidenceRefs: [], controlRefs: bundle.controlRefs,
            bindings: bundle.bindings.filter(binding => producers.has(binding.producerAttemptId)) };
        // A Review's own durable rerun decision invalidates its old Planner
        // input before its Model receipt settles. Re-prove only that saga's
        // historical input; every other live consumer keeps the original rule.
        const reviewer = selected.node.kind === 'review' && this.state.attemptId
            ? (await readAttempt(tx, handle, root, this.state.attemptId)).doc : null;
        const review = reviewer?.nodeId === selected.node.nodeId && reviewer.status === 'running'
            ? await readGraphReviewReceipt(tx, handle, root, reviewer) : null;
        if (review?.decision !== 'rerun') return this.state.fanoutParent ? this.inputs(tx, root) : readRpControlInputs(tx, handle, root, controls,
            { targetNodeId: selected.node.nodeId, live: true, checkSelections: false, controlsOnly: true });
        await assertAttemptCurrent(tx, handle, root, reviewer);
        if (root.status !== 'running' || root.cancelRequested || reviewer.epoch !== root.epoch
            || reviewer.sourceBindingDigest !== root.sourceBinding.bindingDigest
            || !equal(reviewer.inputRefs[0]?.controlGraph, bundle) || reviewer.inputDigest !== hash(reviewer.inputRefs)
            || !equal(review.evidenceRefs, bundle.evidenceRefs)) fail('native_orchestration_review_producer_denied');
        const commandId = controlCommandId('review.decide', review.receiptId);
        const command = (await tx.getResource({ kind: K.orchestrationCommand, handle, commandId }))?.doc;
        const detail = { reviewAttemptId: reviewer.attemptId, decision: review.decision,
            targetAttemptIds: [...review.targetAttemptIds].sort(), reasonCode: review.reasonCode, evidenceRefs: review.evidenceRefs };
        if (!command || command.schemaVersion !== 1 || command.commandId !== commandId || command.target !== root.runId
            || command.operation !== 'runs.control.review.decide' || !equal(command.outcome?.reviewReceipt, review)
            || command.payloadHash !== hash({ operation: command.operation, body: { runId: root.runId, operation: 'review.decide', detail } }))
            fail('native_orchestration_review_producer_denied');
        const facts = await readRpControlInputs(tx, handle, root, controls,
            { targetNodeId: selected.node.nodeId, checkSelections: false, controlsOnly: true,
                recipient: reviewer, fanoutAttemptId: this.state.fanoutParent?.fanoutAttemptId });
        for (const fact of facts) {
            const invalidation = await readAttemptInvalidation(tx, handle, root, fact.producer);
            if (!invalidation) { await assertAttemptConsumable(tx, handle, root, fact.producer); continue; }
            const targets = await Promise.all(review.targetAttemptIds.map(async id => (await readAttempt(tx, handle, root, id)).doc));
            const readCompletion = this.readFanoutCompletion ?? readRpControlFanoutCompletion;
            const completed = fact.controlRef?.kind === 'graph_join_control'
                ? await readReviewableFanoutCompletion(tx, handle, root, fact.producer.attemptId, { targets, readCompletion })
                : fact.controlRef?.kind === 'graph_planner_control'
                    ? await readReviewablePlannerCompletion(tx, handle, root, fact.producer.attemptId, { ...this.plannerReaderOptions ?? rpPlannerReaderOptions,
                        reviewTargets: targets, readFanoutCompletion: readCompletion, reviewer, reviewDecisionSeq: review.decisionSeq }) : null;
            if (!completed || !equal(completed, fact) || invalidation.reviewReceiptId !== review.receiptId
                || invalidation.reviewIntegrity !== hash(review) || !review.invalidatedAttemptIds.includes(fact.producer.attemptId)
                || fact.receipt.decisionSeq >= review.decisionSeq)
                fail('native_orchestration_review_producer_denied');
        }
        return facts;
    }

    async describeControls(root, recipient) {
        const facts = await this.service.runs.engine.withTransaction(this.state.handle, tx => this.inputs(tx, root));
        const controls = [];
        for (const fact of facts.filter(fact => fact.controlRef)) {
            const readable = !fact.patch || await this.canReadControl(root.graph.nodes.find(node => node.nodeId === fact.producer.nodeId), recipient);
            controls.push({ controlRef: fact.controlRef,
                ...(fact.patch ? readable ? { operations: fact.patch.appliedOperations }
                    : { disclosure: 'reference-only', operationKinds: fact.patch.appliedOperations.map(operation => operation.op) }
                    : fact.review ? { decision: fact.review.decision, reasonCode: fact.review.reasonCode, targetAttemptIds: fact.review.targetAttemptIds }
                        : fact.joinReceipt ? { joinId: fact.joinReceipt.joinId, outcome: fact.joinReceipt.outcome, acceptedResultRefs: fact.joinReceipt.acceptedResultRefs }
                            : { selectedResultRef: fact.selectedResultRef, reasonCode: 'candidate_selected' }) });
        }
        return controls;
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
        const current = await service.runs.get(handle, runId);
        const evidence = await service.runs.engine.withTransaction(handle, tx => this.inputs(tx, current));
        const progressKey = graphPlannerProgressFingerprint(parsed.operations, root.sourceBinding, evidence.filter(fact => fact.record || fact.controlRef && fact.producer.nodeId !== nodeId));
        if (this.lastOperations.get(nodeId)?.has(progressKey)) fail('native_orchestration_planner_no_progress');
        const patch = { schemaVersion: 1,
            patchId: 'opatch_' + hash({ runId, attemptId }).slice(0, 32), runId, producerAttemptId: attemptId, expectedEpoch: current.epoch,
            expectedGraphRevision: current.graphRevision, operations: parsed.operations,
            reasonRefs: [{ kind: 'source', bindingDigest: current.sourceBinding.bindingDigest },
                ...state.controlBundle.evidenceRefs.map(ref => ({ kind: 'result', resultId: ref.resultId }))], payloadHash: '' };
        patch.payloadHash = graphPatchHash(patch);
        const boundary = service.sourcePort.consumptionBoundary(handle, root.sourceBinding, { engine: service.runs.engine });
        const proposed = await work('graph_control_adopt', patch, () => service.runs.withSourceControl(handle, runId, async () => new GraphController({ runs: service.runs,
            authorizePatch: async ({ tx, root: active, producer, patch: actual }) => {
                await this.current();
                if (!equal(proof, await port.inspectResultCompletion(handle, { result, runId, effectId }))
                    || producer.attemptId !== attemptId || !equal(actual, patch)) fail('native_orchestration_planner_producer_denied');
                const scopedReplan = state.fanoutParent ? await assertRpFanoutPlannerPatch(tx, handle, active, producer, actual) : null;
                const candidate = cloneNativeDocument(active.graph);
                for (const operation of actual.operations) {
                    if (operation.op === 'addNode') candidate.nodes.push(operation.node);
                    if (operation.op === 'addEdge') candidate.edges.push(operation.edge);
                }
                const admission = this.admitGraph ? this.admitGraph(candidate) : rpControlGraph({ ...state.selected.plan, definition: candidate }, { force: true });
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
                const capacity = await service.budgetPort.observeCapacity(handle, { authorityRef: active.budgetAuthorityRef, reservationId: this.reservationId ?? null }, { tx });
                const repeats = actual.operations.some(operation => operation.op === 'requestReplan')
                    ? scopedReplan?.affectedNodeIds ?? (candidate.edges.some(edge => edge.loopBack && edge.from.nodeId === nodeId)
                        ? rpControlReplanScope(candidate, nodeId).affectedNodeIds : [nodeId]) : [];
                const paid = state.fanoutParent ? await readRpFanoutPaidModelNodes(tx, handle, active) : null;
                const cancelled = new Set(actual.operations.filter(operation => operation.op === 'cancelPending').map(operation => operation.nodeId));
                const requiredModels = await Promise.all(admission.models.filter(node => !cancelled.has(node.nodeId) && active.nodeControl[node.nodeId]?.disposition !== 'cancelled'
                    && (repeats.includes(node.nodeId) || (paid ? !paid.has(node.nodeId) : !this.records.has(node.nodeId)) && node.nodeId !== nodeId))
                    .map(node => state.selected.resolveGraphModel(node)));
                const required = requiredModels.reduce((sum, model) => sum + 1 + (model.child?.resolved.route.executionPolicy.computeBudget.maxRequests ?? 0), 0);
                if (!capacity || capacity.overrun || capacity.remaining.requests < required) fail('native_orchestration_graph_budget_unavailable');
                await this.inputs(tx, active);
                await this.current();
            } }).propose(handle, { expectedStateVersion: state.fanoutParent ? (await service.runs.get(handle, runId)).stateVersion : current.stateVersion, patch }), { withAuthority: boundary }));
        const accepted = proposed.outcome.patchReceipt;
        if (!accepted.accepted) fail('native_orchestration_planner_patch_rejected');
        if (accepted.requests.replan && accepted.requests.finalize) fail('native_orchestration_planner_replan_pending');
        if (accepted.requests.replan) rpControlReplanScope((await service.runs.get(handle, runId)).graph, nodeId);
        const receiptId = graphPlannerReceiptId(runId, attemptId);
        await service.runs.withSourceControl(handle, runId, async () => service.runs.control(handle, controlCommandId('graph.planner.settle', attemptId), {
            ...runGuard(current), expectedGraphRevision: accepted.newGraphRevision, expectedStateVersion: state.fanoutParent ? (await service.runs.get(handle, runId)).stateVersion : proposed.outcome.versions.stateVersion,
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
        const keys = this.lastOperations.get(nodeId) ?? new Set(); keys.add(progressKey); this.lastOperations.set(nodeId, keys);
        const fact = await service.runs.engine.withTransaction(handle, async tx => readGraphPlannerCompletion(tx, handle,
            await service.runs.get(handle, runId), attemptId, this.plannerReaderOptions ?? rpPlannerReaderOptions));
        if (!fact) fail('native_orchestration_rp_control_stale');
        return { attemptId, controlRef: fact.controlRef, requests: fact.patch.requests, status: 'completed' };
    }

    async fanoutReplan({ tx, root, completion, progress, branch }) {
        const handle = this.state.handle;
        const fact = await readGraphPlannerCompletion(tx, handle, root, completion.attemptId, this.plannerReaderOptions ?? rpPlannerReaderOptions);
        const scope = fact && await readFanoutReplanScope(tx, handle, root, fact.producer);
        const original = fact && rpControlReplanScope(root.graph, fact.producer.nodeId);
        if (!fact || !fact.patch.requests.replan || fact.patch.requests.finalize || !equal(fact.controlRef, completion.controlRef)
            || !scope || !equal(scope.branch.scopeNodeIds, branch.scopeNodeIds) || original.target.nodeId !== scope.target.nodeId
            || !equal(original.loops, scope.loops)) fail('native_orchestration_planner_replan_pending');
        // Unexecuted members keep their frozen reserved identity, already
        // counted in progress.attempts; only executed members open a new Attempt.
        const effects = [];
        let repeated = 0;
        for (const id of scope.affectedNodeIds) {
            const prior = progress.get(id);
            if (!prior) continue;
            const attempt = (await readAttempt(tx, handle, root, prior.attemptId)).doc;
            if (attempt.status !== 'completed') fail('native_orchestration_planner_replan_pending');
            effects.push(...attempt.effectRefs); repeated++;
        }
        const costs = effects.length ? await this.service.budgetPort.observeEffectClosure(handle,
            { authorityRef: root.budgetAuthorityRef, effectIds: effects }, { tx }) : null;
        const capacity = await this.service.budgetPort.observeCapacity(handle,
            { authorityRef: root.budgetAuthorityRef, reservationId: this.reservationId ?? null }, { tx });
        const models = await Promise.all(scope.affectedNodeIds.map(id => this.state.selected.resolveGraphModel(root.graph.nodes.find(node => node.nodeId === id))));
        const requests = models.reduce((sum, model) => sum + 1 + (model.child?.resolved.route.executionPolicy.computeBudget.maxRequests ?? 0), 0);
        if (!costs?.closed || !capacity || capacity.overrun || capacity.remaining.requests < requests) fail('native_orchestration_graph_budget_unavailable');
        if (root.progress.attempts + repeated > root.limits.maxAttempts) fail('native_orchestration_limit_exhausted');
        return { target: scope.target, affectedNodeIds: scope.affectedNodeIds, loopBindings: scope.loops.map(edge => ({ edge, ...completion })) };
    }

    async reviewRerunRequests(root, reviewer, invalidatedIds, { tx } = {}) {
        const scoped = !!reviewer.inputRefs[0]?.fanoutAttemptId;
        const paid = scoped ? await readRpFanoutPaidModelNodes(tx, this.state.handle, root) : new Set();
        const invalidatedNodes = new Set();
        if (scoped) for (const id of invalidatedIds) invalidatedNodes.add((await readAttempt(tx, this.state.handle, root, id)).doc.nodeId);
        const nodes = root.graph.nodes.filter(node => ['agent', 'planner', 'review', 'judge'].includes(node.kind)
            && root.nodeControl[node.nodeId]?.disposition !== 'cancelled'
            && (node.nodeId === reviewer.nodeId || scoped && invalidatedNodes.has(node.nodeId)
                || !this.records.has(node.nodeId) && !paid.has(node.nodeId)
                || this.records.has(node.nodeId) && invalidatedIds.includes(this.records.get(node.nodeId).attemptId)));
        let requests = 0;
        for (const node of nodes) {
            const selected = await this.state.selected.resolveGraphModel(node);
            requests += 1 + (selected.child?.resolved.route.executionPolicy.computeBudget.maxRequests ?? 0);
        }
        return requests;
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
                if (decision === 'rerun' && reviewer.inputRefs[0]?.fanoutAttemptId
                    && !await readFanoutReviewScope(tx, handle, active, reviewer, targets)) fail('native_orchestration_review_irreversible_dependency');
                if (decision === 'rerun') for (const [nodeId, fact] of this.records) {
                    if (!targets.some(target => graphReachable(active.graph, target.nodeId, nodeId))) continue;
                    const readCompletion = this.readFanoutCompletion ?? readRpControlFanoutCompletion;
                    if ((await readAttempt(tx, handle, active, fact.attemptId)).doc.inputRefs[0]?.kind === 'native_rp_delegation') {
                        if (!await readReviewableDelegationCompletion(tx, handle, active, fact.attemptId))
                            fail('native_orchestration_review_irreversible_dependency');
                        continue;
                    }
                    if (fact.controlRef?.kind === 'graph_join_control'
                        && !await readReviewableFanoutCompletion(tx, handle, active, fact.attemptId, { targets, readCompletion })
                        || fact.controlRef?.kind === 'graph_planner_control'
                            && !await readReviewablePlannerCompletion(tx, handle, active, fact.attemptId, { ...this.plannerReaderOptions ?? rpPlannerReaderOptions,
                                reviewTargets: targets, readFanoutCompletion: readCompletion, reviewer }))
                        fail('native_orchestration_review_irreversible_dependency');
                }
                await this.current();
            },
            admitRerun: async ({ tx, root: active, reviewer, target, attemptId: replacementId, invalidatedAttemptIds }) => {
                await this.current();
                const capacity = await service.budgetPort.observeCapacity(handle, { authorityRef: active.budgetAuthorityRef, reservationId: this.reservationId ?? null }, { tx });
                const admission = await readReviewAdmission(tx, handle, active, reviewer);
                const requiredRequests = this.reviewRerunRequests ? await this.reviewRerunRequests(active, reviewer, invalidatedAttemptIds, { tx })
                    : active.graph.nodes.filter(node => ['agent', 'planner', 'review', 'judge'].includes(node.kind)
                        && active.nodeControl[node.nodeId]?.disposition !== 'cancelled'
                        && (node.nodeId === reviewer.nodeId || !this.records.has(node.nodeId)
                            || invalidatedAttemptIds.includes(this.records.get(node.nodeId).attemptId))).length;
                if (!capacity || capacity.overrun || capacity.remaining.requests < requiredRequests
                    || !admission || admission.round >= active.graph.nodes.find(node => node.nodeId === reviewer.nodeId).policy.maxRounds
                    || active.progress.reviews >= active.limits.maxReviews)
                    fail('native_orchestration_review_rerun_budget_unavailable');
                const bundle = reviewer.inputRefs[0]?.fanoutAttemptId ? target.inputRefs[0].controlGraph
                    : this.bundle(active.graph.edges.filter(edge => !edge.loopBack && edge.to.nodeId === target.nodeId), active.graph);
                const feedback = { reviewReceiptRef: { runId, receiptId: reviewReceiptId(runId, reviewer.attemptId) }, reasonCode: parsed.reasonCode };
                const spec = await this.prepareRerun(active, target, replacementId, bundle, feedback);
                const inputRefs = spec.inputRefs ?? [spec.input, ...bundle.evidenceRefs, ...bundle.controlRefs];
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
                await service.runs.get(handle, runId), attemptId, this.reviewReaderOptions ?? rpReviewReaderOptions));
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
        for (const record of this.plannerHistory) {
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

    async controlNode(node, bundle, fanoutAttemptId = null) {
        const { handle, graphRunId: runId } = this.state, { runs } = this.service;
        const root = await runs.get(handle, runId), input = { kind: 'native_rp_graph_control', nodeId: node.nodeId,
            planRef: root.planRef, sourceRef: root.sourceBinding.sourceRef, acceptedGraphResultRefs: bundle.evidenceRefs,
            acceptedControlRefs: bundle.controlRefs, controlGraph: bundle, ...(fanoutAttemptId ? { fanoutAttemptId } : {}) };
        const inputRefs = [input, ...bundle.evidenceRefs, ...bundle.controlRefs], grantDigest = hash({ handle, source: root.sourceBinding, inputRefs });
        const admission = { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: grantDigest, budgetRef: root.budgetAuthorityRef };
        if (bundle.bindings.length) {
            const advanced = await new TransitionController({ runs, authorizeTransition: async args => {
                const facts = await readRpControlInputs(args.tx, handle, args.root, bundle, { targetNodeId: node.nodeId, live: true });
                if (args.producers.length !== bundle.bindings.length || args.producers.some(item => !bundle.bindings.some(binding => binding.edgeId === item.edge.edgeId
                    && binding.producerAttemptId === item.attempt.attemptId) || !facts.some(fact => fact.producer.attemptId === item.attempt.attemptId))) fail('native_orchestration_rp_control_stale');
                await this.currentFanout(); return admission;
            } }).advance(handle, { ...runGuard(root), bindings: bundle.bindings, reservedAttemptId: null });
            return advanced.outcome.attemptId;
        }
        return (await runs.beginAttempt(handle, controlCommandId('rp.graph.control', { runId, nodeId: node.nodeId, fanoutAttemptId, inputDigest: admission.inputDigest }),
            { ...runGuard(root), nodeId: node.nodeId, ...admission })).attemptId;
    }

    mergeBundle(bundle, inherited) {
        return { ...bundle, evidenceRefs: [...new Map([...bundle.evidenceRefs, ...inherited.evidenceRefs].map(ref => [hash(ref), ref])).values()],
            controlRefs: [...new Map([...bundle.controlRefs, ...inherited.controlRefs].map(ref => [hash(ref), ref])).values()] };
    }

    async fanout(profile, inherited) {
        const { handle, graphRunId: runId } = this.state, { runs, sourcePort, budgetPort } = this.service;
        const current = async () => { await this.currentFanout(); return runs.get(handle, runId); };
        const withAuthority = sourcePort.consumptionBoundary(handle, this.state.sourceBinding, { engine: runs.engine });
        this.state.fanoutBranches ??= new Map();
        const fanoutAttemptId = await this.controlNode(profile.fanout, inherited);
        await new AttemptController({ runs, authorizeAttempt: async ({ attempt }) => {
            await current(); if (attempt.attemptId !== fanoutAttemptId) fail('native_orchestration_rp_control_stale');
        } }).activate(handle, { ...runGuard(await current()), attemptId: fanoutAttemptId });
        this.records.set(profile.fanout.nodeId, { attemptId: fanoutAttemptId, status: 'running' });
        const declared = [];
        for (const branch of profile.branches) {
            const root = await current(), spec = await this.prepareBranch(branch.entry, root, { ...inherited, bindings: [] }, fanoutAttemptId);
            const inputRefs = [spec.input, ...inherited.evidenceRefs, ...inherited.controlRefs];
            const begun = await runs.beginAttempt(handle, controlCommandId('rp.control.fanout.entry', { runId, fanoutAttemptId, nodeId: branch.entry.nodeId }), {
                ...runGuard(await current()), nodeId: branch.entry.nodeId, inputRefs, inputDigest: hash(inputRefs),
                effectiveGrantDigest: spec.grantDigest, budgetRef: root.budgetAuthorityRef });
            const attempts = new Map([[branch.entry.nodeId, begun.attemptId]]), models = new Map([[branch.entry.nodeId, spec.stage]]);
            for (const nodeId of branch.scopeNodeIds.filter(id => id !== branch.entry.nodeId)) {
                const node = root.graph.nodes.find(node => node.nodeId === nodeId), model = await this.state.selected.resolveGraphModel(node);
                const reserved = await new AttemptController({ runs, authorizeAttempt: async () => {}, authorizeReservation: async ({ producer, target }) => {
                    await current();
                    if (producer.attemptId !== fanoutAttemptId || !branch.scopeNodeIds.includes(target.nodeId)) fail('native_orchestration_rp_control_stale');
                } }).reserve(handle, { ...runGuard(await current()), producerAttemptId: fanoutAttemptId, nodeId });
                attempts.set(nodeId, reserved.outcome.attemptId); models.set(nodeId, model);
            }
            declared.push({ branch, attempts, models, entry: spec });
        }
        const joinAttemptId = await this.controlNode(profile.join, { evidenceRefs: [], controlRefs: [], bindings: [] }, fanoutAttemptId);
        const branches = declared.map(item => ({ entryAttemptId: item.attempts.get(item.branch.entry.nodeId), memberAttemptIds: [...item.attempts.values()].sort(),
            scopeNodeIds: item.branch.scopeNodeIds }));
        await new FanoutController({ runs, authorizeGroup: async ({ tx, root, producer, branches: actual }) => {
            await current();
            if (producer.attemptId !== fanoutAttemptId || !equal(actual.map(branch => ({ entryAttemptId: branch.entry.attemptId,
                memberAttemptIds: branch.members.map(member => member.attemptId).sort(), scopeNodeIds: branch.scopeNodeIds })).sort((a, b) => a.entryAttemptId.localeCompare(b.entryAttemptId)),
            [...branches].sort((a, b) => a.entryAttemptId.localeCompare(b.entryAttemptId)))) fail('native_orchestration_rp_control_stale');
            const capacity = await budgetPort.observeCapacity(handle, { authorityRef: root.budgetAuthorityRef, reservationId: null }, { tx });
            const remainingModels = await Promise.all(rpControlGraph({ ...this.state.selected.plan, definition: root.graph }, { force: true }).models
                .filter(node => !this.records.has(node.nodeId)).map(node => this.state.selected.resolveGraphModel(node)));
            const requiredRequests = remainingModels.reduce((sum, model) => sum + 1 + (model.child?.resolved.route.executionPolicy.computeBudget.maxRequests ?? 0), 0);
            if (!capacity || capacity.overrun || capacity.remaining.requests < requiredRequests)
                fail('native_orchestration_rp_graph_budget_unavailable');
        } }).freeze(handle, { ...runGuard(await current()), fanoutAttemptId, branches });
        const terminalIds = profile.members.map(edge => declared.find(item => item.attempts.has(edge.from.nodeId)).attempts.get(edge.from.nodeId));
        const joins = new JoinController({ runs, authorizeMembership: async ({ tx, root, fanout, join, members }) => {
            await current(); const frame = await readFanoutFrame(tx, handle, root, fanoutAttemptId);
            if (!frame || fanout.attemptId !== fanoutAttemptId || join.attemptId !== joinAttemptId
                || !equal(members.map(member => member.attemptId).sort(), [...new Set(terminalIds)].sort())) fail('native_orchestration_rp_control_stale');
        }, verifyResults: async ({ tx, root, attempt, receipt }) => {
            await current();
            if (!terminalIds.includes(attempt.attemptId) || receipt.resultRefs.length !== 1) return { valid: false };
            const fact = await readGraphNodeResult(tx, handle, root, receipt.resultRefs[0].resultId);
            return { valid: !!fact && fact.producer.attemptId === attempt.attemptId && fact.record.envelope.audienceConstraint.nodeIds.includes(profile.join.nodeId) };
        } });
        const frozen = await joins.freeze(handle, { ...runGuard(await current()), fanoutAttemptId, nodeAttemptId: joinAttemptId, memberAttemptIds: [...new Set(terminalIds)] });
        const root = await current(), workers = [];
        for (const item of declared) {
            workers.push({ key: 'rp-control-fanout:' + runId + ':' + item.attempts.get(item.branch.entry.nodeId), models: [...item.models.values()], fanoutAttemptId,
                fingerprint: hash({ runId, fanoutAttemptId, attempts: [...item.attempts], models: [...item.models].map(([id, model]) => [id, model.configDigest]) }),
                run: async ({ signal, generate, settleFailure }) => {
                    const pending = new Set(item.branch.scopeNodeIds), executed = new Set(), reruns = new Map(), retryTokens = new Map();
                    let forced = null;
                    while (pending.size) {
                        signal.throwIfAborted(); const active = await current();
                        const completion = Object.fromEntries([...this.records].map(([id, fact]) => [id, fact.status ?? 'completed']));
                        const ready = forced ?? (pending.has(item.branch.entry.nodeId) ? { node: item.branch.entry, edges: [] }
                            : inspectGraphReadiness(active.graph, active.nodeControl, completion, { excludeNodeIds: active.graph.nodes.filter(node => !pending.has(node.nodeId)).map(node => node.nodeId) }).ready[0]);
                        forced = null;
                        if (!ready) fail('native_orchestration_rp_graph_blocked');
                        const node = ready.node, entry = node.nodeId === item.branch.entry.nodeId, rerun = reruns.get(node.nodeId);
                        const bundle = rerun?.bundle ?? this.mergeBundle(entry && !ready.loopBindings ? { evidenceRefs: [], controlRefs: [], bindings: [] } : this.bundle(ready.edges, active.graph), inherited);
                        for (const binding of ready.loopBindings ?? []) {
                            bundle.bindings.push({ edgeId: binding.edge.edgeId, producerAttemptId: binding.attemptId });
                            if (!bundle.controlRefs.some(ref => equal(ref, binding.controlRef))) bundle.controlRefs.push(binding.controlRef);
                        }
                        bundle.bindings.sort((a, b) => a.edgeId.localeCompare(b.edgeId));
                        const spec = entry && !rerun && !executed.has(node.nodeId) ? item.entry : await this.prepareBranch(node, active, bundle, fanoutAttemptId, retryTokens.get(node.nodeId));
                        if (rerun) { spec.request = rerun.request; spec.feedback = rerun.feedback; }
                        try {
                            const args = rerun ? { preparedAttemptId: rerun.attemptId } : executed.has(node.nodeId) ? {}
                                : entry ? { preparedAttemptId: item.attempts.get(node.nodeId) } : { reservedAttemptId: item.attempts.get(node.nodeId) };
                            const result = await generate(spec, bundle, args);
                            item.attempts.set(node.nodeId, result.attemptId); executed.add(node.nodeId); reruns.delete(node.nodeId);
                            const fact = ['planner', 'review'].includes(node.kind) ? result
                                : { attemptId: result.attemptId, resultRef: result.resultRef, status: 'completed' };
                            if (node.kind === 'planner') {
                                this.plannerHistory.push(result);
                            }
                            if (fact.review?.decision === 'rerun') {
                                for (const [id, old] of this.records) if (fact.review.invalidatedAttemptIds.includes(old.attemptId)) {
                                    this.records.delete(id);
                                    if (item.branch.scopeNodeIds.includes(id)) { pending.add(id); retryTokens.set(id, fact.review.receiptId); }
                                }
                                for (const replacement of fact.replacements) { reruns.set(replacement.nodeId, replacement); pending.add(replacement.nodeId); }
                                retryTokens.set(node.nodeId, fact.review.receiptId); pending.add(node.nodeId);
                            } else { this.records.set(node.nodeId, fact); pending.delete(node.nodeId); }
                            if (fact.requests?.replan) {
                                const latest = await current();
                                const next = await runs.engine.withTransaction(handle, tx => this.fanoutReplan({ tx, root: latest, completion: fact, progress: this.records, branch: item.branch }));
                                // Unexecuted members keep their frozen reserved identity.
                                for (const id of next.affectedNodeIds) if (this.records.has(id)) { this.records.delete(id); pending.add(id); retryTokens.set(id, fact.attemptId); }
                                forced = { node: next.target, edges: latest.graph.edges.filter(edge => !edge.loopBack && edge.to.nodeId === next.target.nodeId
                                    && edge.from.nodeId !== profile.fanout.nodeId), loopBindings: next.loopBindings };
                            }
                        } catch (error) {
                            await settleFailure();
                            throw error;
                        }
                    }
                } });
        }
        let decided;
        const members = async branch => runs.withSourceControl(handle, runId, async () => {
            const active = await current();
            return runs.engine.withTransaction(handle, async tx => {
                const frame = await readFanoutFrame(tx, handle, active, fanoutAttemptId), attempts = [];
                if (!frame) fail('native_orchestration_rp_control_stale');
                for (const attemptId of active.attemptRefs) {
                    const attempt = (await readAttempt(tx, handle, active, attemptId)).doc;
                    if (attempt.epoch === frame.epoch && (!branch || branch.scopeNodeIds.includes(attempt.nodeId))
                        && await readFanoutMembership(tx, handle, active, frame, attemptId)) attempts.push(attempt);
                }
                return attempts;
            });
        }, { withAuthority });
        const unstarted = attempt => ['pending', 'reserved'].includes(attempt.status) && attempt.startedAt === null
            && !attempt.effectRefs.length && !attempt.resultRefs.length;
        const cancelPending = async (attemptId, failedAttemptId, joinId) => runs.withSourceControl(handle, runId, async () =>
            new AttemptController({ runs, authorizeAttempt: async () => {}, authorizePendingCancellation: async ({ tx, root, frame, attempt }) => {
                await current();
                if (frame.fanoutAttemptId !== fanoutAttemptId || !await readFanoutMembership(tx, handle, root, frame, attempt.attemptId)) fail('native_orchestration_rp_control_stale');
            } }).cancelPending(handle, { ...runGuard(await current()), fanoutAttemptId, failedAttemptId, joinId, attemptId }), { withAuthority });
        const group = await this.withFanout(workers, { maxConcurrency: Math.min(profile.fanout.policy.maxConcurrency, root.limits.maxConcurrency),
            timeoutMs: Math.max(1, root.progress.deadlineAt - Date.now()), deadlineAt: frozen.outcome.joinBarrier.deadlineAt,
            until: async () => {
                try {
                    decided = await runs.withSourceControl(handle, runId, async () => joins.settle(handle,
                        { ...runGuard(await current()), joinId: joinIdForAttempt(joinAttemptId) }), { withAuthority }); return true;
                } catch (error) { if (error.code === 'native_orchestration_join_not_ready') return false; throw error; }
            }, onSettled: async (item) => {
                if (item.status !== 'rejected') return;
                const attempts = await members(declared[item.index].branch);
                if (attempts.every(attempt => attempt.status === 'cancelled')) return;
                const failed = attempts.find(attempt => attempt.status === 'failed');
                if (!failed) throw item.reason;
                if (profile.fanout.policy.failurePolicy === 'fail_fast') {
                    for (const attempt of await members()) if (unstarted(attempt)) await cancelPending(attempt.attemptId, failed.attemptId, null);
                }
            } });
        const cancelled = group.cancelPending();
        for (const index of cancelled) for (const attempt of await members(declared[index].branch)) {
            if (unstarted(attempt)) await cancelPending(attempt.attemptId, null, decided.outcome.joinReceipt.joinId);
        }
        await group.wait();
        const drained = await current();
        await runs.engine.withTransaction(handle, async tx => {
            for (const item of declared) for (const [nodeId, attemptId] of item.attempts) {
                const actual = (await readAttempt(tx, handle, drained, attemptId)).doc;
                if (['cancelled', 'failed'].includes(actual.status)) this.records.set(nodeId, { attemptId, status: actual.status });
            }
        });
        const final = await current(), costs = await runs.engine.withTransaction(handle, async tx => {
            const capacity = await budgetPort.observeCapacity(handle, { authorityRef: final.budgetAuthorityRef, reservationId: null }, { tx });
            const frame = await readFanoutFrame(tx, handle, final, fanoutAttemptId), attempts = [];
            for (const id of final.attemptRefs) if (await readFanoutMembership(tx, handle, final, frame, id)) attempts.push((await readAttempt(tx, handle, final, id)).doc);
            const closure = await this.inspectFanoutClosure({ tx, root: final, frame, attempts, effectIds: attempts.flatMap(attempt => attempt.effectRefs) });
            if (!closure.closed) fail('native_orchestration_rp_quality_unsettled');
            return capacity;
        });
        if (!costs || costs.overrun) fail('native_orchestration_graph_budget_unavailable');
        const outcome = decided.outcome.joinReceipt.outcome;
        await runs.withSourceControl(handle, runId, () => new AttemptController({ runs, authorizeAttempt: async () => {}, verifySettlement: async ({ attempt, resultRefs, receipts }) => {
            await current(); if (attempt.attemptId !== fanoutAttemptId || resultRefs.length || receipts.length) fail('native_orchestration_rp_control_stale');
        } }).settle(handle, { ...runGuard(final), attemptId: fanoutAttemptId, outcome, resultRefs: [], effectReceiptRefs: [], reasonCode: 'rp_fanout_join_' + outcome }), { withAuthority });
        const saved = await runs.engine.withTransaction(handle, async tx => readRpControlFanoutCompletion(tx, handle, await runs.get(handle, runId), joinAttemptId));
        if (!saved || !['completed', 'partial'].includes(outcome)) fail('native_orchestration_rp_fanout_failed');
        this.records.set(profile.fanout.nodeId, { attemptId: fanoutAttemptId, status: outcome });
        this.records.set(profile.join.nodeId, { attemptId: joinAttemptId, status: outcome, controlRef: saved.controlRef, evidenceRefs: saved.joinReceipt.acceptedResultRefs });
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
        if (state.selected.controlGraph.fanouts.length) await this.initializeFanoutBank(root);
        const handledReplans = new Set();
        for (;;) {
            root = await service.runs.get(handle, root.runId);
            const admission = rpControlGraph({ ...state.selected.plan, definition: root.graph }, { force: true });
            const readiness = inspectGraphReadiness(root.graph, root.nodeControl,
                Object.fromEntries([...this.records].map(([id, fact]) => [id, fact.status])), { excludeNodeIds: [root.graph.outputContract.ownerNodeId] });
            const replan = [...this.records.entries()].find(([, fact]) => fact.requests?.replan && !handledReplans.has(fact.attemptId));
            let next, replanBundle;
            if (replan) {
                const [nodeId, previous] = replan, scope = rpControlReplanScope(root.graph, nodeId), { target: node, loops } = scope;
                if (previous.requests.finalize || !this.records.has(node.nodeId)) fail('native_orchestration_planner_replan_pending');
                if (scope.affectedNodeIds.some(id => this.reruns.has(id))) fail('native_orchestration_planner_replan_pending');
                if (scope.affectedNodeIds.some(id => this.records.has(id)
                    && !['agent', 'planner', 'review', 'judge'].includes(root.graph.nodes.find(node => node.nodeId === id).kind)))
                    fail('native_orchestration_review_irreversible_dependency');
                const capacity = await service.runs.engine.withTransaction(handle, tx => service.budgetPort.observeCapacity(handle,
                    { authorityRef: root.budgetAuthorityRef, reservationId: null }, { tx }));
                const remaining = admission.models.filter(model => !this.records.has(model.nodeId) || scope.affectedNodeIds.includes(model.nodeId)).length;
                if (!capacity || capacity.overrun || capacity.remaining.requests < remaining) fail('native_orchestration_planner_replan_budget_unavailable');
                if (root.progress.attempts + remaining + 1 > root.limits.maxAttempts) fail('native_orchestration_planner_replan_limit_exhausted');
                next = inspectGraphReadiness(root.graph, root.nodeControl,
                    Object.fromEntries([...this.records].filter(([id]) => id !== node.nodeId).map(([id, fact]) => [id, fact.status])))
                    .ready.find(item => item.node.nodeId === node.nodeId);
                if (!next) fail('native_orchestration_graph_dependency_unavailable');
                replanBundle = this.bundle([...next.edges, ...loops], root.graph);
                handledReplans.add(previous.attemptId);
                for (const id of scope.affectedNodeIds) {
                    this.records.delete(id);
                }
            } else next = readiness.ready[0];
            if (!next) fail('native_orchestration_graph_dependency_unavailable');
            if (next.node.kind === 'fanout') {
                const inherited = this.bundle(next.edges, root.graph);
                state.controlBundle = null;
                await this.fanout(admission.fanouts.find(group => group.fanout.nodeId === next.node.nodeId), inherited);
                continue;
            }
            const selected = await state.selected.resolveGraphModel(next.node);
            const rerun = this.reruns.get(next.node.nodeId);
            state.activeSelection = selected; state.controlBundle = replanBundle ?? rerun?.bundle ?? this.bundle(next.edges, root.graph);
            state.controlFeedback = rerun?.feedback; state.controlRequest = rerun?.request; state.controlOrdinal = root.attemptRefs.length;
            const facts = await service.runs.engine.withTransaction(handle, tx => this.inputs(tx, root));
            const controls = [];
            for (const fact of facts.filter(fact => fact.controlRef)) {
                const readable = !fact.patch || await this.canReadControl(root.graph.nodes.find(node => node.nodeId === fact.producer.nodeId), next.node);
                controls.push({ controlRef: fact.controlRef,
                    ...(fact.patch ? readable ? { operations: fact.patch.appliedOperations }
                        : { disclosure: 'reference-only', operationKinds: fact.patch.appliedOperations.map(operation => operation.op) }
                        : fact.review ? { decision: fact.review.decision, reasonCode: fact.review.reasonCode, targetAttemptIds: fact.review.targetAttemptIds }
                            : fact.joinReceipt ? { joinId: fact.joinReceipt.joinId, outcome: fact.joinReceipt.outcome, acceptedResultRefs: fact.joinReceipt.acceptedResultRefs }
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
            if (replan) controlTask.replan = { reasonCode: 'bounded_replan', previousControlRef: replan[1].controlRef };
            const result = await this.withCapture(selected, controlTask, () => this.generate({ planner, review, judge, graphNode: !planner && !review && !judge && !final,
                graphRunId: root.runId, preparedAttemptId: rerun?.attemptId ?? null }));
            this.reruns.delete(next.node.nodeId);
            if (final) return result;
            if (result.review?.decision === 'rerun') {
                for (const [nodeId, fact] of this.records) if (result.review.invalidatedAttemptIds.includes(fact.attemptId)) this.records.delete(nodeId);
                for (const replacement of result.replacements) this.reruns.set(replacement.nodeId, replacement);
            } else {
                this.records.set(next.node.nodeId, planner || review || judge ? result : { attemptId: state.attemptId, resultRef: result.resultRef, status: 'completed' });
                if (planner) this.plannerHistory.push(result);
            }
        }
    }
}
