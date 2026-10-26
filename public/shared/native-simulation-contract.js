import { fields, assertJsonDeclaration } from './native-values.js';
import { WORLD_DATA_LIMITS } from './native-world-data.js';
import { taskId } from './native-task-contract.js';
import { appraisalTargets } from './native-appraisal-contract.js';
import { authorityInteger as integer, authorityList as list, authorityReference as reference } from './native-authority-contract.js';
import { reads, readContext, predicate, template } from '../scripts/native/experience/logic/bound-expressions.js';

// Calendar distance is not a work budget: sparse multi-year resolution uses
// the same bounded jobs, steps, effects and deliberations as short advances.
export const SIMULATION_LIMITS = Object.freeze({ jobs: 4096, steps: 65536, deliberations: 1, advanceTicks: Number.MAX_SAFE_INTEGER });
export const simulationInstantSchema = Object.freeze({ type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const relevanceSchema = { type: 'string', maxLength: 4, enum: ['hot', 'warm', 'cold'] };
// targetTick is the requested interval end, not elapsed world state. It allows
// a declared aggregate job to run once at the interval boundary. tick stays canonical.
export function simulationContext(job, lifecycle) {
    const grants = [...job.reads, ...(job.subject?.fields ? [{ id: 'subject', domainId: job.subject.domainId, recordId: 'bound', fields: job.subject.fields }] : [])];
    return { reads: readContext(reads(grants, lifecycle)), clock: { type: 'object', additionalProperties: false,
        properties: { tick: simulationInstantSchema, targetTick: simulationInstantSchema, requestedTick: simulationInstantSchema }, required: ['tick', 'targetTick', 'requestedTick'] },
    ...(job.subject ? { subject: { type: 'object', additionalProperties: false, properties: {
        id: { type: 'string', maxLength: 64 }, recordId: { type: 'string', maxLength: 64 }, viewId: { type: 'string', maxLength: 128 },
    }, required: ['id', 'recordId', 'viewId'] } } : {}) };
}

// Declaration-only. Private state can enter only explicit, schema-bounded Task
// input; this is not a new state namespace or an ambient expression authority.
export function assertSimulationRuntime(raw, lifecycle, tasks, authority, information) {
    const value = assertJsonDeclaration(raw, 'World simulation', 16 * 1024 * 1024, WORLD_DATA_LIMITS);
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
        fields(job, ['id', 'scopeId', 'reads', 'enabled', 'due', 'priority', 'relevance', 'action', 'subject'], 'Simulation job');
        taskId(job.id); reference(lifecycle.scopes, job.scopeId, 'simulation scope');
        integer(job.priority, 0, 15, 'simulation priority');
        const context = simulationContext(job, lifecycle);
        if (job.subject !== undefined) {
            fields(job.subject, ['id', 'domainId', 'perspective', 'fields'], 'Simulation Subject');
            const domain = reference(lifecycle.domains, job.subject.domainId, 'simulation Subject Domain');
            const view = reference(information?.views, job.subject.perspective, 'simulation Subject Perspective');
            if (!['transaction', 'task'].includes(job.action?.kind) || domain.scopeId !== job.scopeId || view.subjectScopeId !== job.scopeId
                || view.audience !== 'actor' || !view.exposure.includes('context')
                || view.subjectAvailability?.domainId !== domain.id) throw new TypeError('Simulation Subject requires its own available Perspective and Domain');
            const selectionContext = simulationContext({ ...job, subject: undefined }, lifecycle);
            template(job.subject.id, { type: 'string', maxLength: 64 }, selectionContext);
            if (job.subject.fields && job.reads.some(grant => grant.id === 'subject')) throw new TypeError('Simulation Subject read identifier is reserved');
        }
        if (job.reads.some(grant => reference(lifecycle.domains, grant.domainId, 'simulation read').scopeId !== job.scopeId
            || !grant.collection && typeof grant.recordId !== 'string')) throw new TypeError('Simulation reads require static same-scope targets');
        predicate(job.enabled, context); template(job.due, simulationInstantSchema, context);
        template(job.relevance, relevanceSchema, context);
        if (job.action?.kind === 'task') {
            fields(job.action, ['kind', 'taskId', 'variantId', 'input'], 'Simulation Task');
            const task = reference(tasks?.tasks, job.action.taskId, 'simulation Task');
            const variant = reference(task.variants, job.action.variantId, 'simulation Variant');
            const appraisal = variant.resultBinding?.kind === 'cognition.appraise';
            const personal = Boolean(variant.resultBinding?.subjectPerspective);
            if (Boolean(job.subject) !== personal) throw new TypeError('Subject Task must consume its bound personal Perspective');
            if (task.executionClass !== 'background' || task.queuePolicy !== 'fifo' || task.resultPolicy.sink !== 'app_command'
                || task.resultPolicy.resultClass !== 'declared_app_command'
                || (appraisal || personal ? task.context.length !== 2 || !task.context.includes('input') || !task.context.includes('projection')
                    : task.context.length !== 1 || task.context[0] !== 'input' || variant.resultBinding?.kind !== 'app.command')) throw new TypeError('Simulation Task requires isolated FIFO background intent binding');
            if (appraisal) {
                if (appraisalTargets(variant.resultBinding).some(kind => reference(lifecycle.domains, variant.resultBinding[kind].domainId, 'simulation appraisal').scopeId !== job.scopeId)) throw new TypeError('Simulation appraisal requires same-scope targets');
            } else if (personal) {
                if (!job.subject || variant.resultBinding.kind !== 'app.command' || variant.resultBinding.domainId !== job.subject.domainId
                    || variant.resultBinding.subjectPerspective !== job.subject.perspective) throw new TypeError('Subject Task must consume its bound personal Perspective');
            } else if (job.subject || reference(lifecycle.domains, variant.resultBinding.domainId, 'simulation intent').scopeId !== job.scopeId
                || typeof variant.resultBinding.recordId !== 'string') throw new TypeError('Simulation intent requires static same-scope target');
            // Host agenda reads select the matter; they do not grant its private
            // contents to an NPC. Personal evidence comes from its projection.
            const { reads: _reads, ...personalInput } = context;
            template(job.action.input, task.inputSchema, personal ? personalInput : context);
        } else if (job.action?.kind === 'transaction') {
            fields(job.action, ['kind', 'transactionId', 'input'], 'Simulation Transaction');
            taskId(job.action.transactionId);
            // Exact input and origin closure needs pinned Game Logic, checked below.
            fields(job.action.input, Object.keys(job.action.input ?? {}), 'Simulation Transaction input');
        } else throw new TypeError('Unknown simulation action');
        return job;
    }, 'simulation jobs');
    return assertJsonDeclaration({ ...value, jobs }, 'World simulation', 16 * 1024 * 1024, WORLD_DATA_LIMITS);
}

export function assertSimulationTransactions(simulation, transactions, lifecycle) {
    for (const job of simulation?.jobs ?? []) {
        if (job.action.kind !== 'transaction') continue;
        const tx = reference(transactions, job.action.transactionId, 'simulation Transaction');
        if (tx.origin !== 'simulation' || tx.intent.expose) throw new TypeError('Simulation requires a non-player Transaction');
        // Clock movement belongs to the bounded driver, never a recursive job.
        if (tx.effects.some(effect => effect.kind === 'clock.advance' || effect.kind === 'workflow.transition')) throw new TypeError('Simulation Transaction cannot recursively advance or dispatch workflows');
        const allowed = (domainId, recordId) => {
            if (reference(lifecycle.domains, domainId, 'simulation target').scopeId !== job.scopeId) return false;
            if (typeof recordId === 'string') return true;
            if (job.subject?.domainId !== domainId || Object.keys(recordId ?? {}).length !== 1) return false;
            const match = /^args\.([A-Za-z_][A-Za-z0-9_-]*)$/.exec(recordId.formula ?? '');
            const input = match && job.action.input[match[1]];
            return input?.formula === 'subject.recordId' && Object.keys(input).length === 1;
        };
        if (tx.reads.some(grant => !allowed(grant.domainId, grant.collection ? 'collection' : grant.recordId))
            || tx.effects.some(effect => effect.kind === 'app.command' && !allowed(effect.domainId, effect.recordId))) throw new TypeError('Simulation Transactions require static or bound Subject same-scope targets');
        template(job.action.input, tx.inputSchema, simulationContext(job, lifecycle));
    }
}
