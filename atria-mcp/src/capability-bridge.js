import { z } from 'zod';
import { redact } from './policy.js';
import { compareBrowser } from './provenance.js';

const empty = z.strictObject({});
const name = z.string().max(256);
// Phase 2 adapters are internal. Phase 3 registers selected READ semantics in
// the existing Registry; no extra tool or dynamic capability/method argument.
const adapters = Object.freeze({
    'memory.schema.scope': { authority: 'memory-graph.getSchemaScopeInfo', input: empty,
        output: z.strictObject({ scope: z.enum(['character', 'global']), hasOverride: z.boolean(), hasAvatar: z.boolean() }) },
    'agents.presets.list': { authority: 'orchestrator.listWorkspacePresets', input: empty,
        output: z.array(z.strictObject({ id: name, name, mode: name })).max(200) },
    'game.loaded.identity': { authority: 'game-runtime.getPackageState (browser-loaded state)', input: empty,
        output: z.strictObject({ status: name, active: z.boolean(), sessionId: name.nullable(),
            packageVersionId: name.nullable(), packageContentHash: name.nullable(), entryPointId: name.nullable() }) },
});

export const BROWSER_ADAPTERS = Object.freeze(Object.entries(adapters).map(([id, adapter]) => Object.freeze({ id,
    risk: 'READ', authority: adapter.authority, externalEffects: [], approval: 'none',
    availability: 'MCP-owned same-origin page and exact first-party method must exist; outputs bounded and projected',
    inputSchema: z.toJSONSchema(adapter.input), outputSchema: z.toJSONSchema(adapter.output) })));

export async function invokeBrowserAdapter(browser, action, input = {}) {
    if (!Object.hasOwn(adapters, action)) throw new Error('Browser adapter is not allowlisted.');
    const adapter = adapters[action]; adapter.input.parse(input);
    if (!browser.page || browser.page.isClosed() || new URL(browser.page.url()).origin !== browser.config.url) throw new Error('Browser adapter requires an open Atria page.');
    const generation = browser.documentGeneration;
    const provenance = { serverBootId: browser.loadedIdentity?.serverBootId ?? null,
        experience: structuredClone(browser.scopedEvidence?.experience ?? null), documentGeneration: generation };
    let result;
    try {
        result = await browser.page.evaluate(async ({ action, timeout }) => {
            const run = async () => {
                const context = globalThis.Atria?.getContext?.();
                if (!context?.getCapabilityApi) return { unavailable: true };
                // All lookup names and method accesses are literal. The caller
                // cannot select JS, a property chain, a capability or a method.
                switch (action) {
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
            let timer;
            try {
                const result = await Promise.race([run(), new Promise(resolve => { timer = setTimeout(() => resolve({ unavailable: true }), timeout); })]);
                return JSON.stringify(result).length <= 65536 ? result : { invalid: true };
            } catch { return { unavailable: true }; }
            finally { clearTimeout(timer); }
        }, { action, timeout: browser.config.timeout });
    } catch { throw new Error('Browser capability unavailable.'); }
    if (generation !== browser.documentGeneration) throw new Error('Browser document changed during adapter read.');
    if (JSON.stringify(provenance.experience) !== JSON.stringify(browser.scopedEvidence?.experience ?? null)) throw new Error('Experience scope changed during adapter read.');
    if (result.unavailable) throw new Error('First-party browser capability unavailable.');
    const parsed = adapter.output.safeParse(result.value);
    if (!parsed.success) throw new Error('Browser capability output failed its fixed schema.');
    const server = await browser.runtimeIdentity();
    if (generation !== browser.documentGeneration) throw new Error('Browser document changed during adapter read.');
    return { action, risk: 'READ', provenance: { ...provenance, browserFreshness: compareBrowser(provenance, server), currentServerBootId: server?.serverBootId ?? null }, value: redact(parsed.data) };
}
