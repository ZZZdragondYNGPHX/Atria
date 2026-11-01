import { fields } from './native-values.js';
import { assertTaskValue, taskId } from './native-task-contract.js';

const comparisons = ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'includes', 'exists'];
const scalar = value => value === null || ['string', 'number', 'boolean'].includes(typeof value);

// Conditions read declared domain facts, not dialogue or a second story ledger.
export function assertWorkflowCondition(value, domains, depth = 0, budget = { nodes: 0 }) {
    if (depth > 8 || ++budget.nodes > 64) throw new TypeError('Workflow condition complexity limit');
    if (typeof value === 'boolean') return value;
    if (value?.all !== undefined || value?.any !== undefined) {
        const kind = value.all !== undefined ? 'all' : 'any';
        fields(value, [kind], 'Workflow condition');
        if (!Array.isArray(value[kind]) || !value[kind].length || value[kind].length > 16) throw new TypeError('Workflow condition requires a nonempty bounded list');
        return { [kind]: value[kind].map(child => assertWorkflowCondition(child, domains, depth + 1, budget)) };
    }
    if (value?.not !== undefined) {
        fields(value, ['not'], 'Workflow condition');
        return { not: assertWorkflowCondition(value.not, domains, depth + 1, budget) };
    }
    fields(value, ['domainId', 'recordId', 'path', 'op', 'value'], 'Workflow fact condition');
    const domain = domains.find(domain => domain.id === value.domainId);
    if (!domain) throw new TypeError('Unknown Workflow condition domain');
    taskId(value.recordId);
    if (!Array.isArray(value.path) || !value.path.length || value.path.length > 16) throw new TypeError('Workflow condition requires a declared field path');
    let schema = domain.recordSchema;
    for (const key of value.path) {
        if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)
            || schema.type !== 'object' || !Object.hasOwn(schema.properties, key)) throw new TypeError('Unknown Workflow condition field');
        schema = schema.properties[key];
    }
    if (!comparisons.includes(value.op)) throw new TypeError('Unknown Workflow comparison');
    if (value.op === 'exists') {
        if (Object.hasOwn(value, 'value')) throw new TypeError('Workflow exists does not accept a comparison value');
    } else {
        if (!Object.hasOwn(value, 'value') || !scalar(value.value)) throw new TypeError('Workflow comparison requires a scalar value');
        const target = value.op === 'includes' ? schema.items : schema;
        if (!target || ['object', 'array'].includes(target.type)) throw new TypeError('Workflow comparison requires a scalar field or array item');
        assertTaskValue(value.value, target);
        if (['lt', 'lte', 'gt', 'gte'].includes(value.op) && !['integer', 'number'].includes(schema.type)) throw new TypeError('Ordered Workflow comparison requires a number');
        if (value.op === 'includes' && schema.type !== 'array') throw new TypeError('Workflow includes requires an array');
    }
    return value;
}

export function workflowCondition(value, state, lookup) {
    if (value === undefined || value === true) return true;
    if (value === false) return false;
    if (value.all) return value.all.every(child => workflowCondition(child, state, lookup));
    if (value.any) return value.any.some(child => workflowCondition(child, state, lookup));
    if (Object.hasOwn(value, 'not')) return !workflowCondition(value.not, state, lookup);
    const record = lookup ? lookup(value.domainId, value.recordId) : state.domains[value.domainId]?.records.find(record => record.id === value.recordId);
    const actual = value.path.reduce((node, key) => node != null && Object.hasOwn(node, key) ? node[key] : undefined, record?.value);
    if (value.op === 'exists') return actual !== undefined;
    // A missing person's record cannot satisfy "not equal" and start an event.
    if (actual === undefined) return false;
    switch (value.op) {
        case 'eq': return actual === value.value;
        case 'ne': return actual !== value.value;
        case 'lt': return actual < value.value;
        case 'lte': return actual <= value.value;
        case 'gt': return actual > value.value;
        case 'gte': return actual >= value.value;
        case 'includes': return actual.includes(value.value);
        default: return false;
    }
}

export function workflowTransitionBlock(flow, current, edge, state, taskResults = [], lookup) {
    if (!edge || current?.status !== 'active' || edge.from !== current.phase) return 'stale_or_closed';
    if (state.scopes[flow.scopeId]?.status !== 'active') return 'scope_inactive';
    if (!workflowCondition(edge.when, state, lookup)) return 'condition_unsatisfied';
    const taskResult = current.taskInvocationId && taskResults.find(result => result.invocationId === current.taskInvocationId);
    if (edge.taskStatus !== undefined && taskResult?.status !== edge.taskStatus) return 'task_status_unsatisfied';
    if (edge.interrupt) return null;
    if (flow.transitions.some(other => other.from === current.phase && other.interrupt
        && (other.taskStatus === undefined || taskResult?.status === other.taskStatus)
        && workflowCondition(other.when, state, lookup))) return 'interrupted';
    const node = flow.nodes.find(node => node.id === current.phase);
    if (!current.entered) return 'not_entered';
    if (node.kind === 'wait_until' && state.clocks[node.wait.clockId] < node.wait.tick) return 'not_due';
    if (node.kind === 'wait_for' && state.clocks[node.wait.clockId] < current.enteredTicks[node.wait.clockId] + node.wait.ticks) return 'not_due';
    if (node.kind === 'model_task' && !(edge.taskStatus !== undefined ? taskResult?.status === edge.taskStatus
        : taskResult && ['draft', 'completed', 'applied'].includes(taskResult.status))) return 'task_pending';
    return null;
}

// Author inspection is read-only; player views still require their information policy.
export function inspectWorkflow(flow, state, taskResults = []) {
    const current = state.workflows[flow.id];
    const node = flow.nodes.find(node => node.id === current?.phase);
    return { id: flow.id, phase: current?.phase, status: current?.status,
        dueTick: node?.kind === 'wait_until' ? node.wait.tick
            : node?.kind === 'wait_for' && current.entered ? current.enteredTicks[node.wait.clockId] + node.wait.ticks : null,
        transitions: flow.transitions.filter(edge => edge.from === current?.phase).map(edge => ({
            id: edge.id, to: edge.to, automatic: edge.automatic === true, interrupt: edge.interrupt === true,
            blocked: workflowTransitionBlock(flow, current, edge, state, taskResults),
        })) };
}
