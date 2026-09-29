import { randomUUID } from 'node:crypto';
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
    register(descriptor, inputSchema, outputSchema, handler) {
        const parsed = descriptorSchema.parse(descriptor);
        if (this.#actions.has(parsed.id)) throw new Error('Duplicate action ID.');
        if (parsed.risk !== 'READ' && parsed.approval === 'none') throw new Error('Side effects require approval metadata.');
        const detail = { ...parsed, inputSchema: z.toJSONSchema(inputSchema), outputSchema: z.toJSONSchema(outputSchema) };
        this.#actions.set(parsed.id, { detail: structuredClone(detail), inputSchema, outputSchema, handler });
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
    describe() { return { version: 1, profile: 'read-only', eligibleActionIds: [...this.#ids], approvalGrants: false }; }
}
export class ReceiptStore {
    #receipts = new Map();
    constructor({ maxEntries = 100, ttlMs = 3600000, now = Date.now, instanceId = randomUUID() } = {}) {
        if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 1000 || !Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('Invalid receipt limits.');
        this.maxEntries = maxEntries; this.ttlMs = ttlMs; this.now = now; this.instanceId = instanceId;
    }
    prune() { for (const [id, item] of this.#receipts) if (item.expiresAt <= this.now()) this.#receipts.delete(id); }
    put(evidence) {
        this.prune();
        const clean = redact(structuredClone(evidence));
        if (JSON.stringify(clean).length > 30000) throw new Error('Receipt exceeds limit.');
        const receipt = { ...clean, version: 1, receiptId: randomUUID(), mcpInstanceId: this.instanceId, issuedAt: this.now(), expiresAt: this.now() + this.ttlMs };
        this.#receipts.set(receipt.receiptId, receipt);
        while (this.#receipts.size > this.maxEntries) this.#receipts.delete(this.#receipts.keys().next().value);
        return structuredClone(receipt);
    }
    get(id) { this.prune(); return structuredClone(this.#receipts.get(id) ?? null); }
    clear() { this.#receipts.clear(); }
}
export class RiskExecutor {
    constructor(registry, ceiling) { this.registry = registry; this.ceiling = ceiling; }
    async execute(risk, { action, input = {} }) {
        const item = this.registry.get(action), d = item.detail;
        if (d.risk !== risk) throw new Error('Executor risk mismatch.');
        if (!d.availability.available) throw new Error('Action unavailable: ' + d.availability.reason);
        if (!this.ceiling.allows(action)) throw new Error('Policy Ceiling denied.');
        const parsed = item.inputSchema.parse(input);
        // READ may have declared provider cost/network effects. It never grants mutations.
        if (risk !== 'READ' || d.guards.length || d.approval !== 'none') throw new Error('Action requires later-phase authorization/guard infrastructure.');
        return redact(item.outputSchema.parse(await item.handler(parsed)));
    }
}
