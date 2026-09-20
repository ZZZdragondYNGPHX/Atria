import { policyCopy, readonlyCopy, requireId } from '../agent-runtime/contracts.js';

export const OUTCOMES = Object.freeze(['completed', 'partial', 'budget_exhausted', 'failed', 'cancelled', 'waiting_user']);
export const NODE_KINDS = Object.freeze(['agent', 'router', 'join', 'judge', 'synthesize', 'terminal']);

/** Canonical structural identity. Hosts may digest it before persisting public diagnostics. */
export function planIdentity(value) {
    const sort = item => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object'
        ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key])])) : item;
    return JSON.stringify(sort(policyCopy(value)));
}

export function normalizePlan(input) {
    const plan = policyCopy(input);
    if (plan.schemaVersion !== 1) throw new Error('Unsupported orchestration plan');
    requireId(plan.planId, 'plan ID');
    if (!['single', 'spec', 'loop', 'agenda', 'director'].includes(plan.source?.mode)) throw new Error('Invalid plan mode');
    if (!Array.isArray(plan.agents) || !Array.isArray(plan.nodes) || !Array.isArray(plan.edges)) throw new Error('Invalid plan graph');
    for (const key of ['maxSteps', 'maxTasks', 'maxConcurrency']) {
        if (!Number.isSafeInteger(plan.budgets?.[key]) || plan.budgets[key] < 1) throw new Error(`Invalid budget: ${key}`);
    }
    if (!['guidance', 'reply'].includes(plan.output?.kind)
        || (plan.output.kind === 'reply') !== (plan.source.mode === 'director')) throw new Error('Invalid output contract');
    if (plan.output.submitCapability !== (plan.output.kind === 'reply' ? 'reply.submit' : 'result.submit')) throw new Error('Invalid submit capability');
    if (!['pass-through', 'merge', 'synthesize', 'judge', 'consensus', 'best-effort'].includes(plan.arbitration?.kind)) throw new Error('Invalid arbitration policy');
    for (const key of ['maxCalls', 'maxInputBytes']) if (plan.arbitration[key] !== undefined
        && (!Number.isSafeInteger(plan.arbitration[key]) || plan.arbitration[key] < 0)) throw new Error(`Invalid arbitration budget: ${key}`);
    return readonlyCopy(plan);
}
