import { assertEffectiveRequestSnapshot, assertPromptIR, assertRequestContextPlan } from './contracts.js';
import { assertContextProviderPort, assertRouteResolverPort, assertSecretPort } from './ports.js';
import { cancellable, checkCancellation, GenerationError, immutable, ProviderFailure } from './execution-utils.js';

// Prompt preparation is an injected port. The P3 compiler will implement it.
export class GenerationService {
    constructor({ resolver, contextProvider, preparePrompt, secretPort, providerFor, now = Date.now }) {
        this.resolver = assertRouteResolverPort(resolver);
        this.contextProvider = assertContextProviderPort(contextProvider);
        this.preparePrompt = preparePrompt;
        this.secretPort = assertSecretPort(secretPort);
        this.providerFor = providerFor ?? (id => resolver.provider(id));
        this.now = now;
    }

    async execute({ signal, handle, ...value }) {
        try {
            const request = immutable(value);
            const mode = request.fallbackMode ?? 'disabled';
            if (!['automatic', 'confirm', 'disabled'].includes(mode)) throw new GenerationError('generation_invalid_fallback_mode');
            const pending = [request.routeRef];
            const visited = new Set();
            let remaining = 0;
            let requirements = [...(request.requirements || [])];
            let outputAuthority;
            while (pending.length) {
                checkCancellation(signal);
                const routeRef = pending.shift();
                const key = JSON.stringify(routeRef);
                if (visited.has(key)) continue;
                visited.add(key);
                const resolved = await cancellable(() => this.resolver.resolve({
                    handle, routeRef, role: request.role, requirements,
                    unknownCapabilityOverrides: request.unknownCapabilityOverrides || [],
                }), signal);
                if (visited.size === 1) remaining = resolved.route.policy.maxFallbackAttempts;
                requirements = [...new Set([...requirements, ...resolved.requirements])];
                const provider = this.providerFor(resolved.connection.providerAdapter);
                const contextPlan = immutable(assertRequestContextPlan(await cancellable(
                    () => this.contextProvider.buildRequestContextPlan(request, resolved), signal,
                )));
                const promptIr = immutable(assertPromptIR(await cancellable(
                    () => this.preparePrompt({ request, resolved, contextPlan }), signal,
                )));
                if (contextPlan.requestId !== request.requestId || promptIr.requestId !== request.requestId) {
                    throw new GenerationError('generation_request_identity_mismatch');
                }
                const authority = JSON.stringify({ tools: promptIr.tools, outputContract: promptIr.outputContract });
                if (outputAuthority !== undefined && authority !== outputAuthority) {
                    throw new GenerationError('generation_output_authority_changed');
                }
                outputAuthority = authority;
                // Tool/output requirements cannot be silently dropped on another route.
                const implied = [
                    ...(promptIr.tools.length ? ['generation.tools'] : []),
                    ...(promptIr.outputContract ? ['generation.structured-output'] : []),
                ];
                if (implied.some(capability => !resolved.requirements.includes(capability))) {
                    throw new GenerationError('generation_missing_output_requirement');
                }
                const tokens = await cancellable(() => provider.countTokens({ resolved, contextPlan, promptIr }), signal);
                if (!Number.isSafeInteger(tokens) || tokens < 0) throw new GenerationError('generation_invalid_token_count');
                if (tokens > contextPlan.budget.maxTokens
                    || contextPlan.budget.reservedOutputTokens > resolved.model.limits.outputTokens
                    || tokens + contextPlan.budget.reservedOutputTokens > resolved.model.limits.contextTokens) {
                    throw new GenerationError('generation_context_budget_exceeded');
                }
                const snapshot = immutable(assertEffectiveRequestSnapshot({
                    schemaVersion: 1, requestId: request.requestId,
                    runtimeRouteId: resolved.route.runtimeRouteId,
                    modelProfileId: resolved.model.modelProfileId,
                    connectionProfileId: resolved.connection.connectionProfileId,
                    generationProfileRef: resolved.route.generationProfileRef,
                    promptProgramRef: resolved.route.promptProgramRef,
                    capabilities: resolved.capabilities, contextPlan, promptIr,
                    createdAt: this.now(), diagnostics: {
                        inputTokens: tokens,
                        // The existing snapshot diagnostics contract carries the effective
                        // non-secret config so mutable player profiles remain explainable.
                        effectiveConfig: {
                            role: resolved.route.role,
                            connection: {
                                connectionProfileId: resolved.connection.connectionProfileId,
                                providerAdapter: resolved.connection.providerAdapter,
                                transport: resolved.connection.transport,
                                endpoint: resolved.connection.endpoint,
                                networkPolicy: resolved.connection.networkPolicy,
                                options: resolved.connection.options,
                            },
                            model: resolved.model,
                            generation: resolved.generation,
                            resources: resolved.resources,
                        },
                    },
                }));
                const rendered = immutable(await cancellable(() => provider.renderRequest({ resolved, snapshot }), signal));
                try {
                    const response = await this._send({ provider, resolved, rendered, snapshot, signal, handle });
                    return immutable({ snapshot, response });
                } catch (error) {
                    checkCancellation(signal);
                    if (!(error instanceof ProviderFailure) || error.kind === 'application') throw error;
                    if (mode === 'confirm' && remaining > 0 && resolved.route.fallbackRouteRefs.length) {
                        throw new GenerationError('generation_fallback_confirmation_required');
                    }
                    if (mode !== 'automatic' || remaining <= 0) throw new GenerationError('generation_provider_failed');
                    remaining--;
                    pending.push(...resolved.route.fallbackRouteRefs.filter(ref => !visited.has(JSON.stringify(ref))));
                    if (!pending.length) throw new GenerationError('generation_provider_failed');
                }
            }
            throw new GenerationError('generation_fallback_exhausted');
        } catch (error) {
            // Never attach an adapter/secret exception, stack, payload, or cause to diagnostics.
            if (error instanceof GenerationError) throw new GenerationError(error.code);
            throw new GenerationError('generation_execution_failed');
        }
    }

    async _send({ provider, resolved, rendered, snapshot, signal, handle }) {
        checkCancellation(signal);
        // Secret exists only in this send-boundary frame, never in config/render/snapshot.
        let secret;
        try {
            secret = await cancellable(() => this.secretPort.resolveSecret(resolved.connection.secretRef, { handle, signal }), signal);
        } catch {
            checkCancellation(signal);
            throw new GenerationError('generation_secret_unavailable');
        }
        checkCancellation(signal);
        if (typeof secret !== 'string' || !secret) throw new GenerationError('generation_secret_unavailable');
        const containsSecret = value => {
            const encoded = JSON.stringify(value);
            return encoded?.includes(secret) || encoded?.includes(JSON.stringify(secret).slice(1, -1));
        };
        if (containsSecret(snapshot) || containsSecret(rendered)) throw new GenerationError('generation_config_contains_secret');
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(abort, resolved.route.policy.timeoutMs);
        try {
            let raw;
            try {
                raw = await cancellable(() => provider.send(rendered, { secret, signal: controller.signal }), controller.signal);
            } catch (error) {
                checkCancellation(signal);
                if (controller.signal.aborted) throw new ProviderFailure('timeout');
                throw error;
            }
            // Stream/parser/normalizer failures are application errors, never send failures.
            let response;
            try {
                const parsed = await cancellable(() => provider.parseStream(raw, { signal: controller.signal }), controller.signal);
                response = await cancellable(() => provider.normalizeResponse(parsed), controller.signal);
            } catch {
                checkCancellation(signal);
                throw new GenerationError('generation_response_invalid');
            }
            checkCancellation(signal);
            // Adapters are untrusted with respect to accidental credential echoes.
            const encoded = JSON.stringify(response);
            if (encoded === undefined) throw new GenerationError('generation_response_invalid');
            if (encoded.includes(secret) || encoded.includes(JSON.stringify(secret).slice(1, -1))) {
                throw new GenerationError('generation_response_contains_secret');
            }
            return response;
        } finally {
            secret = undefined;
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
        }
    }
}
