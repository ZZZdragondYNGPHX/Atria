import { compileNativeContextPlan } from '../../../public/scripts/native/context-compiler.js';
import { actorAvailability, informationContext } from '../../../public/shared/native-information-runtime.js';
import { fields } from '../../../public/shared/native-values.js';
import { hashNativeDocument } from '../repositories/common.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { createNativeSessionContextProvider } from '../model-prompt-runtime/context-providers.js';

const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** Audience admission around the original compiler; no context/Memory writer. */
export class ContextPort {
    #contexts = new WeakMap();

    constructor({ sessionCore, authorizeContext, contextOptions = {}, readMemoryEvidence } = {}) {
        if (typeof authorizeContext !== 'function') fail('native_orchestration_context_authority_required');
        Object.assign(this, { sessionCore, authorizeContext, contextOptions: { ...contextOptions }, readMemoryEvidence });
    }

    #request(handle, input) {
        fields(input, ['ownerRef', 'sourceBinding', 'audience', 'taskPurpose', 'grantDigest', 'inputRefs', 'tokenBudget'], 'Context compile request');
        fields(input.ownerRef, ['handle'], 'Context owner');
        if (input.ownerRef.handle !== handle) fail('native_orchestration_context_owner_mismatch');
        const { sourceBinding: binding, audience, tokenBudget } = input;
        if (!binding || !digest(binding.bindingDigest)
            || hashNativeDocument(Object.fromEntries(Object.entries(binding).filter(([key]) => key !== 'bindingDigest'))) !== binding.bindingDigest) fail('native_orchestration_context_source_invalid');
        fields(audience, ['kind', 'id'], 'Context audience');
        if (!['narrator', 'actor'].includes(audience.kind) || (audience.kind === 'actor' ? typeof audience.id !== 'string' || !audience.id : audience.id !== undefined)) fail('native_orchestration_context_audience_invalid');
        if (!digest(input.grantDigest) || typeof input.taskPurpose !== 'string' || !input.taskPurpose.trim() || !Array.isArray(input.inputRefs)) fail('native_orchestration_context_request_invalid');
        fields(tokenBudget, ['modelContextLimit', 'responseReserve'], 'Context token budget');
        if (!Number.isSafeInteger(tokenBudget.modelContextLimit) || !Number.isSafeInteger(tokenBudget.responseReserve)
            || tokenBudget.responseReserve < 0 || tokenBudget.modelContextLimit <= tokenBudget.responseReserve) fail('native_orchestration_context_budget_invalid');
        return immutable(input);
    }

    async #current(handle, request, phase) {
        // Delegation/grants are an original-domain decision, never inferred
        // from a model's audience string or an already compiled prompt.
        const permission = await this.authorizeContext({ handle, request, phase });
        if (permission?.allowed !== true || permission.grantDigest !== request.grantDigest) fail('native_orchestration_context_denied');
        const binding = request.sourceBinding;
        if (binding.sourceAuthority !== 'native_session' || !this.sessionCore) fail('native_orchestration_context_domain_unavailable');
        const snapshot = await this.sessionCore.observe(handle, binding.sourceRef.sessionId);
        const { session, revision } = snapshot, expected = binding.sourceRef;
        if (session.sessionId !== expected.sessionId || revision.branchId !== expected.branchId || revision.revisionId !== expected.revisionId
            || (expected.packageVersionId !== undefined && session.packageVersionId !== expected.packageVersionId)) fail('native_orchestration_context_source_stale');
        const information = informationContext(snapshot, request.audience);
        // Missing Information must not fall through to compiler's broad raw
        // history path. A declared, available context exposure is mandatory.
        if (!information?.projection || (request.audience.kind === 'actor' && !actorAvailability(snapshot, request.audience.id).available)
            || information.projection.availability.some(item => !item.available)) fail('native_orchestration_context_audience_denied');
        return { snapshot, information };
    }

    async compile(handle, input) {
        const request = this.#request(handle, input);
        const { snapshot, information } = await this.#current(handle, request, 'compile');
        const memoryEvidence = this.readMemoryEvidence ? await this.readMemoryEvidence({ handle, request, snapshot, information }) : [];
        const plan = await compileNativeContextPlan(snapshot, { ...this.contextOptions, ...request.tokenBudget,
            target: request.audience, informationTaskId: undefined, memoryEvidence });
        // Asynchronous retrieval/derivation can outlive Source or grants.
        await this.#current(handle, request, 'compiled');
        const proof = { sourceBindingDigest: request.sourceBinding.bindingDigest, grantDigest: request.grantDigest,
            audienceDigest: hashNativeDocument(request.audience), projectionDigest: hashNativeDocument(information.projection) };
        const context = immutable({ schemaVersion: 1, contextId: hashNativeDocument({ request, plan, proof }), request, plan,
            evidenceRefs: plan.included.flatMap(item => item.sourceRefs ?? []), currentnessProof: proof });
        this.#contexts.set(context, { handle, request, proof });
        return context;
    }

    async revalidate(handle, { context, phase, audience = context?.request?.audience } = {}) {
        const captured = this.#contexts.get(context);
        if (!captured || captured.handle !== handle || !['send', 'consume'].includes(phase)) fail('native_orchestration_context_proof_invalid');
        if (hashNativeDocument(audience) !== captured.proof.audienceDigest) fail('native_orchestration_context_audience_mismatch');
        const { information } = await this.#current(handle, captured.request, phase);
        if (hashNativeDocument(information.projection) !== captured.proof.projectionDigest) fail('native_orchestration_context_source_stale');
        return context.plan;
    }

    assertSource(handle, { context, source } = {}) {
        const captured = this.#contexts.get(context), ref = captured?.request.sourceBinding.sourceRef;
        if (!captured || captured.handle !== handle || source?.kind !== 'session' || source.sessionId !== ref.sessionId
            || source.branchId !== ref.branchId || source.revisionId !== ref.revisionId) fail('native_orchestration_context_source_mismatch');
    }

    // Use this provider as the actual generation input. Checking this plan and
    // then compiling another (broader) audience would not protect the send.
    provider(handle, { context, source } = {}) {
        return createNativeSessionContextProvider(async () => {
            if (source !== undefined) this.assertSource(handle, { context, source });
            const plan = await this.revalidate(handle, { context, phase: 'send' });
            const ref = context.request.sourceBinding.sourceRef;
            return { source: { kind: 'session', sessionId: ref.sessionId, branchId: ref.branchId, revisionId: ref.revisionId }, plan };
        });
    }
}
