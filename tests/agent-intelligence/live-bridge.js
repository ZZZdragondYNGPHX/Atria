import { createNativeId } from '../../src/native/identity.js';
import { NativeModelPromptPersistence, VersionedJsonResourceHandler } from '../../src/native/model-prompt-runtime/persistence.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { GenerationService } from '../../src/native/model-prompt-runtime/generation-service.js';
import { RouteResolver } from '../../src/native/model-prompt-runtime/route-resolver.js';
import { PromptCompiler } from '../../src/native/model-prompt-runtime/prompt-compiler.js';
import { EvaluationBudget } from './budget.js';
import { hash } from './cases.js';
import { observedGenerationUsage } from '../../src/native/adapters/generation-usage.js';

function publicDirectorMessages(messages) {
    // Director presentation metadata is not part of a provider transcript.
    // Preserve public tool call/result relationships; never forward reasoning.
    return messages.map(message => ({ role: message.role, content: message.content,
        ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
        ...(message.name ? { name: message.name } : {}),
        ...(message.tool_calls ? { tool_calls: message.tool_calls.map(call => ({ id: call.id, type: call.type,
            function: { name: call.function.name, arguments: call.function.arguments } })) } : {}) }));
}

function generationEndpoint(endpoint) {
    const url = new URL(endpoint);
    if (!/\/v1\/?$/.test(url.pathname)) return endpoint;
    url.pathname = url.pathname.replace(/\/$/, '') + '/chat/completions';
    return url.toString();
}

/** Explicit test connection only, original compiler/resolver/provider and Host.
 * Secret is an injected send-boundary port and never part of the returned identity.
 */
export async function createLiveBridge({ engine, handle, config, secretPort, fetchImpl, budget = new EvaluationBudget(config) }) {
    if (!config || Object.keys(config).some(key => !['endpoint', 'model', 'tokenizer', 'contextTokens', 'maxOutputTokens', 'maxRequests', 'maxTotalTokens', 'timeoutMs'].includes(key))
        || typeof config.model !== 'string' || !config.model || !['cl100k_base', 'o200k_base'].includes(config.tokenizer)
        || ![config.contextTokens, config.maxOutputTokens, config.timeoutMs].every(value => Number.isSafeInteger(value) && value >= 1)
        || config.maxOutputTokens >= config.contextTokens) throw new Error('Exact evaluation connection/tokenizer/limits required');
    const persistence = new NativeModelPromptPersistence({ engine });
    const library = new VersionedJsonResourceHandler({ engine });
    const id = kind => createNativeId(kind, () => hash(['s06-live', config, kind]).slice(0, 32));
    const module = { schemaVersion: 1, promptModuleId: id('promptModule'), revision: 's06-v1', displayName: 'Evaluation transport',
        target: 'system.foundation', stages: ['stage.main'], body: 'Follow the supplied task and its tool contract. Return public output only.' };
    const prompt = { schemaVersion: 1, promptProgramId: id('promptProgram'), revision: 's06-v1', displayName: 'Evaluation program',
        stages: [{ stageId: 'stage.main', moduleRefs: [{ resourceType: 'core.prompt-module', scope: 'library', resourceId: module.promptModuleId, revision: module.revision }] }] };
    const generation = { schemaVersion: 1, generationProfileId: id('generationProfile'), revision: 's06-v1', displayName: 'Evaluation generation',
        output: { maxTokens: config.maxOutputTokens }, streaming: { enabled: false } };
    for (const [type, resource] of [['core.prompt-module', module], ['core.prompt-program', prompt], ['core.generation-profile', generation]]) await library.commit(handle, type, resource);
    const connection = { schemaVersion: 1, connectionProfileId: id('connectionProfile'), scope: 'player', displayName: 'Explicit evaluation connection',
        endpoint: generationEndpoint(config.endpoint), providerAdapter: 'provider.openai-compatible', transport: 'transport.http', secretRef: { secretId: 's06-test-key', scope: 'player' } };
    await persistence.saveConnectionProfile(handle, connection);
    const model = { schemaVersion: 1, modelProfileId: id('modelProfile'), scope: 'player', displayName: 'Explicit evaluation model',
        connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId }, remoteModelId: config.model,
        limits: { contextTokens: config.contextTokens, outputTokens: config.maxOutputTokens }, tokenizer: { encoding: config.tokenizer, source: 'explicit_evaluation_config' } };
    await persistence.saveModelProfile(handle, model);
    const routes = {};
    for (const role of ['orchestrator', 'studio']) {
        const route = { schemaVersion: 1, runtimeRouteId: createNativeId('runtimeRoute', () => hash([config, role]).slice(0, 32)), scope: 'player', displayName: role, role: 'role.' + role,
            modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId }, connectionProfileRef: model.connectionProfileRef,
            promptProgramRef: { resourceType: 'core.prompt-program', scope: 'library', resourceId: prompt.promptProgramId, revision: prompt.revision },
            generationProfileRef: { resourceType: 'core.generation-profile', scope: 'library', resourceId: generation.generationProfileId, revision: generation.revision },
            fallbackRouteRefs: [], policy: { timeoutMs: config.timeoutMs, maxRetries: 0, maxFallbackAttempts: 0 }, requirements: [] };
        await persistence.saveRuntimeRoute(handle, route); routes[role] = route;
    }
    const prepared = new Map(); const attempts = []; let active = null;
    const baseProvider = createHttpGenerationProvider({ fetchImpl: async (url, options) => {
        const attempt = attempts.at(-1);
        try {
            const response = await fetchImpl(url, options);
            attempt.httpStatus = response.status;
            attempt.contentType = response.headers.get('content-type') || 'unavailable';
            return response;
        } catch (error) {
            const code = error.cause?.code;
            attempt.failureCode = ['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(code) ? code : options.signal.aborted ? 'aborted' : 'transport_error';
            throw error;
        }
    } });
    const provider = { ...baseProvider,
        renderRequest(input) {
            const rendered = baseProvider.renderRequest(input);
            prepared.set(hash(rendered), { requestId: input.snapshot.requestId, inputTokens: input.snapshot.diagnostics.inputTokens,
                snapshotHash: hash(input.snapshot), configurationHash: hash(input.snapshot.diagnostics.effectiveConfig) });
            return rendered;
        },
        async send(rendered, boundary) {
            const pin = prepared.get(hash(rendered));
            if (!pin || !active) throw new Error('Unprepared evaluation send');
            const attemptId = pin.requestId + ':send:' + (attempts.filter(item => item.requestId === pin.requestId).length + 1);
            if (budget.reserve({ requestId: attemptId, trialId: active.trialId, inputTokens: pin.inputTokens, reservedOutput: config.maxOutputTokens, kind: active.kind ?? 'model' }).status !== 'passed') {
                active.budgetBlocked = true; throw new Error('evaluation_budget_blocked');
            }
            const attempt = { ...pin, attemptId, trialId: active.trialId, status: 'started', usage: null, durationMs: 0 }; attempts.push(attempt);
            const started = Date.now();
            try { const sending = baseProvider.send(rendered, boundary); active.onSend?.(); const result = await sending; attempt.status = 'sent';
                attempt.httpStatus = result.status; attempt.contentType = result.headers.get('content-type') || 'unavailable'; return result; }
            catch (error) { attempt.status = boundary.signal.aborted ? 'cancelled' : 'failed'; budget.settle(attemptId); throw error; }
            finally { attempt.durationMs = Date.now() - started; }
        },
        normalizeResponse(raw) {
            const attempt = attempts.at(-1);
            attempt.usage = observedGenerationUsage(raw?.usage, { inputTokens: 'prompt_tokens', outputTokens: 'completion_tokens', totalTokens: 'total_tokens' }) ?? null;
            budget.settle(attempt.attemptId, attempt.usage?.totalTokens ?? null);
            try { const response = baseProvider.normalizeResponse(raw); attempt.status = 'completed';
                attempt.toolNames = response.toolCalls.map(call => call.name); attempt.finalTextPresent = Boolean(response.assistantText); return response; }
            catch (error) { attempt.status = 'invalid_response'; throw error; }
        },
    };
    const providers = { 'provider.openai-compatible': provider };
    const resolver = new RouteResolver({ persistence, library, providers });
    const compiler = new PromptCompiler();
    const identity = { configurationHash: hash(config), promptHash: hash([module, prompt]), generationHash: hash(generation),
        routesHash: hash(routes), modelHash: hash(model), providerAdapter: 'provider.openai-compatible',
        model: config.model, tokenizer: config.tokenizer, upstreamStatus: 'unavailable', priceStatus: 'unavailable' };
    return {
        identity, budget, timeoutMs: config.timeoutMs,
        observations: () => structuredClone(attempts),
        async rp({ requestId, trialId, fixtureHash, messages, tools, signal, onSend, kind = 'model' }) {
            if (active) throw new Error('Live evaluation requires serial transport');
            if (!['model', 'grader'].includes(kind)) throw new Error('Invalid evaluation request kind');
            active = { trialId, budgetBlocked: false, onSend, kind };
            try {
                const contextProvider = { buildRequestContextPlan: async () => ({ schemaVersion: 1, requestId,
                    source: { kind: 'task', projectId: id('project'), revision: fixtureHash, taskId: trialId },
                    items: publicDirectorMessages(messages).map((content, index) => ({ kind: 'context.history', id: 'eval-message-' + index, content, provenance: [{ source: 'evaluation.fixture' }] })),
                    provenance: [], budget: { maxTokens: config.contextTokens - config.maxOutputTokens, reservedOutputTokens: config.maxOutputTokens } }) };
                const service = new GenerationService({ resolver, contextProvider, preparePrompt: compiler.preparePrompt, secretPort, providerFor: () => provider });
                return await service.execute({ requestId, handle, role: 'role.orchestrator', routeRef: { scope: 'player', runtimeRouteId: routes.orchestrator.runtimeRouteId },
                    tools, requirements: tools.length ? ['generation.tools'] : [], prompt: {}, fallbackMode: 'disabled', signal });
            } catch (error) {
                if (active.budgetBlocked) throw Object.assign(new Error('comparison_budget_blocked'), { code: 'comparison_budget_blocked' });
                throw error;
            } finally { active = null; }
        },
        async project({ studio, agent, input, trialId, signal }) {
            if (active) throw new Error('Live evaluation requires serial transport');
            active = { trialId, budgetBlocked: false };
            try {
                const host = new NativeGenerationHost({ persistence, library, providers, secretPort, studio, agent });
                return await host.execute(handle, { ...input, routeRef: { scope: 'player', runtimeRouteId: routes.studio.runtimeRouteId }, fallbackMode: 'disabled' }, signal);
            } catch (error) {
                if (active.budgetBlocked) throw Object.assign(new Error('comparison_budget_blocked'), { code: 'comparison_budget_blocked' });
                throw error;
            } finally { active = null; }
        },
    };
}
