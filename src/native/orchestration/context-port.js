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

const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const packageInputs = installed => ({ manifest: installed.manifest, entryPoint: installed.entryPoint,
    sourceFiles: [...installed.sourceFiles].sort(([a], [b]) => a.localeCompare(b)), assets: [...installed.assets].sort(([a], [b]) => a.localeCompare(b)) });
const packageDigestOf = installed => hashNativeDocument(JSON.parse(JSON.stringify(packageInputs(installed))));

/** Audience admission around the original compiler; no context/Memory writer. */
export class ContextPort {
    #contexts = new WeakMap();

    constructor({ sessionCore, authorizeContext, contextOptions = {}, readMemoryEvidence, authorityTurn = null, resolverCapture = null, compilationInputs = null } = {}) {
        if (typeof authorizeContext !== 'function') fail('native_orchestration_context_authority_required');
        if (authorityTurn && resolverCapture) fail('native_orchestration_context_authority_conflict');
        Object.assign(this, { sessionCore, authorizeContext, contextOptions: { ...contextOptions }, readMemoryEvidence, authorityTurn, resolverCapture, compilationInputs });
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
        if (!(resolver ? audience.kind === 'authority_intent' : ['narrator', 'actor'].includes(audience.kind))
            || (audience.kind === 'actor' ? typeof audience.id !== 'string' || !audience.id : audience.id !== undefined)) fail('native_orchestration_context_audience_invalid');
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
        if (binding.sourceAuthority !== 'native_session' || !this.sessionCore) fail('native_orchestration_context_domain_unavailable');
        const committed = await this.sessionCore.observe(handle, binding.sourceRef.sessionId);
        const { session, revision } = committed, expected = binding.sourceRef;
        if (session.sessionId !== expected.sessionId || revision.branchId !== expected.branchId || revision.revisionId !== expected.revisionId
            || (expected.packageVersionId !== undefined && session.packageVersionId !== expected.packageVersionId)) fail('native_orchestration_context_source_stale');
        let snapshot = committed, authorityContext = null, authorityDigest = null;
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
        const information = readInformation ? informationContext(snapshot, request.audience, undefined, this.authorityTurn ? { includeRollups: false } : {}) : null;
        // Missing Information must not fall through to compiler's broad raw
        // history path. A declared, available context exposure is mandatory.
        if (readInformation && (!information?.projection || (request.audience.kind === 'actor' && !actorAvailability(snapshot, request.audience.id).available)
            || information.projection.availability.some(item => !item.available))) fail('native_orchestration_context_audience_denied');
        return { snapshot, information, authorityContext, authorityDigest };
    }

    // Short-lived actual compiler inputs, never a persisted snapshot or a
    // caller's claimed byte count. Projection/compilation still happen only
    // inside the admitted work; this pure read establishes its input bound.
    async compilationDescriptor(handle, input) {
        const request = this.#request(handle, input);
        const { snapshot, authorityContext, resolver } = await this.#current(handle, request, 'compile_descriptor', false);
        if (resolver) {
            const installed = await this.#resolverPackage(handle, snapshot);
            return { request, snapshot, logicalDescriptor: resolver.logicalDescriptor, ...packageInputs(installed), contextOptions: this.contextOptions };
        }
        return { request, snapshot, authorityContext, contextOptions: this.contextOptions, compilationInputs: this.compilationInputs };
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
        const { snapshot, information, authorityDigest, resolver } = await this.#current(handle, request, 'compile');
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
        const memoryEvidence = this.readMemoryEvidence ? await this.readMemoryEvidence({ handle, request, snapshot, information }) : this.contextOptions.memoryEvidence ?? [];
        const plan = await compileNativeContextPlan(snapshot, { ...this.contextOptions, ...request.tokenBudget,
            target: request.audience, informationTaskId: undefined, memoryEvidence, authorityTurn: Boolean(this.authorityTurn) });
        // Asynchronous retrieval/derivation can outlive Source or grants.
        await this.#current(handle, request, 'compiled');
        const proof = { sourceBindingDigest: request.sourceBinding.bindingDigest, grantDigest: request.grantDigest,
            audienceDigest: hashNativeDocument(request.audience), projectionDigest: hashNativeDocument(information.projection), authorityDigest };
        const context = immutable({ schemaVersion: 1, contextId: hashNativeDocument({ request, plan, proof }), request, plan,
            evidenceRefs: plan.included.flatMap(item => item.sourceRefs ?? []), currentnessProof: proof });
        this.#contexts.set(context, { handle, request, proof });
        return context;
    }

    async revalidate(handle, { context, phase, audience = context?.request?.audience } = {}) {
        const captured = this.#contexts.get(context);
        if (!captured || captured.handle !== handle || !['send', 'consume'].includes(phase)) fail('native_orchestration_context_proof_invalid');
        if (hashNativeDocument(audience) !== captured.proof.audienceDigest) fail('native_orchestration_context_audience_mismatch');
        const { information, authorityDigest, snapshot } = await this.#current(handle, captured.request, phase);
        if (captured.resolver) {
            if (authorityDigest !== captured.proof.authorityDigest
                || packageDigestOf(await this.#resolverPackage(handle, snapshot)) !== captured.proof.packageDigest) fail('native_orchestration_context_source_stale');
            return context.plan;
        }
        if (hashNativeDocument(information.projection) !== captured.proof.projectionDigest || authorityDigest !== captured.proof.authorityDigest) fail('native_orchestration_context_source_stale');
        return context.plan;
    }

    assertSource(handle, { context, source } = {}) {
        const captured = this.#contexts.get(context), ref = captured?.request.sourceBinding.sourceRef;
        if (!captured || captured.handle !== handle || source?.kind !== 'session' || source.sessionId !== ref.sessionId
            || source.branchId !== ref.branchId || source.revisionId !== ref.revisionId) fail('native_orchestration_context_source_mismatch');
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
            const selected = await provider.buildRequestContextPlan(request, resolved);
            const { snapshot, authorityContext } = await this.#current(handle, context.request, 'send');
            return authorityContext ? authorityContextPlan(selected, snapshot, authorityContext) : selected;
        } };
    }
}
