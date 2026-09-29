import { z } from 'zod';
import { createHash } from 'node:crypto';
import { redact } from './policy.js';
import { compareBrowser } from './provenance.js';

const empty = z.strictObject({});
const name = z.string().max(256);
const ident = name.min(1);
const types = z.array(ident).max(20).optional();
const search = { query: z.string().min(1).max(4000), types, k: z.number().int().min(1).max(100).default(20) };
const read = (authority, shape = {}, effects = []) => ({ authority, input: z.strictObject({ ...shape,
    outputOffset: z.number().int().min(0).max(1048576).default(0), outputLimit: z.number().int().min(100).max(64000).default(24000) }), output: z.json(), externalEffects: effects });
// Fixed adapters register selected READ semantics in
// the existing Registry; no extra tool or dynamic capability/method argument.
const adapters = Object.freeze({
    'memory.status': read('memory-graph schema scope / current injection'),
    'memory.schema': read('memory-graph.openReadSession.getSchema'),
    'memory.nodes.list': read('memory-graph.openReadSession.listNodes', { types, activeOnly: z.boolean().default(true) }),
    'memory.graph.edges': read('memory-graph.openReadSession.listEdges', { from: ident.optional(), to: ident.optional(), types, excludeInternal: z.boolean().default(true) }),
    'memory.node.get': read('memory-graph.openReadSession.getNode', { id: ident }),
    'memory.nodes.get': read('memory-graph.openReadSession.getNode (bounded ids)', { ids: z.array(ident).min(1).max(50) }),
    'memory.candidates': read('memory-graph.openReadSession.listVisibleCandidates', { types, excludeRecentMessages: z.number().int().min(0).max(1000).default(0) }),
    'memory.node.brief': read('memory-graph.openReadSession.getNodeBrief', { id: ident }),
    'memory.edges': read('memory-graph.openReadSession.getEdgeSummary', { id: ident, limit: z.number().int().min(1).max(100).default(20) }),
    'memory.graph.expand': read('memory-graph.openReadSession.expandFromSeeds', { ids: z.array(ident).min(1).max(20), hops: z.number().int().min(1).max(3).default(1), edgeTypes: types }),
    'memory.search.keyword': read('memory-graph.openReadSession.keywordSearch', search),
    'memory.search.vector': read('memory-graph.openReadSession.vectorSearch', search, ['embedding-provider-network', 'mayIncurCost']),
    'memory.resolve': read('memory-graph.openReadSession.findByName', { query: search.query, types }),
    'memory.recall': read('memory-graph.previewRecall (no persistent reconciliation/access accounting)', { query: search.query }, ['embedding-rerank-provider-network', 'mayIncurCost']),
    'memory.compaction.candidates': read('memory-graph.openReadSession.compactionCandidates', { type: ident, depth: z.number().int().min(0).max(10).default(0) }),
    'memory.injection': read('memory-graph.getCurrentInjection'),
    'memory.recall.last': read('memory-graph.getLoadedRecallProjection'),
    'agents.run.get': read('orchestrator.getRunObservation', { runId: ident.optional(), nodeId: ident.optional(), stepId: ident.optional() }),
    'agents.checkpoints': read('orchestrator.listRuntimeCheckpoints'),
    'agents.binding': read('orchestrator.getPresetBinding', { scope: z.enum(['global', 'character', 'chat', 'package']), subjectId: ident }),
    'agents.tools': read('orchestrator.listExtensionTools'),
    'game.llm.status': read('game-runtime.getLlmRuntimeState (browser-loaded LLM routing, not committed Conversation or GenerationProjection)'),
    'game.presentation': read('game-runtime.getPresentationCapabilities'),
    'memory.schema.scope': { authority: 'memory-graph.getSchemaScopeInfo', input: empty,
        output: z.strictObject({ scope: z.enum(['character', 'global']), hasOverride: z.boolean(), hasAvatar: z.boolean() }) },
    'agents.presets.list': { authority: 'orchestrator.listWorkspacePresets', input: empty,
        output: z.array(z.strictObject({ id: name, name, mode: name })).max(200) },
    'game.loaded.identity': { authority: 'game-runtime.getPackageState (browser-loaded state)', input: empty,
        output: z.strictObject({ status: name, active: z.boolean(), sessionId: name.nullable(),
            packageVersionId: name.nullable(), packageContentHash: name.nullable(), entryPointId: name.nullable() }) },
});

export const BROWSER_ADAPTERS = Object.freeze(Object.entries(adapters).map(([id, adapter]) => Object.freeze({ id,
    risk: 'READ', authority: adapter.authority, externalEffects: adapter.externalEffects ?? [], approval: 'none',
    availability: 'MCP-owned same-origin page and exact first-party method must exist; outputs bounded and projected',
    inputSchema: z.toJSONSchema(adapter.input), outputSchema: z.toJSONSchema(adapter.output) })));

export const browserAdapterSchema = action => adapters[action].input;

export async function invokeBrowserAdapter(browser, action, input = {}) {
    if (!Object.hasOwn(adapters, action)) throw new Error('Browser adapter is not allowlisted.');
    const adapter = adapters[action]; input = adapter.input.parse(input);
    const { outputOffset = 0, outputLimit = 64000, ...argumentsOnly } = input;
    if (!browser.page || browser.page.isClosed() || new URL(browser.page.url()).origin !== browser.config.url) throw new Error('Browser adapter requires an open Atria page.');
    const generation = browser.documentGeneration;
    const provenance = { serverBootId: browser.loadedIdentity?.serverBootId ?? null,
        experience: structuredClone(browser.scopedEvidence?.experience ?? null), documentGeneration: generation };
    let result;
    try {
        result = await browser.page.evaluate(async ({ action, input, timeout }) => {
            const run = async () => {
                const context = globalThis.Atria?.getContext?.();
                if (!context?.getCapabilityApi) return { unavailable: true };
                // All lookup names and method accesses are literal. The caller
                // cannot select JS, a property chain, a capability or a method.
                switch (action) {
                    case 'memory.status':
                    case 'memory.schema':
                    case 'memory.nodes.list':
                    case 'memory.graph.edges':
                    case 'memory.candidates':
                    case 'memory.node.brief':
                    case 'memory.edges':
                    case 'memory.graph.expand':
                    case 'memory.search.keyword':
                    case 'memory.search.vector':
                    case 'memory.resolve':
                    case 'memory.compaction.candidates': {
                        const api = context.getCapabilityApi('memory-graph');
                        if (action === 'memory.status') return { value: { scope: api.getSchemaScopeInfo(context), injection: api.getCurrentInjection(context) } };
                        if (typeof api?.openReadSession !== 'function') return { unavailable: true };
                        const session = await api.openReadSession(context);
                        if (!session) return { unavailable: true };
                        switch (action) {
                            case 'memory.schema': return { value: session.getSchema() };
                            case 'memory.nodes.list': return { value: session.listNodes(input) };
                            case 'memory.graph.edges': return { value: session.listEdges(input) };
                            case 'memory.candidates': return { value: session.listVisibleCandidates(input) };
                            case 'memory.node.brief': return { value: session.getNodeBrief(input.id) };
                            case 'memory.edges': return { value: session.getEdgeSummary(input.id, { limit: input.limit }) };
                            case 'memory.graph.expand': return { value: session.expandFromSeeds(input.ids, { hops: input.hops, edgeTypes: input.edgeTypes }) };
                            case 'memory.search.keyword': return { value: session.keywordSearch(input) };
                            case 'memory.search.vector': return { value: await session.vectorSearch(input) };
                            case 'memory.resolve': return { value: session.findByName(input) };
                            case 'memory.compaction.candidates': return { value: session.compactionCandidates(input) };
                        }
                        return { unavailable: true };
                    }
                    case 'memory.node.get': {
                        const session = await context.getCapabilityApi('memory-graph').openReadSession(context);
                        return session ? { value: session.getNode(input.id) } : { unavailable: true };
                    }
                    case 'memory.nodes.get': {
                        const session = await context.getCapabilityApi('memory-graph').openReadSession(context);
                        return session ? { value: input.ids.map(id => session.getNode(id)) } : { unavailable: true };
                    }
                    case 'memory.injection': return { value: await context.getCapabilityApi('memory-graph').getCurrentInjection(context) };
                    case 'memory.recall.last': return { value: await context.getCapabilityApi('memory-graph').getLoadedRecallProjection(context) };
                    case 'memory.recall': return { value: await context.getCapabilityApi('memory-graph').previewRecall(context, input.query) };
                    case 'agents.run.get': return { value: await context.getCapabilityApi('orchestrator').getRunObservation(input) };
                    case 'agents.checkpoints': return { value: await context.getCapabilityApi('orchestrator').listRuntimeCheckpoints() };
                    case 'agents.binding': return { value: await context.getCapabilityApi('orchestrator').getPresetBinding(input.scope, input.subjectId) };
                    case 'agents.tools': {
                        const tools = await context.getCapabilityApi('orchestrator').listExtensionTools();
                        return { value: tools.map(({ name, description }) => ({ name, description })) };
                    }
                    case 'game.llm.status': return { value: await context.getCapabilityApi('game-runtime').getLlmRuntimeState() };
                    case 'game.presentation': return { value: await context.getCapabilityApi('game-runtime').getPresentationCapabilities() };
                    case 'memory.schema.scope': {
                        const api = context.getCapabilityApi('memory-graph');
                        if (typeof api?.getSchemaScopeInfo !== 'function') return { unavailable: true };
                        const value = await api.getSchemaScopeInfo(context);
                        return { value: { scope: value.scope, hasOverride: value.hasOverride, hasAvatar: value.hasAvatar } };
                    }
                    case 'agents.presets.list': {
                        const api = context.getCapabilityApi('orchestrator');
                        if (typeof api?.listWorkspacePresets !== 'function') return { unavailable: true };
                        const rows = await api.listWorkspacePresets();
                        if (!Array.isArray(rows) || rows.length > 200) return { invalid: true };
                        return { value: rows.map(({ id, name, mode }) => ({ id, name, mode })) };
                    }
                    case 'game.loaded.identity': {
                        const api = context.getCapabilityApi('game-runtime');
                        if (typeof api?.getPackageState !== 'function') return { unavailable: true };
                        const state = await api.getPackageState();
                        return { value: { status: state.status, active: state.active, sessionId: state.sessionId || null,
                            packageVersionId: state.descriptor?.packageVersionId ?? null,
                            packageContentHash: state.descriptor?.packageContentHash ?? null, entryPointId: state.descriptor?.entryPointId ?? null } };
                    }
                    default: return { unavailable: true };
                }
            };
            const scope = async () => {
                const context = globalThis.Atria?.getContext?.();
                const game = context?.getCapabilityApi?.('game-runtime');
                const state = await game?.getPackageState?.();
                return JSON.stringify([context?.chatId ?? null, state?.sessionId ?? null,
                    await game?.getWorldBranchIdentity?.() ?? null]);
            };
            let timer;
            try {
                const before = await scope();
                const result = await Promise.race([run(), new Promise(resolve => { timer = setTimeout(() => resolve({ unavailable: true }), timeout); })]);
                if (before !== await scope()) return { scopeChanged: true };
                const serialized = JSON.stringify(result, (_key, value) => value instanceof Set ? [...value] : value instanceof Map ? Object.fromEntries(value) : value);
                return serialized.length <= 1048576 ? JSON.parse(serialized) : { invalid: true };
            } catch { return { unavailable: true }; }
            finally { clearTimeout(timer); }
        }, { action, input: argumentsOnly, timeout: browser.config.timeout });
    } catch { throw new Error('Browser capability unavailable.'); }
    if (generation !== browser.documentGeneration) throw new Error('Browser document changed during adapter read.');
    if (JSON.stringify(provenance.experience) !== JSON.stringify(browser.scopedEvidence?.experience ?? null)) throw new Error('Experience scope changed during adapter read.');
    if (result.unavailable) throw new Error('First-party browser capability unavailable.');
    if (result.scopeChanged) throw new Error('Browser-owned Session scope changed during read.');
    const parsed = adapter.output.safeParse(result.value);
    if (!parsed.success) throw new Error('Browser capability output failed its fixed schema.');
    const server = await browser.runtimeIdentity();
    if (generation !== browser.documentGeneration) throw new Error('Browser document changed during adapter read.');
    if (JSON.stringify(provenance.experience) !== JSON.stringify(browser.scopedEvidence?.experience ?? null)) throw new Error('Experience scope changed during adapter read.');
    const clean = redact(parsed.data), serialized = JSON.stringify(clean);
    return { action, risk: 'READ', provenance: { ...provenance, scopedEvidenceStatus: 'last-observed; not current exact verification', observedAt: new Date().toISOString(), browserFreshness: compareBrowser(provenance, server), currentServerBootId: server?.serverBootId ?? null },
        value: outputOffset === 0 && serialized.length <= outputLimit ? clean : { format: 'json-text-fragment', text: serialized.slice(outputOffset, outputOffset + outputLimit) },
        page: { totalChars: serialized.length, nextOffset: outputOffset + outputLimit < serialized.length ? outputOffset + outputLimit : null, contentHash: createHash('sha256').update(serialized).digest('hex') } };
}
