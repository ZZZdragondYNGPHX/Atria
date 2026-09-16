import { copy } from './contracts.js';

const terminal = new Set(['completed', 'failed', 'cancelled']);
const reasons = new Set(['stage_dispatch', 'review_rerun', 'agenda_plan', 'agenda_dispatch', 'agenda_finalize', 'director_dispatch', 'director_inline_dispatch']);
const textFields = ['eventId', 'type', 'runId', 'parentRunId', 'stepId', 'effectId', 'agentId', 'status', 'toolName',
    'branchId', 'childRunId', 'handoffId', 'fromAgentId', 'toAgentId', 'contextPolicy', 'tokenCounting', 'budgetScope', 'failureKind',
    'planId', 'nodeId', 'resultId', 'outcome', 'routing', 'capability'];
const engineEvent = /^(graph\.(compiled|mutated|node\.(started|completed|failed))|result\.created|output\.ready|arbitration\.(started|completed)|capability\.denied)$/;

/** Allowlist execution metadata. Never retain task/prompt/args/results, headers or host objects. */
export function sanitizeRuntimeEvent(raw) {
    if (!raw || typeof raw.eventId !== 'string' || typeof raw.runId !== 'string'
        || !Number.isInteger(raw.version) || !Number.isInteger(raw.generation)) return null;
    if (!engineEvent.test(raw.type) && !/^(run\.(started|running|completed|failed|cancelled|resumed|waiting_user)|context\.compiled|effect\.(stale|failed)|(policy\.advance|model\.request|memory\.recall|tool\.execute|agent\.handoff|parallel\.fanout|parallel\.join)\.(started|completed)|parallel\.branch\.(started|completed|failed|cancelled|stale))$/.test(raw.type)) return null;
    const event = { schemaVersion: 1, version: raw.version, generation: raw.generation };
    for (const field of textFields) if (typeof raw[field] === 'string') event[field] = raw[field];
    if (typeof raw.ok === 'boolean') event.ok = raw.ok;
    if (Number.isInteger(raw.restoredVersion)) event.restoredVersion = raw.restoredVersion;
    if (Number.isFinite(raw.tokens)) event.tokens = raw.tokens;
    if (Number.isSafeInteger(raw.graphRevision) && raw.graphRevision >= 0) event.graphRevision = raw.graphRevision;
    if (raw.reason) event.reason = reasons.has(raw.reason) ? raw.reason : 'custom_handoff';
    if (raw.modelProfile) event.modelProfile = Object.fromEntries(['apiPresetName', 'promptPresetName'].map(key =>
        [key, typeof raw.modelProfile[key] === 'string' ? raw.modelProfile[key] : '']));
    if (Array.isArray(raw.references)) event.references = raw.references.map(ref => ({ id: String(ref?.id || ''),
        ...(typeof ref?.revision === 'number' ? { revision: ref.revision } : {}) }));
    if (Array.isArray(raw.diagnostics)) event.diagnostics = raw.diagnostics.map(item => ({
        source: String(item?.source || ''), tokens: Number(item?.tokens) || 0, truncated: item?.truncated === true,
    }));
    return event;
}

/** In-memory execution journal and its deterministic projection. No commands or host dependencies. */
export class RuntimeProjection {
    #events = [];
    #seen = new Set();
    #runs = new Map();
    #effectIndexes = new Map();
    append(raw) {
        const event = sanitizeRuntimeEvent(raw);
        if (!event || this.#seen.has(event.eventId)) return false;
        this.#seen.add(event.eventId);
        this.#events.push(event);
        let run = this.#runs.get(event.runId);
        if (!run) {
            run = { runId: event.runId, parentRunId: event.parentRunId || null, status: 'idle', generation: 0,
                version: -1, agentId: null, stepId: null, effects: [], handoffs: [], contexts: [], staleEffects: [] };
            this.#runs.set(event.runId, run);
            this.#effectIndexes.set(event.runId, new Map());
        }
        if (['effect.stale', 'parallel.branch.stale'].includes(event.type)) run.staleEffects.push(event.effectId);
        const current = event.generation > run.generation || (event.generation === run.generation && event.version >= run.version);
        if (!current || (terminal.has(run.status) && event.generation === run.generation)) return true;
        Object.assign(run, { generation: event.generation, version: event.version,
            status: event.status || run.status, agentId: event.agentId || run.agentId, stepId: event.stepId || run.stepId });
        if (event.effectId && /\.(started|completed|failed|cancelled)$/.test(event.type) && !event.type.startsWith('run.')) {
            const index = this.#effectIndexes.get(event.runId);
            let effect = index.get(event.effectId);
            if (!effect) { effect = { effectId: event.effectId, stepId: event.stepId, agentId: event.agentId }; run.effects.push(effect); index.set(event.effectId, effect); }
            Object.assign(effect, { type: event.type === 'effect.failed' ? effect.type : event.type.replace(/\.(started|completed|failed|cancelled)$/, ''),
                status: event.type.endsWith('.cancelled') ? 'cancelled' : event.type.endsWith('.failed') || event.ok === false ? 'failed' : event.type.endsWith('.completed') ? 'completed' : 'running',
                ...(event.toolName ? { toolName: event.toolName } : {}) });
        }
        if (event.type === 'agent.handoff.completed') run.handoffs.push(event);
        if (event.type === 'context.compiled') run.contexts.push(event);
        if (terminal.has(run.status)) for (const effect of run.effects) {
            if (effect.status === 'running') effect.status = run.status === 'cancelled' ? 'cancelled' : 'interrupted';
        }
        return true;
    }
    snapshot() { return copy({ schemaVersion: 1, events: this.#events, runs: [...this.#runs.values()] }); }
}

export function replayRuntimeEvents(events) {
    const projection = new RuntimeProjection();
    for (const event of events) projection.append(event);
    return projection.snapshot();
}
