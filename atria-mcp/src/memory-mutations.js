import { z } from 'zod';
import { fingerprint } from './kernel.js';
import { compareBrowser } from './provenance.js';
import { redact } from './policy.js';

const id = z.string().min(1).max(256);
const fields = z.record(z.string().max(128), z.json()).refine(v => JSON.stringify(v).length <= 16000);
const shapes = {
    'memory.node.delete': { id },
    'memory.relation.delete': { source: z.strictObject({ id }), target: z.strictObject({ id }), relation: id, direction: z.enum(['outgoing', 'incoming', 'bidirectional']).optional() },
    'memory.node.create': { type: id, title: z.string().max(2000), fields },
    'memory.node.edit': { id, title: z.string().max(2000).optional(), setFields: fields, clearFields: z.array(id).max(30).default([]) },
    'memory.relation.upsert': { source: z.strictObject({ id }), links: z.array(z.strictObject({ target: z.strictObject({ id }), relation: id, direction: z.enum(['outgoing', 'incoming', 'bidirectional']).optional() })).min(1).max(30) },
    'memory.compact': { type: id, childIds: z.array(id).min(1).max(30), summary: z.string().min(1).max(8000), fields },
};

// Literal first-party capability calls only; all writes use the owning guarded session.
async function bridge(browser, action, input = {}, expected = null) {
    return browser.page.evaluate(async ({ action, input, expected }) => {
        const context = globalThis.Atria?.getContext?.();
        const api = context?.getCapabilityApi?.('memory-graph');
        const game = context?.getCapabilityApi?.('game-runtime');
        if (!api?.openReadSession || !api?.openGuardedSession) throw new Error('Guarded Memory capability unavailable');
        const scope = async () => {
            // Native Session owns Memory persistence. The game presentation may
            // temporarily unload during an ordinary revision commit; it cannot
            // replace this stronger owning identity with a transient null.
            const runtime = globalThis.Atria?.nativeSessionRuntime;
            const snapshot = runtime?.active ? runtime.snapshot : null;
            const sessionId = snapshot?.session?.sessionId;
            if (runtime?.active && (!sessionId || !snapshot.revision?.branchId || !snapshot.revision?.revisionId)) throw new Error('Native Memory identity unavailable');
            return { chatId: globalThis.Atria?.getContext?.()?.chatId ?? null,
                sessionId: sessionId ?? (await game?.getPackageState?.())?.sessionId ?? null,
                branch: sessionId ? { sessionId, branchId: snapshot.revision?.branchId, revisionId: snapshot.revision?.revisionId }
                    : await game?.getWorldBranchIdentity?.() ?? null };
        };
        const target = await scope();
        if (!target.chatId && !target.sessionId) throw new Error('Loaded Memory target required');
        const read = await api.openReadSession(context);
        if (!read) throw new Error('Loaded Memory graph required');
        const graph = { schema: read.getSchema(), nodes: read.listNodes({ activeOnly: false }), edges: read.listEdges({ excludeInternal: false }) };
        const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
        const bytes = new TextEncoder().encode(JSON.stringify(canonical(graph)));
        if (bytes.length > 1048576) throw new Error('Memory graph exceeds bounded guard size');
        const graphHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
        if (JSON.stringify(target) !== JSON.stringify(await scope())) throw new Error('Memory scope changed');
        if (!expected) return { target, graphHash };
        if (graphHash !== expected.graphHash || JSON.stringify(target) !== JSON.stringify(expected.target)) throw new Error('Stale Memory review');
        const write = await api.openGuardedSession(context, graph);
        if (!write || JSON.stringify(target) !== JSON.stringify(await scope())) throw new Error('Memory source session unavailable');
        let result;
        switch (action) {
            case 'memory.node.delete': result = await write.deleteNode(input); break;
            case 'memory.relation.delete': result = await write.deleteLinks(input); break;
            case 'memory.node.create': result = await write.createNode(input); break;
            case 'memory.node.edit': result = await write.editNode(input); break;
            case 'memory.relation.upsert': result = await write.upsertLinks(input); break;
            case 'memory.compact': result = await write.compactNodes(input); break;
            default: throw new Error('Unknown fixed Memory operation');
        }
        const afterTarget = await scope();
        // The owning persistence transaction advances the Native revision on a
        // successful write. Keep exact revision checks before the write, but
        // compare stable ownership after it; this is observed revision evidence,
        // not a claim that no subsequent same-branch writer has run.
        const ownership = value => ({ ...value, branch: value.branch && typeof value.branch === 'object'
            ? Object.fromEntries(Object.entries(value.branch).filter(([key]) => key !== 'revisionId')) : value.branch });
        if (JSON.stringify(ownership(target)) !== JSON.stringify(ownership(afterTarget))) throw new Error('Scope changed during Memory write; inspect authority');
        return { value: result, afterTarget };
    }, { action, input, expected });
}

export function registerMemoryMutations(registry, browser) {
    const current = async () => {
        if (!browser.page || browser.page.isClosed() || new URL(browser.page.url()).origin !== browser.config.url) throw new Error('Open Atria page required');
        const runtime = await browser.runtimeIdentity();
        if (compareBrowser(browser.loadedIdentity, runtime) !== 'CURRENT') throw new Error('Stale browser; reload before mutation');
        return runtime.serverBootId;
    };
    registry.register({ version: 1, id: 'memory.mutation.inspect', domain: 'memory', title: 'Loaded Memory exact mutation fingerprint', risk: 'READ',
        authority: 'Memory loaded read factory', adapter: 'fixed-browser', externalEffects: [], guards: [], approval: 'none', availability: { available: true, reason: 'Loaded guarded Memory capability required' } },
    z.strictObject({}), z.json(), async () => { const serverBootId = await current(); return { ...await bridge(browser, 'inspect'), serverBootId }; });
    for (const [action, shape] of Object.entries(shapes)) registry.register({ version: 1, id: action, domain: 'memory', title: action, risk: action.endsWith('.delete') ? 'DESTRUCTIVE' : 'MUTATE',
        authority: 'Memory guarded source session / persistence', adapter: 'fixed-browser', externalEffects: ['memory-persistence'],
        guards: ['browser-server-boot', 'current-memory-target', 'graph-fingerprint', 'source-session', 'double-check'], approval: 'trusted-approval-required',
        availability: { available: true, reason: 'Loaded guarded Memory capability, exact graph hash, policy and trusted approval' } },
    z.strictObject({ graphHash: z.string().regex(/^[a-f0-9]{64}$/), target: z.strictObject({ chatId: z.union([z.string(), z.number(), z.null()]), sessionId: id.nullable(), branch: z.json() }), operation: z.strictObject(shape) }), z.json(),
    async (i, { before }) => {
        if (await current() !== before.serverBootId || browser.documentGeneration !== before.documentGeneration) throw new Error('Browser changed before Memory execution');
        const committed = redact(await bridge(browser, action, i.operation, { graphHash: i.graphHash, target: i.target }));
        if (await current() !== before.serverBootId || browser.documentGeneration !== before.documentGeneration) throw new Error('Browser changed during Memory execution; inspect authority');
        const value = committed.value;
        return { ok: value?.ok !== false && !value?.error, value, receiptEvidence: { after: value,
            deleted: action.endsWith('.delete') ? [{ kind: action, ...i.operation }] : [],
            created: !action.endsWith('.delete') && (value?.id || value?.rollupNodeId) ? [{ kind: 'memory-node', id: value.id ?? value.rollupNodeId }] : [],
            provenance: { documentGeneration: before.documentGeneration, memoryTarget: before.target, observedAfterTarget: committed.afterTarget,
                experienceEvidence: 'Memory source/branch guard; no Frontend Host Bridge handle or exact Experience Epoch claim' } } };
    }, async i => {
        const serverBootId = await current(); const documentGeneration = browser.documentGeneration;
        const observed = await bridge(browser, 'inspect');
        if (observed.graphHash !== i.graphHash || fingerprint(observed.target) !== fingerprint(i.target)) throw new Error('Stale Memory graph or target');
        if (await current() !== serverBootId || documentGeneration !== browser.documentGeneration) throw new Error('Browser changed during Memory guard');
        return { serverBootId, documentGeneration, target: observed.target, graphHash: observed.graphHash };
    });
    return registry;
}
