import { hashNativeDocument } from './repositories/common.js';
import { privateReads, template, predicate, prepareSimulationStep } from './authority-transaction.js';
import { simulationInstantSchema } from '../../public/shared/native-simulation-contract.js';
import { addOutbox } from './lifecycle-authority.js';

const relevanceSchema = { type: 'string', maxLength: 4, enum: ['hot', 'warm', 'cold'] };
const compare = (a, b) => a.tick - b.tick || a.job.priority - b.job.priority || (a.job.id < b.job.id ? -1 : a.job.id > b.job.id ? 1 : 0);
function evaluate(base, contract, job, budget, targetTick = base.states.atri_lifecycle.clocks[contract.simulationRuntime.clockId]) {
    const state = base.states.atri_lifecycle;
    budget.step();
    if (state.scopes[job.scopeId]?.status !== 'active') return null;
    const reads = privateReads(base, contract, job.reads, {}, budget);
    const context = { reads, clock: { tick: state.clocks[contract.simulationRuntime.clockId], targetTick } };
    if (!predicate(job.enabled, context)) return null;
    return { job, context, tick: budget.typed(template(job.due, context), simulationInstantSchema),
        relevance: budget.typed(template(job.relevance, context), relevanceSchema) };
}

// Pure bounded preparation. The caller charges one declared clock advance (or
// uses this as a zero-time Task-result reaction). No repository/provider access.
export async function prepareWorldSimulation(base, installed, untilTick, budget, { admit = true } = {}) {
    const contract = base.manifest.runtime.experienceContract;
    const simulation = contract.simulationRuntime;
    if (!simulation || !budget || !base.states.atri_lifecycle.ready) throw new TypeError('Ready simulation authority required');
    const start = base.states.atri_lifecycle.clocks[simulation.clockId];
    budget.typed(untilTick, simulationInstantSchema);
    if (untilTick < start || untilTick - start > simulation.policy.maxAdvanceTicks) throw new TypeError('Simulation advance outside declared bounds');
    let candidate = { ...base, states: structuredClone(base.states) };
    const occurrences = new Set();
    let steps = 0;
    while (true) {
        const due = simulation.jobs.filter(job => job.action.kind === 'transaction')
            .map(job => evaluate(candidate, contract, job, budget, untilTick)).filter(item => item && item.tick <= untilTick).sort(compare);
        if (!due.length) break;
        const next = due[0];
        const occurrence = next.job.id + ':' + next.tick;
        if (occurrences.has(occurrence) || ++steps > simulation.policy.maxSteps) throw new TypeError('Simulation progress/work limit');
        occurrences.add(occurrence);
        const tick = Math.max(candidate.states.atri_lifecycle.clocks[simulation.clockId], next.tick);
        candidate.states.atri_lifecycle.clocks[simulation.clockId] = tick;
        candidate = await prepareSimulationStep(candidate, installed, next.job.id, tick, budget, untilTick);
    }
    candidate.states.atri_lifecycle.clocks[simulation.clockId] = untilTick;
    // Admission is after deterministic catch-up, not once per event or model.
    if (admit && simulation.policy.maxDeliberations) {
        const state = candidate.states.atri_lifecycle;
        const pending = state.outbox.some(item => item.status === 'pending' && item.simulation);
        if (!pending) {
            const candidates = simulation.jobs.filter(job => job.action.kind === 'task')
                .map(job => evaluate(candidate, contract, job, budget, untilTick)).filter(item => item && item.tick <= untilTick && item.relevance !== 'cold'
                    && (state.automations['simulation:' + item.job.id]?.cursor ?? -1) < item.tick);
            candidates.sort((a, b) => (a.relevance === b.relevance ? 0 : a.relevance === 'hot' ? -1 : 1) || compare(a, b));
            const selected = candidates[0];
            if (selected) {
                const { job, context, tick } = selected;
                const task = contract.taskRuntime.tasks.find(item => item.id === job.action.taskId);
                const input = budget.typed(template(job.action.input, context), task.inputSchema);
                const action = { kind: 'task', taskId: job.action.taskId, variantId: job.action.variantId, input };
                budget.effect(action);
                const queued = addOutbox(state, action, job.scopeId, 'simulation:' + job.id + ':' + tick);
                queued.simulation = { jobId: job.id, tick: untilTick, dueTick: tick, anchorRevisionId: base.revision.revisionId };
                state.automations['simulation:' + job.id] = { cursor: tick, epoch: state.scopes[job.scopeId].epoch };
            }
        }
    }
    return candidate;
}

export function simulationTaskCurrent(base, item, budget) {
    if (!item.simulation) return true;
    const contract = base.manifest.runtime.experienceContract;
    const simulation = contract.simulationRuntime;
    const job = simulation?.jobs.find(job => job.id === item.simulation.jobId);
    if (!job || job.action.kind !== 'task' || job.action.taskId !== item.taskId || job.action.variantId !== item.variantId
        || job.scopeId !== item.scopeId || item.simulation.tick !== base.states.atri_lifecycle.clocks[simulation.clockId]) return false;
    const evaluated = evaluate(base, contract, job, budget);
    if (!evaluated || evaluated.relevance === 'cold' || evaluated.tick !== item.simulation.dueTick) return false;
    const task = contract.taskRuntime.tasks.find(task => task.id === job.action.taskId);
    const input = budget.typed(template(job.action.input, evaluated.context), task.inputSchema);
    return hashNativeDocument(input) === hashNativeDocument(item.input);
}
