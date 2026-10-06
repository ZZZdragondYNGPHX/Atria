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

export async function createFrozenEvaluationBridge(config, send) {
    const store = await createEvaluationStore(), { engine, handle } = store;
    const persistence = new NativeModelPromptPersistence({ engine }), library = new VersionedJsonResourceHandler({ engine });
    const pending = [...config.resources], committed = new Set();
    while (pending.length) {
        const index = pending.findIndex(({ ref, resource }) => collectVersionedModelPromptResourceRefs(ref.resourceType, resource).every(r => committed.has(hash(r))));
        if (index < 0) throw new Error('evaluation_resource_closure_incomplete');
        const { ref, resource } = pending.splice(index, 1)[0];
        await library.commit(handle, ref.resourceType, resource); committed.add(hash(ref));
    }
    const connection = { ...config.connection, secretRef: { scope: 'player', secretId: 'evaluation-parent-port' } };
    await persistence.saveConnectionProfile(handle, connection); await persistence.saveModelProfile(handle, config.model); await persistence.saveRuntimeRoute(handle, config.route);
    let active = null, prepared = null;
    const transport = createHttpGenerationProvider();
    const provider = { ...transport,
        renderRequest(input) {
            const rendered = transport.renderRequest(input);
            prepared = { inputTokens: input.snapshot.diagnostics.inputTokens, outputTokens: input.snapshot.contextPlan.budget.reservedOutputTokens,
                requestHash: hash(rendered), snapshotHash: hash(input.snapshot) };
            return rendered;
        },
        async send(rendered, { signal }) {
            if (!active || !prepared || signal.aborted) throw new Error('evaluation_send_unprepared');
            const { onSend, ...packet } = active;
            const raw = await send({ ...packet, ...prepared, rendered }); onSend?.();
            return { headers: { get: () => 'application/json' }, json: async () => raw };
        },
    };
    const providers = { 'provider.openai-compatible': provider }, secretPort = { resolveSecret: async () => 'parent-port' };
    const resolver = new RouteResolver({ persistence, library, providers }), compiler = new PromptCompiler();
    return {
        identity: { configurationHash: hash(config), promptHash: hash(config.resources), modelHash: hash(config.model) },
        cleanup: () => store.cleanup(),
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
