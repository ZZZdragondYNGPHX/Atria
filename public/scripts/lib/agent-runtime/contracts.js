// SPDX-License-Identifier: AGPL-3.0-or-later
/** Runtime data is JSON, never live host objects, signals, or configuration services. */
export function copy(value) {
    return JSON.parse(JSON.stringify(value));
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

/** Validate normalized ModelPort output before it can schedule an effect. */
export function validateDecision(decision, agent, registry) {
    if (!decision || !['complete', 'continue', 'tool', 'tools', 'handoff', 'wait'].includes(decision.type)) {
        throw new TypeError('Invalid model decision');
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
        if (!['task_only', 'include_scratch'].includes(decision.contextPolicy)) {
            throw new Error('Invalid handoff context policy');
        }
    }
    return copy(decision);
}

/** Ports: model.request -> decision; tool.execute -> envelope; memory.recall -> guarded references/content. */
export function validatePorts(ports) {
    for (const [name, method] of [['model', 'request'], ['tool', 'execute'], ['memory', 'recall']]) {
        if (typeof ports?.[name]?.[method] !== 'function') throw new TypeError(`Missing ${name}.${method}`);
    }
}
