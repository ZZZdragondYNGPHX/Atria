import { assertNativeNarratorQuota, assertNativeTurnOutputQuota, captureNativeTurnOutputFinalization } from './native-turn-quota.js';
import { compileNativeContextPlan } from '../../../public/scripts/native/context-compiler.js';
import { actorAvailability, informationContext } from '../../../public/shared/native-information-runtime.js';
import { fields } from '../../../public/shared/native-values.js';
import { hashNativeDocument } from '../repositories/common.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { createNativeSessionContextProvider } from '../model-prompt-runtime/context-providers.js';
import { authorityTurnProof, authorityCatalog, resolverRequest } from '../authority-turn.js';
import { buildAuthorityObservation } from '../authority-transaction.js';
import { authorityContextPlan, emptyNativeContextPlan } from '../adapters/native-authority-context.js';
import { inspectNativeAuthorityResolver } from './authority-resolver-context.js';
import { inspectNativeProjectGeneration, inspectNativeProjectGenerationIdentity, readNativeProjectSkillInventory } from './native-project-generation-authority.js';
import { buildNativeProjectModelRound, projectAgentPromptInputs } from '../../../public/shared/project-agent-prompt.js';
import { ProjectAgentService } from '../project-agent.js';
import { ResultPort } from './result-port.js';
import { inspectNativeRpGeneration, inspectNativeRpDelegation, inspectNativeRpDelegationIdentity } from './native-rp-generation.js';
import { RpRunControl } from '../rp-run-control.js';
import { NativeMemoryAuthority } from '../memory-authority.js';
import { SettingsRepo } from '../../storage/repositories/settings-repo.js';
import { inspectNativeBackgroundGeneration } from './native-background-generation.js';
import { PROJECT_TOOL_BATCH_POLICY, projectToolCapability } from './project-tool-contracts.js';
import { selectNativeTaskContext } from '../adapters/task-context-items.js';
import { prepareRpSkillContext, assertRpSkillContext } from './rp-skill-context.js';
import { inspectSessionTurnOutput } from '../session-turn-output.js';
import { NativeGenerationHost } from '../adapters/generation-host.js';
import { NativeNarratorOrchestrationAuthority } from './native-turn-orchestration.js';

const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const packageInputs = installed => ({ manifest: installed.manifest, entryPoint: installed.entryPoint,
    sourceFiles: [...installed.sourceFiles].sort(([a], [b]) => a.localeCompare(b)), assets: [...installed.assets].sort(([a], [b]) => a.localeCompare(b)) });
const packageDigestOf = installed => hashNativeDocument(JSON.parse(JSON.stringify(packageInputs(installed))));
const rpHistoryItems = (messages, provenance) => messages.map((message, index) => ({ kind: 'context.history', id: 'rp-message-' + index,
    content: { ...message, role: message.role === 'system' ? 'user' : message.role }, provenance: [provenance] }));

/** Audience admission around the original compiler; no context/Memory writer. */
export class ContextPort {
    #contexts = new WeakMap();
    #rpSkills = new Map();
    #memoryDescriptors = new Map();
    #nativeOutputQuota = null;
    #sessionModelPolicy = null;
    #projectModelPolicy = null;
    #projectRoundPreviousSystem;
    #sessionGraphInputs = null;

    constructor({ sessionCore, projectAgent, projectCapture = null, projectDelegationCapture = null, projectDelegationHost = null, rpControl = null, rpCapture = null, rpReturnCapture = null, rpGraphResults = [], resultPort = null, rpDelegationCapture = null, sessionDelegationCapture = null, sessionDelegationHost = null, taskCapture = null, authorizeContext, contextOptions = {}, readMemoryEvidence, memoryAuthority = null, authorityTurn = null, resolverCapture = null, compilationInputs = null, nativeOutputQuota = null, sessionModelPolicy = null, projectModelPolicy = null, projectRoundPreviousSystem = undefined, sessionGraphInputs = null } = {}) {
        if (typeof authorizeContext !== 'function') fail('native_orchestration_context_authority_required');
        if (!Array.isArray(rpGraphResults) || new Set(rpGraphResults.map(hashNativeDocument)).size !== rpGraphResults.length
            || rpGraphResults.length && rpReturnCapture) fail('native_orchestration_context_authority_conflict');
        if ((rpReturnCapture || resultPort || rpGraphResults.length) && (!rpCapture || !(rpReturnCapture || rpGraphResults.length) || !(resultPort instanceof ResultPort)
            || resultPort.execution.sourcePort.rpControl !== rpControl)) fail('native_orchestration_context_authority_conflict');
        if ([authorityTurn, resolverCapture, projectCapture, projectDelegationCapture, rpCapture, rpDelegationCapture, sessionDelegationCapture, taskCapture].filter(Boolean).length > 1) fail('native_orchestration_context_authority_conflict');
        if ((rpDelegationCapture || sessionDelegationCapture || projectDelegationCapture) && (memoryAuthority || readMemoryEvidence || Object.keys(contextOptions).length || compilationInputs !== null || sessionGraphInputs !== null))
            fail('native_orchestration_context_delegation_scope_invalid');
        if (Boolean(sessionDelegationCapture) !== Boolean(sessionDelegationHost)
            || sessionDelegationCapture && (!(sessionDelegationHost instanceof NativeGenerationHost)
                || !(sessionDelegationHost.turnOrchestration instanceof NativeNarratorOrchestrationAuthority)
                || sessionDelegationHost.sessionCore !== sessionCore
                || sessionDelegationHost.persistence._engine !== sessionCore?._sessions?._engine))
            fail('native_orchestration_context_delegation_scope_invalid');
        if (Boolean(projectDelegationCapture) !== Boolean(projectDelegationHost)
            || projectDelegationCapture && (!(projectDelegationHost instanceof NativeGenerationHost)
                || !(projectDelegationHost.turnOrchestration instanceof NativeNarratorOrchestrationAuthority)
                || projectDelegationHost.agent !== projectAgent || projectDelegationHost.persistence._engine !== projectAgent?._repository?.engine))
            fail('native_orchestration_context_delegation_scope_invalid');
        if (memoryAuthority && (!(memoryAuthority instanceof NativeMemoryAuthority) || memoryAuthority.core !== sessionCore || readMemoryEvidence
            || !(memoryAuthority.settingsRepo instanceof SettingsRepo) || memoryAuthority.settingsRepo._engine !== sessionCore?._sessions?._engine))
            fail('native_orchestration_memory_authority_invalid');
        if (nativeOutputQuota) {
            fields(nativeOutputQuota, ['proof', 'expected'], 'Native output quota');
            const quota = assertNativeNarratorQuota(nativeOutputQuota.proof, nativeOutputQuota.expected);
            if (quota.sessionCore !== sessionCore || nativeOutputQuota.expected.host !== quota.host
                || projectCapture || projectDelegationCapture || rpCapture || rpDelegationCapture || sessionDelegationCapture || taskCapture || resolverCapture) fail('native_orchestration_context_authority_conflict');
            this.#nativeOutputQuota = Object.freeze({ proof: nativeOutputQuota.proof, expected: Object.freeze({ ...nativeOutputQuota.expected,
                anchor: immutable(nativeOutputQuota.expected.anchor), policy: immutable(nativeOutputQuota.expected.policy) }) });
        }
        if (sessionModelPolicy) {
            fields(sessionModelPolicy, ['fallbackMode', 'routes'], 'Native Session model policy');
            if (!(resolverCapture || nativeOutputQuota || sessionGraphInputs || sessionDelegationCapture) || projectCapture || rpCapture || rpDelegationCapture || taskCapture
                || !['disabled', 'automatic'].includes(sessionModelPolicy.fallbackMode) || !Array.isArray(sessionModelPolicy.routes)
                || !sessionModelPolicy.routes.length) fail('native_orchestration_context_authority_conflict');
            this.#sessionModelPolicy = immutable(sessionModelPolicy);
        }
        if (projectModelPolicy) {
            fields(projectModelPolicy, ['fallbackMode', 'routes'], 'Native Project model policy');
            if (!(projectCapture || projectDelegationCapture) || sessionModelPolicy || !['disabled', 'automatic'].includes(projectModelPolicy.fallbackMode)
                || !Array.isArray(projectModelPolicy.routes) || !projectModelPolicy.routes.length) fail('native_orchestration_context_authority_conflict');
            this.#projectModelPolicy = immutable(projectModelPolicy);
        }
        if (projectRoundPreviousSystem !== undefined && (!projectCapture || typeof projectRoundPreviousSystem !== 'string')) fail('native_orchestration_context_authority_conflict');
        this.#projectRoundPreviousSystem = projectRoundPreviousSystem;
        this.#sessionGraphInputs = sessionGraphInputs ? immutable(sessionGraphInputs) : null;
        Object.assign(this, { sessionCore, projectAgent, projectCapture, projectDelegationCapture, projectDelegationHost, rpControl, rpCapture, rpReturnCapture, rpGraphResults: immutable(rpGraphResults), resultPort, rpDelegationCapture, sessionDelegationCapture, sessionDelegationHost, taskCapture, authorizeContext, contextOptions: { ...contextOptions }, readMemoryEvidence, memoryAuthority, authorityTurn, resolverCapture, compilationInputs });
    }

    #request(handle, input) {
        fields(input, ['ownerRef', 'sourceBinding', 'audience', 'taskPurpose', 'grantDigest', 'inputRefs', 'tokenBudget'], 'Context compile request');
        fields(input.ownerRef, ['handle'], 'Context owner');
        if (input.ownerRef.handle !== handle) fail('native_orchestration_context_owner_mismatch');
        const { sourceBinding: binding, audience, tokenBudget } = input;
        if (!binding || !digest(binding.bindingDigest)
            || hashNativeDocument(Object.fromEntries(Object.entries(binding).filter(([key]) => key !== 'bindingDigest'))) !== binding.bindingDigest) fail('native_orchestration_context_source_invalid');
        fields(audience, ['kind', 'id'], 'Context audience');
        const resolver = this.resolverCapture !== null;
        if (!(this.taskCapture || this.rpDelegationCapture || this.sessionDelegationCapture || this.projectDelegationCapture ? audience.kind === 'task' : this.projectCapture ? audience.kind === 'project_task' : resolver ? audience.kind === 'authority_intent' : ['narrator', 'actor'].includes(audience.kind))
            || (['actor', 'project_task', 'task'].includes(audience.kind) ? typeof audience.id !== 'string' || !audience.id : audience.id !== undefined)) fail('native_orchestration_context_audience_invalid');
        if (resolver) inspectNativeAuthorityResolver(this.resolverCapture, { sessionCore: this.sessionCore, handle, sourceBinding: binding });
        if (this.rpDelegationCapture) {
            const identity = inspectNativeRpDelegationIdentity(this.rpDelegationCapture, { rpControl: this.rpControl, handle });
            if (audience.id !== identity.childRunId) fail('native_orchestration_context_audience_denied');
        }
        if (this.sessionDelegationCapture) {
            const identity = NativeNarratorOrchestrationAuthority.prototype.inspectDelegationIdentity.call(this.sessionDelegationHost.turnOrchestration,
                this.sessionDelegationCapture, { host: this.sessionDelegationHost, handle });
            if (audience.id !== identity.childRunId) fail('native_orchestration_context_audience_denied');
        }
        if (this.projectDelegationCapture) {
            const identity = NativeNarratorOrchestrationAuthority.prototype.inspectDelegationIdentity.call(this.projectDelegationHost.turnOrchestration,
                this.projectDelegationCapture, { host: this.projectDelegationHost, handle });
            if (audience.id !== identity.childRunId) fail('native_orchestration_context_audience_denied');
        }
        if (!digest(input.grantDigest) || typeof input.taskPurpose !== 'string' || !input.taskPurpose.trim() || !Array.isArray(input.inputRefs)) fail('native_orchestration_context_request_invalid');
        fields(tokenBudget, ['modelContextLimit', 'responseReserve'], 'Context token budget');
        if (!Number.isSafeInteger(tokenBudget.modelContextLimit) || !Number.isSafeInteger(tokenBudget.responseReserve)
            || tokenBudget.responseReserve < 0 || tokenBudget.modelContextLimit <= tokenBudget.responseReserve) fail('native_orchestration_context_budget_invalid');
        return immutable(input);
    }

    async #current(handle, request, phase, readInformation = true, finalizationPermit = null, projectRead = false) {
        // Delegation/grants are an original-domain decision, never inferred
        // from a model's audience string or an already compiled prompt.
        const permission = await this.authorizeContext({ handle, request, phase, ...(finalizationPermit ? { finalizationPermit } : {}) });
        if (permission?.allowed !== true || permission.grantDigest !== request.grantDigest) fail('native_orchestration_context_denied');
        const binding = request.sourceBinding;
        if (this.sessionDelegationCapture) {
            const sessionDelegation = await NativeNarratorOrchestrationAuthority.prototype.inspectDelegation.call(this.sessionDelegationHost.turnOrchestration,
                this.sessionDelegationCapture, { host: this.sessionDelegationHost, handle });
            const { context } = sessionDelegation;
            if (binding.sourceAuthority !== 'native_session' || hashNativeDocument(binding) !== hashNativeDocument(sessionDelegation.sourceBinding)
                || request.audience.kind !== 'task' || request.audience.id !== sessionDelegation.childRunId
                || request.taskPurpose !== 'original_native_session_delegated_analysis' || request.taskPurpose !== sessionDelegation.taskPurpose
                || request.grantDigest !== sessionDelegation.grantDigest
                || hashNativeDocument(request.inputRefs) !== hashNativeDocument(sessionDelegation.contextInputRefs)
                || context?.sourceAudience?.kind !== 'actor' || !context.task || !Array.isArray(context.results))
                fail('native_orchestration_context_delegation_scope_invalid');
            const ref = binding.sourceRef, snapshot = context.snapshot;
            if (snapshot?.session.sessionId !== ref.sessionId || snapshot.revision.branchId !== ref.branchId
                || snapshot.revision.revisionId !== ref.revisionId || !actorAvailability(snapshot, context.sourceAudience.id).available)
                fail('native_orchestration_context_source_stale');
            const information = informationContext(snapshot, context.sourceAudience);
            if (!information?.projection || information.projection.truncated || information.projection.availability.some(item => !item.available))
                fail('native_orchestration_context_audience_denied');
            const descriptor = { sourceBinding: binding, parentRunId: sessionDelegation.parentRunId,
                parentAttemptId: sessionDelegation.parentAttemptId, parentEpoch: sessionDelegation.parentEpoch,
                childRunId: sessionDelegation.childRunId, childEpoch: sessionDelegation.childEpoch, childPlanRef: sessionDelegation.childPlanRef,
                mode: sessionDelegation.mode, request: sessionDelegation.request, grantDigest: sessionDelegation.grantDigest,
                contextInputRefs: sessionDelegation.contextInputRefs, sourceAudience: context.sourceAudience,
                information, task: context.task, results: context.results,
                handoffReceiptRef: sessionDelegation.handoffReceiptRef, delegationReceiptRef: sessionDelegation.delegationReceiptRef,
                budgetReadyReceiptRef: sessionDelegation.budgetReadyReceiptRef };
            return { sessionDelegation, information, descriptor, authorityDigest: hashNativeDocument(descriptor) };
        }
        if (this.rpDelegationCapture) {
            if (!(this.rpControl instanceof RpRunControl)) fail('native_orchestration_context_domain_unavailable');
            const rpDelegation = await inspectNativeRpDelegation(this.rpDelegationCapture, { rpControl: this.rpControl, handle });
            if (binding.sourceAuthority !== 'rp_chat' || hashNativeDocument(binding) !== hashNativeDocument(rpDelegation.sourceBinding)
                || request.audience.kind !== 'task' || request.audience.id !== rpDelegation.childRunId
                || request.taskPurpose !== rpDelegation.taskPurpose || request.grantDigest !== rpDelegation.grantDigest
                || hashNativeDocument(request.inputRefs) !== hashNativeDocument(rpDelegation.contextInputRefs ?? rpDelegation.inputRefs)) fail('native_orchestration_context_denied');
            if (rpDelegation.context.messages.length !== 1 + (rpDelegation.delegatedSources?.length ?? 0) || rpDelegation.context.messages[0].role !== 'user'
                || typeof rpDelegation.context.messages[0].content !== 'string') fail('native_orchestration_context_delegation_scope_invalid');
            const authorityDigest = hashNativeDocument({ sourceBinding: rpDelegation.sourceBinding,
                parentRunId: rpDelegation.parentRunId, parentAttemptId: rpDelegation.parentAttemptId, parentEpoch: rpDelegation.parentEpoch,
                childRunId: rpDelegation.childRunId, childEpoch: rpDelegation.childEpoch, childPlanRef: rpDelegation.childPlanRef,
                handoffReceiptRef: rpDelegation.handoffReceiptRef, delegationReceiptRef: rpDelegation.delegationReceiptRef,
                budgetReadyReceiptRef: rpDelegation.budgetReadyReceiptRef,
                request: rpDelegation.request, grantDigest: rpDelegation.grantDigest, inputRefs: rpDelegation.contextInputRefs ?? rpDelegation.inputRefs,
                taskPurpose: rpDelegation.taskPurpose, context: rpDelegation.context });
            return { rpDelegation, authorityDigest };
        }
        if (this.rpCapture) {
            if (!(this.rpControl instanceof RpRunControl)) fail('native_orchestration_context_domain_unavailable');
            const rpIdentity = await inspectNativeRpGeneration(this.rpCapture, { rpControl: this.rpControl, handle });
            const expectedAudience = rpIdentity.audienceContext?.audience ?? { kind: 'narrator' };
            if (hashNativeDocument(request.audience) !== hashNativeDocument(expectedAudience)) fail('native_orchestration_context_audience_denied');
            if (binding.sourceAuthority !== 'rp_chat' || !binding.sourceRequest || hashNativeDocument(binding.sourceRequest) !== hashNativeDocument(rpIdentity.sourceRequest)
                || binding.sourceRef.controlId !== rpIdentity.sourceRequest.controlId || binding.sourceRef.prefixDigest !== rpIdentity.context.prefixDigest)
                fail('native_orchestration_context_source_mismatch');
            const parentResult = this.rpReturnCapture ? await ResultPort.prototype.readForParent.call(this.resultPort, handle, { capture: this.rpReturnCapture }) : null;
            await assertRpSkillContext(this.#rpSkills.get(hashNativeDocument(request)), { host: rpIdentity.host, handle });
            const graphResults = this.rpGraphResults.length ? await ResultPort.prototype.readForGraphResults.call(this.resultPort, handle, { capture: this.rpCapture, resultRefs: this.rpGraphResults }) : [];
            return { rpIdentity, parentResult, graphResults, authorityDigest: hashNativeDocument({ source: rpIdentity.sourceRequest, context: rpIdentity.context,
                ...(rpIdentity.audienceContext ? { audience: rpIdentity.audienceContext.descriptor } : {}),
                ...(graphResults.length ? { graphResults } : {}),
                ...(rpIdentity.controlTask ? { controlTask: rpIdentity.controlTask } : {}), ...(parentResult ? { parentResult } : {}) }) };
        }
        let projectDelegation = null;
        if (this.projectDelegationCapture) {
            projectDelegation = await NativeNarratorOrchestrationAuthority.prototype.inspectDelegation.call(this.projectDelegationHost.turnOrchestration,
                this.projectDelegationCapture, { host: this.projectDelegationHost, handle });
            if (binding.sourceAuthority !== 'project' || hashNativeDocument(binding) !== hashNativeDocument(projectDelegation.sourceBinding)
                || request.audience.kind !== 'task' || request.audience.id !== projectDelegation.childRunId
                || request.taskPurpose !== 'original_native_project_delegated_analysis' || request.taskPurpose !== projectDelegation.taskPurpose
                || request.grantDigest !== projectDelegation.grantDigest
                || hashNativeDocument(request.inputRefs) !== hashNativeDocument(projectDelegation.contextInputRefs))
                fail('native_orchestration_context_delegation_scope_invalid');
        }
        const currentProjectCapture = this.projectCapture ?? projectDelegation?.projectCapture;
        if (currentProjectCapture) {
            const projectIdentity = await inspectNativeProjectGeneration(currentProjectCapture, { projectAgent: this.projectAgent, handle });
            if (['compiled', 'send', 'consume'].includes(phase))
                await readNativeProjectSkillInventory(currentProjectCapture, { projectAgent: this.projectAgent, handle });
            if (binding.sourceAuthority !== 'project' || request.audience.id !== (projectDelegation?.childRunId ?? projectIdentity.taskId)
                || hashNativeDocument(binding.sourceRequest) !== hashNativeDocument(projectIdentity.sourceRequest)) fail('native_orchestration_context_source_mismatch');
            const original = await ProjectAgentService.prototype.observeModelContext.call(this.projectAgent, handle, projectIdentity.projectId, projectIdentity.taskId);
            if (projectDelegation && permission.projectToolPins?.length) fail('native_orchestration_context_denied');
            if (!Array.isArray(permission.projectToolPins)) fail('native_orchestration_context_denied');
            const names = new Set();
            const tools = permission.projectToolPins.map(pin => {
                const ref = pin.resourceRef, tool = original.tools.find(tool => tool.function.name === ref?.name);
                if (pin.port !== 'tool' || ref?.kind !== 'project_agent_tool' || ref.projectId !== projectIdentity.projectId || ref.taskId !== projectIdentity.taskId
                    || !tool || names.has(ref.name) || hashNativeDocument(tool) !== pin.integrity) fail('native_orchestration_context_denied');
                names.add(ref.name); return tool;
            });
            const modelContext = { ...original, tools, ...(permission.projectGraphTask ? { graphTask: immutable(permission.projectGraphTask) } : {}),
                    ...(permission.projectGraphItems?.length ? { graphItems: immutable(permission.projectGraphItems) } : {}),
                    ...(projectIdentity.workerStage ? { workerStage: { ...projectIdentity.workerStage,
                        ...(projectDelegation ? { task: projectDelegation.context.task } : {}) } } : {}),
                    ...(projectDelegation ? { graphItems: projectDelegation.context.results.map(item => ({ kind: 'context.history',
                        content: { role: 'user', content: item.content }, provenance: [{ source: 'native.project-child', ref: hashNativeDocument(item.resultRef ?? item.controlRef) }] })) } : {}) }, { task, project, registry } = modelContext;
            const attempt = task.attempts.find(item => item.attemptId === projectIdentity.projectAttemptId && item.kind === 'generation');
            if (task.executionFingerprint !== (projectRead ? projectIdentity.currentSourceFingerprint : projectIdentity.sourceFingerprint)
                || hashNativeDocument(task.conversation) !== projectIdentity.conversationDigest
                || task.baseRevision !== projectIdentity.revision || project.revision.revision !== projectIdentity.revision
                || attempt?.status !== 'started' || attempt.requestId !== (projectIdentity.originalRequestId ?? projectIdentity.requestId)) fail('native_orchestration_context_source_stale');
            const accepted = projectRead ? projectIdentity.toolReceipts : [];
            let fingerprint = projectIdentity.sourceFingerprint;
            for (const receipt of accepted) {
                if (receipt.fromFingerprint !== fingerprint || receipt.sourceBindingDigest !== binding.bindingDigest
                    || !attempt.calls.some(call => hashNativeDocument(call.nativeReceipt ?? null) === hashNativeDocument(receipt))) fail('native_orchestration_context_source_stale');
                fingerprint = receipt.toFingerprint;
            }
            if (projectRead && fingerprint !== task.executionFingerprint) fail('native_orchestration_context_source_stale');
            const calls = attempt.calls.filter(call => !accepted.some(receipt => hashNativeDocument(call.nativeReceipt ?? null) === hashNativeDocument(receipt)));
            const projectDigest = hashNativeDocument({ sourceFingerprint: projectRead ? projectIdentity.sourceFingerprint : task.executionFingerprint, conversation: task.conversation,
                attempt: { attemptId: attempt.attemptId, kind: attempt.kind, status: attempt.status, requestId: attempt.requestId, calls },
                project, registry, tools, ...(permission.projectGraphTask ? { graphTask: permission.projectGraphTask } : {}),
                ...(modelContext.graphItems ? { graphItems: modelContext.graphItems } : {}), ...(modelContext.workerStage ? { workerStage: modelContext.workerStage } : {}), ...(projectDelegation ? { delegation: { parentRunId: projectDelegation.parentRunId, childRunId: projectDelegation.childRunId, contextInputRefs: projectDelegation.contextInputRefs, mode: projectDelegation.mode, handoffReceiptRef: projectDelegation.handoffReceiptRef, delegationReceiptRef: projectDelegation.delegationReceiptRef, budgetReadyReceiptRef: projectDelegation.budgetReadyReceiptRef } } : {}), toolPins: permission.projectToolPins, toolBatchPolicy: PROJECT_TOOL_BATCH_POLICY, skillWorkRecords: projectIdentity.skillWorkRecords });
            return { modelContext, projectIdentity, projectCapture: currentProjectCapture, projectDelegation, authorityDigest: projectDigest, information: null };
        }
        if (binding.sourceAuthority !== 'native_session' || !this.sessionCore) fail('native_orchestration_context_domain_unavailable');
        const committed = await this.sessionCore.observe(handle, binding.sourceRef.sessionId);
        const { session, revision } = committed, expected = binding.sourceRef;
        if (session.sessionId !== expected.sessionId || revision.branchId !== expected.branchId || revision.revisionId !== expected.revisionId
            || (expected.packageVersionId !== undefined && session.packageVersionId !== expected.packageVersionId)) fail('native_orchestration_context_source_stale');
        let snapshot = committed, authorityContext = null, authorityDigest = null;
        let taskIdentity = null;
        if (this.taskCapture) {
            taskIdentity = await inspectNativeBackgroundGeneration(this.taskCapture, { sessionCore: this.sessionCore, handle });
            if (request.audience.id !== taskIdentity.input.taskId || hashNativeDocument(taskIdentity.sourceRequest) !== hashNativeDocument(binding.sourceRequest))
                fail('native_orchestration_context_source_mismatch');
            if (hashNativeDocument(taskIdentity.taskPlan.task.context) === hashNativeDocument(['input'])) {
                // An authored input-only Task has no Information view and must
                // never fall through to Session history, Knowledge or Memory.
                authorityDigest = hashNativeDocument({ sourceBindingDigest: binding.bindingDigest, task: taskIdentity.taskPlan.task,
                    variant: taskIdentity.taskPlan.variant, input: taskIdentity.taskPlan.payload });
                return { snapshot, information: null, authorityContext: null, authorityDigest, taskIdentity, taskInputOnly: true };
            }
        }
        if (this.resolverCapture) {
            const captured = inspectNativeAuthorityResolver(this.resolverCapture, { sessionCore: this.sessionCore, handle, sourceBinding: binding });
            if (hashNativeDocument(committed) !== captured.baseDigest) fail('native_orchestration_context_source_stale');
            return { snapshot, information: null, authorityContext: null, authorityDigest: captured.baseDigest, resolver: captured };
        }
        if (this.authorityTurn) {
            const { base, proof } = this.authorityTurn;
            if (base.session.sessionId !== session.sessionId || base.revision.branchId !== revision.branchId || base.revision.revisionId !== revision.revisionId)
                fail('native_orchestration_context_source_stale');
            const original = authorityTurnProof(this.sessionCore, handle, base, proof);
            snapshot = original.prepared.candidate;
            authorityContext = { mode: 'narrator', receipt: original.prepared.receipt };
            authorityDigest = hashNativeDocument({ candidate: snapshot, receipt: original.prepared.receipt, identity: original.prepared.identity });
        }
        const information = readInformation ? informationContext(snapshot, request.audience, taskIdentity?.input.taskId, this.authorityTurn ? { includeRollups: false } : {}) : null;
        // Missing Information must not fall through to compiler's broad raw
        // history path. A declared, available context exposure is mandatory.
        if (readInformation && (!information?.projection || (request.audience.kind === 'actor' && !actorAvailability(snapshot, request.audience.id).available)
            || information.projection.availability.some(item => !item.available))) fail('native_orchestration_context_audience_denied');
        return { snapshot, information, authorityContext, authorityDigest, taskIdentity };
    }

    // Short-lived actual compiler inputs, never a persisted snapshot or a
    // caller's claimed byte count. Projection/compilation still happen only
    // inside the admitted work; this pure read establishes its input bound.
    async compilationDescriptor(handle, input) {
        const request = this.#request(handle, input);
        const { snapshot, authorityContext, resolver, modelContext, projectIdentity, rpIdentity, rpDelegation, sessionDelegation, descriptor: sessionDelegationDescriptor, parentResult, graphResults, taskIdentity, taskInputOnly } = await this.#current(handle, request, 'compile_descriptor', false);
        if (taskInputOnly) return { request, taskPlan: taskIdentity.taskPlan };
        if (sessionDelegation) return { request, ...sessionDelegationDescriptor };
        if (rpDelegation) return { request, source: rpDelegation.sourceRequest, context: rpDelegation.context,
            parentRunId: rpDelegation.parentRunId, parentAttemptId: rpDelegation.parentAttemptId, parentEpoch: rpDelegation.parentEpoch,
            childRunId: rpDelegation.childRunId, childEpoch: rpDelegation.childEpoch, childPlanRef: rpDelegation.childPlanRef,
            handoffReceiptRef: rpDelegation.handoffReceiptRef, delegationReceiptRef: rpDelegation.delegationReceiptRef,
            budgetReadyReceiptRef: rpDelegation.budgetReadyReceiptRef };
        if (rpIdentity) {
            const memoryDescriptor = !this.memoryAuthority ? null : rpIdentity.audienceContext
                ? await NativeMemoryAuthority.prototype.contextDescriptor.call(this.memoryAuthority, handle, rpIdentity.audienceContext.snapshot)
                : await NativeMemoryAuthority.prototype.rpContextDescriptor.call(this.memoryAuthority, handle, this.rpControl, rpIdentity.sourceRequest);
            if (memoryDescriptor) this.#memoryDescriptors.set(hashNativeDocument(request), memoryDescriptor);
            return { request, source: rpIdentity.sourceRequest, context: rpIdentity.context, memoryDescriptor,
                ...(rpIdentity.audienceContext ? { audienceSource: rpIdentity.audienceContext.descriptor, audienceSnapshot: rpIdentity.audienceContext.snapshot } : {}),
                skills: this.#rpSkills.get(hashNativeDocument(request))?.items ?? [],
                ...(rpIdentity.controlTask ? { controlTask: rpIdentity.controlTask } : {}), ...(parentResult ? { parentResult } : {}), ...(graphResults.length ? { graphResults } : {}) };
        }
        if (projectIdentity) return { request, modelContext: projectAgentPromptInputs(modelContext), ...(this.#projectRoundPreviousSystem !== undefined ? { previousSystem: this.#projectRoundPreviousSystem } : {}), ...(modelContext.graphTask ? { graphTask: modelContext.graphTask } : {}),
            ...(modelContext.graphItems ? { graphItems: modelContext.graphItems } : {}), ...(modelContext.workerStage ? { workerStage: modelContext.workerStage } : {}), skillWorkRecords: projectIdentity.skillWorkRecords };
        if (resolver) {
            const installed = await this.#resolverPackage(handle, snapshot);
            return { request, snapshot, logicalDescriptor: resolver.logicalDescriptor, ...packageInputs(installed), contextOptions: this.contextOptions };
        }
        const memoryDescriptor = this.memoryAuthority ? await NativeMemoryAuthority.prototype.contextDescriptor.call(this.memoryAuthority, handle, snapshot) : null;
        if (memoryDescriptor) this.#memoryDescriptors.set(hashNativeDocument(request), memoryDescriptor);
        return { request, snapshot, authorityContext, contextOptions: this.contextOptions, compilationInputs: this.compilationInputs, memoryDescriptor, sessionGraphInputs: this.#sessionGraphInputs };
    }

    async #resolverPackage(handle, snapshot) {
        const { packageId, packageVersionId, entryPointId } = snapshot.session;
        const installed = await this.sessionCore._openPackage(handle, packageId, packageVersionId, entryPointId);
        if (hashNativeDocument(installed.manifest) !== hashNativeDocument(snapshot.manifest)
            || installed.entryPoint.entryPointId !== entryPointId
            || hashNativeDocument(installed.entryPoint) !== hashNativeDocument(snapshot.manifest.entryPoints.find(item => item.entryPointId === entryPointId)))
            fail('native_orchestration_context_source_stale');
        return installed;
    }

    /** Observation only: pins of instructions in this instance's actual compiled Context. */
    async inspectRpSkillConsumption(handle, { context }) {
        const saved = this.#contexts.get(context);
        if (!saved || saved.handle !== handle || !saved.rp || !this.rpCapture) fail('native_orchestration_context_unknown');
        const { rpIdentity } = await this.#current(handle, saved.request, 'consume');
        const captured = this.#rpSkills.get(hashNativeDocument(saved.request));
        if (!captured?.alwaysPins.length) return null;
        const { locator } = await RpRunControl.prototype.status.call(this.rpControl, handle, rpIdentity.sourceRequest.controlId);
        return immutable({ scope: { domain: 'rp_chat', charDir: locator.charDir, name: locator.name,
            isGroup: locator.isGroup, groupId: locator.groupId ?? '' }, pins: captured.alwaysPins, capturedAt: captured.capturedAt,
        contextId: context.contextId, sourceBindingDigest: saved.request.sourceBinding.bindingDigest });
    }

    async prepareRpSkills(handle, input, work) {
        const request = this.#request(handle, input);
        if (!this.rpCapture) return;
        const { rpIdentity } = await this.#current(handle, request, 'skill_inventory');
        if (rpIdentity.audienceContext?.audience.kind === 'actor') return;
        const current = await this.rpControl.status(handle, rpIdentity.sourceRequest.controlId);
        const captured = await prepareRpSkillContext({ host: rpIdentity.host, handle, locator: current.locator, work });
        this.#rpSkills.set(hashNativeDocument(request), captured);
        await this.#current(handle, request, 'skill_loaded');
    }

    async compile(handle, input, retrieval) {
        const request = this.#request(handle, input);
        const { snapshot, information, authorityDigest, resolver, modelContext, projectIdentity, projectCapture, projectDelegation, rpIdentity, taskIdentity, taskInputOnly, rpDelegation, sessionDelegation, parentResult, graphResults } = await this.#current(handle, request, 'compile');
        if (sessionDelegation) {
            const { context: delegated } = sessionDelegation, ref = request.sourceBinding.sourceRef;
            const source = { kind: 'session', sessionId: ref.sessionId, branchId: ref.branchId, revisionId: ref.revisionId };
            const selected = emptyNativeContextPlan(sessionDelegation.request, { model: { limits: {
                contextTokens: request.tokenBudget.modelContextLimit, outputTokens: request.tokenBudget.responseReserve } } }, source);
            const scoped = await compileNativeContextPlan(delegated.snapshot, { ...request.tokenBudget,
                target: delegated.sourceAudience, memoryEvidence: [], playerPersona: { enabled: false } });
            const plan = { ...selected, items: [...scoped.included.map(item => ({ kind: 'context.history', id: 'delegated-audience:' + item.contextItemId,
                content: { role: 'user', content: item.content }, provenance: [{ source: 'native.context', ref: item.contextItemId },
                    ...(item.sourceRefs ?? []).map(ref => ({ source: 'native.context-source', ref: JSON.stringify(ref) }))] })),
            { kind: 'context.input', id: 'native-delegated-task', content: JSON.stringify(delegated.task),
                provenance: [{ source: 'native.session-delegation', ref: hashNativeDocument(delegated.task) }] },
            ...delegated.results.map(item => ({ kind: 'context.history', id: 'delegated-result:' + (item.resultRef?.resultId ?? item.controlRef.receiptId),
                content: { role: 'user', content: item.content }, provenance: [{ source: 'native.session-graph-result', ref: hashNativeDocument(item.resultRef ?? item.controlRef) }] }))] };
            if ((await this.#current(handle, request, 'compiled')).authorityDigest !== authorityDigest) fail('native_orchestration_context_source_stale');
            const proof = { sourceBindingDigest: request.sourceBinding.bindingDigest, grantDigest: request.grantDigest,
                audienceDigest: hashNativeDocument(request.audience), projectionDigest: hashNativeDocument(information.projection), authorityDigest };
            const context = immutable({ schemaVersion: 1, contextId: hashNativeDocument({ request, plan, proof }), request, plan,
                evidenceRefs: [request.sourceBinding.sourceRef, ...delegated.results.flatMap(item => item.sourceRefs)], currentnessProof: proof });
            this.#contexts.set(context, { handle, request, proof, sessionDelegation: { request: sessionDelegation.request } });
            return context;
        }
        if (rpDelegation) {
            const source = { kind: 'rp_chat', controlId: rpDelegation.sourceRequest.controlId };
            const selected = emptyNativeContextPlan(rpDelegation.request, { model: { limits: {
                contextTokens: request.tokenBudget.modelContextLimit, outputTokens: request.tokenBudget.responseReserve } } }, source);
            const plan = { ...selected, items: [
                ...rpHistoryItems(rpDelegation.context.messages, { source: 'native.rp-delegation',
                    ref: hashNativeDocument({ source: rpDelegation.sourceRequest, childRunId: rpDelegation.childRunId }) }),
                ...(rpDelegation.context.graphItems ?? []),
                ...(rpDelegation.context.task ? [{ kind: 'context.input', id: 'native-rp-delegated-task',
                    content: JSON.stringify(rpDelegation.context.task),
                    provenance: [{ source: 'native.rp-delegated-task', ref: hashNativeDocument(rpDelegation.context.task) }] }] : []),
            ] };
            const after = await this.#current(handle, request, 'compiled');
            if (after.authorityDigest !== authorityDigest) fail('native_orchestration_context_source_stale');
            const proof = { sourceBindingDigest: request.sourceBinding.bindingDigest, grantDigest: request.grantDigest,
                audienceDigest: hashNativeDocument(request.audience), projectionDigest: authorityDigest, authorityDigest };
            const context = immutable({ schemaVersion: 1, contextId: hashNativeDocument({ request, plan, proof }), request, plan,
                evidenceRefs: [rpDelegation.sourceBinding.sourceRef, ...(rpDelegation.context.sourceRefs ?? [])], currentnessProof: proof });
            this.#contexts.set(context, { handle, request, proof, rpDelegation: { request: rpDelegation.request } });
            return context;
        }
        if (rpIdentity) {
            const descriptorKey = hashNativeDocument(request), expectedDescriptor = this.#memoryDescriptors.get(descriptorKey);
            this.#memoryDescriptors.delete(descriptorKey);
            const recall = !this.memoryAuthority ? null : rpIdentity.audienceContext
                ? await NativeMemoryAuthority.prototype.recallContext.call(this.memoryAuthority, handle, { snapshot: rpIdentity.audienceContext.snapshot,
                    requester: request.audience, tokenBudget: request.tokenBudget, countTokens: this.contextOptions.countTokens,
                    expectedDescriptor, retrieval, assertCurrent: () => this.#current(handle, request, 'recall') })
                : await NativeMemoryAuthority.prototype.recallRpContext.call(this.memoryAuthority, handle, {
                    control: this.rpControl, request: rpIdentity.sourceRequest, tokenBudget: request.tokenBudget, countTokens: this.contextOptions.countTokens,
                    expectedDescriptor, retrieval, assertCurrent: () => this.#current(handle, request, 'recall') });
            const source = { kind: 'rp_chat', controlId: rpIdentity.sourceRequest.controlId };
            const selected = emptyNativeContextPlan(rpIdentity.request, { model: { limits: {
                contextTokens: request.tokenBudget.modelContextLimit, outputTokens: request.tokenBudget.responseReserve } } }, source);
            const scoped = rpIdentity.audienceContext ? await compileNativeContextPlan(rpIdentity.audienceContext.snapshot,
                { ...request.tokenBudget, target: request.audience, memoryEvidence: recall?.evidence ?? [], playerPersona: { enabled: false } }) : null;
            const plan = { ...selected, items: [...(this.#rpSkills.get(hashNativeDocument(request))?.items ?? []), ...rpHistoryItems(rpIdentity.context.messages, { source: 'native.rp-chat', ref: rpIdentity.context.prefixDigest }),
                ...(scoped?.included ?? []).map(item => ({ kind: 'context.history', id: 'audience:' + item.contextItemId,
                    content: { role: 'user', content: item.content }, provenance: [{ source: 'native.context', ref: item.contextItemId },
                        ...(item.sourceRefs ?? []).map(ref => ({ source: 'native.context-source', ref: JSON.stringify(ref) }))] })),
                ...(!rpIdentity.audienceContext ? recall?.evidence ?? [] : []).map(item => ({ kind: 'context.history', id: item.memoryId, content: { role: 'user', content: item.content },
                    provenance: [{ source: 'native.rp-memory', ref: item.memoryId }] })), ...(parentResult ? [parentResult.item] : []), ...graphResults.map(item => item.item),
                ...(rpIdentity.controlTask ? [{ kind: 'context.input', id: 'native-graph-task', content: JSON.stringify(rpIdentity.controlTask),
                    provenance: [{ source: 'native.rp-graph-task', ref: hashNativeDocument(rpIdentity.controlTask) }] }] : [])] };
            const after = await this.#current(handle, request, 'compiled');
            if (after.authorityDigest !== authorityDigest) fail('native_orchestration_context_source_stale');
            if (recall) {
                if (rpIdentity.audienceContext) await NativeMemoryAuthority.prototype.assertContextRecall.call(this.memoryAuthority, handle,
                    recall.proof, rpIdentity.audienceContext.snapshot, request.audience);
                else await NativeMemoryAuthority.prototype.assertRpContextRecall.call(this.memoryAuthority, handle, recall.proof, this.rpControl, rpIdentity.sourceRequest);
            }
            const proof = { sourceBindingDigest: request.sourceBinding.bindingDigest, grantDigest: request.grantDigest,
                audienceDigest: hashNativeDocument(request.audience), projectionDigest: authorityDigest, authorityDigest };
            const context = immutable({ schemaVersion: 1, contextId: hashNativeDocument({ request, plan, proof }), request, plan,
                evidenceRefs: (recall?.evidence ?? []).flatMap(item => item.sourceRefs), currentnessProof: proof });
            this.#contexts.set(context, { handle, request, proof, rp: { request: rpIdentity.request,
                ...(rpIdentity.audienceContext ? { audienceSource: rpIdentity.audienceSource, snapshot: rpIdentity.audienceContext.snapshot } : {}) },
            memoryProof: recall?.proof, memoryDescriptorDigest: expectedDescriptor && !rpIdentity.audienceContext ? hashNativeDocument(expectedDescriptor) : null });
            return context;
        }
        if (projectIdentity) {
            const skillEntries = await readNativeProjectSkillInventory(projectCapture, { projectAgent: this.projectAgent, handle });
            const toolBatchPolicy = { ...PROJECT_TOOL_BATCH_POLICY,
                proposalToolNames: modelContext.tools.map(tool => tool.function.name).filter(name => projectToolCapability(name) === 'project.propose') };
            const round = buildNativeProjectModelRound({ context: modelContext, skillEntries, tools: modelContext.tools, toolBatchPolicy, previousSystem: this.#projectRoundPreviousSystem });
            if (modelContext.workerStage) round.messages.push({ role: 'user', content: JSON.stringify(modelContext.workerStage.task) });
            if (modelContext.graphItems) round.messages.push(...modelContext.graphItems.map(item => item.content));
            if (modelContext.graphTask) round.messages.push({ role: 'user', content: JSON.stringify({ kind: 'native_project_graph_task', ...modelContext.graphTask }) });
            const fixedRequest = immutable({ ...projectIdentity.request, tools: round.tools,
                ...(this.#projectModelPolicy?.fallbackMode === 'automatic' ? { fallbackMode: 'automatic' } : {}) });
            const source = { kind: 'task', projectId: projectIdentity.projectId, taskId: projectIdentity.taskId, revision: projectIdentity.revision };
            const selected = emptyNativeContextPlan(fixedRequest, { model: { limits: { contextTokens: request.tokenBudget.modelContextLimit, outputTokens: request.tokenBudget.responseReserve } } }, source);
            const plan = { ...selected, items: round.messages.map((message, index) => ({ kind: 'context.history', id: 'task-message-' + index,
                content: message, provenance: [{ source: 'host.task' }] })) };
            const after = await this.#current(handle, request, 'compiled');
            if (after.authorityDigest !== authorityDigest) fail('native_orchestration_context_source_stale');
            const proof = { sourceBindingDigest: request.sourceBinding.bindingDigest, grantDigest: request.grantDigest,
                audienceDigest: hashNativeDocument(request.audience), projectionDigest: authorityDigest, authorityDigest };
            const context = immutable({ schemaVersion: 1, contextId: hashNativeDocument({ request, plan, proof }), request, plan, evidenceRefs: [], currentnessProof: proof });
            this.#contexts.set(context, { handle, request, proof, project: { request: fixedRequest, capture: projectCapture, delegation: Boolean(projectDelegation), round: immutable(round), runtime: modelContext.project.source.package.runtime ?? null } });
            return context;
        }
        if (resolver) {
            const installed = await this.#resolverPackage(handle, snapshot);
            const original = resolverRequest(await authorityCatalog(snapshot, installed), buildAuthorityObservation(snapshot), snapshot.timeline.at(-1).content);
            const ref = request.sourceBinding.sourceRef, source = { kind: 'session', sessionId: ref.sessionId, branchId: ref.branchId, revisionId: ref.revisionId };
            const fixedRequest = immutable({ ...resolver.request, tools: original.tools,
                ...(this.#sessionModelPolicy?.fallbackMode === 'automatic' ? { fallbackMode: 'automatic' } : {}) });
            const selected = emptyNativeContextPlan(fixedRequest, { model: { limits: { contextTokens: request.tokenBudget.modelContextLimit, outputTokens: request.tokenBudget.responseReserve } } }, source);
            const plan = authorityContextPlan(selected, snapshot, { mode: 'resolver', payload: original.payload });
            await this.#current(handle, request, 'compiled');
            const packageDigest = packageDigestOf(installed);
            if (packageDigestOf(await this.#resolverPackage(handle, snapshot)) !== packageDigest) fail('native_orchestration_context_source_stale');
            const proof = { sourceBindingDigest: request.sourceBinding.bindingDigest, grantDigest: request.grantDigest,
                audienceDigest: hashNativeDocument(request.audience), projectionDigest: hashNativeDocument(original.payload.observation), authorityDigest, packageDigest };
            const context = immutable({ schemaVersion: 1, contextId: hashNativeDocument({ request, plan, proof }), request, plan, evidenceRefs: [], currentnessProof: proof });
            this.#contexts.set(context, { handle, request, proof, resolver: { request: fixedRequest, select: original.select } });
            return context;
        }
        if (taskInputOnly) {
            const ref = request.sourceBinding.sourceRef, source = { kind: 'session', sessionId: ref.sessionId, branchId: ref.branchId, revisionId: ref.revisionId };
            const plan = emptyNativeContextPlan(taskIdentity.request, { model: { limits: {
                contextTokens: request.tokenBudget.modelContextLimit, outputTokens: request.tokenBudget.responseReserve } } }, source);
            if ((await this.#current(handle, request, 'compiled')).authorityDigest !== authorityDigest) fail('native_orchestration_context_source_stale');
            const proof = { sourceBindingDigest: request.sourceBinding.bindingDigest, grantDigest: request.grantDigest,
                audienceDigest: hashNativeDocument(request.audience), projectionDigest: hashNativeDocument(null), authorityDigest };
            const context = immutable({ schemaVersion: 1, contextId: hashNativeDocument({ request, plan, proof }), request, plan, evidenceRefs: [], currentnessProof: proof });
            this.#contexts.set(context, { handle, request, proof, task: { request: taskIdentity.request, taskPlan: taskIdentity.taskPlan, inputOnly: true } });
            return context;
        }
        const descriptorKey = hashNativeDocument(request), expectedDescriptor = this.#memoryDescriptors.get(descriptorKey);
        this.#memoryDescriptors.delete(descriptorKey);
        const recall = this.memoryAuthority ? await NativeMemoryAuthority.prototype.recallContext.call(this.memoryAuthority, handle, {
            snapshot, requester: request.audience, informationTaskId: taskIdentity?.input.taskId, tokenBudget: request.tokenBudget, countTokens: this.contextOptions.countTokens,
            expectedDescriptor, retrieval, assertCurrent: () => this.#current(handle, request, 'recall') }) : null;
        const memoryEvidence = recall?.evidence ?? (this.readMemoryEvidence ? await this.readMemoryEvidence({ handle, request, snapshot, information }) : this.contextOptions.memoryEvidence ?? []);
        let plan = await compileNativeContextPlan(snapshot, { ...this.contextOptions, ...request.tokenBudget,
            target: taskIdentity ? { kind: 'narrator' } : request.audience, informationTaskId: taskIdentity?.input.taskId, memoryEvidence, authorityTurn: Boolean(this.authorityTurn) });
        if (this.#sessionGraphInputs) plan = { ...plan, included: [...plan.included,
            { contextItemId: 'native-session-graph-task', lane: 'runtime_system', content: JSON.stringify(this.#sessionGraphInputs.task), sourceRefs: [] },
            ...this.#sessionGraphInputs.results.map(item => ({ contextItemId: 'native-session-graph-result:' + (item.resultRef?.resultId ?? item.reviewReceiptRef?.receiptId ?? item.controlRef.attemptId),
                lane: 'recent_raw', content: item.content, sourceRefs: item.sourceRefs }))] };
        // Asynchronous retrieval/derivation can outlive Source or grants.
        await this.#current(handle, request, 'compiled');
        if (recall) await NativeMemoryAuthority.prototype.assertContextRecall.call(this.memoryAuthority, handle, recall.proof, snapshot, request.audience);
        const proof = { sourceBindingDigest: request.sourceBinding.bindingDigest, grantDigest: request.grantDigest,
            audienceDigest: hashNativeDocument(request.audience), projectionDigest: hashNativeDocument(information.projection), authorityDigest };
        const context = immutable({ schemaVersion: 1, contextId: hashNativeDocument({ request, plan, proof }), request, plan,
            evidenceRefs: plan.included.flatMap(item => item.sourceRefs ?? []), currentnessProof: proof });
        this.#contexts.set(context, { handle, request, proof, memoryProof: recall?.proof,
            outputSnapshot: this.#nativeOutputQuota ? immutable(snapshot) : null,
            taskSnapshot: taskIdentity ? immutable(snapshot) : null,
            task: taskIdentity ? { request: taskIdentity.request, taskPlan: taskIdentity.taskPlan } : null });
        return context;
    }

    async revalidate(handle, { context, phase, audience = context?.request?.audience } = {}) {
        if (!['send', 'consume'].includes(phase)) fail('native_orchestration_context_proof_invalid');
        return this.#revalidateContext(handle, { context, phase, audience });
    }

    #nativeOutputContext(handle, context) {
        const captured = this.#contexts.get(context), quota = this.#nativeOutputQuota;
        if (!captured || captured.handle !== handle || !quota || captured.request.sourceBinding.sourceAuthority !== 'native_session'
            || captured.request.audience.kind !== 'narrator' || captured.request.taskPurpose !== 'original_native_narrator') fail('native_orchestration_context_proof_invalid');
        const ref = captured.request.sourceBinding.sourceRef, input = captured.request.inputRefs[0], expected = quota.expected;
        if (ref.sessionId !== expected.sessionId || ref.branchId !== expected.anchor.branchId || ref.revisionId !== expected.anchor.revisionId
            || captured.request.inputRefs.length !== 1 + (this.#sessionGraphInputs?.results.filter(item => item.resultRef || item.controlRef).length ?? 0)
            || this.#sessionGraphInputs && (hashNativeDocument(captured.request.inputRefs.slice(1)) !== hashNativeDocument([...this.#sessionGraphInputs.results.flatMap(item => item.resultRef ? [item.resultRef] : []), ...this.#sessionGraphInputs.results.flatMap(item => item.controlRef ? [item.controlRef] : [])])
                || hashNativeDocument(input.acceptedGraphResultRefs) !== hashNativeDocument(this.#sessionGraphInputs.results.flatMap(item => item.resultRef ? [item.resultRef] : []))
                || hashNativeDocument(input.acceptedControlRefs ?? []) !== hashNativeDocument(this.#sessionGraphInputs.results.flatMap(item => item.controlRef ? [item.controlRef] : [])))
            || input.kind !== 'native_turn_intent' || input.role !== 'narrator'
            || input.invocationId !== expected.invocationId || input.requestHash !== expected.requestHash || expected.handle !== handle)
            fail('native_orchestration_context_source_mismatch');
        return quota;
    }

    captureNativeOutputFinalization(handle, request) {
        fields(request, ['context', 'finalizationBoundary'], 'Native Context finalizer');
        const quota = this.#nativeOutputContext(handle, request.context);
        return captureNativeTurnOutputFinalization(quota.proof, { host: quota.expected.host, handle, finalizationBoundary: request.finalizationBoundary });
    }

    async revalidateNativeOutput(handle, request) {
        fields(request, ['context', 'finalizationPermit'], 'Native output Context');
        const quota = this.#nativeOutputContext(handle, request.context);
        assertNativeTurnOutputQuota(quota.proof, request.finalizationPermit, quota.expected);
        return this.#revalidateContext(handle, { context: request.context, phase: 'output', audience: request.context.request.audience,
            finalizationPermit: request.finalizationPermit });
    }

    async revalidateNativeOutputCommit(handle, request) {
        fields(request, ['context', 'finalizationPermit', 'committed'], 'Committed Native output Context');
        const { context, finalizationPermit, committed } = request, quota = this.#nativeOutputContext(handle, context);
        const captured = this.#contexts.get(context), input = captured.request.inputRefs[0];
        const expected = { repo: this.sessionCore._sessions, handle, sessionId: quota.expected.sessionId,
            branchId: quota.expected.anchor.branchId, expectedRevisionId: quota.expected.anchor.revisionId,
            invocationId: input.invocationId, requestHash: input.requestHash };
        const check = async () => {
            assertNativeTurnOutputQuota(quota.proof, finalizationPermit, quota.expected);
            const own = inspectSessionTurnOutput(committed, expected);
            const now = await this.sessionCore.observe(handle, expected.sessionId);
            if (now.revision.revisionId !== own.revisionId || now.revision.branchId !== own.branchId) fail('native_orchestration_context_source_stale');
            return own;
        };
        await check();
        const permission = await this.authorizeContext({ handle, request: captured.request, phase: 'output_committed', finalizationPermit, committed });
        if (permission?.allowed !== true || permission.grantDigest !== captured.request.grantDigest) fail('native_orchestration_context_denied');
        const snapshot = captured.outputSnapshot;
        if (!snapshot || hashNativeDocument(informationContext(snapshot, captured.request.audience, undefined, this.authorityTurn ? { includeRollups: false } : {}).projection) !== captured.proof.projectionDigest)
            fail('native_orchestration_context_source_stale');
        if (this.authorityTurn) {
            const original = authorityTurnProof(this.sessionCore, handle, this.authorityTurn.base, this.authorityTurn.proof);
            if (hashNativeDocument({ candidate: original.prepared.candidate, receipt: original.prepared.receipt, identity: original.prepared.identity }) !== captured.proof.authorityDigest)
                fail('native_orchestration_context_source_stale');
        }
        if (captured.memoryProof) await NativeMemoryAuthority.prototype.assertContextRecall.call(this.memoryAuthority, handle, captured.memoryProof, snapshot, captured.request.audience);
        await check();
        return context.plan;
    }

    async #revalidateContext(handle, { context, phase, audience, finalizationPermit = null }) {
        const captured = this.#contexts.get(context);
        if (!captured || captured.handle !== handle) fail('native_orchestration_context_proof_invalid');
        if (hashNativeDocument(audience) !== captured.proof.audienceDigest) fail('native_orchestration_context_audience_mismatch');
        const { information, authorityDigest, snapshot, rpIdentity } = await this.#current(handle, captured.request, phase, true, finalizationPermit);
        if (captured.project || captured.rp || captured.rpDelegation || captured.sessionDelegation || captured.task?.inputOnly) {
            if (authorityDigest !== captured.proof.authorityDigest) fail('native_orchestration_context_source_stale');
            if (captured.rp && captured.memoryProof) {
                if (rpIdentity.audienceContext) await NativeMemoryAuthority.prototype.assertContextRecall.call(this.memoryAuthority, handle,
                    captured.memoryProof, rpIdentity.audienceContext.snapshot, captured.request.audience);
                else await NativeMemoryAuthority.prototype.assertRpContextRecall.call(this.memoryAuthority, handle,
                    captured.memoryProof, this.rpControl, captured.request.sourceBinding.sourceRequest);
            }
            return context.plan;
        }
        if (captured.resolver) {
            if (authorityDigest !== captured.proof.authorityDigest
                || packageDigestOf(await this.#resolverPackage(handle, snapshot)) !== captured.proof.packageDigest) fail('native_orchestration_context_source_stale');
            return context.plan;
        }
        if (hashNativeDocument(information.projection) !== captured.proof.projectionDigest || authorityDigest !== captured.proof.authorityDigest) fail('native_orchestration_context_source_stale');
        if (captured.memoryProof) await NativeMemoryAuthority.prototype.assertContextRecall.call(this.memoryAuthority, handle, captured.memoryProof, snapshot, captured.request.audience);
        return context.plan;
    }

    /** Original Task adoption advances its own Source. This only rechecks the
     * captured Memory facts; the Task finalizer separately guards that advance. */
    async revalidateBackgroundMemory(handle, request) {
        fields(request, ['context'], 'Background Task Memory proof');
        const captured = this.#contexts.get(request.context);
        if (!captured || captured.handle !== handle || !captured.task || !this.taskCapture
            || captured.request.sourceBinding.sourceAuthority !== 'native_session' || captured.request.audience.kind !== 'task')
            fail('native_orchestration_context_proof_invalid');
        if (captured.memoryProof) await NativeMemoryAuthority.prototype.assertContextRecall.call(this.memoryAuthority, handle,
            captured.memoryProof, captured.taskSnapshot, captured.request.audience);
    }

    /** Final RP publication checks Memory facts without consuming settled Graph
     * inputs again. This returns no Context/Result body or fresh Model grant. */
    async revalidateRpMemory(handle, request) {
        fields(request, ['context'], 'RP output Memory proof');
        const captured = this.#contexts.get(request.context);
        if (!captured || captured.handle !== handle || !captured.rp) fail('native_orchestration_context_proof_invalid');
        if (captured.memoryProof) {
            if (captured.rp.audienceSource) await NativeMemoryAuthority.prototype.assertContextRecall.call(this.memoryAuthority, handle,
                captured.memoryProof, captured.rp.snapshot, captured.request.audience);
            else await NativeMemoryAuthority.prototype.assertRpContextRecall.call(this.memoryAuthority, handle,
                captured.memoryProof, this.rpControl, captured.request.sourceBinding.sourceRequest);
        }
        return captured.memoryDescriptorDigest;
    }

    /** Same live Project capture only; exact original receipts explain owned Task progress. No Model grant. */
    async revalidateProjectTool(handle, request) {
        fields(request, ['context'], 'Project read Context');
        const captured = this.#contexts.get(request.context);
        if (!captured?.project || captured.handle !== handle) fail('native_orchestration_context_proof_invalid');
        await readNativeProjectSkillInventory(this.projectCapture ?? captured.project.capture, { projectAgent: this.projectAgent, handle });
        const current = await this.#current(handle, captured.request, 'consume', true, null, true);
        if (current.authorityDigest !== captured.proof.authorityDigest) fail('native_orchestration_context_source_stale');
        return request.context.plan;
    }

    assertSource(handle, { context, source } = {}) {
        const captured = this.#contexts.get(context), ref = captured?.request.sourceBinding.sourceRef;
        if (captured?.rp || captured?.rpDelegation) {
            if (captured.handle !== handle || source?.kind !== 'rp_chat' || source.controlId !== ref.controlId) fail('native_orchestration_context_source_mismatch');
            return;
        }
        if (captured?.project) {
            if (captured.handle !== handle || source?.kind !== 'task' || source.projectId !== ref.projectId || source.taskId !== ref.taskId || source.revision !== ref.revision)
                fail('native_orchestration_context_source_mismatch');
            return;
        }
        if (!captured || captured.handle !== handle || source?.kind !== 'session' || source.sessionId !== ref.sessionId
            || source.branchId !== ref.branchId || source.revisionId !== ref.revisionId) fail('native_orchestration_context_source_mismatch');
    }

    /** Read-only identification from this Context's private compilation proof. */
    isProjectDelegation(handle, { context } = {}) {
        const captured = this.#contexts.get(context);
        if (!captured?.project?.delegation) return false;
        if (captured.handle !== handle || !this.projectDelegationCapture) fail('native_orchestration_context_proof_invalid');
        NativeNarratorOrchestrationAuthority.prototype.inspectDelegationIdentity.call(this.projectDelegationHost.turnOrchestration,
            this.projectDelegationCapture, { host: this.projectDelegationHost, handle });
        return true;
    }

    /** Sealed read-only stage witness. JSON flags cannot suppress Task writers. */
    inspectProjectWorker(handle, { context, request }) {
        const captured = this.#contexts.get(context);
        if (!captured?.project || captured.handle !== handle) fail('native_orchestration_context_proof_invalid');
        const identity = inspectNativeProjectGenerationIdentity(this.projectCapture ?? captured.project.capture, { projectAgent: this.projectAgent, handle });
        if (!identity.workerStage) return null;
        for (const field of ['requestId', 'projectId', 'taskId', 'projectAttemptId']) {
            if (request[field] !== captured.project.request[field] || request[field] !== identity.request[field]) fail('native_orchestration_project_request_mismatch');
        }
        return { originalRequestId: identity.originalRequestId };
    }

    projectRequest(handle, { context } = {}) {
        const captured = this.#contexts.get(context);
        if (!captured?.project || captured.handle !== handle) fail('native_orchestration_context_proof_invalid');
        inspectNativeProjectGenerationIdentity(this.projectCapture ?? captured.project.capture, { projectAgent: this.projectAgent, handle });
        return captured.project.request;
    }

    projectRound(handle, { context } = {}) {
        this.projectRequest(handle, { context });
        // The original runner appends observed assistant/tool messages after
        // generation. Its working transcript must not mutate the frozen plan.
        return structuredClone(this.#contexts.get(context).project.round);
    }

    assertProjectRequest(handle, { context, request } = {}) {
        const fixed = this.projectRequest(handle, { context });
        if (!request || hashNativeDocument(request) !== hashNativeDocument(fixed)) fail('native_orchestration_project_request_mismatch');
        return fixed;
    }

    #assertProjectExecution(handle, context, request, resolved) {
        const fixed = this.projectRequest(handle, { context }), { runtime } = this.#contexts.get(context).project;
        const requirements = [...new Set([...(runtime?.modelPrompt?.roles.find(item => item.role === 'role.studio')?.requiredCapabilities ?? []),
            ...(fixed.tools.length ? ['generation.tools'] : []), ...(fixed.outputContract ? ['generation.structured-output'] : [])])];
        const expected = { requestId: fixed.requestId, role: 'role.studio', routeRef: fixed.routeRef,
            requirements, tools: fixed.tools, outputContract: fixed.outputContract ?? null, fallbackMode: this.#projectModelPolicy?.fallbackMode ?? 'disabled', unknownCapabilityOverrides: [],
            prompt: { host: { role: 'role.studio', sourceKind: 'task', sessionId: '', branchId: '', revisionId: '', projectId: fixed.projectId, projectRevision: fixed.revision } } };
        if (hashNativeDocument(request) !== hashNativeDocument(expected)) fail('native_orchestration_project_request_mismatch');
    }

    #assertProjectModelCandidate(resolved) {
        if (!this.#projectModelPolicy) return;
        const candidate = this.#projectModelPolicy.routes.find(item => item.routeRef.scope === 'player' && item.routeRef.runtimeRouteId === resolved.route.runtimeRouteId);
        if (!candidate || candidate.configDigest !== hashNativeDocument({ route: resolved.route, model: resolved.model, connection: resolved.connection,
            generation: resolved.generation, resources: resolved.resources })) fail('native_orchestration_project_request_mismatch');
    }

    resolverRequest(handle, { context } = {}) {
        const captured = this.#contexts.get(context);
        if (!captured?.resolver || captured.handle !== handle) fail('native_orchestration_context_proof_invalid');
        inspectNativeAuthorityResolver(this.resolverCapture, { sessionCore: this.sessionCore, handle, sourceBinding: captured.request.sourceBinding });
        return captured.resolver.request;
    }

    assertResolverRequest(handle, { context, request } = {}) {
        const fixed = this.resolverRequest(handle, { context });
        if (!request || hashNativeDocument(request) !== hashNativeDocument(fixed)) fail('native_orchestration_resolver_request_mismatch');
        return fixed;
    }

    #assertResolverExecution(handle, context, request, resolved) {
        const fixed = this.resolverRequest(handle, { context });
        const captured = inspectNativeAuthorityResolver(this.resolverCapture, { sessionCore: this.sessionCore, handle, sourceBinding: context.request.sourceBinding });
        const ref = context.request.sourceBinding.sourceRef;
        const requirements = [...new Set([...(captured.base.manifest.runtime?.modelPrompt?.roles.find(item => item.role === 'role.intent_resolver')?.requiredCapabilities ?? []),
            ...(fixed.tools.length ? ['generation.tools'] : []), ...(fixed.outputContract ? ['generation.structured-output'] : [])])];
        const expected = { requestId: fixed.requestId, role: 'role.intent_resolver', routeRef: this.#sessionModelPolicy?.routes[0].routeRef ?? { scope: 'player', runtimeRouteId: resolved.route.runtimeRouteId },
            requirements, tools: fixed.tools, outputContract: null,
            prompt: { host: { role: 'role.intent_resolver', sourceKind: 'session', sessionId: ref.sessionId, branchId: ref.branchId, revisionId: ref.revisionId, projectId: '', projectRevision: '' } },
            fallbackMode: this.#sessionModelPolicy?.fallbackMode ?? 'disabled', unknownCapabilityOverrides: [] };
        if (hashNativeDocument(request) !== hashNativeDocument(expected)) fail('native_orchestration_resolver_request_mismatch');
    }

    async selectResolver(handle, { context, response } = {}) {
        const captured = this.#contexts.get(context);
        this.resolverRequest(handle, { context });
        await this.revalidate(handle, { context, phase: 'consume' });
        return captured.resolver.select(response);
    }

    // Use this provider as the actual generation input. Checking this plan and
    // then compiling another (broader) audience would not protect the send.
    provider(handle, { context, source } = {}) {
        if (this.#contexts.get(context)?.sessionDelegation) return { buildRequestContextPlan: async (request, resolved) => {
            this.#assertSessionCandidate(resolved);
            const fixed = this.#contexts.get(context).sessionDelegation.request, ref = context.request.sourceBinding.sourceRef;
            NativeNarratorOrchestrationAuthority.prototype.inspectDelegationIdentity.call(this.sessionDelegationHost.turnOrchestration,
                this.sessionDelegationCapture, { host: this.sessionDelegationHost, handle });
            const expected = { requestId: fixed.requestId, role: 'role.narrator', routeRef: fixed.routeRef,
                requirements: fixed.outputContract ? ['generation.structured-output'] : [], tools: [], outputContract: fixed.outputContract ?? null, fallbackMode: 'disabled', unknownCapabilityOverrides: [],
                prompt: { host: { role: 'role.narrator', sourceKind: 'session', sessionId: ref.sessionId,
                    branchId: ref.branchId, revisionId: ref.revisionId, projectId: '', projectRevision: '' } } };
            if (hashNativeDocument(request) !== hashNativeDocument(request?.role === 'narrator' ? fixed : expected)
                || resolved.route.role !== 'role.narrator' || resolved.route.runtimeRouteId !== fixed.routeRef.runtimeRouteId)
                fail('native_orchestration_context_model_denied');
            if (source !== undefined) this.assertSource(handle, { context, source });
            const plan = await this.revalidate(handle, { context, phase: 'send' });
            return immutable({ ...plan, budget: emptyNativeContextPlan(request, resolved, plan.source).budget });
        } };
        if (this.#contexts.get(context)?.rpDelegation) return { buildRequestContextPlan: async (request, resolved) => {
            const fixed = this.#contexts.get(context).rpDelegation.request;
            inspectNativeRpDelegationIdentity(this.rpDelegationCapture, { rpControl: this.rpControl, handle });
            const expected = request?.role === 'role.narrator' ? { requestId: fixed.requestId, role: 'role.narrator', routeRef: fixed.routeRef,
                requirements: fixed.outputContract ? ['generation.structured-output'] : [], tools: [], outputContract: fixed.outputContract ?? null, fallbackMode: 'disabled', unknownCapabilityOverrides: [],
                prompt: { host: { role: 'role.narrator', sourceKind: 'rp_chat', sessionId: '', branchId: '', revisionId: '', projectId: '', projectRevision: '' } } } : fixed;
            if (hashNativeDocument(request) !== hashNativeDocument(expected) || resolved.route.runtimeRouteId !== fixed.routeRef.runtimeRouteId
                || resolved.route.role !== 'role.narrator') fail('native_orchestration_rp_request_mismatch');
            if (source !== undefined) this.assertSource(handle, { context, source });
            const plan = await this.revalidate(handle, { context, phase: 'send' });
            return immutable({ ...plan, budget: emptyNativeContextPlan(request, resolved, plan.source).budget });
        } };
        if (this.#contexts.get(context)?.rp) return { buildRequestContextPlan: async (request, resolved) => {
            const fixed = this.#contexts.get(context).rp.request;
            const expected = request.role === 'role.narrator' ? { requestId: fixed.requestId, role: 'role.narrator', routeRef: fixed.routeRef,
                requirements: fixed.outputContract ? ['generation.structured-output'] : [], tools: [], outputContract: fixed.outputContract ?? null, fallbackMode: fixed.fallbackMode ?? 'disabled', unknownCapabilityOverrides: [],
                prompt: { host: { role: 'role.narrator', sourceKind: 'rp_chat', sessionId: '', branchId: '', revisionId: '', projectId: '', projectRevision: '' } } } : fixed;
            if (hashNativeDocument(request) !== hashNativeDocument(expected)) fail('native_orchestration_rp_request_mismatch');
            if (source !== undefined) this.assertSource(handle, { context, source });
            const plan = await this.revalidate(handle, { context, phase: 'send' });
            return immutable({ ...plan, budget: emptyNativeContextPlan(request, resolved, plan.source).budget });
        } };
        if (this.#contexts.get(context)?.project) return { buildRequestContextPlan: async (request, resolved) => {
            this.#assertProjectModelCandidate(resolved);
            if (request?.role === 'role.studio') this.#assertProjectExecution(handle, context, request, resolved);
            else this.assertProjectRequest(handle, { context, request });
            if (source !== undefined) this.assertSource(handle, { context, source });
            const plan = await this.revalidate(handle, { context, phase: 'send' });
            return immutable({ ...plan, budget: emptyNativeContextPlan(request, resolved, plan.source).budget });
        } };
        if (this.#contexts.get(context)?.resolver) return { buildRequestContextPlan: async (request, resolved) => {
            this.#assertSessionCandidate(resolved);
            if (request?.role === 'role.intent_resolver') this.#assertResolverExecution(handle, context, request, resolved);
            else this.assertResolverRequest(handle, { context, request });
            if (source !== undefined) this.assertSource(handle, { context, source });
            const plan = await this.revalidate(handle, { context, phase: 'send' });
            return immutable({ ...plan, budget: emptyNativeContextPlan(request, resolved, plan.source).budget });
        } };
        const provider = createNativeSessionContextProvider(async () => {
            if (source !== undefined) this.assertSource(handle, { context, source });
            const plan = await this.revalidate(handle, { context, phase: 'send' });
            const ref = context.request.sourceBinding.sourceRef;
            return { source: { kind: 'session', sessionId: ref.sessionId, branchId: ref.branchId, revisionId: ref.revisionId }, plan };
        });
        return { buildRequestContextPlan: async (request, resolved) => {
            this.#assertSessionCandidate(resolved);
            const task = this.#contexts.get(context)?.task;
            if (task) {
                if (source !== undefined) this.assertSource(handle, { context, source });
                const fixed = task.request, ref = context.request.sourceBinding.sourceRef;
                const expected = { requestId: fixed.requestId, role: 'role.' + fixed.role, routeRef: fixed.routeRef,
                    requirements: [...new Set([...task.taskPlan.slot.requiredCapabilities, ...task.taskPlan.variant.requiredCapabilities, 'generation.structured-output'])],
                    tools: [], outputContract: fixed.outputContract, fallbackMode: 'disabled', unknownCapabilityOverrides: [],
                    prompt: { host: { role: 'role.' + fixed.role, sourceKind: 'session', sessionId: ref.sessionId,
                        branchId: ref.branchId, revisionId: ref.revisionId, projectId: '', projectRevision: '' } } };
                if (hashNativeDocument(request) !== hashNativeDocument(request?.role === fixed.role ? fixed : expected)) fail('native_orchestration_background_request_mismatch');
            }
            const selected = task?.inputOnly ? { ...await this.revalidate(handle, { context, phase: 'send' }),
                budget: emptyNativeContextPlan(request, resolved, context.plan.source).budget } : await provider.buildRequestContextPlan(request, resolved);
            if (task) {
                const items = selectNativeTaskContext(selected.items, task.taskPlan.task);
                if (task.taskPlan.task.context.includes('input')) items.push({ kind: 'context.input', id: 'task-input',
                    content: JSON.stringify(task.taskPlan.payload), provenance: [{ source: 'host.task' }] });
                return immutable({ ...selected, items });
            }
            const { snapshot, authorityContext } = await this.#current(handle, context.request, 'send');
            return authorityContext ? authorityContextPlan(selected, snapshot, authorityContext) : selected;
        } };
    }

    #assertSessionCandidate(resolved) {
        if (!this.#sessionModelPolicy) return;
        const candidate = this.#sessionModelPolicy.routes.find(item => item.routeRef?.scope === 'player' && item.routeRef.runtimeRouteId === resolved.route.runtimeRouteId);
        if (!candidate || candidate.configDigest !== hashNativeDocument({ route: resolved.route, model: resolved.model, connection: resolved.connection,
            generation: resolved.generation, resources: resolved.resources })) fail('native_orchestration_context_model_denied');
    }
}
