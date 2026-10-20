import { performance } from 'node:perf_hooks';
import { ConflictError } from '../../storage/errors.js';
import { fields } from '../../../public/shared/native-values.js';
import { assertNativeId } from '../identity.js';
import { NativeGenerationHost } from '../adapters/generation-host.js';
import { McpService } from '../mcp-service.js';
import { A2aService } from '../a2a-service.js';
import { hashNativeDocument as hash, putImmutable, withNativeResourceWrite, equalNativeDocuments as equal } from '../repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { createOrchestrationExecutionService } from './execution-service.js';
import { createOrchestrationAuthoringService } from './authoring-service.js';
import { ToolPort } from './tool-port.js';
import { captureNativeTool, nativeToolDecision } from './native-tool-contracts.js';
import { readNativeToolCompletion, readNativeToolOutput, nativeToolResult, nativeToolId, assertNativeToolPayload } from './native-tool-output-contracts.js';

import { readEffect, effectDecision } from './effect-contracts.js';
import { controlCommandId, controlRecordKey, runGuard, readAttempt } from './controller-common.js';
import { localWorkAttemptId } from './budget-port.js';
import { AttemptController } from './attempt-controller.js';
import { TransitionController } from './transition-controller.js';
import { writeAttemptSettlement, attemptReceiptId } from './attempt-settlement.js';
import { SourcePort } from './source-port.js';

const fail = (code = 'native_orchestration_native_tool_stale') => { throw new ConflictError(code); };

/** A finite original Session consumer, not a caller-supplied Tool gateway. */
export class NativeToolOrchestrationAuthority {
    #states = new Map();
    #execution;
    #port;
    constructor({ host, plans = null }) {
        if (!(host instanceof NativeGenerationHost) || host.persistence?._engine !== host.sessionCore?._sessions?._engine)
            throw new TypeError('Original Native Tool Host required');
        Object.assign(this, { host, engine: host.persistence._engine, plans });
        this.mcp = new McpService({ host }); this.a2a = new A2aService({ host });
    }
    get execution() {
        return this.#execution ??= createOrchestrationExecutionService({ engine: this.engine, sessionCore: this.host.sessionCore, effectAuthority: this });
    }
    get port() {
        const service = this.execution;
        return this.#port ??= new ToolPort({ mcpService: this.mcp, a2aService: this.a2a,
            budgetPort: service.budgetPort, sourcePort: service.sourcePort, runs: service.runs, effects: service.effects,
            verifyDispatch: args => service.assertDispatch(args), readInput: async ({ inputRef }) => structuredClone(inputRef.input),
            authorizeTool: async args => {
                const state = this.#state(args.handle, args.root.runId); await this.authorize(args);
                return { grantDigest: state.decision.grantDigest, egressDigest: state.decision.egressDigest,
                    sourceBindingDigest: state.sourceBinding.bindingDigest, capability: state.descriptor.capability, limits: state.descriptor.limits };
            }, skillAuthority: async ({ handle, root }) => {
                const state = this.#state(handle, root.runId), captured = await this.#current(state);
                return { ...captured.skill, revalidate: () => this.#current(state) };
            } });
    }
    #key(handle, runId) { return hash({ handle, runId }); }
    #state(handle, runId) { const state = this.#states.get(this.#key(handle, runId)); if (!state) fail('native_orchestration_native_tool_recovery_required'); return state; }
    async #plan(handle, planRef) {
        this.plans ??= createOrchestrationAuthoringService(this.engine, { sessionCore: this.host.sessionCore, toolHost: this.host }).plans;
        const plan = await this.plans.getRevision(handle, planRef), graph = plan.definition;
        const node = graph.nodes.find(item => item.kind === 'effect'), output = graph.nodes.find(item => item.kind === 'output');
        const pin = plan.dependencyPins.find(item => item.pinId === node?.policy.actionPinId), capability = pin && { mcp: 'mcp.read', a2a: 'a2a.read', skill: 'skill.read' }[pin.resourceRef.protocol];
        if (graph.nodes.length !== 2 || !node || !output || graph.edges.length !== 1 || graph.graphChangePolicy.allowedOperations.length
            || !capability || !equal(graph.capabilityCeiling, [capability]) || !equal(node.capabilities, [capability]) || node.inputs.length
            || node.outputs.length !== 1 || node.outputs[0].type !== 'json' || !node.outputs[0].required
            || output.capabilities.length || output.dependencyPinIds.length || output.outputs.length || output.inputs.length !== 1
            || output.inputs[0].type !== 'json' || !output.inputs[0].required || !equal(graph.entryNodeIds, [node.nodeId])
            || !equal(node.dependencyPinIds, [pin?.pinId]) || plan.dependencyPins.length !== 1 || pin.port !== 'tool'
            || pin.resourceRef.kind !== 'native_session_tool' || graph.outputContract.kind !== 'result' || graph.outputContract.allowPartial
            || graph.outputContract.resultPolicy?.outputType !== 'json' || graph.outputContract.resultPolicy.maxBytes > 1048576
            || graph.outputContract.ownerNodeId !== output.nodeId || graph.edges[0].from.nodeId !== node.nodeId || graph.edges[0].to.nodeId !== output.nodeId
            || graph.edges[0].condition !== 'always' || graph.edges[0].loopBack || graph.edges[0].maxVisits !== 1) fail();
        return { plan, graph, node, pin };
    }
    async #current(state) {
        const { pin } = await this.#plan(state.handle, state.planRef), captured = await captureNativeTool(state.handle, pin.resourceRef, this.host);
        if (!equal(pin, state.pin) || !equal(captured.descriptor, state.descriptor) || pin.integrity !== hash(captured.descriptor)) fail();
        const root = await this.execution.runs.get(state.handle, state.runId);
        if (root.cancelRequested || !['admitted', 'running'].includes(root.status) || root.epoch !== state.epoch
            || !equal(root.sourceBinding, state.sourceBinding) || !equal(root.planRef, state.planRef)) fail();
        return captured;
    }
    async authorize({ handle, root, proposal, intent, attempt }) {
        const state = this.#state(handle, root.runId); await this.#current(state);
        if (intent && !equal(effectDecision(intent), state.decision) || proposal && !equal(proposal,
            Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, state.decision[key]])))
            || attempt && attempt.nodeId !== state.nodeId) fail();
        return structuredClone(state.decision);
    }
    verifySend() { fail(); }
    verifyApproval() { fail(); }
    verifyObservation(args) { return this.port.verifyObservation(args); }

    async prepare(handle, input) {
        fields(input, ['commandId', 'planRef'], 'Native Tool prepare'); assertNativeId(input.commandId, 'orchestrationCommand');
        return withNativeResourceWrite(handle, input.commandId, async () => {
            const saved = await this.engine.withTransaction(handle, tx => tx.getResource({ kind: K.orchestrationCommand, handle, commandId: input.commandId }));
            if (saved) {
                if (saved.doc.operation !== 'runs.start') fail('native_orchestration_command_conflict');
                const root = await this.execution.runs.get(handle, saved.doc.target);
                if (!equal(root.planRef, input.planRef) || root.retentionPolicyRef.policyId !== 'native_session_tool') fail('native_orchestration_command_conflict');
                return this.#metadata(handle, root);
            }
            const { node, pin } = await this.#plan(handle, input.planRef), captured = await captureNativeTool(handle, pin.resourceRef, this.host);
            const descriptor = captured.descriptor;
            if (pin.integrity !== hash(descriptor)) fail();
            const service = this.execution, root = await service.runs.start(handle, input.commandId,
                { planRef: input.planRef, sourceRequest: pin.resourceRef.source, retentionPolicyRef: { policyId: 'native_session_tool' } });
            if (root.recovered || root.sourceBinding.bindingDigest !== descriptor.sourceBindingDigest) fail();
            const decision = nativeToolDecision({ ownerRef: root.ownerRef, planRef: root.planRef, sourceBinding: root.sourceBinding, nodeId: node.nodeId, pin, descriptor });
            const state = { handle, runId: root.runId, epoch: root.epoch, planRef: root.planRef, sourceBinding: root.sourceBinding, pin, descriptor, nodeId: node.nodeId, decision };
            this.#states.set(this.#key(handle, root.runId), state);
            const { attemptId } = await service.runs.beginAttempt(handle, controlCommandId('native.tool.attempt', root.runId), { ...runGuard(root), nodeId: node.nodeId,
                inputRefs: [decision.inputRef], inputDigest: hash([decision.inputRef]), effectiveGrantDigest: decision.grantDigest, budgetRef: root.budgetAuthorityRef });
            state.attemptId = attemptId;
            await new AttemptController({ runs: service.runs, authorizeAttempt: args => this.authorize(args) }).activate(handle,
                { ...runGuard(await service.runs.get(handle, root.runId)), attemptId });
            state.effectId = 'oeffect_' + hash({ kind: 'native_session_tool', runId: root.runId, attemptId }).slice(0, 32);
            await service.effects.prepare(handle, { ...runGuard(await service.runs.get(handle, root.runId)), effectId: state.effectId, nodeAttemptId: attemptId,
                proposal: Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, decision[key]])) });
            const started = performance.now(), cpu = process.cpuUsage(), attemptIdWork = localWorkAttemptId(state.effectId, 0);
            await this.#current(state);
            const charged = await service.budgetPort.chargeLocalWork(handle, { authorityRef: root.budgetAuthorityRef, limits: descriptor.limits,
                effectId: state.effectId, localWorkOrdinal: 0, attempt: { attemptId: attemptIdWork, requestId: root.runId, kind: 'context_build',
                    estimatedItems: 1, estimatedInputBytes: Buffer.byteLength(JSON.stringify(decision.inputRef)), targetFingerprint: descriptor.inputHash } });
            if (!charged) fail('native_orchestration_tool_budget_unavailable');
            const used = process.cpuUsage(cpu);
            await service.budgetPort.settleLocalWork(handle, root.budgetAuthorityRef, attemptIdWork, { wallMs: performance.now() - started,
                cpuUserMicros: used.user, cpuSystemMicros: used.system, cpuScope: 'process', outcome: 'completed' });
            const budgetAttemptRef = { kind: 'local_work', authorityRef: root.budgetAuthorityRef, effectId: state.effectId, attemptId: attemptIdWork,
                reservationId: null, localWorkOrdinal: 0 };
            await service.effects.ready(handle, { ...runGuard(await service.runs.get(handle, root.runId)), effectId: state.effectId, budgetAttemptRef });
            return { runId: state.runId, effectId: state.effectId, status: 'ready' };
        });
    }
    #request(input) { fields(input, ['runId', 'effectId'], 'Native Tool reference'); assertNativeId(input.runId, 'orchestrationRun'); assertNativeId(input.effectId, 'orchestrationEffect'); }
    async dispatch(handle, input) {
        this.#request(input);
        // Claim is the original atomic once gate. Never hold its Run mutex
        // while awaiting the independent original protocol scheduler finalizer.
        return (async () => {
            const service = this.execution, root = await service.runs.get(handle, input.runId);
            const intent = await this.engine.withTransaction(handle, async tx => (await readEffect(tx, handle, root, input.effectId)).doc);
            if (intent.inputRef.kind !== 'native_session_tool') fail();
            if (intent.status !== 'ready') return this.observe(handle, input);
            const state = this.#state(handle, root.runId);
            if (state.effectId !== input.effectId) fail();
            await this.#current(state);
            const claim = await service.effects.claim(handle, { ...runGuard(await service.runs.get(handle, root.runId)), effectId: input.effectId });
            if (!claim.claimed || !claim.dispatchToken) fail();
            let executed;
            try {
                executed = await this.port.execute(handle, { ...input, dispatchToken: claim.dispatchToken });
                if (executed.operationRef) {
                    state.operationRef = executed.operationRef;
                    const original = intent.actionRef.protocol === 'mcp' ? this.mcp : this.a2a;
                    await original.scheduler.operations.get(executed.operationRef.operationId).handle.result;
                    if (intent.actionRef.protocol === 'a2a') {
                        const accepted = await this.port.observe(handle, executed.operationRef, input);
                        if (accepted.observation) await service.effects.observe(handle,
                            { ...runGuard(await service.runs.get(handle, root.runId)), effectId: input.effectId, observation: accepted.observation });
                        return this.observe(handle, input);
                    }
                    const status = await this.mcp.status(handle, { operationId: executed.operationRef.operationId });
                    if (!status.current || !status.artifact) fail();
                    executed.result = status.artifact.result;
                }
            } catch (error) {
                // A sender failure, including unknown ACK, can only be observed.
                // Do not restore ready or retry the original operation.
                state.failureCode = typeof error.code === 'string' ? error.code : 'native_orchestration_native_tool_failed';
                return this.observe(handle, input);
            }
            const completion = await this.engine.withTransaction(handle, async tx => {
                const current = await service.runs.get(handle, root.runId), effect = (await readEffect(tx, handle, current, input.effectId)).doc;
                return effect.status === 'confirmed' ? readNativeToolCompletion(tx, handle, current) : null;
            });
            if (!completion) return this.observe(handle, input);
            assertNativeToolPayload(completion, executed.result);
            await this.#finish(state, executed.result);
            this.#states.delete(this.#key(handle, root.runId));
            return this.observe(handle, input);
        })();
    }
    async #metadata(handle, root, requestedEffectId = null) {
        return this.engine.withTransaction(handle, async tx => {
            for (const id of root.attemptRefs) {
                const attempt = (await readAttempt(tx, handle, root, id)).doc;
                for (const effectId of attempt.effectRefs) {
                    if (requestedEffectId && requestedEffectId !== effectId) continue;
                    const intent = (await readEffect(tx, handle, root, effectId)).doc;
                    if (intent.inputRef.kind !== 'native_session_tool') continue;
                    const state = this.#states.get(this.#key(handle, root.runId));
                    const accepted = intent.actionRef.protocol === 'a2a' && intent.status === 'confirmed';
                    const completionId = 'oreceipt_' + hash({ effectId, observationId: 'tool.completed:' + effectId }).slice(0, 32);
                    const receipt = (await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', completionId)))?.doc;
                    return { runId: root.runId, effectId, status: root.status === 'completed' ? 'completed' : intent.status === 'failed' ? 'failed' : intent.status === 'ready' ? state ? 'ready' : 'recovery_required' : 'unknown',
                        effectStatus: intent.status, accepted, remoteCompleted: false, failureCode: state?.failureCode ?? null,
                        reasonCode: receipt?.reasonCode ?? null,
                        resultRef: root.status === 'completed' ? root.resultRefs[0] : null };
                }
            }
            fail();
        });
    }
    async observe(handle, input) {
        this.#request(input); const root = await this.execution.runs.get(handle, input.runId);
        return this.#metadata(handle, root, input.effectId);
    }

    async #finish(state, payload) {
        const { handle, runId, effectId } = state, { runs } = this.execution;
        const withAuthority = SourcePort.prototype.consumptionBoundary.call(this.execution.sourcePort, handle, state.sourceBinding, { engine: this.engine });
        return runs.withSourceControl(handle, runId, () => this.engine.withTransaction(handle, async tx => {
            const current = async () => {
                await this.#current(state);
                const root = await runs.get(handle, runId), completion = await readNativeToolCompletion(tx, handle, root);
                if (!completion?.costs.closed) fail(); assertNativeToolPayload(completion, payload);
                await this.execution.sourcePort.revalidate(handle, root.sourceBinding, { tx, root });
                return { root, completion };
            };
            let { root } = await current();
            await runs.control(handle, controlCommandId('native.tool.result', runId), { ...runGuard(root), operation: 'result.publish', detail: { effectId } }, async ({ tx, root, now }) => {
                const { completion } = await current(), record = await readAttempt(tx, handle, root, state.attemptId);
                if (root.resultRefs.length || record.doc.status !== 'running') fail();
                const result = nativeToolResult(root, completion, payload, now), resultRef = { runId, resultId: result.resultId };
                await putImmutable(tx, controlRecordKey(handle, runId, 'result', result.resultId), result);
                await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', nativeToolId('publication', runId)), {
                    schemaVersion: 1, receiptKind: 'native_tool_publication', receiptId: nativeToolId('publication', runId), runId, epoch: root.epoch,
                    resultRef, resultIntegrity: hash(result), effectId, effectReceiptRef: { runId, effectId, receiptId: completion.receipt.receiptId }, decisionSeq: root.eventSeq + 1, createdAt: now });
                await writeAttemptSettlement({ tx, handle, root, record, outcome: 'completed', resultRefs: [resultRef],
                    effectReceiptRefs: [completion.receipt.receiptId], reasonCode: 'native_tool_confirmed', now });
                root.resultRefs.push(resultRef); root.progress.steps++;
                return { root, eventType: 'native_tool_published', reasonCode: 'native_tool_confirmed', outcome: { resultRef } };
            });
            ({ root } = await current());
            const bindings = [{ edgeId: root.graph.edges[0].edgeId, producerAttemptId: state.attemptId }];
            const advanced = await new TransitionController({ runs, authorizeTransition: async ({ root, target, producers }) => {
                const { completion } = await current();
                if (target.nodeId !== root.graph.outputContract.ownerNodeId || producers.length !== 1 || producers[0].attempt.attemptId !== completion.producer.attemptId) fail();
                return { inputRefs: [...root.resultRefs], inputDigest: hash(root.resultRefs), effectiveGrantDigest: completion.intent.grantDigest, budgetRef: root.budgetAuthorityRef };
            } }).advance(handle, { ...runGuard(root), bindings, reservedAttemptId: null });
            const attemptId = advanced.outcome.attemptId;
            ({ root } = await current());
            await new AttemptController({ runs, authorizeAttempt: async ({ attempt }) => { await current(); if (attempt.attemptId !== attemptId) fail(); } }).activate(handle, { ...runGuard(root), attemptId });
            ({ root } = await current());
            await runs.control(handle, controlCommandId('native.tool.output', runId), { ...runGuard(root), operation: 'output.publish', detail: { attemptId } }, async ({ tx, root, now }) => {
                const { completion } = await current(), record = await readAttempt(tx, handle, root, attemptId);
                if (root.outputClaims.length || record.doc.status !== 'running') fail();
                const claimId = nativeToolId('claim', runId), claimRef = { runId, claimId }, resultRef = root.resultRefs[0];
                const operationRef = { runId, effectId, receiptId: completion.receipt.receiptId };
                const claim = { schemaVersion: 1, claimId, runId, nodeAttemptId: attemptId,
                    outputKey: hash({ kind: 'native_session_tool', runId, effectId }), sourceBindingDigest: root.sourceBinding.bindingDigest, resultRef,
                    consumerRef: nativeToolResult(root, completion, payload, now).envelope.audienceConstraint, operationRef, status: 'committed', domainReceiptRef: operationRef };
                await putImmutable(tx, controlRecordKey(handle, runId, 'output', claimId), claim);
                await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', nativeToolId('output', runId)), { schemaVersion: 1, receiptKind: 'native_tool_output',
                    receiptId: nativeToolId('output', runId), runId, epoch: root.epoch, graphRevision: root.graphRevision, claimRef, claimIntegrity: hash(claim), resultRef,
                    publicationReceiptRef: { runId, receiptId: nativeToolId('publication', runId) },
                    traversalReceiptRef: { runId, receiptId: 'oreceipt_' + hash({ runId, bindings, reservedAttemptId: null }).slice(0, 32) },
                    outputAttemptReceiptRef: { runId, receiptId: attemptReceiptId(runId, attemptId) }, costs: completion.costs, decisionSeq: root.eventSeq + 1, createdAt: now });
                await writeAttemptSettlement({ tx, handle, root, record, outcome: 'completed', resultRefs: [resultRef], effectReceiptRefs: [], reasonCode: 'native_tool_completed', now });
                root.outputClaims.push(claimRef); root.status = 'completed'; root.progress.steps++;
                return { root, eventType: 'native_tool_completed', reasonCode: 'native_tool_completed', outcome: { claimRef } };
            });
        }), { withAuthority });
    }

    /** Fresh, read-only recipient authority after restart; no old private scope. */
    async consume(handle, input) {
        this.#request(input);
        const { runs, sourcePort, budgetPort } = this.execution, initial = await runs.get(handle, input.runId);
        const boundary = SourcePort.prototype.consumptionBoundary.call(sourcePort, handle, initial.sourceBinding, { engine: this.engine });
        const denied = Symbol('original Tool consumption denied');
        const outcome = await withNativeResourceWrite(handle, input.runId, () => boundary(() => this.engine.withTransaction(handle, async tx => {
            const current = async () => {
                const fence = await this.engine.nativeHostLifecycle.assertWriter(handle, tx), root = await runs.get(handle, input.runId);
                if (root.cancelRequested || root.status !== 'completed' || root.ownerRef.handle !== handle) fail();
                const output = await readNativeToolOutput(tx, handle, root);
                if (!output || output.completion.intent.effectId !== input.effectId) fail();
                const { pin } = await this.#plan(handle, root.planRef), captured = await captureNativeTool(handle, pin.resourceRef, this.host);
                if (pin.integrity !== hash(captured.descriptor) || !equal(captured.descriptor, output.completion.descriptor)) fail();
                await budgetPort.assertCurrent(handle, root.budgetAuthorityRef, { tx });
                await sourcePort.revalidate(handle, root.sourceBinding, { tx, root });
                return { root, output, fence };
            };
            try {
                const first = await current(), second = await current();
                if (!equal(first.root, second.root) || !equal(first.output, second.output) || !equal(first.fence, second.fence)) fail();
                const recipient = { ...second.output.result.envelope.audienceConstraint, hostBootId: second.fence.hostBootId, hostGeneration: second.fence.generation };
                return { runId: input.runId, effectId: input.effectId, status: 'complete', advisory: true, result: second.output.result,
                    recipient, grantDigest: hash({ principal: 'original_native_session_tool_recipient', ownerRef: second.root.ownerRef,
                        recipient, resultIntegrity: hash(second.output.result), descriptorIntegrity: second.output.completion.pin.integrity }) };
            } catch (error) {
                // Preserve legitimate same-boundary human/cancel writes before
                // refusing an obsolete body, as the original Run consumer does.
                if (/^native_(orchestration_(source_stale|native_tool_(stale|unavailable))|mcp_(allowlist_denied|source_stale)|credential_.*)$/.test(error.code ?? ''))
                    return { [denied]: true, error };
                throw error;
            }
        })));
        if (outcome[denied]) throw outcome.error;
        return outcome;
    }
}
