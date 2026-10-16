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
import { inspectNativeRpGeneration } from './native-rp-generation.js';
import { RpRunControl } from '../rp-run-control.js';
import { NativeMemoryAuthority } from '../memory-authority.js';
import { SettingsRepo } from '../../storage/repositories/settings-repo.js';
import { inspectNativeBackgroundGeneration } from './native-background-generation.js';
import { selectNativeTaskContext } from '../adapters/task-context-items.js';

const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const packageInputs = installed => ({ manifest: installed.manifest, entryPoint: installed.entryPoint,
    sourceFiles: [...installed.sourceFiles].sort(([a], [b]) => a.localeCompare(b)), assets: [...installed.assets].sort(([a], [b]) => a.localeCompare(b)) });
const packageDigestOf = installed => hashNativeDocument(JSON.parse(JSON.stringify(packageInputs(installed))));

/** Audience admission around the original compiler; no context/Memory writer. */
export class ContextPort {
    #contexts = new WeakMap();
    #memoryDescriptors = new Map();

    constructor({ sessionCore, projectAgent, projectCapture = null, rpControl = null, rpCapture = null, taskCapture = null, authorizeContext, contextOptions = {}, readMemoryEvidence, memoryAuthority = null, authorityTurn = null, resolverCapture = null, compilationInputs = null } = {}) {
        if (typeof authorizeContext !== 'function') fail('native_orchestration_context_authority_required');
        if ([authorityTurn, resolverCapture, projectCapture, rpCapture, taskCapture].filter(Boolean).length > 1) fail('native_orchestration_context_authority_conflict');
        if (memoryAuthority && (!(memoryAuthority instanceof NativeMemoryAuthority) || memoryAuthority.core !== sessionCore || readMemoryEvidence
            || !(memoryAuthority.settingsRepo instanceof SettingsRepo) || memoryAuthority.settingsRepo._engine !== sessionCore?._sessions?._engine))
            fail('native_orchestration_memory_authority_invalid');
        Object.assign(this, { sessionCore, projectAgent, projectCapture, rpControl, rpCapture, taskCapture, authorizeContext, contextOptions: { ...contextOptions }, readMemoryEvidence, memoryAuthority, authorityTurn, resolverCapture, compilationInputs });
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
        if (this.rpCapture && (audience.kind !== 'narrator' || audience.id !== undefined)) fail('native_orchestration_context_audience_invalid');
        if (!(this.taskCapture ? audience.kind === 'task' : this.projectCapture ? audience.kind === 'project_task' : resolver ? audience.kind === 'authority_intent' : ['narrator', 'actor'].includes(audience.kind))
            || (['actor', 'project_task', 'task'].includes(audience.kind) ? typeof audience.id !== 'string' || !audience.id : audience.id !== undefined)) fail('native_orchestration_context_audience_invalid');
        if (resolver) inspectNativeAuthorityResolver(this.resolverCapture, { sessionCore: this.sessionCore, handle, sourceBinding: binding });
        if (!digest(input.grantDigest) || typeof input.taskPurpose !== 'string' || !input.taskPurpose.trim() || !Array.isArray(input.inputRefs)) fail('native_orchestration_context_request_invalid');
        fields(tokenBudget, ['modelContextLimit', 'responseReserve'], 'Context token budget');
        if (!Number.isSafeInteger(tokenBudget.modelContextLimit) || !Number.isSafeInteger(tokenBudget.responseReserve)
            || tokenBudget.responseReserve < 0 || tokenBudget.modelContextLimit <= tokenBudget.responseReserve) fail('native_orchestration_context_budget_invalid');
        return immutable(input);
    }

    async #current(handle, request, phase, readInformation = true) {
        // Delegation/grants are an original-domain decision, never inferred
        // from a model's audience string or an already compiled prompt.
        const permission = await this.authorizeContext({ handle, request, phase });
        if (permission?.allowed !== true || permission.grantDigest !== request.grantDigest) fail('native_orchestration_context_denied');
        const binding = request.sourceBinding;
        if (this.rpCapture) {
            if (!(this.rpControl instanceof RpRunControl)) fail('native_orchestration_context_domain_unavailable');
            const rpIdentity = await inspectNativeRpGeneration(this.rpCapture, { rpControl: this.rpControl, handle });
            if (binding.sourceAuthority !== 'rp_chat' || !binding.sourceRequest || hashNativeDocument(binding.sourceRequest) !== hashNativeDocument(rpIdentity.sourceRequest)
                || binding.sourceRef.controlId !== rpIdentity.sourceRequest.controlId || binding.sourceRef.prefixDigest !== rpIdentity.context.prefixDigest)
                fail('native_orchestration_context_source_mismatch');
            return { rpIdentity, authorityDigest: hashNativeDocument({ source: rpIdentity.sourceRequest, context: rpIdentity.context }) };
        }
        if (this.projectCapture) {
            const projectIdentity = await inspectNativeProjectGeneration(this.projectCapture, { projectAgent: this.projectAgent, handle });
            if (['compiled', 'send', 'consume'].includes(phase))
                await readNativeProjectSkillInventory(this.projectCapture, { projectAgent: this.projectAgent, handle });
            if (binding.sourceAuthority !== 'project' || request.audience.id !== projectIdentity.taskId
                || hashNativeDocument(binding.sourceRequest) !== hashNativeDocument(projectIdentity.sourceRequest)) fail('native_orchestration_context_source_mismatch');
            const modelContext = await ProjectAgentService.prototype.observeModelContext.call(this.projectAgent, handle, projectIdentity.projectId, projectIdentity.taskId);
            const { task, project, registry, tools } = modelContext;
            const attempt = task.attempts.find(item => item.attemptId === projectIdentity.projectAttemptId && item.kind === 'generation');
            if (task.executionFingerprint !== projectIdentity.sourceFingerprint || hashNativeDocument(task.conversation) !== projectIdentity.conversationDigest
                || task.baseRevision !== projectIdentity.revision || project.revision.revision !== projectIdentity.revision
                || attempt?.status !== 'started' || attempt.requestId !== projectIdentity.requestId) fail('native_orchestration_context_source_stale');
            const projectDigest = hashNativeDocument({ sourceFingerprint: task.executionFingerprint, conversation: task.conversation,
                attempt: { attemptId: attempt.attemptId, kind: attempt.kind, status: attempt.status, requestId: attempt.requestId, calls: attempt.calls },
                project, registry, tools, skillWorkRecords: projectIdentity.skillWorkRecords });
            return { modelContext, projectIdentity, authorityDigest: projectDigest, information: null };
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
        const { snapshot, authorityContext, resolver, modelContext, projectIdentity, rpIdentity } = await this.#current(handle, request, 'compile_descriptor', false);
        if (rpIdentity) {
            const memoryDescriptor = this.memoryAuthority ? await NativeMemoryAuthority.prototype.rpContextDescriptor.call(this.memoryAuthority, handle, this.rpControl, rpIdentity.sourceRequest) : null;
            if (memoryDescriptor) this.#memoryDescriptors.set(hashNativeDocument(request), memoryDescriptor);
            return { request, source: rpIdentity.sourceRequest, context: rpIdentity.context, memoryDescriptor };
        }
        if (projectIdentity) return { request, modelContext: projectAgentPromptInputs(modelContext), skillWorkRecords: projectIdentity.skillWorkRecords };
        if (resolver) {
            const installed = await this.#resolverPackage(handle, snapshot);
            return { request, snapshot, logicalDescriptor: resolver.logicalDescriptor, ...packageInputs(installed), contextOptions: this.contextOptions };
        }
        const memoryDescriptor = this.memoryAuthority ? await NativeMemoryAuthority.prototype.contextDescriptor.call(this.memoryAuthority, handle, snapshot) : null;
        if (memoryDescriptor) this.#memoryDescriptors.set(hashNativeDocument(request), memoryDescriptor);
        return { request, snapshot, authorityContext, contextOptions: this.contextOptions, compilationInputs: this.compilationInputs, memoryDescriptor };
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

    async compile(handle, input) {
        const request = this.#request(handle, input);
        const { snapshot, information, authorityDigest, resolver, modelContext, projectIdentity, rpIdentity, taskIdentity } = await this.#current(handle, request, 'compile');
        if (rpIdentity) {
            const descriptorKey = hashNativeDocument(request), expectedDescriptor = this.#memoryDescriptors.get(descriptorKey);
            this.#memoryDescriptors.delete(descriptorKey);
            const recall = this.memoryAuthority ? await NativeMemoryAuthority.prototype.recallRpContext.call(this.memoryAuthority, handle, {
                control: this.rpControl, request: rpIdentity.sourceRequest, tokenBudget: request.tokenBudget, countTokens: this.contextOptions.countTokens,
                expectedDescriptor, assertCurrent: () => this.#current(handle, request, 'recall') }) : null;
            const source = { kind: 'rp_chat', controlId: rpIdentity.sourceRequest.controlId };
            const selected = emptyNativeContextPlan(rpIdentity.request, { model: { limits: {
                contextTokens: request.tokenBudget.modelContextLimit, outputTokens: request.tokenBudget.responseReserve } } }, source);
            const plan = { ...selected, items: [...rpIdentity.context.messages.map((message, index) => ({ kind: 'context.history', id: 'rp-message-' + index,
                content: { ...message, role: message.role === 'system' ? 'user' : message.role }, provenance: [{ source: 'native.rp-chat', ref: rpIdentity.context.prefixDigest }] })),
            ...(recall?.evidence ?? []).map(item => ({ kind: 'context.history', id: item.memoryId, content: { role: 'user', content: item.content },
                provenance: [{ source: 'native.rp-memory', ref: item.memoryId }] }))] };
            const after = await this.#current(handle, request, 'compiled');
            if (after.authorityDigest !== authorityDigest) fail('native_orchestration_context_source_stale');
            if (recall) await NativeMemoryAuthority.prototype.assertRpContextRecall.call(this.memoryAuthority, handle, recall.proof, this.rpControl, rpIdentity.sourceRequest);
            const proof = { sourceBindingDigest: request.sourceBinding.bindingDigest, grantDigest: request.grantDigest,
                audienceDigest: hashNativeDocument(request.audience), projectionDigest: authorityDigest, authorityDigest };
            const context = immutable({ schemaVersion: 1, contextId: hashNativeDocument({ request, plan, proof }), request, plan,
                evidenceRefs: (recall?.evidence ?? []).flatMap(item => item.sourceRefs), currentnessProof: proof });
            this.#contexts.set(context, { handle, request, proof, rp: { request: rpIdentity.request }, memoryProof: recall?.proof });
            return context;
        }
        if (projectIdentity) {
            const skillEntries = await readNativeProjectSkillInventory(this.projectCapture, { projectAgent: this.projectAgent, handle });
            const round = buildNativeProjectModelRound({ context: modelContext, skillEntries });
            const fixedRequest = immutable({ ...projectIdentity.request, tools: round.tools });
            const source = { kind: 'task', projectId: projectIdentity.projectId, taskId: projectIdentity.taskId, revision: projectIdentity.revision };
            const selected = emptyNativeContextPlan(fixedRequest, { model: { limits: { contextTokens: request.tokenBudget.modelContextLimit, outputTokens: request.tokenBudget.responseReserve } } }, source);
            const plan = { ...selected, items: round.messages.map((message, index) => ({ kind: 'context.history', id: 'task-message-' + index,
                content: message, provenance: [{ source: 'host.task' }] })) };
            const after = await this.#current(handle, request, 'compiled');
            if (after.authorityDigest !== authorityDigest) fail('native_orchestration_context_source_stale');
            const proof = { sourceBindingDigest: request.sourceBinding.bindingDigest, grantDigest: request.grantDigest,
                audienceDigest: hashNativeDocument(request.audience), projectionDigest: authorityDigest, authorityDigest };
            const context = immutable({ schemaVersion: 1, contextId: hashNativeDocument({ request, plan, proof }), request, plan, evidenceRefs: [], currentnessProof: proof });
            this.#contexts.set(context, { handle, request, proof, project: { request: fixedRequest, round: immutable(round), runtime: modelContext.project.source.package.runtime ?? null } });
            return context;
        }
        if (resolver) {
            const installed = await this.#resolverPackage(handle, snapshot);
            const original = resolverRequest(await authorityCatalog(snapshot, installed), buildAuthorityObservation(snapshot), snapshot.timeline.at(-1).content);
            const ref = request.sourceBinding.sourceRef, source = { kind: 'session', sessionId: ref.sessionId, branchId: ref.branchId, revisionId: ref.revisionId };
            const fixedRequest = immutable({ ...resolver.request, tools: original.tools });
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
        const descriptorKey = hashNativeDocument(request), expectedDescriptor = this.#memoryDescriptors.get(descriptorKey);
        this.#memoryDescriptors.delete(descriptorKey);
        const recall = this.memoryAuthority ? await NativeMemoryAuthority.prototype.recallContext.call(this.memoryAuthority, handle, {
            snapshot, requester: request.audience, informationTaskId: taskIdentity?.input.taskId, tokenBudget: request.tokenBudget, countTokens: this.contextOptions.countTokens,
            expectedDescriptor, assertCurrent: () => this.#current(handle, request, 'recall') }) : null;
        const memoryEvidence = recall?.evidence ?? (this.readMemoryEvidence ? await this.readMemoryEvidence({ handle, request, snapshot, information }) : this.contextOptions.memoryEvidence ?? []);
        const plan = await compileNativeContextPlan(snapshot, { ...this.contextOptions, ...request.tokenBudget,
            target: taskIdentity ? { kind: 'narrator' } : request.audience, informationTaskId: taskIdentity?.input.taskId, memoryEvidence, authorityTurn: Boolean(this.authorityTurn) });
        // Asynchronous retrieval/derivation can outlive Source or grants.
        await this.#current(handle, request, 'compiled');
        if (recall) await NativeMemoryAuthority.prototype.assertContextRecall.call(this.memoryAuthority, handle, recall.proof, snapshot, request.audience);
        const proof = { sourceBindingDigest: request.sourceBinding.bindingDigest, grantDigest: request.grantDigest,
            audienceDigest: hashNativeDocument(request.audience), projectionDigest: hashNativeDocument(information.projection), authorityDigest };
        const context = immutable({ schemaVersion: 1, contextId: hashNativeDocument({ request, plan, proof }), request, plan,
            evidenceRefs: plan.included.flatMap(item => item.sourceRefs ?? []), currentnessProof: proof });
        this.#contexts.set(context, { handle, request, proof, memoryProof: recall?.proof, task: taskIdentity ? { request: taskIdentity.request, taskPlan: taskIdentity.taskPlan } : null });
        return context;
    }

    async revalidate(handle, { context, phase, audience = context?.request?.audience } = {}) {
        const captured = this.#contexts.get(context);
        if (!captured || captured.handle !== handle || !['send', 'consume'].includes(phase)) fail('native_orchestration_context_proof_invalid');
        if (hashNativeDocument(audience) !== captured.proof.audienceDigest) fail('native_orchestration_context_audience_mismatch');
        const { information, authorityDigest, snapshot } = await this.#current(handle, captured.request, phase);
        if (captured.project || captured.rp) {
            if (authorityDigest !== captured.proof.authorityDigest) fail('native_orchestration_context_source_stale');
            if (captured.rp && captured.memoryProof) await NativeMemoryAuthority.prototype.assertRpContextRecall.call(this.memoryAuthority, handle,
                captured.memoryProof, this.rpControl, captured.request.sourceBinding.sourceRequest);
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

    assertSource(handle, { context, source } = {}) {
        const captured = this.#contexts.get(context), ref = captured?.request.sourceBinding.sourceRef;
        if (captured?.rp) {
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

    projectRequest(handle, { context } = {}) {
        const captured = this.#contexts.get(context);
        if (!captured?.project || captured.handle !== handle) fail('native_orchestration_context_proof_invalid');
        inspectNativeProjectGenerationIdentity(this.projectCapture, { projectAgent: this.projectAgent, handle });
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
            ...(fixed.tools.length ? ['generation.tools'] : [])])];
        const expected = { requestId: fixed.requestId, role: 'role.studio', routeRef: { scope: 'player', runtimeRouteId: resolved.route.runtimeRouteId },
            requirements, tools: fixed.tools, outputContract: null, fallbackMode: 'disabled', unknownCapabilityOverrides: [],
            prompt: { host: { role: 'role.studio', sourceKind: 'task', sessionId: '', branchId: '', revisionId: '', projectId: fixed.projectId, projectRevision: fixed.revision } } };
        if (hashNativeDocument(request) !== hashNativeDocument(expected)) fail('native_orchestration_project_request_mismatch');
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
            ...(fixed.tools.length ? ['generation.tools'] : [])])];
        const expected = { requestId: fixed.requestId, role: 'role.intent_resolver', routeRef: { scope: 'player', runtimeRouteId: resolved.route.runtimeRouteId },
            requirements, tools: fixed.tools, outputContract: null,
            prompt: { host: { role: 'role.intent_resolver', sourceKind: 'session', sessionId: ref.sessionId, branchId: ref.branchId, revisionId: ref.revisionId, projectId: '', projectRevision: '' } },
            fallbackMode: 'disabled', unknownCapabilityOverrides: [] };
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
        if (this.#contexts.get(context)?.rp) return { buildRequestContextPlan: async (request, resolved) => {
            const fixed = this.#contexts.get(context).rp.request;
            const expected = request.role === 'role.narrator' ? { requestId: fixed.requestId, role: 'role.narrator', routeRef: fixed.routeRef,
                requirements: [], tools: [], outputContract: null, fallbackMode: 'disabled', unknownCapabilityOverrides: [],
                prompt: { host: { role: 'role.narrator', sourceKind: 'rp_chat', sessionId: '', branchId: '', revisionId: '', projectId: '', projectRevision: '' } } } : fixed;
            if (hashNativeDocument(request) !== hashNativeDocument(expected)) fail('native_orchestration_rp_request_mismatch');
            if (source !== undefined) this.assertSource(handle, { context, source });
            const plan = await this.revalidate(handle, { context, phase: 'send' });
            return immutable({ ...plan, budget: emptyNativeContextPlan(request, resolved, plan.source).budget });
        } };
        if (this.#contexts.get(context)?.project) return { buildRequestContextPlan: async (request, resolved) => {
            if (request?.role === 'role.studio') this.#assertProjectExecution(handle, context, request, resolved);
            else this.assertProjectRequest(handle, { context, request });
            if (source !== undefined) this.assertSource(handle, { context, source });
            const plan = await this.revalidate(handle, { context, phase: 'send' });
            return immutable({ ...plan, budget: emptyNativeContextPlan(request, resolved, plan.source).budget });
        } };
        if (this.#contexts.get(context)?.resolver) return { buildRequestContextPlan: async (request, resolved) => {
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
            const task = this.#contexts.get(context)?.task;
            if (task) {
                const fixed = task.request, ref = context.request.sourceBinding.sourceRef;
                const expected = { requestId: fixed.requestId, role: 'role.' + fixed.role, routeRef: fixed.routeRef,
                    requirements: [...new Set([...task.taskPlan.slot.requiredCapabilities, ...task.taskPlan.variant.requiredCapabilities, 'generation.structured-output'])],
                    tools: [], outputContract: fixed.outputContract, fallbackMode: 'disabled', unknownCapabilityOverrides: [],
                    prompt: { host: { role: 'role.' + fixed.role, sourceKind: 'session', sessionId: ref.sessionId,
                        branchId: ref.branchId, revisionId: ref.revisionId, projectId: '', projectRevision: '' } } };
                if (hashNativeDocument(request) !== hashNativeDocument(request?.role === fixed.role ? fixed : expected)) fail('native_orchestration_background_request_mismatch');
            }
            const selected = await provider.buildRequestContextPlan(request, resolved);
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
}
