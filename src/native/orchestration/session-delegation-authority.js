import { ConflictError } from '../../storage/errors.js';
import { hashNativeDocument as hash, putImmutable, putMutable } from '../repositories/common.js';
import { immutable, effectiveOutputReserve } from '../model-prompt-runtime/execution-utils.js';
import { readPlanRevision } from './plan-repository.js';
import { readAttempt, runGuard, controlCommandId, controlRecordKey } from './controller-common.js';
import { sessionGraphAudience } from './session-agent-graph-profile.js';
import { audienceRunCapture } from './audience-source-contracts.js';
import { assertNativeTurnQuota, captureNativeTurnChildQuota } from './native-turn-quota.js';
import { nativeTaskScheduler } from '../task-scheduler.js';
import { AttemptController } from './attempt-controller.js';
import { TransitionController } from './transition-controller.js';
import { ContextPort } from './context-port.js';
import { compileNativeContextMetered } from './generation-local-work.js';
import { ResultController } from './result-controller.js';
import { TaskLocalOutputController } from './task-local-output-controller.js';
import { HandoffReturnController } from './handoff-return-controller.js';
import { BudgetPort } from './budget-port.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { readModelTerminalReceipt } from './model-port.js';
import { writeAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readTaskLocalOutput } from './task-local-output-contracts.js';
import { readResultPublication } from './result-publication-contracts.js';
import { assertNativeTurnPermit } from './native-turn-permit.js';
import { childBudgetReceiptId, assertChildRunCurrent } from './run-repository.js';
import { readSessionDelegation, readSessionDelegationContinuation } from './session-delegation-contracts.js';
import { readSessionDelegationInputs } from './session-delegation-inputs.js';
import { sessionDelegatedGraphProfile } from './session-delegated-graph-profile.js';
import { readSessionPlannerCompletion, sessionPlannerOutputContract } from './session-planner-contracts.js';
import { completeSessionDelegatedPlanner } from './session-delegated-planner-work.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';

const fail = (code = 'native_orchestration_delegation_denied') => { throw new ConflictError(code); };
const equal = (a, b) => hash(a) === hash(b);
const configHash = resolved => hash({ route: resolved.route, model: resolved.model, connection: resolved.connection, generation: resolved.generation, resources: resolved.resources });

/** No new ledger, Scheduler or bank: captures bind original child callbacks to
 * the original Run/Plan/Source and Controller facts. */
export class SessionDelegationAuthority {
    #delegations = new WeakMap();
    #returns = new WeakMap();
    #children = new Map();
    #parents = new Map();
    #graphs = new WeakMap();
    constructor({ owner, execution, port, issueScope, resolveModel, assertSelection }) {
        Object.assign(this, { owner, execution, port, issueScope, resolveModel, assertSelection });
    }
    ownsDelegationCapture(capture) { return this.#delegations.has(capture); }
    ownsReturnCapture(capture) { return this.#returns.has(capture); }
    hasRun(runId) { return this.#children.has(runId); }
    ownsGraphCapture(capture) { return this.#graphs.has(capture); }

    async selection(host, handle, base, input, plan, parentNode) {
        const ids = parentNode.policy.allowedPlanPinIds ?? [];
        if (!ids.length) return null;
        if (ids.length !== 1 || parentNode.kind !== 'agent' || !parentNode.capabilities.includes('agent.delegate')) fail();
        const pin = plan.dependencyPins.find(pin => pin.pinId === ids[0] && parentNode.dependencyPinIds.includes(pin.pinId));
        if (pin?.port !== 'plan') fail();
        const childPlan = await this.owner.engine.withTransaction(handle, tx => readPlanRevision(tx, handle, pin.resourceRef));
        if (hash(childPlan) !== pin.integrity) fail();
        const topology = sessionDelegatedGraphProfile(childPlan), parentSource = sessionGraphAudience(base, parentNode, plan.dependencyPins), profiles = [];
        if (parentSource.audience.kind !== 'actor') fail();
        for (const node of topology.ordered) {
            const model = await this.resolveModel(host, handle, base, input, childPlan, node, null);
            if (!equal(model.audienceSource.audience, parentSource.audience) || !equal(model.audienceSource.descriptor, parentSource.descriptor)
                || model.failurePlan.routes.length !== 1 || model.resolved.route.policy.maxRetries !== 0
                || model.resolved.route.executionPolicy.continuity !== 'none' || model.resolved.route.executionPolicy.reuse !== 'disabled') fail();
            profiles.push(model);
        }
        // Each actual node's route is frozen; all sends use the held original
        // child allocation. The first original route defines that allocation.
        const ceiling = profiles[0].resolved.route.executionPolicy.computeBudget;
        if (profiles.some(model => !equal(model.resolved.route.executionPolicy.computeBudget, ceiling))) fail();
        return { pin, plan: childPlan, planRef: pin.resourceRef, topology, profiles, ceiling, parentSource };
    }

    parentInput(state, child, mode) {
        const selected = state.selectionState, ref = state.decision.inputRef, source = selected.audienceSource;
        if (!['delegate', 'handoff'].includes(mode) || !child) fail();
        const input = { kind: 'native_session_delegation', role: 'narrator', requestId: state.request.requestId,
            sourceRef: state.sourceBinding.sourceRef, bindingRef: ref.bindingRef, planRef: ref.planRef, nodeId: ref.nodeId,
            childPlanRef: child.planRef, audience: ref.audience,
            delegationScope: { parentPinId: source.pin.pinId, childPinId: child.profiles[0].audienceSource.pin.pinId,
                sourceRef: source.actualRef ?? source.pin.resourceRef, integrity: hash(source.descriptor) },
            acceptedGraphResultRefs: ref.acceptedGraphResultRefs ?? [],
            ...(ref.acceptedControlRefs ? { acceptedControlRefs: ref.acceptedControlRefs } : {}),
            graphBindings: state.graphBindings.map(item => ({ edgeId: item.edge.edgeId, producerAttemptId: item.attemptId })).toSorted((a, b) => a.edgeId.localeCompare(b.edgeId)),
            ...(ref.audienceCapture ? { audienceCapture: ref.audienceCapture } : {}) };
        return input;
    }

    async authorizeDelegation({ handle, tx, parent, parentAttempt, childPlan, inputRefs, effectiveGrantDigest, budgetCeiling, phase }) {
        const state = this.#parents.get(parent.runId);
        if (!state || state.handle !== handle || ![state.mode, 'confirm_budget'].includes(phase)
            || parentAttempt.attemptId !== state.attemptId || parentAttempt.effectiveGrantDigest !== state.decision.grantDigest
            || parentAttempt.status !== (phase === 'confirm_budget' && state.mode === 'handoff' ? 'waiting_child' : 'running')
            || !equal(parentAttempt.inputRefs, state.parentInputRefs) || !equal(childPlan, state.child.plan)
            || !equal(inputRefs, state.childInputRefs) || effectiveGrantDigest !== state.childGrantDigest || !equal(budgetCeiling, state.child.ceiling)) fail();
        await this.assertSelection(state.selection);
        await this.execution().sourcePort.revalidate(handle, state.sourceBinding, { tx, root: parent });
        await BudgetPort.prototype.assertCurrent.call(this.execution().budgetPort, handle, parent.budgetAuthorityRef, { tx });
        return { allowed: true, effectiveGrantDigest, parentGrantDigest: state.decision.grantDigest,
            budgetCeilingDigest: hash(budgetCeiling), sourceBindingDigest: parent.sourceBinding.bindingDigest };
    }

    inspectDelegationIdentity(capture, { host, handle } = {}) {
        const state = this.#delegations.get(capture);
        if (!state || state.handle !== handle || host !== undefined && state.host !== host || state.host.turnOrchestration !== this.owner
            || this.#children.get(state.identity.childRunId) !== state) fail();
        const proof = assertNativeTurnQuota(state.quotaProof, state.parent.proofExpected);
        return Object.freeze({ ...state.identity, host: state.host, signal: assertNativeTurnPermit(proof.permit).signal,
            request: state.request, contextInputRefs: state.contextInputRefs, activeNode: state.activeNode ? immutable(state.activeNode) : null });
    }

    async #inspect(capture, expected, output) {
        const identity = this.inspectDelegationIdentity(capture, expected), state = this.#delegations.get(capture), service = this.execution();
        return this.owner.engine.withTransaction(identity.handle, async tx => {
            if (expected.tx !== undefined && expected.tx !== tx) fail();
            await this.assertSelection(state.parent.selection);
            const parentRoot = await service.runs.get(identity.handle, identity.parentRunId);
            const lineage = await readSessionDelegation(tx, identity.handle, parentRoot, identity.childRunId);
            if (!lineage) fail();
            const root = lineage.child, parentAttempt = lineage.parentAttempt;
            const fence = await this.owner.engine.nativeHostLifecycle.assertWriter(identity.handle, tx);
            await assertChildRunCurrent(tx, identity.handle, root);
            if (parentRoot.cancelRequested || parentRoot.status !== 'running' || parentRoot.epoch !== identity.parentEpoch
                || root.hostBootId !== fence.hostBootId || root.hostGeneration !== fence.generation
                || parentAttempt.status !== (state.parent.mode === 'handoff' ? 'waiting_child' : 'running')) fail();
            if (!equal(root.sourceBinding, identity.sourceBinding) || root.epoch !== identity.childEpoch || root.cancelRequested
                || !['admitted', 'running'].includes(root.status) || !equal(root.graph, state.child.plan.definition)
                || !equal(root.parentRef.inputRefs, identity.inputRefs) || root.parentRef.effectiveGrantDigest !== identity.grantDigest
                || parentAttempt.effectiveGrantDigest !== identity.parentGrantDigest || lineage.mode !== state.parent.mode) fail();
            await service.sourcePort.revalidate(identity.handle, root.sourceBinding, { tx, root });
            let closure;
            if (output) {
                closure = await service.budgetPort.observeChildClosure(identity.handle, { authorityRef: root.budgetAuthorityRef, reservationId: root.runId,
                    expectedParentReservationId: parentRoot.parentRef ? parentRoot.runId : null, expectedCeiling: root.parentRef.budgetCeiling }, { tx });
                if (!closure.closed) fail('native_orchestration_child_budget_unclosed');
            } else await service.budgetPort.verifyReservation({ handle: identity.handle, tx, root, parent: parentRoot });
            const upstream = await readSessionDelegationInputs(tx, identity.handle, parentRoot, parentAttempt,
                { base: state.parent.selectionState.base, node: state.model.node, pins: state.child.plan.dependencyPins });
            const results = [...upstream.results];
            for (const binding of state.bindings ?? []) {
                if (binding.controlRef) {
                    const saved = await readSessionPlannerCompletion(tx, identity.handle, root, binding.attemptId);
                    if (!saved || !equal(saved.controlRef, binding.controlRef)) fail();
                    results.push({ controlRef: binding.controlRef, sourceRefs: [binding.controlRef], content: 'Advisory graph control only; this never grants Source, tools or official writes: ' + JSON.stringify(saved.patch.appliedOperations) });
                    continue;
                }
                const saved = await readGraphNodeResult(tx, identity.handle, root, binding.resultRef.resultId);
                if (!saved || saved.producer.attemptId !== binding.attemptId) fail();
                results.push({ resultRef: binding.resultRef, sourceRefs: saved.record.envelope.sourceRefs, content: saved.record.payload });
            }
            const taskGraph = state.model.node.kind === 'planner' ? await readTaskGraphRevision(tx, identity.handle, root,
                state.activeNode ? (await readAttempt(tx, identity.handle, root, state.activeNode.nodeAttemptId)).doc.graphRevision : root.graphRevision) : null;
            this.inspectDelegationIdentity(capture, expected);
            return { ...identity, root, parentRoot, parentAttempt, parentGrantDigest: parentAttempt.effectiveGrantDigest,
                parentTaskPurpose: 'original_native_session_delegation', mode: lineage.mode,
                handoffReceiptRef: lineage.handoff ? { runId: parentRoot.runId, receiptId: lineage.handoff.receiptId } : null,
                delegationReceiptRef: { runId: parentRoot.runId, receiptId: lineage.delegation.receiptId },
                budgetReadyReceiptRef: { runId: root.runId, receiptId: childBudgetReceiptId(root.runId) },
                ...(output ? { closure } : { context: { snapshot: state.parent.selectionState.base, sourceAudience: state.model.audienceSource.audience,
                    task: { nodeId: state.model.node.nodeId, label: state.model.node.label,
                        ...(taskGraph ? { graphView: taskGraph } : {}),
                        ...(upstream.controls.length ? { inputs: upstream.controls } : {}),
                        purpose: state.model.node.kind === 'planner' ? 'Return only structured operations for this published task graph and its original limits. Graph changes never grant Source, tools or official writes.' : 'Provide advisory analysis only. Never write official world facts or speak for the player.' }, results } }) };
        });
    }
    inspectDelegation(capture, expected = {}) { return this.#inspect(capture, expected, false); }
    inspectDelegationOutput(capture, expected = {}) { return this.#inspect(capture, expected, true); }

    async authorizeChildAttempt({ handle, tx, root, input }) {
        const state = this.#children.get(root.runId);
        if (!state || state.handle !== handle || input.nodeId !== state.model.node.nodeId
            || !equal(input.inputRefs, state.contextInputRefs) || input.inputDigest !== hash(state.contextInputRefs)
            || input.effectiveGrantDigest !== state.identity.grantDigest || !equal(input.budgetRef, root.budgetAuthorityRef)) fail();
        await this.inspectDelegation(state.capture, { host: state.host, handle, tx });
        return { allowed: true, inputDigest: input.inputDigest, effectiveGrantDigest: input.effectiveGrantDigest,
            sourceBindingDigest: root.sourceBinding.bindingDigest };
    }

    async authorize({ handle, tx, root, attempt, proposal, intent }) {
        const state = this.#children.get(root.runId);
        if (!state || state.handle !== handle || !state.activeNode || attempt && attempt.attemptId !== state.activeNode.nodeAttemptId
            || proposal && !equal(proposal, Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, state.decision[key]])))
            || intent && (intent.nodeAttemptId !== state.activeNode.nodeAttemptId || intent.inputHash !== state.decision.inputHash)) fail();
        await this.inspectDelegation(state.capture, { host: state.host, handle, ...(tx ? { tx } : {}) });
        return immutable(state.decision);
    }
    async verifySend(args) {
        await this.authorize(args);
        const state = this.#children.get(args.root.runId);
        if (configHash(args.resolved) !== state.model.configDigest || args.snapshot.requestId !== state.request.requestId
            || args.compiledBinding.fingerprint !== args.snapshot.diagnostics.compiledBinding.fingerprint
            || !equal(await state.contextPort.provider(args.handle, { context: state.context }).buildRequestContextPlan(state.request, args.resolved), args.snapshot.contextPlan)) fail();
    }
    async verifyObservation(args) {
        const state = this.#children.get(args.root.runId);
        if (!state) fail();
        if (args.observation.dispatchEvidence.kind === 'proven_not_dispatched') {
            if (!state.noDispatchObservation || !equal(args.observation, state.noDispatchObservation)
                || args.intent.effectId !== state.activeNode.effectId || args.intent.status !== 'prepared'
                || args.intent.budgetAttemptRef !== null || args.intent.dispatchToken !== null) fail();
            const costs = await this.execution().budgetPort.observeEffectClosure(args.handle,
                { authorityRef: args.root.budgetAuthorityRef, effectIds: [args.intent.effectId] }, { tx: args.tx });
            if (!costs.closed || costs.budgetAttemptRefs.some(ref => ref.kind !== 'local_work')) fail();
            return;
        }
        return this.port(state.host).verifyObservation(args);
    }
    async authorizeGraphResult(args) {
        const state = this.#graphs.get(args.capture);
        if (!state || state !== this.#children.get(args.root.runId) || state.activeNode.nodeAttemptId !== args.producer.attemptId
            || args.effectId !== state.activeNode.effectId || args.phase !== 'publish' || state.model.node === state.child.topology.final) fail();
        await this.inspectDelegation(state.capture, { handle: state.handle, host: state.host, tx: args.tx });
        return { allowed: true, grantDigest: state.decision.grantDigest };
    }

    async authorizeTaskLocalOutput({ handle, tx, capture, phase, identity, publication }) {
        const current = await (phase === 'publish' ? this.inspectDelegationOutput(capture, { handle, tx }) : this.inspectDelegation(capture, { handle, tx }));
        if (!equal(identity, { childRunId: current.childRunId, parentRunId: current.parentRunId, parentAttemptId: current.parentAttemptId,
            childEpoch: current.childEpoch, parentEpoch: current.parentEpoch })) fail();
        const saved = await readResultPublication(tx, handle, current.root, publication.resultRef.resultId);
        if (!saved || !equal(publication, { status: 'published', resultRef: saved.receipt.resultRef,
            publicationReceiptRef: { runId: current.childRunId, receiptId: saved.receipt.receiptId } })) fail();
        return { inputRefs: [saved.receipt.resultRef], inputDigest: hash([saved.receipt.resultRef]), effectiveGrantDigest: current.grantDigest, budgetRef: current.root.budgetAuthorityRef };
    }

    inspectReturnIdentity(capture, { handle, host } = {}) {
        const state = this.#returns.get(capture);
        if (!state || state.handle !== handle || host !== undefined && state.host !== host || this.#parents.get(state.runId) !== state
            || state.returnCapture !== capture || state.host.turnOrchestration !== this.owner) fail('native_orchestration_return_denied');
        const quota = assertNativeTurnQuota(state.quotaProof, state.proofExpected);
        return Object.freeze({ ...state.returnIdentity, host: state.host, signal: assertNativeTurnPermit(quota.permit).signal });
    }
    async inspectReturn(capture, expected = {}) {
        const identity = this.inspectReturnIdentity(capture, expected), state = this.#returns.get(capture), service = this.execution();
        return this.owner.engine.withTransaction(identity.handle, async tx => {
            if (expected.tx !== undefined && expected.tx !== tx) fail();
            await this.assertSelection(state.selection);
            const parentRoot = await service.runs.get(identity.handle, identity.parentRunId), child = await service.runs.get(identity.handle, identity.childRunId);
            const producer = (await readAttempt(tx, identity.handle, parentRoot, identity.parentAttemptId)).doc;
            const lineage = await readSessionDelegation(tx, identity.handle, parentRoot, identity.childRunId);
            if (child.status !== 'completed' || child.cancelRequested || child.epoch !== identity.childEpoch || lineage.mode !== state.mode) fail();
            await service.sourcePort.revalidate(identity.handle, parentRoot.sourceBinding, { tx, root: parentRoot });
            const output = await readTaskLocalOutput(tx, identity.handle, child);
            if (!output || !equal(output.claim.resultRef, identity.resultRef) || parentRoot.cancelRequested || parentRoot.status !== 'running'
                || parentRoot.epoch !== identity.parentEpoch || producer.effectiveGrantDigest !== identity.parentGrantDigest
                || producer.inputDigest !== identity.parentInputDigest || !equal(producer.inputRefs, identity.parentInputRefs)) fail();
            return { ...identity, parentRoot, parent: parentRoot, child, parentAttempt: producer, attempt: producer, output, handoff: lineage.handoff, mode: state.mode };
        });
    }
    async authorizeHandoffReturn({ capture, handle, tx }) {
        const value = await this.inspectReturn(capture, { handle, tx });
        if (value.mode !== 'handoff' || value.parentAttempt.status !== 'waiting_child') fail();
        return { allowed: true, parentGrantDigest: value.parentGrantDigest, childGrantDigest: value.childGrantDigest,
            sourceBindingDigest: value.sourceBinding.bindingDigest, parentInputDigest: value.parentInputDigest,
            resultRef: value.resultRef, outputReceiptRef: value.outputReceiptRef, controlToken: value.handoff.controlToken };
    }
    async authorizeParentResult({ capture, handle, tx }) {
        return (await this.inspectParentResult(capture, { handle, tx })).decision;
    }
    async inspectParentResult(capture, { handle, tx } = {}) {
        const value = await this.inspectReturn(capture, { handle, tx });
        if (!['running', 'waiting_effect'].includes(value.parentAttempt.status)) fail();
        if (value.parentAttempt.status === 'waiting_effect') {
            if (value.parentAttempt.effectRefs.length !== 1) fail();
            const intent = (await readEffect(tx, handle, value.parentRoot, value.parentAttempt.effectRefs[0])).doc;
            await readSessionDelegationContinuation(tx, handle, value.parentRoot, value.parentAttempt, intent);
        }
        return { current: value, decision: { allowed: true, grantDigest: value.parentGrantDigest, inputDigest: value.parentInputDigest,
            sourceBindingDigest: value.sourceBinding.bindingDigest, resultRef: value.resultRef } };
    }
    async continuation(capture, state) {
        const identity = this.inspectReturnIdentity(capture, { host: state.host, handle: state.handle });
        if (identity.parentRunId !== state.runId || identity.parentAttemptId !== state.attemptId || identity.parentGrantDigest !== state.decision.grantDigest) fail();
        await this.owner.engine.withTransaction(state.handle, async tx => readSessionDelegationContinuation(tx, state.handle,
            await this.execution().runs.get(state.handle, state.runId), (await readAttempt(tx, state.handle, await this.execution().runs.get(state.handle, state.runId), state.attemptId)).doc, { inputRef: state.decision.inputRef, nodeAttemptId: state.attemptId, sourceBindingDigest: state.sourceBinding.bindingDigest }));
        return identity;
    }

    async run({ parentState, childPlanPinId, mode }) {
        const state = parentState, { host, handle } = state, service = this.execution(), child = state.selectionState.delegation;
        if (!child || child.pin.pinId !== childPlanPinId || !['delegate', 'handoff'].includes(mode) || this.#parents.has(state.runId)) fail();
        state.child = child; state.mode = mode;
        state.parentInputRefs = immutable((await this.owner.engine.withTransaction(handle, async tx => readAttempt(tx, handle,
            await service.runs.get(handle, state.runId), state.attemptId))).doc.inputRefs);
        state.childInputRefs = state.parentInputRefs;
        state.childGrantDigest = hash({ parentGrantDigest: state.decision.grantDigest, childPlanRef: child.planRef,
            inputRefs: state.childInputRefs, sourceBindingDigest: state.sourceBinding.bindingDigest });
        this.#parents.set(state.runId, state);
        const original = assertNativeTurnQuota(state.quotaProof, state.proofExpected), permit = original.permit;
        const schedulerProof = assertNativeTurnPermit(permit);
        try {
            const delegated = await service.delegates[mode](handle, { ...runGuard(await service.runs.get(handle, state.runId)), parentAttemptId: state.attemptId,
                delegationId: 'original_native_session_analysis', childPlanRef: child.planRef, inputRefs: state.childInputRefs,
                inputDigest: hash(state.childInputRefs), effectiveGrantDigest: state.childGrantDigest, returnContract: child.plan.definition.outputContract, budgetCeiling: child.ceiling });
            state.childRunId = delegated.outcome.childRunId;
            await service.reserveChild(handle, { parentRunId: state.runId, childRunId: state.childRunId, ceiling: child.ceiling,
                limits: state.selectionState.resolved.route.executionPolicy.computeBudget });
            await service.delegates.confirmBudget(handle, runGuard(await service.runs.get(handle, state.childRunId)));
            const resources = [...new Set((await Promise.all(child.profiles.map(model => host.executionResources(handle, model.resolved.route)))).flat())];
            const expected = { owner: handle, anchor: schedulerProof.expected.anchor, kind: 'model_task', executionClass: 'turn_blocking', resources,
                key: 'session-child:' + state.childRunId, fingerprint: hash({ childRunId: state.childRunId, childPlanRef: child.planRef }) };
            const output = await nativeTaskScheduler.withResourceHandoff(schedulerProof.boundary, schedulerProof.expected, {
                ...Object.fromEntries(['kind', 'executionClass', 'resources', 'key', 'fingerprint'].map(key => [key, expected[key]])),
                fresh: async () => { await this.assertSelection(state.selection); return true; },
                run: boundary => this.#runChild(state, expected, boundary), finalize: value => value });
            if (output.status !== 'completed') {
                const pending = await service.runs.get(handle, state.childRunId);
                const outputAttemptId = await this.owner.engine.withTransaction(handle, async tx => {
                    for (const id of pending.attemptRefs) if ((await readAttempt(tx, handle, pending, id)).doc.nodeId === pending.graph.outputContract.ownerNodeId) return id;
                    return null;
                });
                const error = new ConflictError('native_orchestration_child_budget_unclosed');
                await this.#failRun(state, pending.runId, outputAttemptId, error);
                throw error;
            }
            const root = await service.runs.get(handle, state.childRunId), capture = Object.freeze({}); state.returnCapture = capture;
            state.returnIdentity = immutable({ handle, sourceBinding: state.sourceBinding, parentRunId: state.runId, parentAttemptId: state.attemptId,
                parentPlanRef: state.selectionState.binding.planRef, parentEpoch: root.parentRef.parentEpoch, childRunId: root.runId, childEpoch: root.epoch,
                childPlanRef: root.planRef, parentGrantDigest: state.decision.grantDigest, childGrantDigest: root.parentRef.effectiveGrantDigest,
                parentInputRefs: state.parentInputRefs, parentInputDigest: hash(state.parentInputRefs), resultRef: output.resultRef,
                outputClaimRef: output.outputClaimRef, outputReceiptRef: output.outputReceiptRef });
            this.#returns.set(capture, state);
            const returned = mode === 'handoff' ? await new HandoffReturnController({ host }).returnChild(handle, { capture }) : { returnReceiptRef: null };
            return { ...output, capture, acceptedResultRef: output.resultRef, returnReceiptRef: returned.returnReceiptRef, parentInputDigest: hash(state.parentInputRefs) };
        } catch (error) {
            const cause = error.cause ?? error;
            try { await this.#failRun(state, state.runId, state.attemptId, cause); } finally { this.release(state); }
            throw error;
        }
    }
    release(state) { if (state.returnCapture) this.#returns.delete(state.returnCapture); this.#parents.delete(state.runId); }

    async #proveNotDispatched(state) {
        if (!state.activeNode) return;
        const service = this.execution(), { handle } = state, runId = state.identity.childRunId;
        const withAuthority = service.sourcePort.consumptionBoundary(handle, state.identity.sourceBinding, { engine: this.owner.engine });
        await service.runs.withSourceControl(handle, runId, async () => this.owner.engine.withTransaction(handle, async tx => {
            const root = await service.runs.get(handle, runId), effect = (await readEffect(tx, handle, root, state.activeNode.effectId)).doc;
            if (effect.status !== 'prepared' || effect.budgetAttemptRef !== null || effect.dispatchToken !== null) return;
            const costs = await service.budgetPort.observeEffectClosure(handle, { authorityRef: root.budgetAuthorityRef, effectIds: [effect.effectId] }, { tx });
            if (!costs.closed || costs.budgetAttemptRefs.some(ref => ref.kind !== 'local_work')) return;
            state.noDispatchObservation = immutable({ observationId: 'session.child.not_sent:' + effect.effectId, observedEpoch: effect.epoch,
                outcome: 'not_dispatched', dispatchEvidence: { kind: 'proven_not_dispatched', reference: {
                    protocol: 'native_session_delegation_preflight', inputHash: effect.inputHash, sourceBindingDigest: effect.sourceBindingDigest } },
                remoteOperationRef: null, domainReceiptRef: null, budgetObservationRef: null, resultRefs: [], sourceRefs: [root.sourceBinding.sourceRef],
                reasonCode: 'native_orchestration_delegated_send_not_admitted' });
            await service.effects.observe(handle, { ...runGuard(root), effectId: effect.effectId, observation: state.noDispatchObservation });
        }), { withAuthority });
    }

    async #failRun(state, runId, attemptId, error) {
        const { handle } = state, service = this.execution(), current = await service.runs.get(handle, runId);
        if (current.cancelRequested || !['admitted', 'running', 'reconciling'].includes(current.status) || current.outputClaims.length) return;
        if (current.parentRef) {
            const parent = await service.runs.get(handle, current.parentRef.parentRunId);
            if (parent.cancelRequested || parent.epoch !== current.parentRef.parentEpoch) {
                await service.runs.cancel(handle, controlCommandId('native.session.child.cancel', runId), { ...runGuard(current),
                    reasonCode: 'native_orchestration_parent_stale' });
                const closure = await this.owner.engine.withTransaction(handle, async tx => {
                    const effectIds = [];
                    for (const id of current.attemptRefs) effectIds.push(...(await readAttempt(tx, handle, current, id)).doc.effectRefs);
                    return effectIds.length ? service.budgetPort.observeEffectClosure(handle, { authorityRef: current.budgetAuthorityRef, effectIds }, { tx }) : null;
                });
                if ((closure === null || closure.closed) && !(await service.runs.get(handle, runId)).pendingEffectRefs.length)
                    await service.budgetPort.releaseUnused(handle, { authorityRef: current.budgetAuthorityRef, reservationId: runId });
                return;
            }
        }
        const withAuthority = service.sourcePort.consumptionBoundary(handle, current.sourceBinding, { engine: this.owner.engine });
        const reasonCode = /^[a-z][a-z0-9_]+$/.test(error.code ?? '') ? error.code : 'native_orchestration_session_delegation_unresolved';
        const failure = await service.runs.withSourceControl(handle, runId, async () => service.runs.control(handle,
            controlCommandId('native.turn.failure', { runId, attemptId }), { ...runGuard(await service.runs.get(handle, runId)),
                operation: 'graph.execution.fail', detail: { attemptId, reasonCode } }, async ({ tx, root, now }) => {
                if (root.cancelRequested || !['admitted', 'running', 'reconciling'].includes(root.status) || root.outputClaims.length) fail();
                const effectIds = [], unresolved = [], records = [];
                let terminal = null;
                for (const id of root.attemptRefs) {
                    const record = await readAttempt(tx, handle, root, id); records.push(record);
                    for (const effectId of record.doc.effectRefs) {
                        effectIds.push(effectId);
                        const effect = (await readEffect(tx, handle, root, effectId)).doc;
                        if (!['confirmed', 'failed', 'not_dispatched'].includes(effect.status)
                            && !(effect.status === 'prepared' && effect.budgetAttemptRef === null && effect.dispatchToken === null)) unresolved.push(effectId);
                        if (id === attemptId && effect.capability === 'generation.send') terminal = await readModelTerminalReceipt(handle, tx, root, effect, service.budgetPort);
                    }
                }
                const costs = effectIds.length ? await service.budgetPort.observeEffectClosure(handle, { authorityRef: root.budgetAuthorityRef, effectIds }, { tx }) : null;
                for (const record of records) {
                    if (record.doc.attemptId !== attemptId || ['completed', 'partial', 'failed', 'cancelled', 'stale'].includes(record.doc.status)) continue;
                    if (terminal?.kind === 'rejected' && record.doc.effectRefs.length === 1 && record.doc.resultRefs.length === 0) {
                        await writeAttemptSettlement({ tx, handle, root, record, outcome: 'failed', resultRefs: [],
                            effectReceiptRefs: [terminal.receiptRef.receiptId], reasonCode: 'generation_provider_rejected', now });
                    } else await putMutable(tx, controlRecordKey(handle, runId, 'attempt', record.doc.attemptId),
                        { ...record.doc, status: 'blocked', reasonCode }, { expectedIntegrity: record.integrity });
                }
                const child = runId === state.runId && state.childRunId ? await service.runs.get(handle, state.childRunId) : null;
                root.pendingEffectRefs = [...new Set([...root.pendingEffectRefs, ...unresolved])];
                root.status = root.pendingEffectRefs.length || costs && !costs.closed || child?.status === 'reconciling' ? 'reconciling'
                    : terminal?.kind === 'rejected' ? 'failed' : 'blocked';
                const receiptId = 'oreceipt_' + hash({ kind: 'native_session_failure', runId, attemptId }).slice(0, 32);
                await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), { schemaVersion: 1,
                    receiptKind: 'native_session_failure', receiptId, runId, epoch: root.epoch, nodeAttemptId: attemptId,
                    reasonCode, status: root.status, effectIds, costs, modelReceiptRef: terminal?.receiptRef ?? null,
                    decisionSeq: root.eventSeq + 1, createdAt: now });
                return { root, eventType: 'session_model_failed', reasonCode, outcome: { status: root.status, costsClosed: costs === null || costs.closed } };
            }), { withAuthority });
        if (current.parentRef && failure.outcome.costsClosed && failure.outcome.status !== 'reconciling') {
            // Only the original bank can release unused allocation. An unknown
            // response or pending charge never reaches this release boundary.
            try { await service.budgetPort.releaseUnused(handle, { authorityRef: current.budgetAuthorityRef, reservationId: runId }); } catch (error) {
                if (error.code !== 'storage_commit_unknown') throw error;
                const closure = await this.owner.engine.withTransaction(handle, tx => service.budgetPort.observeChildClosure(handle, {
                    authorityRef: current.budgetAuthorityRef, reservationId: runId, expectedParentReservationId: current.parentRef.depth === 1 ? null : current.parentRef.parentRunId,
                    expectedCeiling: current.parentRef.budgetCeiling }, { tx }));
                if (!closure.closed) throw error;
            }
        }
    }

    async #runChild(parent, expected, boundary) {
        const service = this.execution(), { host, handle, child } = parent, root = await service.runs.get(handle, parent.childRunId);
        const capture = Object.freeze({}), quotaProof = captureNativeTurnChildQuota(parent.quotaProof, boundary, expected);
        const state = { host, handle, parent, child, capture, boundary, quotaProof, bindings: [], plannerOperations: new Map(), root, identity: immutable({ handle,
            parentRunId: parent.runId, parentAttemptId: parent.attemptId, parentEpoch: root.parentRef.parentEpoch, childRunId: root.runId,
            childEpoch: root.epoch, sourceBinding: root.sourceBinding, grantDigest: root.parentRef.effectiveGrantDigest,
            parentGrantDigest: parent.decision.grantDigest, inputRefs: root.parentRef.inputRefs, taskPurpose: 'original_native_session_delegated_analysis', childPlanRef: root.planRef }) };
        this.#delegations.set(capture, state); this.#children.set(root.runId, state);
        const progress = new Map(), port = this.port(host);
        try {
            for (;;) {
                const active = await service.runs.get(handle, root.runId);
                await this.owner.engine.withTransaction(handle, tx => readTaskGraphRevision(tx, handle, active));
                state.root = active;
                let loopBindings = [], model;
                const replan = [...progress].find(([, entry]) => entry.requests?.replan);
                if (replan) {
                    const [nodeId, previous] = replan;
                    const loops = active.graph.edges.filter(edge => edge.loopBack && edge.from.nodeId === nodeId);
                    if (previous.requests.finalize || !loops.length || loops.some(edge => edge.to.nodeId !== nodeId)) fail('native_orchestration_planner_replan_pending');
                    const capacity = await this.owner.engine.withTransaction(handle, tx => service.budgetPort.observeCapacity(handle,
                        { authorityRef: active.budgetAuthorityRef, reservationId: root.runId }, { tx }));
                    const required = child.topology.ordered.filter(node => node.nodeId === nodeId || !progress.has(node.nodeId)).length;
                    if (!capacity || capacity.overrun || capacity.remaining.requests < required) fail('native_orchestration_graph_budget_unavailable');
                    if (active.progress.attempts + required + 1 > active.limits.maxAttempts) fail('native_orchestration_limit_exhausted');
                    loopBindings = loops.map(edge => ({ edge, ...previous })); progress.delete(nodeId);
                    model = child.profiles.find(item => item.node.nodeId === nodeId);
                } else model = child.profiles.find(item => !progress.has(item.node.nodeId)
                    && child.topology.incoming[item.node.nodeId].every(edge => progress.has(edge.from.nodeId)));
                if (!model) fail('native_orchestration_graph_dependency_unavailable');
                state.model = model; state.request = immutable({ sessionId: parent.proofExpected.sessionId, revisionId: parent.proofExpected.anchor.revisionId,
                    requestId: parent.request.requestId, role: 'narrator', routeRef: model.pin.resourceRef, messages: [],
                    ...(model.node.kind === 'planner' ? { outputContract: sessionPlannerOutputContract } : {}) });
                const bindings = [...child.topology.incoming[model.node.nodeId].map(edge => ({ edge, ...progress.get(edge.from.nodeId) })), ...loopBindings]
                    .toSorted((a, b) => a.edge.edgeId.localeCompare(b.edge.edgeId)); state.bindings = bindings;
                const results = [...new Map(bindings.filter(item => item.resultRef).map(item => [hash(item.resultRef), item.resultRef])).values()];
                const controls = [...new Map(bindings.filter(item => item.controlRef).map(item => [hash(item.controlRef), item.controlRef])).values()];
                const audience = model.audienceSource.audience;
                const logical = { kind: 'native_session_delegated_intent', role: 'narrator', requestId: state.request.requestId,
                    invocationId: parent.proofExpected.invocationId, requestHash: parent.proofExpected.requestHash, sourceRef: root.sourceBinding.sourceRef,
                    planRef: root.planRef, nodeId: model.node.nodeId, parentRunId: parent.runId, parentAttemptId: parent.attemptId,
                    parentEpoch: root.parentRef.parentEpoch, childRunId: root.runId, childEpoch: root.epoch, delegationInputDigest: root.parentRef.inputDigest,
                    routeRef: model.pin.resourceRef, configDigest: model.configDigest, audience, acceptedGraphResultRefs: results,
                    ...(controls.length ? { acceptedControlRefs: controls } : {}),
                    graphBindings: bindings.map(item => ({ edgeId: item.edge.edgeId, producerAttemptId: item.attemptId })),
                    delegationScope: { parentPinId: child.parentSource.pin.pinId, childPinId: model.audienceSource.pin.pinId,
                        sourceRef: model.audienceSource.actualRef ?? model.audienceSource.pin.resourceRef, integrity: hash(model.audienceSource.descriptor) },
                    ...(model.audienceSource.pin.resourceRef.anchor === 'run_source' ? { audienceCapture: audienceRunCapture(model.audienceSource.pin, model.audienceSource) } : {}) };
                const inputRefs = [logical, ...root.parentRef.inputRefs, ...results, ...controls]; state.contextInputRefs = immutable(inputRefs);
                const admission = { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: state.identity.grantDigest, budgetRef: root.budgetAuthorityRef };
                let attemptId;
                if (!bindings.length) ({ attemptId } = await service.runs.beginAttempt(handle, controlCommandId('native.session.child.attempt', { runId: root.runId, nodeId: model.node.nodeId }),
                    { ...runGuard(await service.runs.get(handle, root.runId)), nodeId: model.node.nodeId, ...admission }));
                else {
                    const transitioned = await new TransitionController({ runs: service.runs, authorizeTransition: async ({ root: active, target, producers }) => {
                        if (active.runId !== root.runId || target.nodeId !== model.node.nodeId || !equal(producers.map(item => item.attempt.attemptId).sort(), bindings.map(item => item.attemptId).sort())) fail();
                        await this.inspectDelegation(capture, { host, handle }); return admission;
                    } }).advance(handle, { ...runGuard(await service.runs.get(handle, root.runId)), bindings: logical.graphBindings, reservedAttemptId: null });
                    attemptId = transitioned.outcome.attemptId;
                }
                const effectId = 'oeffect_' + hash({ runId: root.runId, attemptId, taskPurpose: state.identity.taskPurpose }).slice(0, 32);
                state.activeNode = { nodeId: model.node.nodeId, nodeAttemptId: attemptId, effectId };
                state.decision = { actionRef: { kind: 'native_model_send', runtimeRouteId: model.resolved.route.runtimeRouteId },
                    targetRef: { connectionProfileId: model.resolved.connection.connectionProfileId, modelProfileId: model.resolved.model.modelProfileId, pathFingerprint: model.resolved.pathFingerprint },
                    inputRef: logical, inputHash: hash(logical), capability: 'generation.send', grantDigest: state.identity.grantDigest,
                    endpointBindingDigest: hash({ pathFingerprint: model.resolved.pathFingerprint, configDigest: model.configDigest }), risk: 'R1', requiresApproval: false,
                    egressDigest: hash({ pathFingerprint: model.resolved.pathFingerprint, sourceBindingDigest: root.sourceBinding.bindingDigest, grantDigest: state.identity.grantDigest, audience }),
                    budgetEnvelopeDigest: hash(model.resolved.route.executionPolicy.computeBudget), dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' } };
                await new AttemptController({ runs: service.runs, authorizeAttempt: args => this.authorize(args) }).activate(handle, { ...runGuard(await service.runs.get(handle, root.runId)), attemptId });
                await service.effects.prepare(handle, { ...runGuard(await service.runs.get(handle, root.runId)), effectId, nodeAttemptId: attemptId,
                    proposal: Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, state.decision[key]])) });
                state.contextPort = new ContextPort({ sessionCore: this.owner.sessionCore, sessionDelegationCapture: capture, sessionDelegationHost: host,
                    sessionModelPolicy: { fallbackMode: 'disabled', routes: model.failurePlan.routes }, authorizeContext: async ({ request }) => {
                        await this.inspectDelegation(capture, { host, handle });
                        if (!equal(request.inputRefs, inputRefs) || request.taskPurpose !== state.identity.taskPurpose || request.grantDigest !== state.identity.grantDigest
                            || !equal(request.audience, { kind: 'task', id: root.runId }) || !equal(request.sourceBinding, root.sourceBinding)) fail();
                        return { allowed: true, grantDigest: state.identity.grantDigest };
                    } });
                const limits = parent.selectionState.resolved.route.executionPolicy.computeBudget;
                const send = await service.generationSend(handle, { runId: root.runId, effectId, reservationId: root.runId, limits, quotaProof });
                const compiled = await compileNativeContextMetered({ handle, port: state.contextPort, request: { ownerRef: { handle }, sourceBinding: root.sourceBinding,
                    audience: { kind: 'task', id: root.runId }, taskPurpose: state.identity.taskPurpose, grantDigest: state.identity.grantDigest, inputRefs,
                    tokenBudget: { modelContextLimit: model.resolved.model.limits.contextTokens, responseReserve: effectiveOutputReserve(model.resolved) } },
                bank: send.bank, budgetPort: service.budgetPort, root: await service.runs.get(handle, root.runId), effectId, limits,
                workDescriptor: { requestId: state.request.requestId, pathFingerprint: model.resolved.pathFingerprint },
                assertCurrent: () => this.inspectDelegation(capture, { host, handle }), signal: boundary.signal });
                state.context = compiled.compiled; await send.bindContext({ port: state.contextPort, compiled: state.context, compileProof: compiled.proof });
                const permit = assertNativeTurnQuota(quotaProof, parent.proofExpected).permit;
                const scope = this.issueScope(host, handle, { runId: root.runId, effectId, request: state.request, logicalInputRef: logical, logicalInputHash: hash(logical),
                    nativeTurnPermit: permit, options: { scheduled: true, orchestrationSend: send }, revalidateConsume: async ({ tx } = {}) => {
                        await this.inspectDelegation(capture, { host, handle, ...(tx ? { tx } : {}) });
                        await state.contextPort.revalidate(handle, { context: state.context, phase: 'consume' });
                    } });
                const result = await port.generate(handle, scope, { signal: boundary.signal }), controller = new ResultController({ host, modelPort: port });
                if (model.node.kind === 'planner') {
                    progress.set(model.node.nodeId, await completeSessionDelegatedPlanner({ state, service, port, result, send, limits,
                        current: () => this.inspectDelegation(capture, { host, handle }), progress, engine: this.owner.engine }));
                    continue;
                }
                if (model.node === child.topology.final) {
                    const publication = await controller.publishModelResult(handle, { capture, result, effectId });
                    const output = await new TaskLocalOutputController({ host }).complete(handle, { capture, publication });
                    return { ...output, resultRef: publication.resultRef, publicationReceiptRef: publication.publicationReceiptRef };
                }
                const graphCapture = Object.freeze({}); this.#graphs.set(graphCapture, state);
                try {
                    const published = await controller.publishGraphModelResult(handle, { capture: graphCapture, result, runId: root.runId, effectId });
                    progress.set(model.node.nodeId, { attemptId, resultRef: published.resultRef });
                } finally { this.#graphs.delete(graphCapture); }
            }
        } catch (error) {
            await this.#proveNotDispatched(state);
            await this.#failRun(parent, root.runId, state.activeNode?.nodeAttemptId ?? null, error);
            throw error;
        } finally { this.#delegations.delete(capture); this.#children.delete(root.runId); }
    }
}
