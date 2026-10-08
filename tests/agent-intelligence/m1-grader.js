import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { RouteResolver } from '../../src/native/model-prompt-runtime/route-resolver.js';
import { observedGenerationUsage } from '../../src/native/adapters/generation-usage.js';
import { evolutionHash as hash, evolutionInteger as integer } from '../../src/native/agent-intelligence/evolution-repository.js';

// Only the independent M1 grader needs additional room for reasoning. Keep
// the production evaluator and frozen primary comparison unchanged.
export async function m1GraderConfiguration(host, handle, routeId) {
    const resolver = new RouteResolver({ persistence: host.persistence, library: host.library, providers: host.providers });
    const resolved = await resolver.resolve({ handle, routeRef: { scope: 'player', runtimeRouteId: routeId }, role: 'role.orchestrator', requirements: [] });
    if (resolved.connection.providerAdapter !== 'provider.openai-compatible' || resolved.resources.some(r => r.ref.scope !== 'library')
        || resolved.generation.streaming.enabled) throw new Error('unsupported_m1_grader_configuration');
    integer(resolved.generation.output.maxTokens, 1, 8192);
    return structuredClone({ route: resolved.route, connection: resolved.connection, model: resolved.model, generation: resolved.generation,
        resources: resolved.resources.map(({ ref, resource }) => ({ ref, resource })) });
}

export async function sendM1Grader(evaluator, handle, job, config, payload, signal, fresh) {
    return sendM1Bounded(evaluator, handle, job, config, payload, signal, fresh, false);
}

export function m1ExtractionConfiguration(original) {
    const config = structuredClone(original);
    if (config.connection.providerAdapter !== 'provider.openai-compatible' || config.generation.streaming.enabled) throw new Error('unsupported_m1_extraction_configuration');
    integer(config.model.limits.contextTokens, 8001, Number.MAX_SAFE_INTEGER);
    config.model.limits.outputTokens = 8000;
    config.generation.output.maxTokens = 8000;
    const generation = config.resources.find(r => r.ref.resourceType === 'core.generation-profile');
    if (!generation) throw new Error('m1_extraction_generation_missing');
    generation.resource.output.maxTokens = 8000;
    generation.resource.revision = generation.ref.revision = config.route.generationProfileRef.revision = 'm1-extraction-8000-v1';
    config.generation.revision = generation.resource.revision;
    return config;
}

export async function sendM1Extraction(evaluator, handle, job, config, payload, signal, fresh) {
    return sendM1Bounded(evaluator, handle, job, config, payload, signal, fresh, true);
}

async function sendM1Bounded(evaluator, handle, job, config, payload, signal, fresh, extraction) {
    await fresh(); signal.throwIfAborted();
    if (extraction ? payload.arm !== 'extraction' || payload.trialId !== job.id + ':extract' || job.price !== null
        : payload.arm !== 'judge' || !job.id.endsWith(':independent') || job.price !== null) throw new Error(extraction ? 'm1_extraction_only' : 'independent_m1_grader_only');
    integer(payload.inputTokens, 1, config.model.limits.contextTokens); integer(payload.outputTokens, 1, extraction ? 8000 : 8192);
    if (payload.rendered.endpoint !== config.connection.endpoint || payload.rendered.body.model !== config.model.remoteModelId
        || payload.rendered.body.max_tokens !== payload.outputTokens || payload.outputTokens !== config.generation.output.maxTokens
        || payload.outputTokens > config.model.limits.outputTokens || hash(payload.rendered) !== payload.requestHash) throw new Error('m1_grader_transport_changed');
    if (payload.inputTokens + payload.outputTokens > config.model.limits.contextTokens) throw new Error('m1_grader_context_exceeded');
    const id = randomUUID();
    const reservation = await evaluator.repository.reserve(handle, { id, scopeId: job.scopeId, jobId: job.id, kind: extraction ? 'extraction' : 'judge', upperBound: payload.inputTokens + payload.outputTokens,
        trialId: payload.trialId, requestHash: payload.requestHash, snapshotHash: payload.snapshotHash });
    let usage = null;
    try {
        if (reservation.createdAt > Date.now()) await delay(reservation.createdAt - Date.now(), undefined, { signal });
        await fresh(); signal.throwIfAborted();
        const secret = await evaluator.host.secretPort.resolveSecret(config.connection.secretRef, { handle });
        const provider = evaluator.host.providers[config.connection.providerAdapter];
        const response = await provider.send(payload.rendered, { secret, signal });
        const raw = await provider.parseStream(response);
        usage = observedGenerationUsage(raw?.usage, { inputTokens: 'prompt_tokens', outputTokens: 'completion_tokens', totalTokens: 'total_tokens' });
        return { raw, charge: { id, trialId: payload.trialId, kind: extraction ? 'extraction' : 'judge', requestHash: payload.requestHash, snapshotHash: payload.snapshotHash,
            status: usage?.totalTokens !== undefined ? 'reported' : 'unknown', tokens: usage?.totalTokens ?? reservation.upperBound, usage, cost: null } };
    } finally { await evaluator.repository.settle(handle, id, usage?.totalTokens ?? null, { usage, cost: null }); }
}
