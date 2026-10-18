import { runProjectDelegatedFanout } from './project-delegated-fanout-work.js';
import { completeProjectDelegatedReview, completeProjectDelegatedJudge } from './project-delegated-quality-work.js';
import { readProjectDelegatedControl } from './project-delegated-quality-contracts.js';
import { ConflictError } from '../../storage/errors.js';
import { hashNativeDocument as hash, putImmutable, putMutable } from '../repositories/common.js';
import { immutable, effectiveOutputReserve } from '../model-prompt-runtime/execution-utils.js';
import { readPlanRevision } from './plan-repository.js';
import { projectDelegatedGraphProfile } from './project-delegated-graph-profile.js';
import { projectReplanScope } from './project-replan-contracts.js';
import { inspectGraphReadiness } from './graph-work-readiness.js';
import { completeProjectDelegatedPlanner } from './project-delegated-planner-work.js';
import { projectPlannerOutputContract, projectGraphReviewOutputContract, projectGraphJudgeOutputContract } from './project-control-graph.js';
import { readAttempt, readGraphReviewReceipt, readAttemptInvalidation, assertAttemptConsumable, runGuard, controlCommandId, controlRecordKey } from './controller-common.js';
import { AttemptController } from './attempt-controller.js';
import { TransitionController } from './transition-controller.js';
import { ContextPort } from './context-port.js';
import { compileNativeContextMetered } from './generation-local-work.js';
import { ResultController } from './result-controller.js';
import { TaskLocalOutputController } from './task-local-output-controller.js';
import { HandoffReturnController } from './handoff-return-controller.js';
import { readHandoffReturn } from './handoff-return-contracts.js';
import { BudgetPort } from './budget-port.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { readModelTerminalReceipt } from './model-port.js';
import { writeAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readTaskLocalOutput } from './task-local-output-contracts.js';
import { readResultPublication } from './result-publication-contracts.js';
import { childBudgetReceiptId, assertChildRunCurrent } from './run-repository.js';
import { readProjectDelegation, readProjectDelegationContinuation, readProjectDelegationInputs } from './project-delegation-contracts.js';
import { withNativeProjectDelegation, captureNativeProjectDelegatedWorker, inspectNativeProjectDelegatedBoundary, inspectNativeProjectGeneration, inspectNativeProjectGenerationIdentity } from './native-project-generation-authority.js';

const fail = (code = 'native_orchestration_delegation_denied') => { throw new ConflictError(code); };
const equal = (a, b) => hash(a) === hash(b);
const configHash = resolved => hash({ route: resolved.route, model: resolved.model, connection: resolved.connection, generation: resolved.generation, resources: resolved.resources });

/** No new ledger, Scheduler or bank: captures bind original child callbacks to
 * the original Run/Plan/Source and Controller facts. */
export class ProjectDelegationAuthority {
    #delegations = new WeakMap();
    #returns = new WeakMap();
    #children = new Map();
    #parents = new Map();
    #graphs = new WeakMap();
    constructor({ owner, execution, port, issueScope, assertSelection }) {
        Object.assign(this, { owner, execution, port, issueScope, assertSelection });
    }
    #childStates(runId) {
        const root = this.#children.get(runId); return root ? [root, ...root.branches ?? []] : [];
    }
    #childState(runId, attemptId) { return this.#childStates(runId).find(state => state.activeNode?.nodeAttemptId === attemptId); }
    ownsDelegationCapture(capture) { return this.#delegations.has(capture); }
    ownsReturnCapture(capture) { return this.#returns.has(capture); }
    hasRun(runId) { return this.#children.has(runId); }
    ownsGraphCapture(capture) { return this.#graphs.has(capture); }

    async selection(handle, plan, parentNode, resolveModel) {
        const ids = parentNode.policy.allowedPlanPinIds ?? [];
        if (!ids.length) return null;
        if (ids.length !== 1 || parentNode.kind !== 'agent' || !parentNode.capabilities.includes('agent.delegate')) fail();
        if (!parentNode.dependencyPinIds.includes(ids[0])) fail();
        return this.planSelection(handle, plan, ids[0], resolveModel);
    }

    // Resolves only the original immutable Plan dependency. This pool does not
    // authorize a parent Node or a Delegate command.
    async planSelection(handle, plan, pinId, resolveModel) {
        const pin = plan.dependencyPins.find(pin => pin.pinId === pinId);
        if (pin?.port !== 'plan') fail();
        const childPlan = await this.owner.engine.withTransaction(handle, tx => readPlanRevision(tx, handle, pin.resourceRef));
        if (hash(childPlan) !== pin.integrity) fail();
        const topology = projectDelegatedGraphProfile(childPlan), profiles = [];
        for (const node of topology.ordered) {
            const model = await resolveModel(node, childPlan);
            if (model.failurePlan.routes.length !== 1 || model.resolved.route.policy.maxRetries !== 0
                || model.resolved.route.executionPolicy.continuity !== 'none' || model.resolved.route.executionPolicy.reuse !== 'disabled') fail();
            profiles.push({ ...model, node });
        }
        // Future Nodes can use only already published owned model pins. These
        // probes resolve Route resources/requirements; they create no Attempt,
        // capture, Model permission or executable synthetic Node.
        const poolProfiles = [];
        for (const modelPin of childPlan.dependencyPins) {
            const initial = profiles.find(model => model.node.kind === 'agent' && model.pin.pinId === modelPin.pinId);
            const probe = { ...topology.final, dependencyPinIds: [modelPin.pinId], policy: { agentPinId: modelPin.pinId } };
            const model = initial ?? { ...await resolveModel(probe, childPlan), node: probe };
            if (model.failurePlan.routes.length !== 1 || model.resolved.route.policy.maxRetries !== 0
                || model.resolved.route.executionPolicy.continuity !== 'none' || model.resolved.route.executionPolicy.reuse !== 'disabled') fail();
            poolProfiles.push(model);
        }
        const ceiling = profiles[0].resolved.route.executionPolicy.computeBudget;
        if ([...profiles, ...poolProfiles].some(model => !equal(model.resolved.route.executionPolicy.computeBudget, ceiling))) fail();
        return { pin, plan: childPlan, planRef: pin.resourceRef, topology, profiles, poolProfiles, ceiling,
            resolveModel: async node => {
                const model = await resolveModel(node, childPlan), initial = poolProfiles.find(candidate => candidate.pin.pinId === model.pin.pinId);
                if (!initial || model.configDigest !== initial.configDigest || !equal(model.resolved.route.executionPolicy.computeBudget, ceiling)) fail();
                return { ...model, node };
            } };
    }

    parentInput(state, node, child, input, bindings) {
        return { kind: 'native_project_delegation', role: 'studio', requestId: input.requestId,
            sourceRef: state.sourceBinding.sourceRef, planRef: state.selected.binding.planRef, nodeId: node.nodeId,
            childPlanRef: child.planRef, acceptedGraphResultRefs: input.acceptedGraphResultRefs ?? [],
            ...(input.acceptedControlRefs ? { acceptedControlRefs: input.acceptedControlRefs } : {}),
            ...(input.projectQualityTask?.feedback ? { reviewFeedbackRef: input.projectQualityTask.feedback } : {}),
            graphBindings: [...bindings ?? []].sort((a, b) => a.edgeId.localeCompare(b.edgeId)) };
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
            || !this.#childStates(state.identity.childRunId).includes(state)) fail();
        return Object.freeze({ ...state.identity, host: state.host, signal: inspectNativeProjectDelegatedBoundary(state.scopeCapture ?? state.parent.projectCapture, state.childPermit, { host: state.host, handle }, state.controlPermit ?? null).signal,
            projectCapture: state.projectCapture,
            request: state.request, contextInputRefs: state.contextInputRefs, activeNode: state.activeNode ? immutable(state.activeNode) : null });
    }

    async #inspect(capture, expected, output) {
        const identity = this.inspectDelegationIdentity(capture, expected), state = this.#delegations.get(capture), service = this.execution();
        return this.owner.engine.withTransaction(identity.handle, async tx => {
            if (expected.tx !== undefined && expected.tx !== tx) fail();
            await this.assertSelection(state.parent.selection);
            const parentRoot = await service.runs.get(identity.handle, identity.parentRunId);
            const lineage = await readProjectDelegation(tx, identity.handle, parentRoot, identity.childRunId);
            if (!lineage) fail();
            const root = lineage.child, parentAttempt = lineage.parentAttempt;
            const fence = await this.owner.engine.nativeHostLifecycle.assertWriter(identity.handle, tx);
            await assertChildRunCurrent(tx, identity.handle, root);
            if (parentRoot.cancelRequested || parentRoot.status !== 'running' || parentRoot.epoch !== identity.parentEpoch
                || root.hostBootId !== fence.hostBootId || root.hostGeneration !== fence.generation
                || parentAttempt.status !== (state.parent.mode === 'handoff' ? 'waiting_child' : 'running')) fail();
            if (!equal(root.sourceBinding, identity.sourceBinding) || root.epoch !== identity.childEpoch || root.cancelRequested
                || !['admitted', 'running'].includes(root.status)
                || !equal(root.parentRef.inputRefs, identity.inputRefs) || root.parentRef.effectiveGrantDigest !== identity.grantDigest
                || parentAttempt.effectiveGrantDigest !== identity.parentGrantDigest || lineage.mode !== state.parent.mode) fail();
            const snapshot = { graph: lineage.graph };
            await service.sourcePort.revalidate(identity.handle, root.sourceBinding, { tx, root });
            let closure;
            if (output) {
                closure = await service.budgetPort.observeChildClosure(identity.handle, { authorityRef: root.budgetAuthorityRef, reservationId: root.runId,
                    expectedParentReservationId: parentRoot.parentRef ? parentRoot.runId : null, expectedCeiling: root.parentRef.budgetCeiling }, { tx });
                if (!closure.closed) fail('native_orchestration_child_budget_unclosed');
            } else await service.budgetPort.verifyReservation({ handle: identity.handle, tx, root, parent: parentRoot });
            const parentFacts = await readProjectDelegationInputs(tx, identity.handle, parentRoot, parentAttempt, { live: true });
            const results = parentFacts.map(fact => fact.record
                ? { resultRef: fact.receipt.resultRef, sourceRefs: fact.record.envelope.sourceRefs, content: fact.record.payload }
                : { controlRef: fact.controlRef, sourceRefs: [], content: 'Host-validated advisory graph control, not a tool or domain permission:\n'
                    + JSON.stringify({ controlRef: fact.controlRef, ...(fact.patch ? { operations: fact.patch.appliedOperations } : fact.review
                        ? { decision: fact.review.decision, reasonCode: fact.review.reasonCode, targetAttemptIds: fact.review.targetAttemptIds }
                        : fact.selectedResultRef ? { selectedResultRef: fact.selectedResultRef } : { outcome: fact.joinReceipt.outcome, acceptedResultRefs: fact.joinReceipt.acceptedResultRefs }) }) });
            for (const binding of state.controlOnly ? [] : state.bindings ?? []) {
                if (binding.controlRef) {
                    const saved = await readProjectDelegatedControl(tx, identity.handle, root, binding.controlRef);
                    if (!saved || !equal(saved.controlRef, binding.controlRef) || saved.review?.decision === 'rerun') fail();
                    await assertAttemptConsumable(tx, identity.handle, root, saved.producer);
                    for (const ref of binding.evidenceRefs ?? []) {
                        const member = await readGraphNodeResult(tx, identity.handle, root, ref.resultId);
                        if (!member || !equal(member.receipt.resultRef, ref) || !saved.joinReceipt?.acceptedResultRefs.some(actual => equal(actual, ref))
                            || !member.record.envelope.audienceConstraint.nodeIds.includes(state.model.node.nodeId)) fail();
                        await assertAttemptConsumable(tx, identity.handle, root, member.producer);
                        results.push({ resultRef: ref, sourceRefs: member.record.envelope.sourceRefs, content: member.record.payload });
                    }
                    results.push({ controlRef: binding.controlRef, sourceRefs: [], content: (saved.patch ? 'Host-validated advisory child GraphPatch: ' : 'Host-validated advisory child graph control: ')
                        + JSON.stringify(saved.patch ? saved.patch.appliedOperations : saved.review ? { decision: saved.review.decision, reasonCode: saved.review.reasonCode }
                            : saved.joinReceipt ? { outcome: saved.joinReceipt.outcome, acceptedResultRefs: saved.joinReceipt.acceptedResultRefs } : { candidateRefs: saved.receipt.candidateRefs, selectedResultRef: saved.selectedResultRef }) });
                } else {
                    const saved = await readGraphNodeResult(tx, identity.handle, root, binding.resultRef.resultId);
                    if (!saved || saved.producer.attemptId !== binding.attemptId) fail();
                    const invalidation = await readAttemptInvalidation(tx, identity.handle, root, saved.producer);
                    if (invalidation) {
                        // During its own decide→settle saga a Review must still
                        // prove the exact old evidence it has just invalidated.
                        // No later consumer or unrelated Review can use it.
                        const reviewer = state.model.node.kind === 'review' && state.activeNode
                            ? (await readAttempt(tx, identity.handle, root, state.activeNode.nodeAttemptId)).doc : null;
                        const review = reviewer ? await readGraphReviewReceipt(tx, identity.handle, root, reviewer) : null;
                        if (!review || review.decision !== 'rerun' || reviewer.nodeId !== state.model.node.nodeId
                            || invalidation.reviewReceiptId !== review.receiptId || !review.invalidatedAttemptIds.includes(binding.attemptId)
                            || !review.evidenceRefs.some(ref => equal(ref, binding.resultRef))) fail();
                    } else await assertAttemptConsumable(tx, identity.handle, root, saved.producer);
                    results.push({ resultRef: binding.resultRef, sourceRefs: saved.record.envelope.sourceRefs, content: saved.record.payload });
                }
            }
            this.inspectDelegationIdentity(capture, expected);
            return { ...identity, root, parentRoot, parentAttempt, parentGrantDigest: parentAttempt.effectiveGrantDigest,
                parentTaskPurpose: 'original_native_project_delegation', mode: lineage.mode,
                handoffReceiptRef: lineage.handoff ? { runId: parentRoot.runId, receiptId: lineage.handoff.receiptId } : null,
                delegationReceiptRef: { runId: parentRoot.runId, receiptId: lineage.delegation.receiptId },
                budgetReadyReceiptRef: { runId: root.runId, receiptId: childBudgetReceiptId(root.runId) },
                ...(output ? { closure } : state.controlOnly ? { context: { task: { kind: 'native_project_delegated_control' }, results: [] } } : { context: { task: { kind: 'native_project_delegated_work', nodeId: state.model.node.nodeId, authoredTask: state.model.node.label,
                    ...(state.model.node.kind === 'review' ? { reviewTargets: state.bindings.filter(binding => binding.resultRef).map(binding => ({ attemptId: binding.attemptId, resultRef: binding.resultRef })) } : {}),
                    ...(state.model.node.kind === 'judge' ? { candidateRefs: state.contextInputRefs[0].acceptedGraphResultRefs } : {}),
                    ...(state.feedback ? { feedback: state.feedback } : {}), ...(state.model.node.kind === 'planner' ? { graph: snapshot.graph, nodeControl: root.nodeControl, graphRevision: root.graphRevision, dependencyPins: state.child.plan.dependencyPins } : {}), instruction: state.model.node.kind === 'planner' ? 'Propose only published bounded graph operations as {operations:[...]}, using the original declared model pins. No tools or official Project writes.' : state.model.node.kind === 'review' ? 'Review only the supplied typed advisory Results. Return decision, reasonCode and exact targetAttemptIds from reviewTargets. No tools or official Project writes.'
                        : state.model.node.kind === 'judge' ? 'Select exactly one supplied candidateRefs Result. Return selectedResultRef and reasonCode candidate_selected. No tools or official Project writes.'
                            : 'Perform this declared advisory task only. No tools, official Project edits or Commit permission.' }, results } }) };
        });
    }
    inspectDelegation(capture, expected = {}) { return this.#inspect(capture, expected, false); }
    inspectDelegationOutput(capture, expected = {}) { return this.#inspect(capture, expected, true); }

    async authorizeChildAttempt({ handle, tx, root, input }) {
        if (input.inputRefs[0]?.kind === 'native_project_delegated_control') {
            const owner = this.#children.get(root.runId), node = root.graph.nodes.find(node => node.nodeId === input.nodeId);
            if (!owner?.controlOnly || !['fanout', 'join'].includes(node?.kind) || !owner.controlAdmission
                || !equal(Object.fromEntries(['inputRefs', 'inputDigest', 'effectiveGrantDigest', 'budgetRef'].map(key => [key, input[key]])), owner.controlAdmission)
                || input.effectiveGrantDigest !== root.parentRef.effectiveGrantDigest) fail();
            await this.inspectDelegation(owner.capture, { host: owner.host, handle, tx });
            return { allowed: true, inputDigest: input.inputDigest, effectiveGrantDigest: input.effectiveGrantDigest, sourceBindingDigest: root.sourceBinding.bindingDigest };
        }
        const state = this.#childStates(root.runId).find(state => state.model?.node.nodeId === input.nodeId && equal(input.inputRefs, state.contextInputRefs));
        if (!state || state.handle !== handle || input.nodeId !== state.model.node.nodeId
            || !equal(input.inputRefs, state.contextInputRefs) || input.inputDigest !== hash(state.contextInputRefs)
            || input.effectiveGrantDigest !== state.identity.grantDigest || !equal(input.budgetRef, root.budgetAuthorityRef)) fail();
        await this.inspectDelegation(state.capture, { host: state.host, handle, tx });
        return { allowed: true, inputDigest: input.inputDigest, effectiveGrantDigest: input.effectiveGrantDigest,
            sourceBindingDigest: root.sourceBinding.bindingDigest };
    }

    async authorize({ handle, tx, root, attempt, proposal, intent }) {
        const state = this.#childState(root.runId, attempt?.attemptId ?? intent?.nodeAttemptId ?? (proposal && this.#childStates(root.runId).find(state => equal(proposal.inputRef, state.decision?.inputRef))?.activeNode?.nodeAttemptId));
        if (!state || state.handle !== handle || !state.activeNode || attempt && attempt.attemptId !== state.activeNode.nodeAttemptId
            || proposal && !equal(proposal, Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, state.decision[key]])))
            || intent && (intent.nodeAttemptId !== state.activeNode.nodeAttemptId || intent.inputHash !== state.decision.inputHash)) fail();
        await this.inspectDelegation(state.capture, { host: state.host, handle, ...(tx ? { tx } : {}) });
        return immutable(state.decision);
    }
    async verifySend(args) {
        await this.authorize(args);
        const state = this.#childState(args.root.runId, args.intent?.nodeAttemptId ?? args.attempt?.attemptId);
        if (configHash(args.resolved) !== state.model.configDigest || args.snapshot.requestId !== state.request.requestId
            || args.compiledBinding.fingerprint !== args.snapshot.diagnostics.compiledBinding.fingerprint
            || !equal(await state.contextPort.provider(args.handle, { context: state.context }).buildRequestContextPlan(state.request, args.resolved), args.snapshot.contextPlan)) fail();
    }
    async verifyObservation(args) {
        const state = this.#childState(args.root.runId, args.intent?.nodeAttemptId ?? args.attempt?.attemptId);
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
        if (!state || !this.#childStates(args.root.runId).includes(state) || state.activeNode.nodeAttemptId !== args.producer.attemptId
            || args.effectId !== state.activeNode.effectId || args.phase !== 'publish' || state.model.node.nodeId === state.child.topology.final.nodeId) fail();
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
        const physical = inspectNativeProjectGenerationIdentity(state.projectCapture, { host: state.host, handle });
        return Object.freeze({ ...state.returnIdentity, host: state.host, signal: physical.signal });
    }
    async inspectReturn(capture, expected = {}) {
        return this.#inspectReturnFacts(capture, expected, false);
    }
    async #inspectReturnFacts(capture, expected, parentResult) {
        const identity = this.inspectReturnIdentity(capture, expected), state = this.#returns.get(capture), service = this.execution();
        await inspectNativeProjectGeneration(state.projectCapture, { host: state.host, handle: identity.handle });
        return this.owner.engine.withTransaction(identity.handle, async tx => {
            if (expected.tx !== undefined && expected.tx !== tx) fail();
            await this.assertSelection(state.selection);
            const parentRoot = await service.runs.get(identity.handle, identity.parentRunId), child = await service.runs.get(identity.handle, identity.childRunId);
            const producer = (await readAttempt(tx, identity.handle, parentRoot, identity.parentAttemptId)).doc;
            await service.sourcePort.revalidate(identity.handle, parentRoot.sourceBinding, { tx, root: parentRoot });
            let continuation = null, returnReceipt = null;
            if (parentResult) {
                if (!['running', 'waiting_effect'].includes(producer.status)) fail();
                if (producer.status === 'waiting_effect') {
                    if (producer.effectRefs.length !== 1) fail();
                    const intent = (await readEffect(tx, identity.handle, parentRoot, producer.effectRefs[0])).doc;
                    continuation = await readProjectDelegationContinuation(tx, identity.handle, parentRoot, producer, intent);
                    returnReceipt = continuation.returnReceipt;
                } else if (state.mode === 'handoff') {
                    returnReceipt = await readHandoffReturn(tx, identity.handle, parentRoot, child.runId);
                }
                if (state.mode === 'handoff' && !returnReceipt) fail();
            }
            // A waiting parent continuation already reads and verifies this
            // exact original output. Keep one complete proof in this call.
            const output = continuation?.output ?? returnReceipt?.output ?? await readTaskLocalOutput(tx, identity.handle, child);
            // This invocation's original output reader already proves complete
            // child history and exact durable delegation. Reuse that pure fact;
            // every live capture/Source/parent permission check stays fresh.
            const lineage = output?.publication.graphHistory.lineage;
            if (!lineage || child.status !== 'completed' || child.cancelRequested || child.epoch !== identity.childEpoch || lineage.mode !== state.mode) fail();
            if (!output || !equal(output.claim.resultRef, identity.resultRef) || parentRoot.cancelRequested || parentRoot.status !== 'running'
                || parentRoot.epoch !== identity.parentEpoch || producer.effectiveGrantDigest !== identity.parentGrantDigest
                || producer.inputDigest !== identity.parentInputDigest || !equal(producer.inputRefs, identity.parentInputRefs)) fail();
            return { ...identity, parentRoot, parent: parentRoot, child, parentAttempt: producer, attempt: producer, output, handoff: lineage.handoff, mode: state.mode,
                ...(parentResult ? { returnReceipt } : {}) };
        });
    }
    async authorizeHandoffReturn({ capture, handle, tx }) {
        const value = await this.inspectReturn(capture, { handle, tx });
        if (value.mode !== 'handoff' || value.parentAttempt.status !== 'waiting_child') fail();
        return { allowed: true, parentGrantDigest: value.parentGrantDigest, childGrantDigest: value.childGrantDigest,
            sourceBindingDigest: value.sourceBinding.bindingDigest, parentInputDigest: value.parentInputDigest,
            resultRef: value.resultRef, outputReceiptRef: value.outputReceiptRef, controlToken: value.handoff.controlToken };
    }
    async inspectParentResult(capture, expected = {}) {
        const value = await this.#inspectReturnFacts(capture, expected, true);
        return { current: value, decision: { allowed: true, grantDigest: value.parentGrantDigest, inputDigest: value.parentInputDigest,
            sourceBindingDigest: value.sourceBinding.bindingDigest, resultRef: value.resultRef } };
    }
    async authorizeParentResult({ capture, handle, tx }) {
        return (await this.inspectParentResult(capture, { handle, tx })).decision;
    }
    async continuation(capture, state) {
        const identity = this.inspectReturnIdentity(capture, { host: state.host, handle: state.handle });
        if (identity.parentRunId !== state.runId || identity.parentAttemptId !== state.attemptId || identity.parentGrantDigest !== state.decision.grantDigest) fail();
        await this.owner.engine.withTransaction(state.handle, async tx => readProjectDelegationContinuation(tx, state.handle,
            await this.execution().runs.get(state.handle, state.runId), (await readAttempt(tx, state.handle, await this.execution().runs.get(state.handle, state.runId), state.attemptId)).doc, { inputRef: state.decision.inputRef, nodeAttemptId: state.attemptId, sourceBindingDigest: state.sourceBinding.bindingDigest }));
        return identity;
    }

    async run({ parentState, childPlanPinId, mode }) {
        const state = parentState, { host, handle } = state, service = this.execution(), child = state.child;
        if (!child || child.pin.pinId !== childPlanPinId || !['delegate', 'handoff'].includes(mode) || this.#parents.has(state.runId)) fail();
        state.child = child; state.mode = mode;
        state.parentInputRefs = immutable((await this.owner.engine.withTransaction(handle, async tx => readAttempt(tx, handle,
            await service.runs.get(handle, state.runId), state.attemptId))).doc.inputRefs);
        state.childInputRefs = state.parentInputRefs;
        state.childGrantDigest = hash({ parentGrantDigest: state.decision.grantDigest, childPlanRef: child.planRef,
            inputRefs: state.childInputRefs, sourceBindingDigest: state.sourceBinding.bindingDigest });
        this.#parents.set(state.runId, state);
        try {
            const delegated = await service.delegates[mode](handle, { ...runGuard(await service.runs.get(handle, state.runId)), parentAttemptId: state.attemptId,
                delegationId: 'original_native_project_analysis', childPlanRef: child.planRef, inputRefs: state.childInputRefs,
                inputDigest: hash(state.childInputRefs), effectiveGrantDigest: state.childGrantDigest, returnContract: child.plan.definition.outputContract, budgetCeiling: child.ceiling });
            state.childRunId = delegated.outcome.childRunId;
            await service.reserveChild(handle, { parentRunId: state.runId, childRunId: state.childRunId, ceiling: child.ceiling,
                limits: state.ownerLimits });
            await service.delegates.confirmBudget(handle, runGuard(await service.runs.get(handle, state.childRunId)));
            const resources = [...new Set((await Promise.all(child.poolProfiles.map(model => host.executionResources(handle, model.resolved.route)))).flat())];
            const output = await withNativeProjectDelegation(state.projectCapture, {
                resources, nodeIds: child.topology.ordered.map(node => node.nodeId),
                ...(child.plan.definition.graphChangePolicy.allowedOperations.includes('addNode') || child.topology.fanouts.length ? {
                    delegatedChild: await service.runs.get(handle, state.childRunId), delegatedParentAttempt: (await this.owner.engine.withTransaction(handle, async tx => readAttempt(tx, handle,
                        await service.runs.get(handle, state.runId), state.attemptId))).doc } : {}),
                key: 'project-child:' + state.childRunId, fingerprint: hash({ childRunId: state.childRunId, childPlanRef: child.planRef }),
                fresh: async () => { await this.assertSelection(state.selection); return true; },
                run: ({ permit, signal }) => this.#runChild(state, permit, signal) });
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
                parentPlanRef: state.selected.binding.planRef, parentEpoch: root.parentRef.parentEpoch, childRunId: root.runId, childEpoch: root.epoch,
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
            const root = await service.runs.get(handle, runId);
            const attempt = (await readAttempt(tx, handle, root, state.activeNode.nodeAttemptId)).doc;
            if (!attempt.effectRefs.includes(state.activeNode.effectId)) return;
            const effect = (await readEffect(tx, handle, root, state.activeNode.effectId)).doc;
            if (effect.status !== 'prepared' || effect.budgetAttemptRef !== null || effect.dispatchToken !== null) return;
            const costs = await service.budgetPort.observeEffectClosure(handle, { authorityRef: root.budgetAuthorityRef, effectIds: [effect.effectId] }, { tx });
            if (!costs.closed || costs.budgetAttemptRefs.some(ref => ref.kind !== 'local_work')) return;
            state.noDispatchObservation = immutable({ observationId: 'project.child.not_sent:' + effect.effectId, observedEpoch: effect.epoch,
                outcome: 'not_dispatched', dispatchEvidence: { kind: 'proven_not_dispatched', reference: {
                    protocol: 'native_project_delegation_preflight', inputHash: effect.inputHash, sourceBindingDigest: effect.sourceBindingDigest } },
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
                await service.runs.cancel(handle, controlCommandId('native.project.child.cancel', runId), { ...runGuard(current),
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
        const reasonCode = /^[a-z][a-z0-9_]+$/.test(error.code ?? '') ? error.code : 'native_orchestration_project_delegation_unresolved';
        const failure = await service.runs.withSourceControl(handle, runId, async () => service.runs.control(handle,
            controlCommandId('native.project.delegation.failure', { runId, attemptId }), { ...runGuard(await service.runs.get(handle, runId)),
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
                const receiptId = 'oreceipt_' + hash({ kind: 'native_project_failure', runId, attemptId }).slice(0, 32);
                await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), { schemaVersion: 1,
                    receiptKind: 'native_project_failure', receiptId, runId, epoch: root.epoch, nodeAttemptId: attemptId,
                    reasonCode, status: root.status, effectIds, costs, modelReceiptRef: terminal?.receiptRef ?? null,
                    decisionSeq: root.eventSeq + 1, createdAt: now });
                return { root, eventType: 'project_child_model_failed', reasonCode, outcome: { status: root.status, costsClosed: costs === null || costs.closed } };
            }), { withAuthority });
        if (current.parentRef && failure.outcome.costsClosed && failure.outcome.status !== 'reconciling') {
            const before = await this.owner.engine.withTransaction(handle, tx => service.budgetPort.observeChildClosure(handle, {
                authorityRef: current.budgetAuthorityRef, reservationId: runId,
                expectedParentReservationId: current.parentRef.depth === 1 ? null : current.parentRef.parentRunId,
                expectedCeiling: current.parentRef.budgetCeiling }, { tx }));
            if (before.closed) return;
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

    async #sendChildStage(state, parent, { attemptId, model, logical, inputRefs, signal }) {
        const { host, handle, capture } = state, service = this.execution(), root = await service.runs.get(handle, state.identity.childRunId), port = this.port(host);
        const audience = { kind: 'task', id: root.runId };
        const effectId = 'oeffect_' + hash({ runId: root.runId, attemptId, taskPurpose: state.identity.taskPurpose }).slice(0, 32);
        state.activeNode = { nodeId: model.node.nodeId, nodeAttemptId: attemptId, effectId };
        state.decision = { actionRef: { kind: 'native_model_send', runtimeRouteId: model.resolved.route.runtimeRouteId },
            targetRef: { connectionProfileId: model.resolved.connection.connectionProfileId, modelProfileId: model.resolved.model.modelProfileId, pathFingerprint: model.resolved.pathFingerprint },
            inputRef: logical, inputHash: hash(logical), capability: 'generation.send', grantDigest: state.identity.grantDigest,
            endpointBindingDigest: hash({ pathFingerprint: model.resolved.pathFingerprint, configDigest: model.configDigest }), risk: 'R1', requiresApproval: false,
            egressDigest: hash({ pathFingerprint: model.resolved.pathFingerprint, sourceBindingDigest: root.sourceBinding.bindingDigest, grantDigest: state.identity.grantDigest, audience }),
            budgetEnvelopeDigest: hash(model.resolved.route.executionPolicy.computeBudget), dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' } };
        // Branches share one RunRoot. Serialize only admission mutations;
        // context compilation and provider work retain their original concurrency.
        await service.runs.withSourceControl(handle, root.runId, async () => {
            await new AttemptController({ runs: service.runs, authorizeAttempt: args => this.authorize(args) }).activate(handle, { ...runGuard(await service.runs.get(handle, root.runId)), attemptId });
            await service.effects.prepare(handle, { ...runGuard(await service.runs.get(handle, root.runId)), effectId, nodeAttemptId: attemptId,
                proposal: Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, state.decision[key]])) });
        }, { withAuthority: service.sourcePort.consumptionBoundary(handle, root.sourceBinding, { engine: this.owner.engine }) });
        state.contextPort = new ContextPort({ projectAgent: host.agent, projectDelegationCapture: capture, projectDelegationHost: host,
            projectModelPolicy: { fallbackMode: 'disabled', routes: model.failurePlan.routes }, authorizeContext: async ({ request }) => {
                await this.inspectDelegation(capture, { host, handle });
                if (!equal(request.inputRefs, inputRefs) || request.taskPurpose !== state.identity.taskPurpose || request.grantDigest !== state.identity.grantDigest
                    || !equal(request.audience, { kind: 'task', id: root.runId }) || !equal(request.sourceBinding, root.sourceBinding)) fail();
                return { allowed: true, grantDigest: state.identity.grantDigest, projectToolPins: [] };
            } });
        const limits = parent.ownerLimits;
        const send = await service.generationSend(handle, { runId: root.runId, effectId, reservationId: root.runId, limits });
        const compiled = await compileNativeContextMetered({ handle, port: state.contextPort, request: { ownerRef: { handle }, sourceBinding: root.sourceBinding,
            audience: { kind: 'task', id: root.runId }, taskPurpose: state.identity.taskPurpose, grantDigest: state.identity.grantDigest, inputRefs,
            tokenBudget: { modelContextLimit: model.resolved.model.limits.contextTokens, responseReserve: effectiveOutputReserve(model.resolved) } },
        bank: send.bank, budgetPort: service.budgetPort, root: await service.runs.get(handle, root.runId), effectId, limits,
        workDescriptor: { requestId: state.request.requestId, pathFingerprint: model.resolved.pathFingerprint },
        assertCurrent: () => this.inspectDelegation(capture, { host, handle }), signal });
        state.context = compiled.compiled; state.request = state.contextPort.projectRequest(handle, { context: state.context });
        await send.bindContext({ port: state.contextPort, compiled: state.context, compileProof: compiled.proof });
        const scope = this.issueScope(host, handle, { runId: root.runId, effectId, request: state.request, logicalInputRef: logical, logicalInputHash: hash(logical),
            nativeProjectCapture: state.projectCapture, options: { scheduled: true, orchestrationSend: send }, revalidateConsume: async ({ tx } = {}) => {
                await this.inspectDelegation(capture, { host, handle, ...(tx ? { tx } : {}) });
                await state.contextPort.revalidate(handle, { context: state.context, phase: 'consume' });
            } });
        const result = await port.generate(handle, scope, { signal });
        if (result.generated.response.toolCalls?.length) fail('native_orchestration_project_quality_tool_denied');
        const closure = await this.owner.engine.withTransaction(handle, tx => service.budgetPort.observeEffectClosure(handle,
            { authorityRef: root.budgetAuthorityRef, effectIds: [effectId] }, { tx }));
        if (!closure.closed) fail('native_orchestration_project_quality_unsettled');
        return { effectId, result, send, limits };
    }

    async #prepareFanoutAgent(owner, parent, { node, bindings, fanoutAttemptId, permit = owner.childPermit, scopeCapture = null, signal = owner.signal, preparedAttemptId = null, reservedAttemptId = null, send = false }) {
        const service = this.execution(), { host, handle, child } = owner, capture = Object.freeze({});
        const root = await service.runs.get(handle, owner.identity.childRunId), model = child.profiles.find(model => equal(model.node, node)) ?? await child.resolveModel(node);
        const state = { ...owner, capture, model, root, childPermit: permit, scopeCapture, signal, controlPermit: null, controlOnly: false, bindings, activeNode: null };
        const requestId = 'project-quality:' + hash({ runId: root.runId, nodeId: node.nodeId, fanoutAttemptId }).slice(0, 32);
        state.projectCapture = await captureNativeProjectDelegatedWorker(scopeCapture ?? parent.projectCapture, permit,
            { requestId, nodeId: node.nodeId, routeRef: model.pin.resourceRef, task: { kind: 'native_project_delegated_work', nodeId: node.nodeId, authoredTask: node.label } });
        const physical = await inspectNativeProjectGeneration(state.projectCapture, { host, handle }); state.request = physical.request;
        const results = [...new Map(bindings.flatMap(item => [item.resultRef, ...item.evidenceRefs ?? []].filter(Boolean)).map(ref => [hash(ref), ref])).values()];
        const controls = [...new Map(bindings.filter(item => item.controlRef).map(item => [hash(item.controlRef), item.controlRef])).values()];
        const logical = { kind: 'native_project_delegated_intent', role: 'studio', requestId, projectAttemptId: state.request.projectAttemptId, operationId: physical.operationId,
            sourceRef: root.sourceBinding.sourceRef, planRef: root.planRef, nodeId: node.nodeId, audience: { kind: 'task', id: root.runId }, parentRunId: parent.runId, parentAttemptId: parent.attemptId,
            parentEpoch: root.parentRef.parentEpoch, childRunId: root.runId, childEpoch: root.epoch, delegationInputDigest: root.parentRef.inputDigest,
            routeRef: model.pin.resourceRef, configDigest: model.configDigest, acceptedGraphResultRefs: results,
            ...(controls.length ? { acceptedControlRefs: controls } : {}), fanoutAttemptId,
            graphBindings: bindings.filter(item => item.edge.to.nodeId === node.nodeId).map(item => ({ edgeId: item.edge.edgeId, producerAttemptId: item.attemptId })) };
        const inputRefs = [logical, ...root.parentRef.inputRefs, ...results, ...controls]; state.contextInputRefs = immutable(inputRefs);
        const admission = { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: root.parentRef.effectiveGrantDigest, budgetRef: root.budgetAuthorityRef };
        owner.branches.add(state); this.#delegations.set(capture, state);
        try {
            let attemptId = preparedAttemptId;
            if (attemptId) {
                const saved = await this.owner.engine.withTransaction(handle, tx => readAttempt(tx, handle, root, attemptId));
                if (saved.doc.status !== 'pending' || !equal(saved.doc.inputRefs, inputRefs) || saved.doc.inputDigest !== admission.inputDigest
                    || saved.doc.effectiveGrantDigest !== admission.effectiveGrantDigest || !equal(saved.doc.budgetRef, admission.budgetRef)) fail();
            } else if (reservedAttemptId) {
                const advanced = await service.runs.withSourceControl(handle, root.runId, async () => new TransitionController({ runs: service.runs, authorizeTransition: async () => {
                    await this.inspectDelegation(capture, { host, handle }); return admission;
                } }).advance(handle, { ...runGuard(await service.runs.get(handle, root.runId)), bindings: logical.graphBindings, reservedAttemptId }),
                { withAuthority: service.sourcePort.consumptionBoundary(handle, root.sourceBinding, { engine: this.owner.engine }) });
                attemptId = advanced.outcome.attemptId;
            } else ({ attemptId } = await service.runs.beginAttempt(handle, controlCommandId('project.child.fanout.entry', { runId: root.runId, fanoutAttemptId, nodeId: node.nodeId }),
                { ...runGuard(root), nodeId: node.nodeId, ...admission }));
            if (!send) return { attemptId, model, inputRefs, projectCapture: state.projectCapture };
            const { effectId, result } = await this.#sendChildStage(state, parent, { attemptId, model, logical, inputRefs, signal });
            const graphCapture = Object.freeze({}); this.#graphs.set(graphCapture, state);
            try {
                const published = await new ResultController({ host, modelPort: this.port(host) }).publishGraphModelResult(handle, { capture: graphCapture, result, runId: root.runId, effectId });
                return { attemptId, resultRef: published.resultRef };
            } finally { this.#graphs.delete(graphCapture); }
        } catch (error) { await this.#proveNotDispatched(state); throw error; } finally { owner.branches.delete(state); this.#delegations.delete(capture); }
    }

    async #runFanoutAgent(owner, parent, args) { return this.#prepareFanoutAgent(owner, parent, { ...args, send: true }); }

    async #runChild(parent, childPermit, signal) {
        const service = this.execution(), { host, handle, child } = parent, root = await service.runs.get(handle, parent.childRunId);
        const capture = Object.freeze({});
        const state = { host, handle, parent, child, capture, childPermit, signal, bindings: [], branches: new Set(), plannerOperations: new Map(), identity: immutable({ handle,
            parentRunId: parent.runId, parentAttemptId: parent.attemptId, parentEpoch: root.parentRef.parentEpoch, childRunId: root.runId,
            childEpoch: root.epoch, sourceBinding: root.sourceBinding, grantDigest: root.parentRef.effectiveGrantDigest,
            parentGrantDigest: parent.decision.grantDigest, inputRefs: root.parentRef.inputRefs, taskPurpose: 'original_native_project_delegated_analysis', childPlanRef: root.planRef }) };
        state.model = child.profiles.find(model => model.node.nodeId === child.topology.terminalNodeId);
        this.#delegations.set(capture, state); this.#children.set(root.runId, state);
        const progress = new Map(), retryTokens = new Map(), replacements = new Map(), payloads = new Map(), port = this.port(host);
        try {
            while (true) {
                const currentRoot = await service.runs.get(handle, root.runId);
                let ready, loopBindings = [];
                const replan = [...progress].find(([, entry]) => entry.requests?.replan);
                if (replan) {
                    const [nodeId, previous] = replan, scope = projectReplanScope(currentRoot.graph, nodeId);
                    if (previous.requests.finalize || !progress.has(scope.target.nodeId)) fail('native_orchestration_planner_replan_pending');
                    const profile = projectDelegatedGraphProfile({ ...child.plan, definition: currentRoot.graph });
                    const required = profile.models.filter(node => scope.affectedNodeIds.includes(node.nodeId) || !progress.has(node.nodeId)).length;
                    const capacity = await this.owner.engine.withTransaction(handle, tx => service.budgetPort.observeCapacity(handle,
                        { authorityRef: currentRoot.budgetAuthorityRef, reservationId: root.runId }, { tx }));
                    if (!capacity || capacity.overrun || capacity.remaining.requests < required) fail('native_orchestration_graph_budget_unavailable');
                    if (currentRoot.progress.attempts + required + 1 > currentRoot.limits.maxAttempts) fail('native_orchestration_limit_exhausted');
                    loopBindings = scope.loops.map(edge => ({ edge, ...previous }));
                    for (const id of scope.affectedNodeIds) { progress.delete(id); retryTokens.set(id, previous.attemptId); }
                    const edges = currentRoot.graph.edges.filter(edge => !edge.loopBack && edge.to.nodeId === scope.target.nodeId);
                    if (edges.some(edge => !progress.has(edge.from.nodeId))) fail('native_orchestration_graph_dependency_unavailable');
                    ready = { node: scope.target, edges };
                } else ready = inspectGraphReadiness(currentRoot.graph, currentRoot.nodeControl, Object.fromEntries([...progress.keys()].map(id => [id, 'completed'])), { excludeNodeIds: [child.topology.output.nodeId] }).ready[0];
                if (!ready) fail();
                if (ready.node.kind === 'fanout') {
                    const group = projectDelegatedGraphProfile({ ...child.plan, definition: currentRoot.graph }).fanouts.find(group => group.fanout.nodeId === ready.node.nodeId);
                    const inherited = ready.edges.map(edge => ({ edge, ...progress.get(edge.from.nodeId) }));
                    await runProjectDelegatedFanout({ state, parent, service, group, inherited, progress, engine: this.owner.engine,
                        current: () => this.inspectDelegation(capture, { host, handle }),
                        execute: args => this.#runFanoutAgent(state, parent, args),
                        prepare: args => this.#prepareFanoutAgent(state, parent, args) });
                    continue;
                }
                const model = child.profiles.find(model => equal(model.node, ready.node)) ?? await child.resolveModel(ready.node);
                state.model = model; state.root = currentRoot;
                const replacement = replacements.get(model.node.nodeId); state.feedback = replacement?.feedback ?? null;
                const retry = retryTokens.get(model.node.nodeId);
                const requestId = replacement?.input.requestId ?? 'project-quality:' + hash({ runId: root.runId, nodeId: model.node.nodeId, ...(retry ? { retry } : {}) }).slice(0, 32);
                state.projectCapture = await captureNativeProjectDelegatedWorker(parent.projectCapture, childPermit, { requestId, nodeId: model.node.nodeId,
                    routeRef: model.pin.resourceRef, ...(['planner', 'review', 'judge'].includes(model.node.kind) ? { outputContract: { planner: projectPlannerOutputContract, review: projectGraphReviewOutputContract, judge: projectGraphJudgeOutputContract }[model.node.kind] } : {}), task: { kind: 'native_project_delegated_work', authoredTask: model.node.label,
                        instruction: 'Provide advisory Project analysis only. No tools or official Project writes.' } });
                const physical = await inspectNativeProjectGeneration(state.projectCapture, { host, handle });
                state.request = physical.request;
                let bindings = [...ready.edges.map(edge => ({ edge, ...progress.get(edge.from.nodeId) })), ...loopBindings]
                    .sort((a, b) => a.edge.edgeId.localeCompare(b.edge.edgeId));
                const judges = bindings.filter(binding => binding.controlRef?.kind === 'graph_judge_control');
                bindings = bindings.filter(binding => {
                    if (!binding.resultRef || !judges.some(judge => judge.candidateRefs.some(ref => equal(ref, binding.resultRef)) && !equal(judge.selectedResultRef, binding.resultRef))) return true;
                    if (model.node.inputs.find(port => port.name === binding.edge.to.port).required) fail('native_orchestration_judge_required_input');
                    return false;
                }); state.bindings = bindings;
                const results = [...new Map(bindings.flatMap(item => [item.resultRef, ...item.evidenceRefs ?? []].filter(Boolean)).map(ref => [hash(ref), ref])).values()];
                const controls = [...new Map(bindings.filter(item => item.controlRef).map(item => [hash(item.controlRef), item.controlRef])).values()];
                const audience = { kind: 'task', id: root.runId };
                const logical = { kind: 'native_project_delegated_intent', role: 'studio', requestId,
                    projectAttemptId: state.request.projectAttemptId, operationId: physical.operationId,
                    sourceRef: root.sourceBinding.sourceRef, planRef: root.planRef, nodeId: model.node.nodeId, audience,
                    parentRunId: parent.runId, parentAttemptId: parent.attemptId, parentEpoch: root.parentRef.parentEpoch,
                    childRunId: root.runId, childEpoch: root.epoch, delegationInputDigest: root.parentRef.inputDigest,
                    routeRef: model.pin.resourceRef, configDigest: model.configDigest, acceptedGraphResultRefs: results, ...(state.feedback ? { reviewFeedbackRef: state.feedback } : {}), ...(controls.length ? { acceptedControlRefs: controls } : {}),
                    graphBindings: bindings.map(item => ({ edgeId: item.edge.edgeId, producerAttemptId: item.attemptId })) };
                const inputRefs = [logical, ...root.parentRef.inputRefs, ...results, ...controls]; state.contextInputRefs = immutable(inputRefs);
                const admission = { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: state.identity.grantDigest, budgetRef: root.budgetAuthorityRef };
                let attemptId;
                if (replacement) {
                    const saved = await this.owner.engine.withTransaction(handle, async tx => (await readAttempt(tx, handle,
                        await service.runs.get(handle, root.runId), replacement.attemptId)).doc);
                    if (saved.nodeId !== model.node.nodeId || saved.status !== 'pending' || !equal(saved.inputRefs, inputRefs)
                        || saved.inputDigest !== admission.inputDigest || saved.effectiveGrantDigest !== admission.effectiveGrantDigest
                        || !equal(saved.budgetRef, admission.budgetRef)) fail('native_orchestration_review_rerun_denied');
                    attemptId = saved.attemptId;
                } else if (!bindings.length) ({ attemptId } = await service.runs.beginAttempt(handle, controlCommandId('native.project.child.attempt', { runId: root.runId, nodeId: model.node.nodeId }),
                    { ...runGuard(await service.runs.get(handle, root.runId)), nodeId: model.node.nodeId, ...admission }));
                else {
                    const transitioned = await new TransitionController({ runs: service.runs, authorizeTransition: async ({ root: active, target, producers }) => {
                        if (active.runId !== root.runId || target.nodeId !== model.node.nodeId || !equal(producers.map(item => item.attempt.attemptId).sort(), bindings.map(item => item.attemptId).sort())) fail();
                        await this.inspectDelegation(capture, { host, handle }); return admission;
                    } }).advance(handle, { ...runGuard(await service.runs.get(handle, root.runId)), bindings: logical.graphBindings, reservedAttemptId: null });
                    attemptId = transitioned.outcome.attemptId;
                }
                const { effectId, result, send, limits } = await this.#sendChildStage(state, parent, { attemptId, model, logical, inputRefs, signal });
                if (model.node.kind === 'planner') {
                    const completed = await completeProjectDelegatedPlanner({ state, service, port, result, send, limits, progress, engine: this.owner.engine,
                        current: () => this.inspectDelegation(capture, { host, handle }) });
                    progress.set(model.node.nodeId, completed);
                    continue;
                }
                if (model.node.kind === 'review') {
                    const decided = await completeProjectDelegatedReview({ state, service, port, result, send, limits,
                        current: () => this.inspectDelegation(capture, { host, handle }), engine: this.owner.engine });
                    if (decided.review.decision === 'rerun') {
                        for (const [id, entry] of progress) if (decided.review.invalidatedAttemptIds.includes(entry.attemptId)) {
                            progress.delete(id); retryTokens.set(id, decided.attemptId);
                        }
                        progress.delete(model.node.nodeId); retryTokens.set(model.node.nodeId, decided.attemptId);
                        for (const row of decided.review.replacements) {
                            const target = await this.owner.engine.withTransaction(handle, async tx => (await readAttempt(tx, handle,
                                await service.runs.get(handle, root.runId), row.targetAttemptId)).doc);
                            replacements.set(target.nodeId, { attemptId: row.attemptId, input: target.inputRefs[0], feedback: decided.feedback });
                        }
                    } else progress.set(model.node.nodeId, { attemptId, controlRef: decided.controlRef });
                    continue;
                }
                if (model.node.kind === 'judge') {
                    progress.set(model.node.nodeId, await completeProjectDelegatedJudge({ state, service, port, result, send, limits,
                        current: () => this.inspectDelegation(capture, { host, handle }), engine: this.owner.engine }));
                    continue;
                }
                const payloadHash = hash(result.generated.response.text);
                if (replacement && payloads.get(model.node.nodeId) === payloadHash) fail('native_orchestration_review_no_progress');
                replacements.delete(model.node.nodeId); payloads.set(model.node.nodeId, payloadHash);
                const controller = new ResultController({ host, modelPort: port });
                if (model.node.nodeId === child.topology.final.nodeId) {
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
            const active = await service.runs.get(handle, root.runId);
            let failedAttemptId = state.activeNode?.nodeAttemptId ?? null;
            await this.owner.engine.withTransaction(handle, async tx => {
                for (const ref of active.attemptRefs) {
                    const attempt = (await readAttempt(tx, handle, active, ref)).doc;
                    if (attempt.nodeId === active.graph.outputContract.ownerNodeId && !['completed', 'partial', 'failed', 'cancelled', 'stale', 'blocked'].includes(attempt.status)) failedAttemptId = attempt.attemptId;
                }
            });
            await this.#failRun(parent, root.runId, failedAttemptId, error);
            throw error;
        } finally { this.#delegations.delete(capture); this.#children.delete(root.runId); }
    }
}
