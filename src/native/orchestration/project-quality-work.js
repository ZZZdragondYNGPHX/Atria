import { ResultPort } from './result-port.js';
import { hashNativeDocument as hash, putImmutable } from '../repositories/common.js';
import { immutable, effectiveOutputReserve } from '../model-prompt-runtime/execution-utils.js';
import { assertObject, assertResultPolicy } from '../../../public/shared/native-orchestration-contracts.js';
import { captureNativeProjectWorker, inspectNativeProjectGeneration } from './native-project-generation-authority.js';
import { ContextPort } from './context-port.js';
import { compileNativeContextMetered, runGenerationLocalWork } from './generation-local-work.js';
import { AttemptController } from './attempt-controller.js';
import { ReviewController, reviewReceiptId } from './review-controller.js';
import { TransitionController } from './transition-controller.js';
import { controlCommandId, controlRecordKey, readAttempt, runGuard } from './controller-common.js';
import { graphNodeResult, readGraphNodeResult, graphResultPublicationId } from './graph-result-contracts.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { readFanoutFrame, readFanoutMembership } from './fanout-controller.js';
import { writeAttemptSettlement } from './attempt-settlement.js';
import { modelResultId } from './result-publication-contracts.js';
import { PROJECT_QUALITY_REASONS, projectQualityOutputContract } from './project-quality-profile.js';
import { projectQualityReceiptId, readProjectQualityReview } from './project-quality-contracts.js';

const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const equal = (a, b) => hash(a) === hash(b);

/** Private work inside the original Project operation and Task capture.
 * No Task generation is finished and no tool or domain writer runs here. */
export class ProjectQualityWork {
    constructor({ service, state, identity, logicalInputRef, port, issueScope, current, install, readControls = null, delegation = null }) {
        Object.assign(this, { service, state, identity, baseInput: logicalInputRef, port, issueScope, current, install, readControls, delegation });
    }

    #input(node, token, evidenceRefs = [], feedback = null, controlRefs = [], controlTask = null) {
        const requestId = 'project-quality:' + hash({ runId: this.state.operation.runId, nodeId: node.nodeId, token }).slice(0, 32);
        const task = controlTask ? { ...controlTask, ...(feedback ? { feedback } : {}) } : { kind: node.kind === 'review' ? 'native_project_quality_review' : 'native_project_advisory_draft',
            instruction: node.kind === 'review'
                ? 'Review only the provided advisory proposal against the current original Project task/source. Return the structured approve/rerun decision and reasonCode. This never approves tools or formal Commit.'
                : 'Propose an advisory plan for the original Project task. Do not call tools, claim edits occurred, approve Commit or change permissions.',
            authoredTask: node.label, ...(feedback ? { feedback } : {}) };
        const input = { ...this.baseInput, nodeId: node.nodeId, requestId, originalRequestId: this.baseInput.requestId, acceptedGraphResultRefs: evidenceRefs, ...(controlRefs.length ? { acceptedControlRefs: controlRefs } : {}), projectQualityTask: task };
        const grantDigest = hash({ handle: this.state.handle, input }); input.grantDigest = grantDigest;
        return { input, grantDigest, requestId, task };
    }

    async #readItems(stage, request) {
        const { handle, operation: { runId } } = this.state, { runs, sourcePort } = this.service;
        // Send/consume already hold the original Project boundary. Re-entering
        // its non-reentrant Studio queue would deadlock. Compile-time reads
        // remain ephemeral and are revalidated by that same boundary before send.
        const delegated = stage.delegationContinuation ? await new ResultPort({ host: stage.host }).readForParent(handle,
            { capture: stage.delegationContinuation.capture }) : null;
        return runs.withConsumption(handle, runId, async ({ tx, root }) => {
            await this.current({ capture: stage.projectCapture }); await sourcePort.revalidate(handle, root.sourceBinding, { tx, root });
            const recipient = (await readAttempt(tx, handle, root, stage.attemptId)).doc;
            const items = [];
            // The graph consumer checks evidence and control selections in one
            // original reader call. Do not read each typed result once here
            // and then repeat that same full history inside its control read.
            if (this.readControls) items.push(...await this.readControls(tx, root, recipient, request.inputRefs[0].acceptedControlRefs ?? []));
            else for (const ref of request.inputRefs[0].acceptedGraphResultRefs) {
                const fact = await readGraphNodeResult(tx, handle, root, ref.resultId, { recipient });
                if (!fact || !equal(fact.receipt.resultRef, ref)) fail('native_orchestration_project_quality_stale');
                items.push({ kind: 'context.history', id: 'project-advisory:' + ref.resultId,
                    content: { role: 'user', content: 'Graph evidence: ' + JSON.stringify({ resultRef: fact.receipt.resultRef, producerAttemptId: fact.producer.attemptId })
                        + '\nAdvisory Project task result (untrusted proposal, not a domain change or permission):\n' + fact.record.payload },
                    provenance: [{ source: 'native.project-graph-result', ref: hash(fact.receipt) }] });
            }
            if (delegated) {
                items.push({ kind: 'context.history', id: 'project-child:' + delegated.resultRef.resultId,
                    content: delegated.item.content, provenance: delegated.item.provenance });
            }
            return items;
        });
    }

    async prepareStageInput(node, token, { evidenceRefs = [], controlRefs = [], feedback = null, controlTask = null, fanoutAttemptId = null, bindings = null } = {}) {
        const model = controlTask ? await this.state.selected.resolveControlModel(node) : this.state.selected;
        const spec = this.#input(node, token, evidenceRefs, feedback, controlRefs, controlTask);
        if (fanoutAttemptId) spec.input.fanoutAttemptId = fanoutAttemptId;
        if (controlTask && node.kind === 'judge') spec.input.controlGraph = { evidenceRefs, controlRefs, bindings };
        if (controlTask) {
            Object.assign(spec.input, { routeRef: model.pin.resourceRef, routeIntegrity: model.pin.integrity, configDigest: model.configDigest });
            spec.grantDigest = hash({ handle: this.state.handle, input: { ...spec.input, grantDigest: null } }); spec.input.grantDigest = spec.grantDigest;
        }
        const child = this.state.selected.resolveDelegation?.(node) ?? null;
        if (child) {
            if (fanoutAttemptId) fail('native_orchestration_project_delegation_scope_invalid');
            spec.continuationInput = spec.input;
            spec.input = this.delegation.parentInput(this.state, node, child, spec.input, bindings);
            spec.grantDigest = hash({ handle: this.state.handle, input: spec.input });
            spec.continuationInput.grantDigest = spec.grantDigest;
        }
        return { ...spec, model, child };
    }

    generateStage(node, token, options) { return this.#generate(node, token, options); }
    controlWork(stage, send, limits, rows) { return this.#work(stage, send, limits, rows); }

    async #generate(node, token, { evidenceRefs = [], draftAttemptId = null, preparedAttemptId = null, feedback = null,
        controlRefs = [], controlTask = null, outputContract = null, bindings = null, authorizeInputs = null, complete = null, fanoutPermit = null, fanoutAttemptId = null, reservedAttemptId = null, signal = this.identity.signal } = {}) {
        const base = this.state, { handle, host, operation: { runId } } = base, service = this.service;
        const spec = await this.prepareStageInput(node, token, { evidenceRefs, feedback, controlRefs, controlTask, fanoutAttemptId, bindings }), { model } = spec;
        const inputRefs = [spec.input, ...evidenceRefs, ...controlRefs];
        const capture = await captureNativeProjectWorker(base.projectCapture, { requestId: spec.requestId, task: spec.task, ...(controlTask ? { routeRef: model.pin.resourceRef } : {}), ...(fanoutPermit ? { fanoutPermit, nodeId: node.nodeId } : {}),
            ...(outputContract || node.kind === 'review' ? { outputContract: outputContract ?? projectQualityOutputContract } : {}) });
        let decision = immutable({ ...base.decision, ...(controlTask ? { actionRef: { kind: 'native_model_send', runtimeRouteId: model.resolved.route.runtimeRouteId },
            targetRef: { connectionProfileId: model.resolved.connection.connectionProfileId, modelProfileId: model.resolved.model.modelProfileId, pathFingerprint: model.resolved.pathFingerprint },
            endpointBindingDigest: hash({ pathFingerprint: model.resolved.pathFingerprint, configDigest: model.configDigest }),
            budgetEnvelopeDigest: hash(model.resolved.route.executionPolicy.computeBudget) } : {}), inputRef: spec.input, inputHash: hash(spec.input), grantDigest: spec.grantDigest,
        egressDigest: hash({ sourceBinding: base.sourceBinding, input: spec.input }) });
        const stage = { ...base, signal, selected: { ...base.selected, ...model, node, toolPins: [] }, projectCapture: capture, decision, qualityStage: true, runId, child: spec.child, ownerLimits: base.selected.resolved.route.executionPolicy.computeBudget };
        const release = this.install(stage);
        try {
            const prepare = async () => {
                const admission = { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: spec.grantDigest, budgetRef: base.sourceBinding.budgetAuthorityRef };
                let attemptId = preparedAttemptId;
                if (!attemptId && bindings?.length) {
                    const advanced = await new TransitionController({ runs: service.runs, authorizeTransition: async args => {
                        await this.current({ capture }); await authorizeInputs({ ...args, capture }); return admission;
                    } }).advance(handle, { ...runGuard(await service.runs.get(handle, runId)), reservedAttemptId, bindings });
                    attemptId = advanced.outcome.attemptId;
                } else if (!attemptId && node.kind === 'review') {
                    const advanced = await new TransitionController({ runs: service.runs, authorizeTransition: async ({ tx, root, producers, target }) => {
                        await this.current({ capture });
                        const fact = await readGraphNodeResult(tx, handle, root, evidenceRefs[0].resultId);
                        if (!fact || target.nodeId !== node.nodeId || producers.length !== 1 || producers[0].attempt.attemptId !== draftAttemptId
                            || fact.producer.attemptId !== draftAttemptId) fail('native_orchestration_project_quality_stale');
                        return admission;
                    } }).advance(handle, { ...runGuard(await service.runs.get(handle, runId)), reservedAttemptId: null,
                        bindings: [{ edgeId: base.selected.quality.reviewInput.edgeId, producerAttemptId: draftAttemptId }] });
                    attemptId = advanced.outcome.attemptId;
                } else if (!attemptId) ({ attemptId } = await service.runs.beginAttempt(handle, controlCommandId('project.quality.draft', controlTask ? { runId, nodeId: node.nodeId, token } : { runId }),
                    { ...runGuard(await service.runs.get(handle, runId)), nodeId: node.nodeId, ...admission }));
                stage.attemptId = attemptId;
                await new AttemptController({ runs: service.runs, authorizeAttempt: async args => {
                    await this.current({ capture });
                    if (args.attempt.attemptId !== attemptId || args.attempt.nodeId !== node.nodeId || !equal(args.attempt.inputRefs, inputRefs)
                        || args.attempt.effectiveGrantDigest !== spec.grantDigest) fail('native_orchestration_project_quality_stale');
                } }).activate(handle, { ...runGuard(await service.runs.get(handle, runId)), attemptId });
                if (spec.child) {
                    const continuation = await host.turnOrchestration.runProjectDelegation({ parentState: stage, childPlanPinId: spec.child.pin.pinId, mode: 'handoff' });
                    stage.delegationContinuation = continuation;
                    const logical = { ...spec.continuationInput, acceptedResultRef: continuation.acceptedResultRef,
                        returnReceiptRef: continuation.returnReceiptRef, parentInputDigest: continuation.parentInputDigest };
                    decision = immutable({ ...decision, inputRef: logical, inputHash: hash(logical),
                        egressDigest: hash({ sourceBinding: base.sourceBinding, input: logical }) });
                    stage.decision = decision;
                    await this.delegation.continuation(continuation.capture, stage);
                }
                const effectId = 'oeffect_' + hash({ runId, attemptId, purpose: 'project_quality' }).slice(0, 32); stage.effectId = effectId;
                await service.effects.prepare(handle, { ...runGuard(await service.runs.get(handle, runId)), effectId, nodeAttemptId: attemptId,
                    proposal: Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, decision[key]])) });
            };
            if (fanoutPermit) await service.runs.withSourceControl(handle, runId, prepare,
                { withAuthority: service.sourcePort.consumptionBoundary(handle, base.sourceBinding, { engine: service.runs.engine }) });
            else await prepare();
            const { effectId } = stage;
            const audience = { kind: 'project_task', id: this.identity.taskId }, taskPurpose = 'original_native_project_quality';
            stage.contextPort = new ContextPort({ projectAgent: host.agent, projectCapture: capture,
                projectModelPolicy: { fallbackMode: stage.selected.failurePlan.routes.length > 1 ? 'automatic' : 'disabled', routes: stage.selected.failurePlan.routes },
                authorizeContext: async ({ request }) => {
                    await this.current({ capture }); await inspectNativeProjectGeneration(capture, { host, handle });
                    if (!equal(request.sourceBinding, base.sourceBinding) || !equal(request.audience, audience) || request.taskPurpose !== taskPurpose
                        || request.grantDigest !== spec.grantDigest || !equal(request.inputRefs, inputRefs)) fail('native_orchestration_context_denied');
                    return { allowed: true, grantDigest: spec.grantDigest, projectToolPins: [], projectGraphItems: await this.#readItems(stage, request) };
                } });
            const request = { ownerRef: { handle }, sourceBinding: base.sourceBinding, audience, taskPurpose, grantDigest: spec.grantDigest, inputRefs,
                tokenBudget: { modelContextLimit: stage.selected.resolved.model.limits.contextTokens, responseReserve: effectiveOutputReserve(stage.selected.resolved) } };
            const routeLimits = stage.selected.resolved.route.executionPolicy.computeBudget, ownerLimits = base.selected.resolved.route.executionPolicy.computeBudget;
            // Every pure route remains within the original Task operation's
            // allowance. The existing bank tightens this common ledger first.
            const limits = { maxRequests: Math.min(routeLimits.maxRequests, ownerLimits.maxRequests), maxTokens: Math.min(routeLimits.maxTokens, ownerLimits.maxTokens),
                localWork: Object.fromEntries(Object.keys(ownerLimits.localWork).map(key => [key, Math.min(ownerLimits.localWork[key], routeLimits.localWork[key])])) };
            const send = await service.generationSend(handle, { runId, effectId, limits });
            const metered = await compileNativeContextMetered({ handle, port: stage.contextPort, request, bank: send.bank, budgetPort: service.budgetPort,
                root: await service.runs.get(handle, runId), effectId, limits, signal,
                workDescriptor: { requestId: spec.requestId, pathFingerprint: stage.selected.resolved.pathFingerprint }, assertCurrent: () => this.current({ capture }) });
            stage.context = metered.compiled; stage.request = stage.contextPort.projectRequest(handle, { context: stage.context });
            await send.bindContext({ port: stage.contextPort, compiled: stage.context, compileProof: metered.proof });
            const scope = this.issueScope(host, handle, { runId, effectId, request: stage.request, logicalInputRef: decision.inputRef, logicalInputHash: decision.inputHash,
                nativeProjectCapture: capture, options: { scheduled: true, orchestrationSend: send }, revalidateConsume: async ({ tx } = {}) => {
                    await this.current({ capture }); await service.sourcePort.revalidate(handle, base.sourceBinding, { tx, root: await service.runs.get(handle, runId) });
                    await stage.contextPort.revalidate(handle, { context: stage.context, phase: 'consume' });
                } });
            const result = await this.port.generate(handle, scope, { signal });
            if (result.generated.response.toolCalls?.length) fail('native_orchestration_project_quality_tool_denied');
            const proof = await this.port.inspectResultCompletion(handle, { result, runId, effectId });
            const costs = await service.runs.engine.withTransaction(handle, tx => service.budgetPort.observeEffectClosure(handle,
                { authorityRef: base.sourceBinding.budgetAuthorityRef, effectIds: [effectId] }, { tx }));
            if (!costs.closed) fail('native_orchestration_project_quality_unsettled');
            if (complete) return await complete(stage, { result, proof, send, limits });
            if (node.kind === 'review') return await this.#review(stage, { result, proof, send, limits, draftAttemptId, evidenceRefs });
            return await this.#publish(stage, result, proof);
        } finally { if (spec.child) this.delegation.release(stage); if (release) release(); else this.install(base); }
    }

    async #publish(stage, result, proof) {
        const { handle, operation: { runId } } = this.state, { runs, sourcePort } = this.service;
        const resultId = modelResultId(runId, stage.effectId), receiptId = graphResultPublicationId(runId, resultId);
        const withAuthority = sourcePort.consumptionBoundary(handle, stage.sourceBinding, { engine: runs.engine });
        try {
            await runs.withSourceControl(handle, runId, () => runs.engine.withTransaction(handle, async tx => {
                await this.current({ capture: stage.projectCapture });
                const root = await runs.get(handle, runId), record = await readAttempt(tx, handle, root, stage.attemptId);
                const actual = await this.port.inspectResultCompletion(handle, { result, runId, effectId: stage.effectId });
                const graphSnapshot = await readTaskGraphRevision(tx, handle, root);
                let pending = root.pendingEffectRefs.length > 0;
                if (record.doc.inputRefs[0].fanoutAttemptId) {
                    const frame = await readFanoutFrame(tx, handle, root, record.doc.inputRefs[0].fanoutAttemptId);
                    if (!frame || !await readFanoutMembership(tx, handle, root, frame, stage.attemptId)) fail('native_orchestration_project_quality_stale');
                    pending = root.pendingEffectRefs.includes(stage.effectId);
                }
                if (!equal(actual, proof) || record.doc.status !== 'running' || !equal(record.doc.effectRefs, [stage.effectId])
                    || record.doc.resultRefs.length || pending || !equal(root, await runs.get(handle, runId))) fail('native_orchestration_project_quality_stale');
                return runs.control(handle, controlCommandId('graph.result.publish', { runId, effectId: stage.effectId }), {
                    ...runGuard(root), operation: 'result.publish', detail: { effectId: stage.effectId, resultId } }, async ({ tx, root: active, now }) => {
                    if (!equal(active, root) || active.progress.steps >= active.limits.maxSteps || now >= active.progress.deadlineAt) fail('native_orchestration_project_quality_stale');
                    const body = graphNodeResult({ root: active, producer: record.doc, proof, text: result.generated.response.text,
                        now, graphSnapshot, dependencyPins: stage.selected.plan.dependencyPins });
                    const resultRef = { runId, resultId };
                    const receipt = { schemaVersion: 1, receiptKind: 'graph_node_result', receiptId, runId, epoch: active.epoch,
                        producerAttemptId: stage.attemptId, resultRef, resultIntegrity: hash(body), modelEffectId: stage.effectId,
                        modelReceiptRef: proof.receiptRef, modelPayloadHash: proof.payloadHash, producerGrantDigest: stage.decision.grantDigest,
                        sourceBindingDigest: active.sourceBinding.bindingDigest, audienceDigest: hash(body.envelope.audienceConstraint),
                        graphRevision: active.graphRevision, decisionSeq: active.eventSeq + 1, createdAt: now };
                    await putImmutable(tx, controlRecordKey(handle, runId, 'result', resultId), body);
                    await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), receipt);
                    await writeAttemptSettlement({ tx, handle, root: active, record, outcome: 'completed', resultRefs: [resultRef],
                        effectReceiptRefs: [proof.receiptRef.receiptId], reasonCode: 'graph_result_published', now });
                    active.resultRefs.push(resultRef); active.progress.steps++;
                    return { root: active, eventType: 'result_published', reasonCode: 'graph_result_published', outcome: {
                        status: 'published', resultRef, publicationReceiptRef: { runId, receiptId } } };
                });
            }), { withAuthority });
        } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            const saved = await runs.engine.withTransaction(handle, async tx => readGraphNodeResult(tx, handle, await runs.get(handle, runId), resultId));
            if (!saved) throw error;
        }
        return { resultRef: { runId, resultId }, attemptId: stage.attemptId, payloadHash: proof.payloadHash };
    }

    #work(stage, send, limits, rows) {
        const { handle, operation: { runId } } = this.state;
        return async (kind, value, operation) => {
            const attempt = { attemptId: send.bank.nextLocalWorkAttemptId(), requestId: stage.request.requestId, kind, estimatedItems: 1,
                estimatedInputBytes: Buffer.byteLength(JSON.stringify(value)), targetFingerprint: hash({ runId, effectId: stage.effectId, kind, inputHash: hash(value) }) };
            let row;
            const output = await runGenerationLocalWork({ signal: stage.signal, attempt, requireAdmission: true, assertCurrent: () => this.current({ capture: stage.projectCapture }),
                admit: item => send.bank.chargeLocalWork(limits, item), settle: ({ attempt, usage }) => send.bank.settleLocalWork(attempt.attemptId, usage),
                onAdmitted: entry => { row = entry; } }, operation);
            const observed = await this.service.budgetPort.observeAttempt(handle, { kind: 'local_work', authorityRef: this.state.sourceBinding.budgetAuthorityRef,
                effectId: stage.effectId, localWorkOrdinal: row.orchestration.ordinal, attemptId: row.attemptId, reservationId: null });
            if (observed.status !== 'settled' || observed.usage?.outcome !== 'completed') fail('native_orchestration_project_quality_unsettled');
            rows.push({ kind, attemptId: observed.attemptId, ordinal: observed.orchestration.ordinal, targetFingerprint: attempt.targetFingerprint, rowHash: hash(observed) });
            return output;
        };
    }

    async #review(stage, { result, proof, send, limits, draftAttemptId, evidenceRefs }) {
        const { handle, selected, operation: { runId } } = this.state, { runs, sourcePort, budgetPort } = this.service;
        const rows = [], work = this.#work(stage, send, limits, rows), responseText = result.generated.response.text;
        const parsed = await work('graph_control_parse', responseText, async () => {
            if (Buffer.byteLength(responseText) > assertResultPolicy(selected.plan.definition.outputContract).maxBytes) fail('native_orchestration_project_quality_response_invalid');
            const value = JSON.parse(responseText); assertObject(value, ['decision', 'reasonCode'], 'Project quality response');
            if (!['approve', 'rerun'].includes(value.decision) || !PROJECT_QUALITY_REASONS.includes(value.reasonCode)
                || (value.decision === 'approve') !== (value.reasonCode === 'quality_ready')) fail('native_orchestration_project_quality_response_invalid');
            return immutable(value);
        });
        const withAuthority = sourcePort.consumptionBoundary(handle, stage.sourceBinding, { engine: runs.engine });
        const controller = new ReviewController({ runs, authorizeReview: async ({ root, reviewer, targets, decision, reasonCode, evidenceRefs: actualRefs }) => {
            await this.current();
            const actual = await this.port.inspectResultCompletion(handle, { result, runId, effectId: stage.effectId });
            if (!equal(actual, proof) || reviewer.attemptId !== stage.attemptId || targets.length !== 1 || targets[0].attemptId !== draftAttemptId
                || decision !== parsed.decision || reasonCode !== parsed.reasonCode || !equal(actualRefs, evidenceRefs)
                || !equal(root.sourceBinding, stage.sourceBinding)) fail('native_orchestration_project_quality_stale');
        }, admitRerun: async ({ tx, root, reviewer, attemptId }) => {
            await this.current();
            const capacity = await budgetPort.observeCapacity(handle, { authorityRef: root.budgetAuthorityRef, reservationId: null }, { tx });
            if (root.progress.reviews >= selected.quality.rounds || root.progress.attempts + 4 > root.limits.maxAttempts
                || (root.progress.edgeVisitCounts[selected.quality.reviewInput.edgeId] ?? 0) >= selected.quality.reviewInput.maxVisits
                || !capacity || capacity.overrun || capacity.remaining.requests < 3) fail('native_orchestration_project_quality_rerun_limit');
            const feedback = { reviewReceiptRef: { runId, receiptId: reviewReceiptId(runId, reviewer.attemptId) }, reasonCode: parsed.reasonCode };
            const spec = this.#input(selected.quality.draft, attemptId, [], feedback), inputRefs = [spec.input];
            return { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: spec.grantDigest, budgetRef: root.budgetAuthorityRef };
        } });
        const decided = await work('graph_control_adopt', parsed, () => runs.withSourceControl(handle, runId, async () => controller.decide(handle, {
            ...runGuard(await runs.get(handle, runId)), reviewAttemptId: stage.attemptId, decision: parsed.decision,
            targetAttemptIds: [draftAttemptId], reasonCode: parsed.reasonCode, evidenceRefs }), { withAuthority }));
        const review = decided.outcome.reviewReceipt, receiptId = projectQualityReceiptId(runId, stage.attemptId);
        try {
            await runs.withSourceControl(handle, runId, async () => runs.control(handle, controlCommandId('project.quality.review.settle', stage.attemptId), {
                ...runGuard(await runs.get(handle, runId)), operation: 'attempt.settle', detail: { attemptId: stage.attemptId, reviewReceiptId: review.receiptId } },
            async ({ tx, root, now }) => {
                await this.current();
                if (!equal(proof, await this.port.inspectResultCompletion(handle, { result, runId, effectId: stage.effectId }))) fail('native_orchestration_project_quality_stale');
                const record = await readAttempt(tx, handle, root, stage.attemptId);
                if (record.doc.status !== 'running' || !equal(record.doc.effectRefs, [stage.effectId]) || !equal(root, await runs.get(handle, runId))) fail('native_orchestration_project_quality_stale');
                const receipt = { schemaVersion: 1, receiptKind: 'project_graph_review_model', receiptId, runId, epoch: root.epoch,
                    producerAttemptId: stage.attemptId, sourceBindingDigest: root.sourceBinding.bindingDigest, grantDigest: stage.decision.grantDigest,
                    modelEffectId: stage.effectId, modelReceiptRef: proof.receiptRef, modelPayloadHash: proof.payloadHash, responseText,
                    reviewReceiptRef: { runId, receiptId: review.receiptId }, reviewIntegrity: hash(review), localWork: rows, decisionSeq: root.eventSeq + 1, createdAt: now };
                await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), receipt);
                await writeAttemptSettlement({ tx, handle, root, record, outcome: 'completed', resultRefs: [],
                    effectReceiptRefs: [proof.receiptRef.receiptId], reasonCode: 'project_graph_review_decided', now });
                root.progress.steps++;
                return { root, eventType: 'project_quality_review_completed', reasonCode: parsed.reasonCode, outcome: { reviewReceiptRef: receipt.reviewReceiptRef } };
            }), { withAuthority });
        } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            const saved = await runs.engine.withTransaction(handle, async tx => readProjectQualityReview(tx, handle, await runs.get(handle, runId), stage.attemptId));
            if (!saved || !equal(saved.review, review)) throw error;
        }
        return { decision: review.decision, reviewAttemptId: stage.attemptId, reviewReceiptRef: { runId, receiptId: review.receiptId },
            modelReviewReceiptRef: { runId, receiptId }, replacementAttemptId: review.replacements[0]?.attemptId ?? null,
            feedback: { reviewReceiptRef: { runId, receiptId: review.receiptId }, reasonCode: review.reasonCode } };
    }

    async run() {
        const profile = this.state.selected.quality;
        let draft = await this.#generate(profile.draft, 'initial');
        while (true) {
            const review = await this.#generate(profile.review, draft.attemptId, { draftAttemptId: draft.attemptId, evidenceRefs: [draft.resultRef] });
            if (review.decision === 'approve') return { draftResultRef: draft.resultRef, reviewAttemptId: review.reviewAttemptId,
                reviewReceiptRef: review.reviewReceiptRef, modelReviewReceiptRef: review.modelReviewReceiptRef };
            if (!review.replacementAttemptId) fail('native_orchestration_project_quality_rerun_denied');
            const next = await this.#generate(profile.draft, review.replacementAttemptId, { preparedAttemptId: review.replacementAttemptId, feedback: review.feedback });
            if (next.payloadHash === draft.payloadHash) fail('native_orchestration_project_quality_no_progress');
            draft = next;
        }
    }
}
