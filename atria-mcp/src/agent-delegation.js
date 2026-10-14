import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fingerprint } from './kernel.js';
import { compareBrowser } from './provenance.js';
import { redact } from './policy.js';
import { NativeDelegatedGeneration } from './delegated-generation.js';

const mappings = Object.freeze({ 'memory.node.create': 'memory_node_create', 'memory.node.edit': 'memory_node_edit',
    'memory.relation.upsert': 'memory_link_upsert', 'memory.compact': 'memory_compact_nodes' });
const id = z.string().min(1).max(256);
const selection = { presetId: id, nodeId: id };
const routeId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/);
export function registerAgentDelegation(registry, browser, { generation = new NativeDelegatedGeneration(browser) } = {}) {
    let bindingPage = null, active = null;
    const current = async () => {
        const runtime = await browser.runtimeIdentity();
        if (!browser.page || browser.page.isClosed() || new URL(browser.page.url()).origin !== browser.config.url
            || compareBrowser(browser.loadedIdentity, runtime) !== 'CURRENT') throw new Error('Current Atria browser required for delegated run');
        return { serverBootId: runtime.serverBootId, documentGeneration: browser.documentGeneration };
    };
    const inspect = async i => {
        const identity = await current();
        const detail = await browser.page.evaluate(i => {
            const api = globalThis.Atria?.getContext?.().getCapabilityApi?.('orchestrator');
            if (!api?.inspectDelegatedRun) throw new Error('Product delegated authority unavailable');
            return api.inspectDelegatedRun(i);
        }, { presetId: i.presetId, nodeId: i.nodeId });
        if (JSON.stringify(detail).length > 18000) throw new Error('Preset exceeds bounded delegation review');
        const runtimeRouteId = routeId.parse(i.runtimeRouteId ?? detail.definition.modelProfile?.nativeRouteRef?.runtimeRouteId);
        const generationReview = await generation.review(detail.scope, runtimeRouteId);
        if (fingerprint(identity) !== fingerprint(await current())) throw new Error('Browser changed during inspection');
        if (generationReview.serverBootId !== identity.serverBootId) throw new Error('Delegated Native configuration Host changed.');
        return { ...identity, detail, presetHash: fingerprint(detail), runtimeRouteId, generationReview, generationFingerprint: fingerprint(generationReview) };
    };
    const add = (action, risk, shape, guard, handler) => registry.register({ version: 1, id: action, domain: 'agent', title: action,
        risk, authority: 'Orchestrator selected preset node / AgentRuntime / fixed semantic ports', adapter: 'fixed-browser',
        externalEffects: risk === 'READ' ? [] : ['generation', 'provider-network', 'mayIncurCost', 'exact-delegated-memory-operations'],
        guards: risk === 'READ' ? [] : ['browser-server-boot', 'preset-fingerprint', 'Session-scope', 'exact-operation-envelope', 'policy-intersection', 'exact-native-config-budget-and-credential-target', 'no-unknown-model-retry'],
        approval: risk === 'READ' ? 'none' : 'trusted-approval-required', availability: { available: true, reason: 'Explicit user-requested delegated-node workflow only; no implicit full-preset execution' } },
    z.strictObject(shape), z.json(), handler, guard);
    add('agent.delegation.inspect', 'READ', { ...selection, runtimeRouteId: routeId.optional() }, null, async i => {
        const observed = await inspect(i);
        return { ...observed, toolMapping: mappings, mode: 'delegated-node', automaticMemoryRecall: false, nestedAgents: false };
    });
    add('agent.run.start', 'MUTATE', { ...selection, mode: z.literal('delegated-node'), presetHash: z.string().regex(/^[a-f0-9]{64}$/),
        runtimeRouteId: routeId, expectedGenerationFingerprint: z.string().regex(/^[a-f0-9]{64}$/), acceptModelCharges: z.literal(true),
        task: z.string().min(1).max(8000), maxSteps: z.number().int().min(1).max(8), contextBudget: z.number().int().min(256).max(16000),
        timeoutMs: z.number().int().min(1000).max(60000), operations: z.array(z.strictObject({ action: z.enum(Object.keys(mappings)), input: z.record(z.string(), z.json()) })).max(8) },
    async (i, c) => {
        const observed = await inspect(i);
        if (!observed.detail.scope.sessionId) throw new Error('Loaded Session required for delegation');
        if (observed.presetHash !== i.presetHash) throw new Error('Delegated preset or Session scope changed');
        if (observed.generationFingerprint !== i.expectedGenerationFingerprint) throw new Error('Delegated Native configuration or budget changed');
        const operations = [];
        for (const op of i.operations) {
            if (!observed.detail.definition.tools.includes(mappings[op.action])) throw new Error('Preset denied delegated tool');
            const child = registry.get(op.action), parsed = child.inputSchema.parse(op.input);
            operations.push({ action: op.action, inputHash: fingerprint(parsed), guard: await child.guard(parsed, c) });
        }
        return { target: { presetId: i.presetId, nodeId: i.nodeId, scope: observed.detail.scope }, serverBootId: observed.serverBootId,
            documentGeneration: observed.documentGeneration, presetHash: observed.presetHash, operations, scope: observed.detail.scope,
            generation: observed.generationReview, generationFingerprint: observed.generationFingerprint, acceptModelCharges: true };
    }, async (i, c) => {
        const observed = await inspect(i);
        if (observed.presetHash !== c.before.presetHash) throw new Error('Delegated authority drift');
        if (observed.generationFingerprint !== c.before.generationFingerprint) throw new Error('Delegated Native authority drift');
        if (bindingPage !== browser.page) {
            await browser.page.exposeBinding('__atriaMcpDelegatedOperation', async (source, request) => {
                if (!active || !active.accepting || source.page !== browser.page || source.frame !== browser.page.mainFrame()
                    || request?.nonce !== active.nonce || request.runId !== active.runId || !Number.isInteger(request.index)
                    || request.index < 0 || request.index >= active.operations.length) throw new Error('Delegated callback denied');
                if (fingerprint(await current()) !== fingerprint(active.identity)) throw new Error('Delegated browser changed');
                const run = active;
                const pending = run.executeChild(request.index, { runId: request.runId, stepId: request.stepId, effectId: request.effectId });
                run.pending.push(pending);
                const child = await pending;
                run.children.push(child.receipt.receiptId);
                if (child.receipt.status === 'indeterminate') run.uncertain = true;
                return { receiptId: child.receipt.receiptId, status: child.receipt.status, after: child.receipt.after };
            });
            await browser.page.exposeBinding('__atriaMcpDelegatedModel', async (source, request) => {
                if (!active || !active.accepting || source.page !== browser.page || source.frame !== browser.page.mainFrame()
                    || request?.nonce !== active.nonce || request.runId !== active.runId || !['request', 'cancel'].includes(request.kind)
                    || typeof request.effectId !== 'string' || request.effectId.length > 256 || typeof request.stepId !== 'string' || request.stepId.length > 256) throw new Error('Delegated model callback denied');
                if (fingerprint(await current()) !== fingerprint(active.identity)) throw new Error('Delegated model browser changed');
                const run = active;
                if (request.kind === 'cancel') return generation.cancel(run, request.effectId);
                if (!Array.isArray(request.messages) || JSON.stringify(request.messages).length > 128000) throw new Error('Delegated model context exceeds bound.');
                const pending = generation.execute(run, request).catch(() => {
                    const original = run.modelRequests.get(request.effectId);
                    return { error: 'Controlled Native model effect failed; inspect its original Native operation and compute ledger.', usage: null,
                        nativeRequestId: original?.nativeRequestId ?? null, nativeOperationId: original?.operationId ?? null,
                        dispatchState: original?.state ?? 'not-dispatched', accounting: original?.state === 'dispatched' ? 'unknown-until-native-reconciliation' : 'not-observed' };
                }); run.pending.push(pending);
                return pending;
            });
            bindingPage = browser.page;
        }
        const runId = randomUUID(), nonce = randomUUID(), children = [];
        active = { runId, nonce, children, accepting: true, pending: [], operations: i.operations, executeChild: c.executeChild, identity: await current(),
            generation: observed.generationReview, modelRequests: new Map(), maxSteps: i.maxSteps, deadline: Date.now() + i.timeoutMs, signal: c.signal };
        const run = active;
        const stop = () => { run.cancelRequested = true;
            for (const effectId of run.modelRequests.keys()) void generation.cancel(run, effectId).catch(() => {});
            void browser.page.evaluate(runId => globalThis.Atria?.getContext?.().getCapabilityApi?.('orchestrator')?.stopDelegatedRun(runId), runId).catch(() => {}); };
        c.signal?.addEventListener('abort', stop, { once: true });
        try {
            const evidence = redact(await browser.page.evaluate(async ({ input, nonce }) => {
                const api = globalThis.Atria.getContext().getCapabilityApi('orchestrator');
                return api.runDelegated(input, request => globalThis.__atriaMcpDelegatedOperation({ ...request, nonce }),
                    request => globalThis.__atriaMcpDelegatedModel({ ...request, nonce }));
            }, { input: { ...i, runId, controlledNative: true, expected: observed.detail, operations: i.operations.map(op => ({ ...op, toolName: mappings[op.action] })) }, nonce }));
            active.accepting = false;
            await Promise.allSettled(active.pending);
            evidence.nativeModels = [...active.modelRequests].map(([effectId, value]) => ({ effectId, nativeRequestId: value.nativeRequestId ?? null,
                nativeOperationId: value.operationId ?? null, state: value.state, accounting: value.state === 'completed' ? 'native-usage-observed' : value.state === 'dispatched' ? 'owning-authority-required' : 'not-dispatched' }));
            return { ok: evidence.status === 'completed' && !active.uncertain, partial: evidence.status !== 'completed' || active.uncertain === true, evidence,
                receiptEvidence: { after: { runId, status: evidence.status }, childReceiptIds: children,
                    delegation: { runId, mode: i.mode, presetHash: i.presetHash, operations: c.before.operations, maxSteps: i.maxSteps, contextBudget: i.contextBudget, timeoutMs: i.timeoutMs,
                        evidence: JSON.stringify(evidence).length < 5000 ? evidence : { contentHash: fingerprint(evidence), note: 'Full evidence in bounded tool result' } } } };
        } finally {
            if (active) { active.accepting = false; await Promise.allSettled(active.pending); }
            c.signal?.removeEventListener('abort', stop); active = null;
        }
    });
    return registry;
}
