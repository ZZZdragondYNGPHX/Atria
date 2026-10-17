import { attachNativeHostLifecycle } from '../../../storage/native-host-lifecycle.js';
import { createEvaluationStore } from './store.js';
import { NativeModelPromptPersistence, VersionedJsonResourceHandler } from '../../model-prompt-runtime/persistence.js';
import { GenerationService } from '../../model-prompt-runtime/generation-service.js';
import { RouteResolver } from '../../model-prompt-runtime/route-resolver.js';
import { PromptCompiler } from '../../model-prompt-runtime/prompt-compiler.js';
import { NativeGenerationHost } from '../../adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../adapters/http-generation-provider.js';
import { hash } from './cases.js';
import { createNativeId } from '../../identity.js';
import { collectVersionedModelPromptResourceRefs } from '../../model-prompt-runtime/resources.js';
import { prepareRetrievalCompute } from '../../retrieval-compute.js';
import { evaluationRetrievalTransport } from './retrieval-transport.js';
import { NativeRetrievalPersistence } from '../../retrieval-persistence.js';
import { executeProjectSkillWork } from '../../skill-invocation.js';

export async function createFrozenEvaluationBridge(config, send, { nativePlan = null } = {}) {
    const store = await createEvaluationStore(nativePlan ? { handle: nativePlan.revision.authorRef.handle } : {}), { engine, handle } = store;
    if (nativePlan) attachNativeHostLifecycle(engine, { directoriesByHandle: owner => { if (owner !== handle) throw new Error('evaluation_owner_mismatch'); return store.dirs; } });
    const persistence = new NativeModelPromptPersistence({ engine }), library = new VersionedJsonResourceHandler({ engine });
    const configurations = [config, ...(nativePlan ? config.nativeRoutes ?? [] : [])];
    const unique = new Map();
    for (const candidate of configurations) for (const resource of candidate.resources) {
        const key = hash(resource.ref);
        if (unique.has(key) && hash(unique.get(key)) !== hash(resource)) throw new Error('evaluation_resource_closure_conflict');
        unique.set(key, resource);
    }
    const pending = [...unique.values()], committed = new Set();
    while (pending.length) {
        const index = pending.findIndex(({ ref, resource }) => collectVersionedModelPromptResourceRefs(ref.resourceType, resource).every(r => committed.has(hash(r))));
        if (index < 0) throw new Error('evaluation_resource_closure_incomplete');
        const { ref, resource } = pending.splice(index, 1)[0];
        await library.commit(handle, ref.resourceType, resource); committed.add(hash(ref));
    }
    const profiles = new Map();
    for (const candidate of configurations) {
        for (const [kind, id, value] of [['connection', candidate.connection.connectionProfileId, candidate.connection], ['model', candidate.model.modelProfileId, candidate.model]]) {
            const key = kind + ':' + id;
            if (profiles.has(key) && profiles.get(key) !== hash(value)) throw new Error('evaluation_profile_conflict');
            profiles.set(key, hash(value));
        }
        const connection = { ...candidate.connection, secretRef: { scope: 'player', secretId: 'evaluation-parent-port' } };
        await persistence.saveConnectionProfile(handle, connection); await persistence.saveModelProfile(handle, candidate.model); await persistence.saveRuntimeRoute(handle, candidate.route);
    }
    if (nativePlan && config.retrievalProfiles) for (const profile of config.retrievalProfiles)
        await new NativeRetrievalPersistence({ engine }).commit(handle, profile);
    let active = null, prepared = null;
    const retrievalTransport = evaluationRetrievalTransport(config, send, () => active);
    const transport = createHttpGenerationProvider();
    const provider = { ...transport,
        renderRequest(input) {
            const rendered = transport.renderRequest(input);
            prepared = { inputTokens: input.snapshot.diagnostics.inputTokens, outputTokens: input.snapshot.contextPlan.budget.reservedOutputTokens,
                requestHash: hash(rendered), snapshotHash: hash(input.snapshot),
                ...(nativePlan ? { nativeRouteId: input.resolved.route.runtimeRouteId } : {}) };
            return rendered;
        },
        async send(rendered, { signal }) {
            if (!active || !prepared || signal.aborted) throw new Error('evaluation_send_unprepared');
            const { onSend, onRendered, beforeSend, ...packet } = active;
            const injected = beforeSend ? await beforeSend({ signal }) : null;
            if (injected === null) onRendered?.(rendered);
            const raw = injected ?? await send({ ...packet, ...prepared, rendered }); onSend?.();
            return { headers: { get: () => 'application/json' }, json: async () => raw };
        },
    };
    const providers = { 'provider.openai-compatible': provider }, secretPort = { resolveSecret: async () => 'parent-port' };
    const resolver = new RouteResolver({ persistence, library, providers }), compiler = new PromptCompiler();
    return {
        ...(config.memorySettings ? { memorySettings: config.memorySettings } : {}),
        identity: { configurationHash: hash(config), promptHash: hash(config.resources), modelHash: hash(config.model) },
        cleanup: async () => { await engine.close(); store.cleanup(); },
        ...(nativePlan ? { native: { store, persistence, library, providers, resolver, secretPort, retrievalTransport },
            async nativeTransport({ trialId, onRendered, beforeSend }, operation) {
                if (active) throw new Error('evaluation_serial_transport_required');
                active = { trialId, kind: 'model', onRendered, beforeSend };
                try { return await operation(); } finally { active = null; }
            } } : {}),
        async projectSkillWork({ studio, agent, repository, settings, request, signal }) {
            const compute = await prepareRetrievalCompute({ handle, context: request.computeContext, profile: { mode: 'embed', purpose: 'studio.skill.v1' },
                persistence, agent, studio });
            return executeProjectSkillWork({ ...request, compute, repository, settings,
                projectId: request.computeContext.projectId, signal });
        },
        async rp({ requestId, trialId, fixtureHash, messages, tools, signal, onSend, kind = 'model' }) {
            if (active) throw new Error('evaluation_serial_transport_required');
            active = { trialId, kind, onSend };
            try {
                const contextProvider = { buildRequestContextPlan: async () => ({ schemaVersion: 1, requestId,
                    source: { kind: 'task', projectId: createNativeId('project', () => '00000000000000000000000000000000'), revision: fixtureHash, taskId: trialId },
                    items: messages.map((m, i) => ({ kind: 'context.history', id: 'evaluation-' + i,
                        content: { role: m.role, content: m.content, ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}), ...(m.name ? { name: m.name } : {}), ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}) },
                        provenance: [{ source: 'evaluation.fixture' }] })), provenance: [],
                    budget: { maxTokens: config.model.limits.contextTokens - config.generation.output.maxTokens, reservedOutputTokens: config.generation.output.maxTokens } }) };
                const service = new GenerationService({ resolver, contextProvider, preparePrompt: compiler.preparePrompt, secretPort, providerFor: () => provider });
                return await service.execute({ requestId, handle, role: config.route.role, routeRef: { scope: 'player', runtimeRouteId: config.route.runtimeRouteId },
                    tools, requirements: tools.length ? ['generation.tools'] : [], prompt: {}, fallbackMode: 'disabled', signal });
            } finally { active = null; }
        },
        async project({ studio, agent, input, trialId, signal }) {
            if (active) throw new Error('evaluation_serial_transport_required');
            active = { trialId, kind: 'model' };
            try {
                const host = new NativeGenerationHost({ persistence, library, providers, secretPort, studio, agent });
                return await host.execute(handle, { ...input, routeRef: { scope: 'player', runtimeRouteId: config.route.runtimeRouteId }, fallbackMode: 'disabled' }, signal);
            } finally { active = null; }
        },
    };
}
