// SPDX-License-Identifier: AGPL-3.0-or-later
/** Runtime data is JSON, never live host objects, signals, or configuration services. */
export function copy(value) {
    return JSON.parse(JSON.stringify(value));
}

/** Reject lossy checkpoint data instead of silently dropping controller state. */
export function policyCopy(value) {
    const seen = new Set();
    const visit = item => {
        if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
        if (typeof item === 'number' && Number.isFinite(item)) return;
        if (typeof item !== 'object' || seen.has(item)
            || (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype)) {
            throw new TypeError('Policy state must be JSON-safe');
        }
        seen.add(item);
        for (const child of Object.values(item)) visit(child);
        seen.delete(item);
    };
    visit(value);
    return copy(value);
}

export function readonlyCopy(value) {
    const freeze = item => {
        if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); }
        return item;
    };
    return freeze(copy(value));
}

export function requireId(value, label = 'id') {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`Invalid ${label}`);
    return value;
}

export const STATUSES = Object.freeze([
    'idle', 'running', 'waiting_model', 'waiting_tool', 'waiting_handoff',
    'waiting_user', 'cancelling', 'completed', 'failed', 'cancelled',
]);
export const TERMINAL = Object.freeze(['completed', 'failed', 'cancelled']);

export function validateParallelPlan(plan) {
    if (!Array.isArray(plan.branches)) throw new TypeError('Parallel branches required');
    const ids = new Set();
    for (const branch of plan.branches) {
        requireId(branch.id, 'branch id');
        if (ids.has(branch.id)) throw new Error('Duplicate branch ID');
        ids.add(branch.id);
    }
    if (!Number.isSafeInteger(plan.concurrency) || plan.concurrency < 1) throw new TypeError('Invalid parallel concurrency');
    if (!['fail_fast', 'settled'].includes(plan.failurePolicy)) throw new TypeError('Invalid parallel failure policy');
    return copy(plan);
}

/** Validate normalized ModelPort output before it can schedule an effect. */
export function validateDecision(decision, agent, registry) {
    if (!decision || !['complete', 'continue', 'tool', 'tools', 'handoff', 'wait', 'fanout'].includes(decision.type)) {
        throw new TypeError('Invalid model decision');
    }
    if (decision.type === 'fanout') {
        const plan = validateParallelPlan(decision);
        if (plan.concurrency > (agent.policies?.maxConcurrency ?? 4)) throw new Error('Parallel concurrency exceeds agent policy');
        return { type: 'fanout', concurrency: plan.concurrency, failurePolicy: plan.failurePolicy,
            branches: plan.branches.map(branch => ({ ...validateDecision({ ...branch, type: 'handoff' }, agent, registry),
                id: branch.id })) };
    }
    if (decision.type === 'tool') {
        requireId(decision.toolName, 'toolName');
        if (!agent.tools.includes(decision.toolName)) throw new Error('Tool not allowed');
    }
    if (decision.type === 'tools') {
        if (!Array.isArray(decision.calls) || !decision.calls.length) throw new TypeError('Empty tool batch');
        for (const call of decision.calls) {
            validateDecision({ type: 'tool', toolName: call?.toolName }, agent, registry);
        }
    }
    if (decision.type === 'handoff') {
        requireId(decision.toAgentId, 'toAgentId');
        requireId(decision.reason, 'reason');
        requireId(decision.task, 'task');
        registry.get(decision.toAgentId);
        if (!agent.handoffs.includes(decision.toAgentId)) throw new Error('Handoff not allowed');
        const allowed = agent.policies?.handoffContextPolicies || ['task_only', 'include_scratch'];
        if (!['task_only', 'include_scratch'].includes(decision.contextPolicy) || !allowed.includes(decision.contextPolicy)) {
            throw new Error('Invalid handoff context policy');
        }
    }
    if (decision.type === 'handoff') return copy({ type: 'handoff', toAgentId: decision.toAgentId,
        reason: decision.reason, task: decision.task, payload: decision.payload ?? null, contextPolicy: decision.contextPolicy });
    return copy(decision);
}

/** Ports: model.request -> decision; tool.execute -> envelope; memory.recall -> guarded references/content. */
export function validatePorts(ports) {
    for (const [name, method] of [['model', 'request'], ['tool', 'execute'], ['memory', 'recall']]) {
        if (typeof ports?.[name]?.[method] !== 'function') throw new TypeError(`Missing ${name}.${method}`);
    }
}
