import { readReviewAdmission } from './controller-common.js';
import { cloneNativeDocument, hashNativeDocument as hash, putImmutable, equalNativeDocuments as equal } from '../repositories/common.js';
import { assertObject, assertResultPolicy } from '../../../public/shared/native-orchestration-contracts.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { ProjectQualityWork } from './project-quality-work.js';
import { inspectGraphReadiness } from './graph-work-readiness.js';
import { projectReplanScope, projectPlannerProgressFingerprint } from './project-replan-contracts.js';
import { projectControlGraph, projectPlannerOutputContract, projectGraphReviewOutputContract, projectGraphJudgeOutputContract } from './project-control-graph.js';
import { AttemptController } from './attempt-controller.js';
import { TransitionController } from './transition-controller.js';
import { projectReviewCosts } from './project-review-output-contracts.js';
import { GraphController } from './graph-controller.js';
import { graphPatchHash } from './graph-revision-contracts.js';
import { FanoutController, readFanoutFrame } from './fanout-controller.js';
import { JoinController, joinIdForAttempt } from './join-controller.js';
import { withNativeProjectFanout } from './native-project-generation-authority.js';
import { readProjectFanoutCompletion } from './project-fanout-contracts.js';
import { assertProjectFanoutPlannerPatch, readProjectFanoutPaidModelNodes } from './project-fanout-planner-contracts.js';
import { readProjectDelegationContinuation } from './project-delegation-contracts.js';
import { readEffect } from './effect-contracts.js';
import { readModelFailureReceipt } from './model-port.js';
import { graphPlannerControlRef, graphPlannerReceiptId, readGraphPlannerCompletion } from './graph-planner-completion.js';
import { assertProjectControlWork } from './project-quality-contracts.js';
import { readProjectControlInputs, projectControlItems, projectJudgeReaderOptions } from './project-control-input-contracts.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { checkedRecord } from './plan-repository.js';
import { ReviewController, reviewReceiptId } from './review-controller.js';
import { graphReviewModelReceiptId, graphReviewControlRef, readGraphReviewCompletion, readReviewablePlannerCompletion } from './graph-review-completion.js';
import { graphJudgeModelReceiptId, graphJudgeControlRef, readGraphJudgeCompletion } from './graph-judge-completion.js';
import { readContextRetrievalCompletions } from './context-retrieval-contracts.js';
import { ConflictError } from '../../storage/errors.js';
import { PROJECT_QUALITY_REASONS } from './project-quality-profile.js';
import { writeAttemptSettlement } from './attempt-settlement.js';
import { controlCommandId, controlRecordKey, readAttempt, runGuard, graphReachable } from './controller-common.js';

const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const readerOptions = { verifyControlWork: assertProjectControlWork };

/** One domain consumer of original Graph/Transition/Model controllers. Ready
 * ordering is shared and read-only; this class owns no durable execution state. */
export class ProjectControlGraphWork {
    #retryTokens = new Map();

    constructor(args) {
        Object.assign(this, args); this.records = new Map(); this.lastOperations = new Map();
        this.models = new ProjectQualityWork({ ...args, readControls: (tx, root, recipient, controlRefs) =>
            projectControlItems(tx, this.state.handle, root, recipient, { controlRefs,
                evidenceRefs: recipient.inputRefs[0].acceptedGraphResultRefs ?? [] }, { graphEvidence: true }) });
    }

    #bundle(edges, graph) {
        const evidenceRefs = [], controlRefs = [], bindings = [];
        const judges = edges.map(edge => this.records.get(edge.from.nodeId)).filter(fact => fact?.controlRef?.kind === 'graph_judge_control');
        for (const edge of edges) {
            const fact = this.records.get(edge.from.nodeId);
            if (!fact) fail('native_orchestration_project_control_dependency_missing');
            if (fact.resultRef && judges.some(judge => judge.candidateRefs.some(ref => equal(ref, fact.resultRef)) && !equal(judge.selectedResultRef, fact.resultRef))) {
                if (graph.nodes.find(node => node.nodeId === edge.to.nodeId).inputs.find(port => port.name === edge.to.port).required)
                    fail('native_orchestration_project_judge_required_input');
                continue;
            }
            bindings.push({ edgeId: edge.edgeId, producerAttemptId: fact.attemptId });
            if (fact.resultRef && !evidenceRefs.some(ref => equal(ref, fact.resultRef))) evidenceRefs.push(fact.resultRef);
            for (const ref of fact.evidenceRefs ?? []) if (!evidenceRefs.some(existing => equal(existing, ref))) evidenceRefs.push(ref);
            if (fact.controlRef && !controlRefs.some(ref => equal(ref, fact.controlRef))) controlRefs.push(fact.controlRef);
        }
        return { evidenceRefs, controlRefs, bindings };
    }

    async #authorizeInputs(bundle, { tx, root, target, producers, capture }) {
        await this.current(capture ? { capture } : {});
        const facts = await readProjectControlInputs(tx, this.state.handle, root, null, bundle, { targetNodeId: target.nodeId });
        if (producers.length !== bundle.bindings.length || producers.some(item => !bundle.bindings.some(binding =>
            binding.edgeId === item.edge.edgeId && binding.producerAttemptId === item.attempt.attemptId))
            || producers.some(item => !facts.some(fact => fact.producer.attemptId === item.attempt.attemptId))) fail('native_orchestration_project_control_stale');
        for (const fact of facts.filter(fact => fact.record)) {
            if (!fact.record.envelope.audienceConstraint.nodeIds.includes(target.nodeId)) fail('native_orchestration_project_control_audience_denied');
        }
    }

    async #judge(stage, { result, proof, send, limits }, bundle) {
        const { handle, operation: { runId } } = this.state, { runs, sourcePort, budgetPort } = this.service;
        const rows = [], work = this.models.controlWork(stage, send, limits, rows), responseText = result.generated.response.text;
        const parsed = await work('graph_control_parse', responseText, async () => {
            if (Buffer.byteLength(responseText) > assertResultPolicy(stage.selected.plan.definition.outputContract).maxBytes)
                fail('native_orchestration_project_judge_response_invalid');
            const value = JSON.parse(responseText); assertObject(value, ['selectedResultRef', 'reasonCode'], 'Project Judge response');
            if (value.reasonCode !== 'candidate_selected' || !bundle.evidenceRefs.length
                || !bundle.evidenceRefs.some(ref => equal(ref, value.selectedResultRef))) fail('native_orchestration_project_judge_response_invalid');
            return immutable(value);
        });
        const candidateRefs = bundle.evidenceRefs, selectedResultRef = parsed.selectedResultRef;
        const boundary = sourcePort.consumptionBoundary(handle, stage.sourceBinding, { engine: runs.engine });
        await work('graph_control_adopt', parsed, () => runs.withSourceControl(handle, runId, () => runs.engine.withTransaction(handle, async tx => {
            const root = await runs.get(handle, runId), record = await readAttempt(tx, handle, root, stage.attemptId);
            await this.current({ capture: stage.projectCapture });
            if (!equal(proof, await this.port.inspectResultCompletion(handle, { result, runId, effectId: stage.effectId })))
                fail('native_orchestration_project_judge_producer_denied');
            await readProjectControlInputs(tx, handle, root, record.doc, bundle);
            await sourcePort.revalidate(handle, root.sourceBinding, { tx, root });
            await budgetPort.assertCurrent(handle, root.budgetAuthorityRef, { tx });
        }), { withAuthority: boundary }));
        const receiptId = graphJudgeModelReceiptId(runId, stage.attemptId);
        try {
            await runs.withSourceControl(handle, runId, async () => runs.control(handle, controlCommandId('graph.judge.settle', stage.attemptId), {
                ...runGuard(await runs.get(handle, runId)), operation: 'attempt.settle', detail: { attemptId: stage.attemptId, selectedResultRef } },
            async ({ tx, root, now, deny }) => {
                let record, retrieval;
                try {
                    const stamp = hash(root);
                    await this.current({ capture: stage.projectCapture });
                    if (!equal(proof, await this.port.inspectResultCompletion(handle, { result, runId, effectId: stage.effectId })))
                        fail('native_orchestration_project_judge_producer_denied');
                    record = await readAttempt(tx, handle, root, stage.attemptId);
                    retrieval = await readContextRetrievalCompletions(tx, handle, root, (await readEffect(tx, handle, root, stage.effectId)).doc, record.doc);
                    const facts = await readProjectControlInputs(tx, handle, root, record.doc, bundle);
                    if (record.doc.status !== 'running' || !equal(record.doc.effectRefs, [stage.effectId, ...retrieval.map(item => item.effectId)])
                        || facts.filter(fact => fact.record).length !== candidateRefs.length) fail('native_orchestration_project_judge_producer_denied');
                    await sourcePort.revalidate(handle, root.sourceBinding, { tx, root });
                    await budgetPort.assertCurrent(handle, root.budgetAuthorityRef, { tx });
                    if (stamp !== hash(await runs.get(handle, runId))) return deny(new ConflictError('native_orchestration_project_judge_producer_denied'));
                } catch (error) {
                    if (error instanceof ConflictError) return deny(error);
                    throw error;
                }
                const receipt = { schemaVersion: 1, receiptKind: 'graph_judge_model', receiptId, runId, epoch: root.epoch, producerAttemptId: stage.attemptId,
                    sourceBindingDigest: root.sourceBinding.bindingDigest, grantDigest: stage.decision.grantDigest, modelEffectId: stage.effectId,
                    modelReceiptRef: proof.receiptRef, modelPayloadHash: proof.payloadHash, responseText, candidateRefs, selectedResultRef,
                    localWork: rows, decisionSeq: root.eventSeq + 1, createdAt: now };
                await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), receipt);
                await writeAttemptSettlement({ tx, handle, root, record, outcome: 'completed', resultRefs: [],
                    effectReceiptRefs: [proof.receiptRef.receiptId, ...retrieval.map(item => item.receiptId)], reasonCode: 'graph_judge_selected', now });
                root.progress.steps++;
                return { root, eventType: 'graph_judge_completed', reasonCode: 'candidate_selected', outcome: { judgeReceiptRef: { runId, receiptId } } };
            }), { withAuthority: boundary });
        } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            const saved = await runs.engine.withTransaction(handle, async tx => readGraphJudgeCompletion(tx, handle, await runs.get(handle, runId),
                stage.attemptId, projectJudgeReaderOptions));
            if (!saved || !equal(saved.selectedResultRef, selectedResultRef) || saved.receipt.modelPayloadHash !== proof.payloadHash) throw error;
        }
        return { attemptId: stage.attemptId, controlRef: graphJudgeControlRef(runId, stage.attemptId), candidateRefs, selectedResultRef, status: 'completed' };
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
        const evidence = await runs.engine.withTransaction(handle, async tx => {
            const active = await runs.get(handle, runId), facts = [];
            for (const ref of stage.decision.inputRef.acceptedGraphResultRefs) facts.push(await readGraphNodeResult(tx, handle, active, ref.resultId));
            if (facts.some(fact => !fact)) fail('native_orchestration_project_control_stale');
            return facts;
        });
        const progressKey = projectPlannerProgressFingerprint(parsed.operations, stage.sourceBinding, evidence);
        if (this.lastOperations.get(stage.selected.node.nodeId)?.has(progressKey)) fail('native_orchestration_project_planner_no_progress');
        const root = await runs.get(handle, runId), patch = { schemaVersion: 1, patchId: 'opatch_' + hash({ runId, attemptId: stage.attemptId }).slice(0, 32),
            runId, producerAttemptId: stage.attemptId, expectedEpoch: root.epoch, expectedGraphRevision: root.graphRevision,
            operations: parsed.operations, reasonRefs: [{ kind: 'source', bindingDigest: root.sourceBinding.bindingDigest },
                ...stage.decision.inputRef.acceptedGraphResultRefs.map(ref => ({ kind: 'result', resultId: ref.resultId }))], payloadHash: '' };
        patch.payloadHash = graphPatchHash(patch);
        const boundary = sourcePort.consumptionBoundary(handle, root.sourceBinding, { engine: runs.engine });
        const proposed = await work('graph_control_adopt', patch, () => runs.withSourceControl(handle, runId, async () => {
            try {
                return await new GraphController({ runs, authorizePatch: async ({ tx, root: active, producer, patch: actual }) => {
                    await this.current({ capture: stage.projectCapture });
                    const completion = await this.port.inspectResultCompletion(handle, { result, runId, effectId: stage.effectId });
                    if (!equal(completion, proof) || producer.attemptId !== stage.attemptId || !equal(actual, patch)) fail('native_orchestration_project_planner_denied');
                    if (stage.decision.inputRef.fanoutAttemptId) await assertProjectFanoutPlannerPatch(tx, handle, active, producer, actual);
                    const candidate = cloneNativeDocument(active.graph);
                    for (const operation of actual.operations) {
                        if (operation.op === 'addNode') candidate.nodes.push(operation.node);
                        if (operation.op === 'addEdge') candidate.edges.push(operation.edge);
                    }
                    const admission = projectControlGraph({ ...stage.selected.plan, definition: candidate });
                    for (const control of admission.pure.filter(node => node.capabilities.includes('generation.send'))) {
                        await this.state.selected.resolveControlModel(control);
                        this.state.selected.resolveDelegation(control);
                    }
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
                    const repeating = actual.operations.some(operation => operation.op === 'requestReplan') ? projectReplanScope(candidate, producer.nodeId).affectedNodeIds : [];
                    const paid = stage.decision.inputRef.fanoutAttemptId ? await readProjectFanoutPaidModelNodes(tx, handle, active) : null;
                    const remaining = admission.pure.filter(node => node.capabilities.includes('generation.send')
                        && (repeating.includes(node.nodeId) || (paid ? !paid.has(node.nodeId) : !this.records.has(node.nodeId)) && node.nodeId !== producer.nodeId));
                    const required = remaining.reduce((requests, node) => requests + 1 + (this.state.selected.resolveDelegation(node)?.ceiling.maxRequests ?? 0), 1);
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
        if (accepted.requests.replan && accepted.requests.finalize) fail('native_orchestration_project_replan_unavailable');
        const receiptId = graphPlannerReceiptId(runId, stage.attemptId);
        try {
            await runs.withSourceControl(handle, runId, async () => runs.control(handle, controlCommandId('graph.planner.settle', stage.attemptId), {
                ...runGuard(await runs.get(handle, runId)), operation: 'attempt.settle', detail: { attemptId: stage.attemptId, patchId: patch.patchId } }, async ({ tx, root: active, now }) => {
                await this.current({ capture: stage.projectCapture });
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
        const keys = this.lastOperations.get(stage.selected.node.nodeId) ?? new Set(); keys.add(progressKey); this.lastOperations.set(stage.selected.node.nodeId, keys);
        return { attemptId: stage.attemptId, controlRef: graphPlannerControlRef(runId, stage.attemptId), requests: accepted.requests };
    }

    async #controlNode(node, bundle, fanoutAttemptId = null) {
        const { handle, operation: { runId } } = this.state, { runs } = this.service;
        const root = await runs.get(handle, runId), input = { kind: 'native_project_graph_control', nodeId: node.nodeId,
            planRef: root.planRef, sourceRef: root.sourceBinding.sourceRef, acceptedGraphResultRefs: bundle.evidenceRefs,
            acceptedControlRefs: bundle.controlRefs, controlGraph: bundle, ...(fanoutAttemptId ? { fanoutAttemptId } : {}) };
        const inputRefs = [input, ...bundle.evidenceRefs, ...bundle.controlRefs], grantDigest = hash({ handle, source: root.sourceBinding, inputRefs });
        const admission = { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: grantDigest, budgetRef: root.budgetAuthorityRef };
        if (bundle.bindings.length) {
            const advanced = await new TransitionController({ runs, authorizeTransition: async args => {
                await this.#authorizeInputs(bundle, args); return admission;
            } }).advance(handle, { ...runGuard(root), bindings: bundle.bindings, reservedAttemptId: null });
            return advanced.outcome.attemptId;
        }
        return (await runs.beginAttempt(handle, controlCommandId('project.graph.control', { runId, nodeId: node.nodeId, fanoutAttemptId }),
            { ...runGuard(root), nodeId: node.nodeId, ...admission })).attemptId;
    }

    #mergeBundle(bundle, inherited) {
        return { ...bundle, evidenceRefs: [...new Map([...bundle.evidenceRefs, ...inherited.evidenceRefs].map(ref => [hash(ref), ref])).values()],
            controlRefs: [...new Map([...bundle.controlRefs, ...inherited.controlRefs].map(ref => [hash(ref), ref])).values()] };
    }

    async #fanout(profile, inherited) {
        const { handle, host, operation: { runId } } = this.state, { runs, sourcePort, budgetPort } = this.service;
        let controlPermit = null;
        const current = async () => { await this.current(controlPermit ? { controlPermit } : {}); return runs.get(handle, runId); };
        const withAuthority = sourcePort.consumptionBoundary(handle, this.state.sourceBinding, { engine: runs.engine });
        const fanoutAttemptId = await this.#controlNode(profile.fanout, inherited);
        await new AttemptController({ runs, authorizeAttempt: async ({ attempt }) => {
            await current(); if (attempt.attemptId !== fanoutAttemptId) fail('native_orchestration_project_control_stale');
        } }).activate(handle, { ...runGuard(await current()), attemptId: fanoutAttemptId });
        this.records.set(profile.fanout.nodeId, { attemptId: fanoutAttemptId, status: 'running' });
        const declared = [];
        for (const branch of profile.branches) {
            const root = await current(), token = 'fanout:' + fanoutAttemptId, task = this.#task(branch.entry, root);
            const spec = await this.models.prepareStageInput(branch.entry, token, { ...inherited, bindings: [], controlTask: task, fanoutAttemptId });
            const inputRefs = [spec.input, ...inherited.evidenceRefs, ...inherited.controlRefs];
            const begun = await runs.beginAttempt(handle, controlCommandId('project.fanout.entry', { runId, fanoutAttemptId, nodeId: branch.entry.nodeId }), {
                ...runGuard(await current()), nodeId: branch.entry.nodeId, inputRefs, inputDigest: hash(inputRefs),
                effectiveGrantDigest: spec.grantDigest, budgetRef: root.budgetAuthorityRef });
            const attempts = new Map([[branch.entry.nodeId, begun.attemptId]]), models = new Map([[branch.entry.nodeId, spec.model]]);
            for (const nodeId of branch.scopeNodeIds.filter(id => id !== branch.entry.nodeId)) {
                const node = root.graph.nodes.find(node => node.nodeId === nodeId), model = await this.state.selected.resolveControlModel(node);
                const reserved = await new AttemptController({ runs, authorizeAttempt: async () => {}, authorizeReservation: async ({ producer, target }) => {
                    await current();
                    if (producer.attemptId !== fanoutAttemptId || !branch.scopeNodeIds.includes(target.nodeId)) fail('native_orchestration_project_control_stale');
                } }).reserve(handle, { ...runGuard(await current()), producerAttemptId: fanoutAttemptId, nodeId });
                attempts.set(nodeId, reserved.outcome.attemptId); models.set(nodeId, model);
            }
            declared.push({ branch, attempts, models, token, task });
        }
        const joinAttemptId = await this.#controlNode(profile.join, { evidenceRefs: [], controlRefs: [], bindings: [] }, fanoutAttemptId);
        const branches = declared.map(item => ({ entryAttemptId: item.attempts.get(item.branch.entry.nodeId), memberAttemptIds: [...item.attempts.values()].sort(),
            scopeNodeIds: item.branch.scopeNodeIds }));
        await new FanoutController({ runs, authorizeGroup: async ({ tx, root, producer, branches: actual }) => {
            await current();
            if (producer.attemptId !== fanoutAttemptId || !equal(actual.map(branch => ({ entryAttemptId: branch.entry.attemptId,
                memberAttemptIds: branch.members.map(member => member.attemptId).sort(), scopeNodeIds: branch.scopeNodeIds })).sort((a, b) => a.entryAttemptId.localeCompare(b.entryAttemptId)),
            [...branches].sort((a, b) => a.entryAttemptId.localeCompare(b.entryAttemptId)))) fail('native_orchestration_project_control_stale');
            const capacity = await budgetPort.observeCapacity(handle, { authorityRef: root.budgetAuthorityRef, reservationId: null }, { tx });
            if (!capacity || capacity.overrun || capacity.remaining.requests < declared.reduce((count, item) => count + item.attempts.size, 0) + 1)
                fail('native_orchestration_project_graph_budget_unavailable');
        } }).freeze(handle, { ...runGuard(await current()), fanoutAttemptId, branches });
        const terminalIds = profile.members.map(edge => declared.find(item => item.attempts.has(edge.from.nodeId)).attempts.get(edge.from.nodeId));
        const joins = new JoinController({ runs, authorizeMembership: async ({ tx, root, fanout, join, members }) => {
            await current(); const frame = await readFanoutFrame(tx, handle, root, fanoutAttemptId);
            if (!frame || fanout.attemptId !== fanoutAttemptId || join.attemptId !== joinAttemptId
                || !equal(members.map(member => member.attemptId).sort(), [...new Set(terminalIds)].sort())) fail('native_orchestration_project_control_stale');
        }, verifyResults: async ({ tx, root, attempt, receipt }) => {
            await current();
            if (!terminalIds.includes(attempt.attemptId) || receipt.resultRefs.length !== 1) return { valid: false };
            const fact = await readGraphNodeResult(tx, handle, root, receipt.resultRefs[0].resultId);
            return { valid: !!fact && fact.producer.attemptId === attempt.attemptId && fact.record.envelope.audienceConstraint.nodeIds.includes(profile.join.nodeId) };
        } });
        const frozen = await joins.freeze(handle, { ...runGuard(await current()), fanoutAttemptId, nodeAttemptId: joinAttemptId, memberAttemptIds: [...new Set(terminalIds)] });
        const root = await current(), workers = [];
        for (const item of declared) {
            const resources = [...new Set([this.identity.projectId, this.identity.taskId,
                ...(await Promise.all([...item.models.values()].map(model => host.executionResources(handle, model.resolved.route)))).flat()])].sort();
            workers.push({ key: 'project-fanout:' + runId + ':' + item.attempts.get(item.branch.entry.nodeId), resources, nodeIds: item.branch.scopeNodeIds,
                fingerprint: hash({ runId, fanoutAttemptId, attempts: [...item.attempts], models: [...item.models].map(([id, model]) => [id, model.configDigest]) }),
                fresh: async permit => { controlPermit = permit; await current(); },
                run: async ({ permit, signal, controlPermit: activeControl }) => {
                    controlPermit = activeControl;
                    const pending = new Set(item.branch.scopeNodeIds);
                    while (pending.size) {
                        signal.throwIfAborted(); const active = await current();
                        const completion = Object.fromEntries([...this.records].map(([id, fact]) => [id, fact.status ?? 'completed']));
                        const ready = pending.has(item.branch.entry.nodeId) ? { node: item.branch.entry, edges: [] }
                            : inspectGraphReadiness(active.graph, active.nodeControl, completion, { excludeNodeIds: active.graph.nodes.filter(node => !pending.has(node.nodeId)).map(node => node.nodeId) }).ready[0];
                        if (!ready) fail('native_orchestration_project_graph_blocked');
                        const node = ready.node, entry = node.nodeId === item.branch.entry.nodeId, bundle = this.#mergeBundle(entry ? { evidenceRefs: [], controlRefs: [], bindings: [] } : this.#bundle(ready.edges, active.graph), inherited);
                        try {
                            const fact = await this.models.generateStage(node, item.token, { ...bundle, controlTask: entry ? item.task : this.#task(node, active),
                                fanoutAttemptId, fanoutPermit: permit, signal,
                                ...(node.kind === 'planner' ? { outputContract: projectPlannerOutputContract, complete: (stage, args) => this.#planner(stage, args) } : {}), ...(entry ? { preparedAttemptId: item.attempts.get(node.nodeId) }
                                    : { reservedAttemptId: item.attempts.get(node.nodeId) }), authorizeInputs: args => this.#authorizeInputs(bundle, args) });
                            this.records.set(node.nodeId, fact); pending.delete(node.nodeId);
                        } catch (error) {
                            await this.#fanoutFailure(item.attempts.get(node.nodeId), current, withAuthority);
                            throw error;
                        }
                    }
                } });
        }
        let decided;
        const cancelPending = async (attemptId, failedAttemptId, joinId) => runs.withSourceControl(handle, runId, async () =>
            new AttemptController({ runs, authorizeAttempt: async () => {}, authorizePendingCancellation: async ({ frame, attempt }) => {
                await current();
                if (frame.fanoutAttemptId !== fanoutAttemptId || !declared.some(item => [...item.attempts.values()].includes(attempt.attemptId))) fail('native_orchestration_project_control_stale');
            } }).cancelPending(handle, { ...runGuard(await current()), fanoutAttemptId, failedAttemptId, joinId, attemptId }), { withAuthority });
        const group = await withNativeProjectFanout(this.state.projectCapture, workers, { maxConcurrency: Math.min(profile.fanout.policy.maxConcurrency, root.limits.maxConcurrency),
            timeoutMs: Math.max(1, root.progress.deadlineAt - Date.now()), deadlineAt: frozen.outcome.joinBarrier.deadlineAt,
            until: async (_observed, permit) => {
                controlPermit = permit;
                try {
                    decided = await runs.withSourceControl(handle, runId, async () => joins.settle(handle,
                        { ...runGuard(await current()), joinId: joinIdForAttempt(joinAttemptId) }), { withAuthority }); return true;
                } catch (error) { if (error.code === 'native_orchestration_join_not_ready') return false; throw error; }
            }, onSettled: async (item, _group, permit) => {
                controlPermit = permit;
                if (item.status !== 'rejected') return;
                const active = await current(), attempts = await runs.engine.withTransaction(handle, async tx => Promise.all([...declared[item.index].attempts.values()].map(id => readAttempt(tx, handle, active, id))));
                if (attempts.every(record => record.doc.status === 'cancelled')) return;
                const failed = attempts.find(record => record.doc.status === 'failed');
                if (!failed) throw item.reason;
                if (profile.fanout.policy.failurePolicy === 'fail_fast') {
                    for (const branch of declared) for (const attemptId of branch.attempts.values()) {
                        const actual = await runs.engine.withTransaction(handle, tx => readAttempt(tx, handle, active, attemptId));
                        if (['pending', 'reserved'].includes(actual.doc.status)) await cancelPending(attemptId, failed.doc.attemptId, null);
                    }
                }
            } });
        const cancelled = group.cancelPending();
        for (const index of cancelled) for (const attemptId of declared[index].attempts.values()) {
            const actual = await runs.engine.withTransaction(handle, async tx => readAttempt(tx, handle, await runs.get(handle, runId), attemptId));
            if (['pending', 'reserved'].includes(actual.doc.status)) await cancelPending(attemptId, null, decided.outcome.joinReceipt.joinId);
            else if (actual.doc.status !== 'cancelled') fail('native_orchestration_project_control_stale');
        }
        await group.wait(); controlPermit = null;
        const drained = await current();
        await runs.engine.withTransaction(handle, async tx => {
            for (const item of declared) for (const [nodeId, attemptId] of item.attempts) {
                const actual = (await readAttempt(tx, handle, drained, attemptId)).doc;
                if (['cancelled', 'failed'].includes(actual.status)) this.records.set(nodeId, { attemptId, status: actual.status });
            }
        });
        const final = await current(), costs = await runs.engine.withTransaction(handle, tx => projectReviewCosts(tx, handle, final));
        if (!costs.closed) fail('native_orchestration_project_quality_unsettled');
        const outcome = decided.outcome.joinReceipt.outcome;
        await runs.withSourceControl(handle, runId, () => new AttemptController({ runs, authorizeAttempt: async () => {}, verifySettlement: async ({ attempt, resultRefs, receipts }) => {
            await current(); if (attempt.attemptId !== fanoutAttemptId || resultRefs.length || receipts.length) fail('native_orchestration_project_control_stale');
        } }).settle(handle, { ...runGuard(final), attemptId: fanoutAttemptId, outcome, resultRefs: [], effectReceiptRefs: [], reasonCode: 'project_fanout_join_' + outcome }), { withAuthority });
        const saved = await runs.engine.withTransaction(handle, async tx => readProjectFanoutCompletion(tx, handle, await runs.get(handle, runId), joinAttemptId));
        if (!saved || !['completed', 'partial'].includes(outcome)) fail('native_orchestration_project_fanout_failed');
        this.records.set(profile.fanout.nodeId, { attemptId: fanoutAttemptId, status: outcome });
        this.records.set(profile.join.nodeId, { attemptId: joinAttemptId, status: outcome, controlRef: saved.controlRef, evidenceRefs: saved.joinReceipt.acceptedResultRefs });
    }

    async #fanoutFailure(attemptId, current, withAuthority) {
        const { handle, operation: { runId } } = this.state, { runs, budgetPort } = this.service;
        const proof = await runs.engine.withTransaction(handle, async tx => {
            const root = await runs.get(handle, runId), attempt = (await readAttempt(tx, handle, root, attemptId)).doc;
            if (attempt.status !== 'running' || attempt.effectRefs.length !== 1) return null;
            const effect = (await readEffect(tx, handle, root, attempt.effectRefs[0])).doc;
            return readModelFailureReceipt(handle, tx, root, effect, budgetPort);
        });
        if (!proof?.closed) return;
        await runs.withSourceControl(handle, runId, async () => new AttemptController({ runs, authorizeAttempt: async () => {}, verifySettlement: async ({ tx, root, attempt, resultRefs, receipts }) => {
            await current(); const effect = (await readEffect(tx, handle, root, attempt.effectRefs[0])).doc;
            const actual = await readModelFailureReceipt(handle, tx, root, effect, budgetPort);
            if (!actual?.closed || !equal(actual.receiptRef, proof.receiptRef) || resultRefs.length || !equal(receipts.map(receipt => receipt.receiptId), [proof.receiptRef.receiptId])) fail('native_orchestration_project_control_stale');
        } }).settle(handle, { ...runGuard(await current()), attemptId, outcome: 'failed', resultRefs: [], effectReceiptRefs: [proof.receiptRef.receiptId], reasonCode: 'project_fanout_model_failed' }), { withAuthority });
    }

    #task(node, root) {
        const planner = node.kind === 'planner', review = node.kind === 'review', judge = node.kind === 'judge';
        return { kind: planner ? 'native_project_graph_planner' : review ? 'native_project_graph_review' : judge ? 'native_project_graph_judge' : 'native_project_graph_work', authoredTask: node.label,
            instruction: planner ? 'Propose structured GraphPatch operations from the current graph and evidence. This is advisory Host control only. Never add tool authority or report domain changes.'
                : review ? 'Review the explicitly supplied typed advisory results. Return decision, reasonCode and exact targetAttemptIds from their evidence identities. A rerun never authorizes tools or formal Commit.'
                    : judge ? 'Select exactly one of the supplied direct typed candidate Result references. Return selectedResultRef and reasonCode candidate_selected. This advisory choice cannot change any Audience, tool authority or Project source.'
                        : 'Perform this declared advisory Project task using only the explicitly supplied source and results. No tools or domain writes are available.',
            ...(planner ? { graphView: { graphRevision: root.graphRevision, graph: root.graph, nodeControl: root.nodeControl,
                dependencyPins: this.state.selected.plan.dependencyPins.filter(pin => pin.port === 'model' || this.state.selected.delegationPlans.has(pin.pinId)) } } : {}) };
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
            // Pure Planner work may be recomputed after its inputs change.
            // Original accepted Patch receipts stay authoritative and are never
            // rolled back or replayed; only the new Model Attempt may propose.
            if (decision === 'rerun') {
                const affected = [...this.records.entries()].filter(([nodeId, fact]) => fact.attemptId !== reviewer.attemptId
                    && targets.some(target => graphReachable(root.graph, target.nodeId, nodeId)));
                for (const [, fact] of affected) {
                    if (fact.controlRef?.kind === 'graph_join_control'
                        || fact.controlRef?.kind === 'graph_planner_control'
                            && !await readReviewablePlannerCompletion(tx, handle, root, fact.attemptId, readerOptions))
                        fail('native_orchestration_review_irreversible_dependency');
                }
                for (const [nodeId, recorded] of affected) {
                    const node = root.graph.nodes.find(node => node.nodeId === nodeId);
                    if (!node.capabilities.includes('agent.delegate')) continue;
                    const fact = evidence.find(fact => fact.producer.attemptId === recorded.attemptId)
                        ?? (recorded.resultRef && await readGraphNodeResult(tx, handle, root, recorded.resultRef.resultId));
                    if (!fact || fact.producer.attemptId !== recorded.attemptId || !equal(fact.receipt.resultRef, recorded.resultRef)
                        || fact.producer.inputRefs[0]?.kind !== 'native_project_delegation') fail('native_orchestration_review_irreversible_dependency');
                    // Recompute only an actual closed, pure advisory child. The
                    // original typed continuation proves its complete DAG,
                    // return/claim and bank; a capability label is insufficient.
                    const completed = await readProjectDelegationContinuation(tx, handle, root, fact.producer, fact.modelEffect);
                    const selected = this.state.selected.resolveDelegation(node), child = completed.lineage.child;
                    if (!selected || child.status !== 'completed' || child.cancelRequested
                        || child.epoch !== completed.output.receipt.epoch || !equal(child.planRef, selected.planRef)
                        || !equal(child.parentRef.budgetCeiling, selected.ceiling)
                        || completed.output.publication.graphHistory.settled !== true) fail('native_orchestration_review_irreversible_dependency');
                }
            }
        }, admitRerun: async ({ tx, root, reviewer, target, attemptId, invalidatedAttemptIds }) => {
            const capacity = await budgetPort.observeCapacity(handle, { authorityRef: root.budgetAuthorityRef, reservationId: null }, { tx });
            const affected = [...this.records.entries()].filter(([, fact]) => invalidatedAttemptIds.includes(fact.attemptId));
            const requests = affected.reduce((count, [nodeId]) => count + 1
                + (this.state.selected.resolveDelegation(root.graph.nodes.find(node => node.nodeId === nodeId))?.ceiling.maxRequests ?? 0), 2);
            const admission = await readReviewAdmission(tx, handle, root, reviewer);
            const reviews = 1 + affected.filter(([nodeId]) => root.graph.nodes.find(node => node.nodeId === nodeId).kind === 'review').length;
            if (!capacity || capacity.overrun || capacity.remaining.requests < requests || !admission
                || admission.round >= root.graph.nodes.find(node => node.nodeId === reviewer.nodeId).policy.maxRounds
                || root.progress.reviews + reviews > root.limits.maxReviews)
                fail('native_orchestration_project_quality_rerun_limit');
            const node = root.graph.nodes.find(node => node.nodeId === target.nodeId), dependencies = this.#bundle(root.graph.edges.filter(edge => edge.to.nodeId === node.nodeId && !edge.loopBack), root.graph);
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
            const completion = Object.fromEntries([...this.records].map(([id, fact]) => [id, fact.status ?? 'completed']));
            const replan = [...this.records.entries()].find(([, fact]) => fact.requests?.replan && !handledReplans.has(fact.attemptId));
            let selected, bundle, token;
            if (replan) {
                const [nodeId, previous] = replan, scope = projectReplanScope(root.graph, nodeId), node = scope.target;
                if (previous.requests.finalize || !this.records.has(node.nodeId)) fail('native_orchestration_project_replan_unavailable');
                if (scope.affectedNodeIds.some(id => this.prepared?.has(id))) fail('native_orchestration_project_replan_unavailable');
                for (const id of scope.affectedNodeIds) if (this.records.has(id)) {
                    const old = root.graph.nodes.find(item => item.nodeId === id);
                    if (!['agent', 'planner', 'review', 'judge'].includes(old.kind) || old.capabilities.some(capability => !['generation.send', 'graph.patch'].includes(capability)))
                        fail('native_orchestration_review_irreversible_dependency');
                }
                const remaining = profile.pure.filter(item => item.capabilities.includes('generation.send')
                    && (!this.records.has(item.nodeId) || scope.affectedNodeIds.includes(item.nodeId)));
                const requests = remaining.reduce((total, item) => total + 1 + (this.state.selected.resolveDelegation(item)?.ceiling.maxRequests ?? 0), 1);
                const capacity = await this.service.runs.engine.withTransaction(handle, tx => this.service.budgetPort.observeCapacity(handle,
                    { authorityRef: root.budgetAuthorityRef, reservationId: null }, { tx }));
                if (!capacity || capacity.overrun || capacity.remaining.requests < requests) fail('native_orchestration_project_graph_budget_unavailable');
                if (root.progress.attempts + remaining.length + 2 > root.limits.maxAttempts) fail('native_orchestration_limit_exhausted');
                const ready = inspectGraphReadiness(root.graph, root.nodeControl, Object.fromEntries([...this.records].filter(([id]) => id !== node.nodeId)
                    .map(([id, fact]) => [id, fact.status ?? 'completed']))).ready.find(item => item.node.nodeId === node.nodeId);
                if (!ready) fail('native_orchestration_project_control_dependency_missing');
                bundle = this.#bundle([...ready.edges, ...scope.loops], root.graph);
                selected = node; token = previous.attemptId; handledReplans.add(previous.attemptId);
                for (const id of scope.affectedNodeIds) {
                    this.records.delete(id); this.#retryTokens.set(id, previous.attemptId);
                }
            } else {
                const observed = inspectGraphReadiness(root.graph, root.nodeControl, completion, { excludeNodeIds: [profile.worker.nodeId, profile.output.nodeId] });
                if (!observed.ready.length) {
                    const unfinished = profile.pure.filter(node => !this.records.has(node.nodeId) && root.nodeControl[node.nodeId].disposition !== 'cancelled');
                    if (unfinished.length) fail('native_orchestration_project_graph_blocked');
                    const final = inspectGraphReadiness(root.graph, root.nodeControl, completion, { excludeNodeIds: profile.pure.map(node => node.nodeId) }).ready.find(item => item.node.nodeId === profile.worker.nodeId);
                    if (!final) fail('native_orchestration_project_graph_blocked');
                    return this.#bundle(final.edges, root.graph);
                }
                selected = observed.ready[0].node; bundle = this.#bundle(observed.ready[0].edges, root.graph); token = this.#retryTokens.get(selected.nodeId) ?? 'initial';
            }
            if (selected.kind === 'fanout') {
                await this.#fanout(profile.fanouts.find(group => group.fanout.nodeId === selected.nodeId), bundle); continue;
            }
            const planner = selected.kind === 'planner', review = selected.kind === 'review', judge = selected.kind === 'judge';
            const prepared = this.prepared?.get(selected.nodeId), controlTask = prepared?.controlTask ?? this.#task(selected, root);
            const result = await this.models.generateStage(selected, prepared?.attemptId ?? token, { ...(prepared?.bundle ?? bundle), controlTask,
                ...(prepared ? { preparedAttemptId: prepared.attemptId, feedback: prepared.feedback } : {}),
                authorizeInputs: args => this.#authorizeInputs(bundle, args), outputContract: planner ? projectPlannerOutputContract : review ? projectGraphReviewOutputContract : judge ? projectGraphJudgeOutputContract : null,
                ...(planner ? { complete: (stage, args) => this.#planner(stage, args) } : review ? { complete: (stage, args) => this.#review(stage, args, bundle) } : judge ? { complete: (stage, args) => this.#judge(stage, args, bundle) } : {}) });
            this.prepared?.delete(selected.nodeId); this.#retryTokens.delete(selected.nodeId);
            if (result.review?.decision === 'rerun') {
                // Targets keep the Controller's exact prepared replacement ID.
                // Other causal descendants re-enter the original admission with
                // this actual Review receipt as a fresh command/request token.
                for (const [nodeId, fact] of this.records) if (result.review.invalidatedAttemptIds.includes(fact.attemptId)) {
                    this.records.delete(nodeId); this.#retryTokens.set(nodeId, result.review.receiptId);
                }
                this.#retryTokens.set(selected.nodeId, result.review.receiptId);
                this.records.delete(selected.nodeId); this.prepared ??= new Map();
                for (const item of result.reruns) this.prepared.set(item.nodeId, item);
                continue;
            }
            this.records.set(selected.nodeId, result);
        }
    }
}
