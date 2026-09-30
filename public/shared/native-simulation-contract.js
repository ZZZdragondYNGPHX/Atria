import { fields, json, assertJsonDeclaration } from './native-values.js';
import { taskId } from './native-task-contract.js';
import { authorityInteger as integer, authorityList as list, authorityReference as reference } from './native-authority-contract.js';
import { reads, readContext, predicate, template } from '../scripts/native/experience/logic/bound-expressions.js';

export const SIMULATION_LIMITS = Object.freeze({ jobs: 16, steps: 16, deliberations: 1, advanceTicks: 10080 });
export const simulationInstantSchema = Object.freeze({ type: 'integer', minimum: 0, maximum: 2147483647 });
const relevanceSchema = { type: 'string', maxLength: 4, enum: ['hot', 'warm', 'cold'] };
export function simulationContext(job, lifecycle) {
    return { reads: readContext(reads(job.reads, lifecycle)), clock: { type: 'object', additionalProperties: false,
        properties: { tick: simulationInstantSchema }, required: ['tick'] } };
}

// Declaration-only. Private state can enter only explicit, schema-bounded Task
// input; this is not a new state namespace or an ambient expression authority.
export function assertSimulationRuntime(raw, lifecycle, tasks, authority) {
    const value = assertJsonDeclaration(raw, 'World simulation', 1048576);
    fields(value, ['schemaVersion', 'clockId', 'policy', 'jobs'], 'World simulation');
    if (value.schemaVersion !== 1 || !lifecycle || !authority) throw new TypeError('World simulation requires Lifecycle and Authority runtime');
    reference(lifecycle.clocks, value.clockId, 'simulation clock');
    if (value.clockId !== authority.canonicalClockId) throw new TypeError('World simulation requires canonical clock');
    if (lifecycle.automations.some(item => item.trigger.kind === 'world.schedule' && item.trigger.clockId === value.clockId)
        || lifecycle.interactions.some(item => item.clockId === value.clockId)
        || lifecycle.workflows.some(flow => flow.nodes.some(node => node.kind === 'wait_until' && node.wait.clockId === value.clockId))) throw new TypeError('Simulation canonical deadlines must use the unified job schedule');
    fields(value.policy, ['maxSteps', 'maxDeliberations', 'maxAdvanceTicks'], 'Simulation policy');
    integer(value.policy.maxSteps, 1, SIMULATION_LIMITS.steps, 'simulation steps');
    integer(value.policy.maxDeliberations, 0, SIMULATION_LIMITS.deliberations, 'simulation deliberations');
    integer(value.policy.maxAdvanceTicks, 1, SIMULATION_LIMITS.advanceTicks, 'simulation advance');
    const jobs = list(value.jobs, SIMULATION_LIMITS.jobs, job => {
        fields(job, ['id', 'scopeId', 'reads', 'enabled', 'due', 'priority', 'relevance', 'action'], 'Simulation job');
        taskId(job.id); reference(lifecycle.scopes, job.scopeId, 'simulation scope');
        integer(job.priority, 0, 15, 'simulation priority');
        const context = simulationContext(job, lifecycle);
        if (job.reads.some(grant => reference(lifecycle.domains, grant.domainId, 'simulation read').scopeId !== job.scopeId
            || typeof grant.recordId !== 'string')) throw new TypeError('Simulation reads require static same-scope targets');
        predicate(job.enabled, context); template(job.due, simulationInstantSchema, context);
        template(job.relevance, relevanceSchema, context);
        if (job.action?.kind === 'task') {
            fields(job.action, ['kind', 'taskId', 'variantId', 'input'], 'Simulation Task');
            const task = reference(tasks?.tasks, job.action.taskId, 'simulation Task');
            const variant = reference(task.variants, job.action.variantId, 'simulation Variant');
            if (task.executionClass !== 'background' || task.queuePolicy !== 'fifo' || task.resultPolicy.sink !== 'app_command'
                || task.resultPolicy.resultClass !== 'declared_app_command' || task.context.length !== 1 || task.context[0] !== 'input'
                || variant.resultBinding?.kind !== 'app.command') throw new TypeError('Simulation Task requires isolated FIFO background intent binding');
            if (reference(lifecycle.domains, variant.resultBinding.domainId, 'simulation intent').scopeId !== job.scopeId
                || typeof variant.resultBinding.recordId !== 'string') throw new TypeError('Simulation intent requires static same-scope target');
            template(job.action.input, task.inputSchema, context);
        } else if (job.action?.kind === 'transaction') {
            fields(job.action, ['kind', 'transactionId', 'input'], 'Simulation Transaction');
            taskId(job.action.transactionId);
            // Exact input and origin closure needs pinned Game Logic, checked below.
            fields(job.action.input, Object.keys(job.action.input ?? {}), 'Simulation Transaction input');
        } else throw new TypeError('Unknown simulation action');
        return job;
    }, 'simulation jobs');
    return json({ ...value, jobs });
}

export function assertSimulationTransactions(simulation, transactions, lifecycle) {
    for (const job of simulation?.jobs ?? []) {
        if (job.action.kind !== 'transaction') continue;
        const tx = reference(transactions, job.action.transactionId, 'simulation Transaction');
        if (tx.origin !== 'simulation' || tx.intent.expose) throw new TypeError('Simulation requires a non-player Transaction');
        // Clock movement belongs to the bounded driver, never a recursive job.
        if (tx.effects.some(effect => effect.kind === 'clock.advance' || effect.kind === 'workflow.transition')) throw new TypeError('Simulation Transaction cannot recursively advance or dispatch workflows');
        if (tx.reads.some(grant => typeof grant.recordId !== 'string'
            || reference(lifecycle.domains, grant.domainId, 'simulation read').scopeId !== job.scopeId)
            || tx.effects.some(effect => effect.kind === 'app.command' && (typeof effect.recordId !== 'string'
                || reference(lifecycle.domains, effect.domainId, 'simulation write').scopeId !== job.scopeId))) throw new TypeError('Simulation Transactions require static same-scope targets');
        template(job.action.input, tx.inputSchema, simulationContext(job, lifecycle));
    }
}
