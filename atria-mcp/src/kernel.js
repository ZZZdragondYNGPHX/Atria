import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { redact } from './policy.js';
export const RISKS = Object.freeze(['READ', 'INTERACT', 'MUTATE', 'DESTRUCTIVE']);
export const PUBLIC_TOOLS = Object.freeze(['atri_status', 'atri_capabilities', 'atri_reference', 'atri_repo', 'atri_git', 'atri_artifact', 'atri_api', 'atri_diagnose_snapshot', 'atri_browser_open', 'atri_browser_observe', 'atri_browser_screenshot', 'atri_browser_interact', 'atri_browser_diagnostics', 'atri_browser_close', 'atri_read', 'atri_interact', 'atri_mutate', 'atri_destructive']);
const descriptorSchema = z.strictObject({
    version: z.literal(1), id: z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/),
    domain: z.string().min(1), title: z.string().min(1), risk: z.enum(RISKS),
    authority: z.string().min(1), adapter: z.string().min(1), externalEffects: z.array(z.string()),
    guards: z.array(z.string()), approval: z.enum(['none', 'trusted-approval-required']),
    availability: z.strictObject({ available: z.boolean(), reason: z.string() }),
});
export class ActionRegistry {
    #actions = new Map();
    register(descriptor, inputSchema, outputSchema, handler, guard = null) {
        const parsed = descriptorSchema.parse(descriptor);
        if (this.#actions.has(parsed.id)) throw new Error('Duplicate action ID.');
        if (parsed.risk !== 'READ' && parsed.approval === 'none') throw new Error('Side effects require approval metadata.');
        const detail = { ...parsed, inputSchema: z.toJSONSchema(inputSchema), outputSchema: z.toJSONSchema(outputSchema) };
        this.#actions.set(parsed.id, { detail: structuredClone(detail), inputSchema, outputSchema, handler, guard });
        return this;
    }
    get(id) { const item = this.#actions.get(id); if (!item) throw new Error('Unknown semantic action.'); return { ...item, detail: structuredClone(item.detail) }; }
    discover({ action, query = '', domain, risk, offset = 0, limit = 50 } = {}) {
        if (action) return this.get(action).detail;
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        const actions = [...this.#actions.values()].map(a => a.detail).filter(a => (!domain || a.domain === domain) && (!risk || a.risk === risk)
            && words.every(w => `${a.id} ${a.title} ${a.authority}`.toLowerCase().includes(w)));
        return structuredClone({ total: actions.length, actions: actions.slice(offset, offset + limit), nextOffset: offset + limit < actions.length ? offset + limit : null });
    }
    ids() { return [...this.#actions.keys()]; }
}
export class PolicyCeiling {
    #ids;
    constructor(registry, actionIds = registry.ids().filter(id => registry.get(id).detail.risk === 'READ')) {
        // Snapshot exact IDs: future registrations cannot inherit historical grants.
        for (const id of actionIds) registry.get(id);
        this.#ids = new Set(actionIds);
    }
    allows(id) { return this.#ids.has(id); }
    describe() { return { version: 1, profile: 'exact-action-ids', eligibleActionIds: [...this.#ids], approvalGrants: false }; }
}
export class ReceiptStore {
    #receipts = new Map();
    constructor({ maxEntries = 100, ttlMs = 3600000, now = Date.now, instanceId = randomUUID() } = {}) {
        if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 1000 || !Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('Invalid receipt limits.');
        this.maxEntries = maxEntries; this.ttlMs = ttlMs; this.now = now; this.instanceId = instanceId;
    }
    prune() { for (const [id, item] of this.#receipts) if (item.expiresAt <= this.now()) this.#receipts.delete(id); }
    put(evidence, receiptId = randomUUID()) {
        this.prune();
        const clean = redact(structuredClone(evidence));
        if (JSON.stringify(clean).length > 30000) throw new Error('Receipt exceeds limit.');
        const receipt = { ...clean, ...(Array.isArray(clean.created) ? { created: clean.created.map(item => ({ ...item, mcpInstanceId: this.instanceId, creatingReceiptId: receiptId })) } : {}),
            version: 1, receiptId, mcpInstanceId: this.instanceId, issuedAt: this.now(), expiresAt: this.now() + this.ttlMs };
        this.#receipts.set(receipt.receiptId, receipt);
        while (this.#receipts.size > this.maxEntries) this.#receipts.delete(this.#receipts.keys().next().value);
        return structuredClone(receipt);
    }
    get(id) { this.prune(); return structuredClone(this.#receipts.get(id) ?? null); }
    clear() { this.#receipts.clear(); }
}
export class RiskExecutor {
    #leases = new Map();
    #running = false;
    constructor(registry, ceiling, { receipts = new ReceiptStore(), approve = null, now = Date.now, provenance = async () => null } = {}) {
        this.registry = registry; this.ceiling = ceiling; this.receipts = receipts; this.approve = approve; this.now = now; this.provenance = provenance;
    }
    clear() { this.#leases.clear(); }
    async execute(risk, args, context = {}) {
        if (this.#running) throw new Error('Executor busy.');
        this.#running = true;
        try { return await this.#execute(risk, args, context); } finally { this.#running = false; }
    }
    async #execute(risk, { action, input = {}, leaseId }, context) {
        const item = this.registry.get(action), d = item.detail;
        if (d.risk !== risk) throw new Error('Executor risk mismatch.');
        if (!d.availability.available) throw new Error('Action unavailable: ' + d.availability.reason);
        if (!this.ceiling.allows(action)) throw new Error('Policy Ceiling denied.');
        const parsed = item.inputSchema.parse(input);
        if (risk === 'READ') {
            if (d.guards.length || d.approval !== 'none' || leaseId) throw new Error('Invalid READ authorization.');
            return redact(item.outputSchema.parse(await item.handler(parsed)));
        }
        if (!item.guard || !d.guards.length) throw new Error('Missing authority guards.');
        const startedAt = new Date(this.now()).toISOString();
        const executionReceiptId = randomUUID();
        if (action === 'agent.run.start') for (const op of parsed.operations) {
            const child = this.registry.get(op.action);
            if (!this.ceiling.allows(op.action) || child.detail.risk !== 'MUTATE') throw new Error('Delegated action exceeds Policy Ceiling');
            child.inputSchema.parse(op.input);
        }
        const before = await item.guard(parsed, { receipts: this.receipts });
        const provenance = await this.provenance();
        if (JSON.stringify(redact({ before, provenance })).length > 12000) throw new Error('Guard evidence exceeds receipt bound; narrow target.');
        const binding = fingerprint({ action, risk, input: parsed, target: before.target, serverBootId: before.serverBootId });
        let lease = leaseId && this.#leases.get(leaseId);
        const valid = value => value && value.binding === binding && value.instanceId === this.receipts.instanceId
            && value.expiresAt > this.now() && value.remaining > 0;
        if (leaseId && !valid(lease)) throw new Error('Invalid, expired, exhausted or mismatched Capability Lease.');
        if (!lease) {
            if (!this.approve && !context.delegated) throw new Error('Trusted client approval unavailable; no operation executed.');
            const decision = context.delegated ? { action: 'accept', content: { authorize: true, uses: 1 } } : await this.approve(redact({ action, risk, authority: d.authority, externalEffects: d.externalEffects,
                input: parsed, before, provenance, binding, scope: 'Exact action, normalized input, target and server boot only' }), context);
            if (decision?.action !== 'accept' || decision.content?.authorize !== true) throw new Error('User approval declined or cancelled.');
            const uses = decision.content?.uses ?? 1;
            if (!Number.isInteger(uses) || uses < 1 || uses > (risk === 'DESTRUCTIVE' ? 1 : 20)) throw new Error('Invalid trusted approval scope.');
            // Mint only here, after a trusted round trip. No public lease creation API.
            for (const [id, value] of this.#leases) if (value.expiresAt <= this.now() || value.remaining <= 0) this.#leases.delete(id);
            if (this.#leases.size >= 100) throw new Error('Lease limit reached.');
            lease = { leaseId: randomUUID(), instanceId: this.receipts.instanceId, binding, remaining: uses, expiresAt: this.now() + 300000 };
            this.#leases.set(lease.leaseId, lease);
        }
        context.signal?.throwIfAborted();
        const checked = await item.guard(parsed, { receipts: this.receipts });
        if (fingerprint(before) !== fingerprint(checked)) throw new Error('Authority changed after approval; review again.');
        if (fingerprint(provenance) !== fingerprint(await this.provenance())) throw new Error('Provenance changed after approval; review again.');
        if (!valid(lease)) throw new Error('Capability Lease expired before execution.');
        context.signal?.throwIfAborted();
        lease.remaining--;
        let result = null, error = null, status = 'succeeded';
        const childReceiptIds = [];
        let childRunning = false;
        try {
            const used = new Set();
            const executeChild = async (index, attribution) => {
                const op = action === 'agent.run.start' && parsed.operations?.[index];
                if (childRunning || !op || used.has(index) || lease.expiresAt <= this.now()) throw new Error('Delegated operation absent, spent or expired');
                if (!['READ', 'MUTATE'].includes(this.registry.get(op.action).detail.risk) || op.action.startsWith('agent.')) throw new Error('Delegation cannot escalate risk or nest agents');
                used.add(index);
                childRunning = true;
                try {
                    const childResult = await this.#execute(this.registry.get(op.action).detail.risk, { action: op.action, input: op.input },
                        { signal: context.signal, delegated: { ...attribution, parentReceiptId: executionReceiptId } });
                    if (childResult.receipt) childReceiptIds.push(childResult.receipt.receiptId);
                    return childResult;
                } finally { childRunning = false; }
            };
            result = redact(item.outputSchema.parse(await item.handler(parsed, { before: checked, receipts: this.receipts, signal: context.signal, executeChild, executionReceiptId })));
            if (result?.ok === false) status = result?.partial === true ? 'indeterminate' : 'rejected';
        } catch (cause) { status = 'indeterminate'; error = redact(cause.message); }
        // Never automatically retry an uncertain operation. Output/schema/transport failures can follow a committed write.
        const evidence = result?.receiptEvidence ?? {};
        const boundedEvidence = value => JSON.stringify(value ?? null).length <= 6000 ? value ?? null : { contentHash: fingerprint(value), omitted: 'Large evidence; inspect owning authority' };
        const receipt = this.receipts.put({ action, risk, status, startedAt, endedAt: new Date(this.now()).toISOString(),
            target: before.target, before, after: boundedEvidence(evidence.after), created: evidence.created ?? [], changed: evidence.changed ?? [], deleted: evidence.deleted ?? [],
            externalEffects: d.externalEffects, recovery: evidence.recovery ?? 'Inspect owning authority before retrying; no automatic rollback.',
            evaluation: evidence.evaluation ?? null, packageReview: evidence.packageReview ?? null,
            delegation: evidence.delegation ?? null, childReceiptIds,
            parentReceiptId: context.delegated?.parentReceiptId ?? evidence.parentReceiptId ?? parsed.evaluationReceiptId ?? parsed.reviewReceiptId ?? null,
            provenance: { serverBootId: before.serverBootId, review: provenance, attribution: context.delegated ?? null, ...(evidence.provenance ?? {}) }, error }, executionReceiptId);
        return { result, receipt, lease: { leaseId: lease.leaseId, remaining: lease.remaining, expiresAt: lease.expiresAt }, ...(error ? { error } : {}) };
    }
}

export function fingerprint(value) {
    const canonical = item => Array.isArray(item) ? item.map(canonical) : item && typeof item === 'object'
        ? Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical(item[key])])) : item;
    return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
