import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { RouteResolver } from '../../src/native/model-prompt-runtime/route-resolver.js';
import { observedGenerationUsage } from '../../src/native/adapters/generation-usage.js';
import { evolutionHash as hash, evolutionInteger as integer } from '../../src/native/agent-intelligence/evolution-repository.js';

// Extended outputs are restricted to the explicit local M1 boundary. Keep
// the production evaluator and frozen primary comparison unchanged.
export async function m1GraderConfiguration(host, handle, routeId, outputCeiling = null) {
    const resolver = new RouteResolver({ persistence: host.persistence, library: host.library, providers: host.providers });
    const resolved = await resolver.resolve({ handle, routeRef: { scope: 'player', runtimeRouteId: routeId }, role: 'role.orchestrator', requirements: [] });
    if (resolved.connection.providerAdapter !== 'provider.openai-compatible' || resolved.resources.some(r => r.ref.scope !== 'library')
        || resolved.generation.streaming.enabled) throw new Error('unsupported_m1_grader_configuration');
    integer(resolved.generation.output.maxTokens, 1, resolved.model.limits.outputTokens);
    if (outputCeiling !== null) integer(outputCeiling, 1, resolved.model.limits.outputTokens);
    const config = structuredClone({ route: resolved.route, connection: resolved.connection, model: resolved.model, generation: resolved.generation,
        resources: resolved.resources.map(({ ref, resource }) => ({ ref, resource })) });
    return outputCeiling !== null && config.generation.output.maxTokens > outputCeiling ? boundedOutputConfiguration(config, outputCeiling, 'm1-grader-ceiling-' + outputCeiling) : config;
}

export async function sendM1Grader(evaluator, handle, job, config, payload, signal, fresh) {
    return sendM1Bounded(evaluator, handle, job, config, payload, signal, fresh, false);
}

export function m1ExtractionConfiguration(original) {
    return boundedOutputConfiguration(original, 8000, 'm1-extraction-8000-v1');
}

function boundedOutputConfiguration(original, outputTokens, revision) {
    const config = structuredClone(original);
    if (config.connection.providerAdapter !== 'provider.openai-compatible' || config.generation.streaming.enabled) throw new Error('unsupported_m1_extraction_configuration');
    integer(config.model.limits.contextTokens, outputTokens + 1, Number.MAX_SAFE_INTEGER);
    config.model.limits.outputTokens = outputTokens;
    config.generation.output.maxTokens = outputTokens;
    const generation = config.resources.find(r => r.ref.resourceType === 'core.generation-profile');
    if (!generation) throw new Error('m1_extraction_generation_missing');
    generation.resource.output.maxTokens = outputTokens;
    generation.resource.revision = generation.ref.revision = config.route.generationProfileRef.revision = revision;
    config.generation.revision = generation.resource.revision;
    return config;
}

export async function sendM1Extraction(evaluator, handle, job, config, payload, signal, fresh) {
    return sendM1Bounded(evaluator, handle, job, config, payload, signal, fresh, true);
}

export async function m1EvaluationConfiguration(host, handle, routeId, projectPromptRef = null) {
    const original = await host.persistence.getRuntimeRoute(handle, routeId);
    const route = projectPromptRef ? { ...original, promptProgramRef: projectPromptRef } : original;
    const persistence = Object.create(host.persistence);
    persistence.getRuntimeRoute = async (owner, id) => id === routeId ? route : host.persistence.getRuntimeRoute(owner, id);
    const resolver = new RouteResolver({ persistence, library: host.library, providers: host.providers });
    const resolved = await resolver.resolve({ handle, routeRef: { scope: 'player', runtimeRouteId: routeId }, role: route.role, requirements: ['generation.tools'] });
    if (resolved.connection.providerAdapter !== 'provider.openai-compatible' || resolved.resources.some(r => r.ref.scope !== 'library')
        || resolved.generation.streaming.enabled) throw new Error('unsupported_m1_evaluation_configuration');
    integer(resolved.generation.output.maxTokens, 1, resolved.model.limits.outputTokens);
    return structuredClone({ route: resolved.route, connection: resolved.connection, model: resolved.model, generation: resolved.generation,
        resources: resolved.resources.map(({ ref, resource }) => ({ ref, resource })) });
}

export async function sendM1Evaluation(evaluator, handle, job, config, payload, signal, fresh) {
    return sendM1Bounded(evaluator, handle, job, config, payload, signal, fresh, false, true);
}

async function sendM1Bounded(evaluator, handle, job, config, payload, signal, fresh, extraction, evaluation = false) {
    await fresh(); signal.throwIfAborted();
    if (evaluation ? !['cycle-output-8000-v1', 'm1-configured-output-v1'].includes(job.m1Envelope) || !['baseline', 'candidate', 'judge', 'extraction'].includes(payload.arm) || job.price !== null
        : extraction ? payload.arm !== 'extraction' || payload.trialId !== job.id + ':extract' || job.price !== null
            : payload.arm !== 'judge' || !(job.id.endsWith(':independent') || job.id.startsWith('m1-secondary-diagnostic-') && job.id.endsWith(':diagnostic')) || job.price !== null) throw new Error(extraction ? 'm1_extraction_only' : 'independent_m1_grader_only');
    integer(payload.inputTokens, 1, config.model.limits.contextTokens); integer(payload.outputTokens, 1, config.model.limits.outputTokens);
    if (payload.rendered.endpoint !== config.connection.endpoint || payload.rendered.body.model !== config.model.remoteModelId
        || payload.rendered.body.max_tokens !== payload.outputTokens || payload.outputTokens !== config.generation.output.maxTokens
        || payload.outputTokens > config.model.limits.outputTokens || hash(payload.rendered) !== payload.requestHash) throw new Error('m1_grader_transport_changed');
    if (payload.inputTokens + payload.outputTokens > config.model.limits.contextTokens) throw new Error('m1_grader_context_exceeded');
    const id = randomUUID();
    const kind = evaluation ? payload.arm : extraction ? 'extraction' : 'judge';
    const reservation = await evaluator.repository.reserve(handle, { id, scopeId: job.scopeId, jobId: job.id, kind, upperBound: payload.inputTokens + payload.outputTokens,
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
        return { raw, charge: { id, trialId: payload.trialId, kind, requestHash: payload.requestHash, snapshotHash: payload.snapshotHash,
            status: usage?.totalTokens !== undefined ? 'reported' : 'unknown', tokens: usage?.totalTokens ?? reservation.upperBound, usage, cost: null } };
    } finally { await evaluator.repository.settle(handle, id, usage?.totalTokens ?? null, { usage, cost: null }); }
}
