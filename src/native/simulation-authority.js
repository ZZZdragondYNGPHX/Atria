import { nextAttentionTick } from './lifetime-authority.js';
import { createTaskCandidate } from './task-authority.js';
import { hashNativeDocument } from './repositories/common.js';
import { simulationPrivateContext, template, predicate, prepareSimulationStep, validateCandidate } from './authority-transaction.js';
import { simulationInstantSchema } from '../../public/shared/native-simulation-contract.js';
import { addOutbox } from './lifecycle-authority.js';
import { captureAppraisalEvent } from './appraisal-authority.js';
import { projectInformation } from '../../public/shared/native-information-runtime.js';
import { simulationEvaluator } from './simulation-evaluation.js';

const relevanceSchema = { type: 'string', maxLength: 4, enum: ['hot', 'warm', 'cold'] };
const compare = (a, b) => a.tick - b.tick || a.job.priority - b.job.priority || (a.job.id < b.job.id ? -1 : a.job.id > b.job.id ? 1 : 0);
function evaluate(base, contract, job, budget, targetTick = base.states.atri_lifecycle.clocks[contract.simulationRuntime.clockId], requestedTick = targetTick) {
    const state = base.states.atri_lifecycle;
    budget.step();
    if (state.scopes[job.scopeId]?.status !== 'active') return null;
    const context = simulationPrivateContext(base, contract, job, budget, state.clocks[contract.simulationRuntime.clockId], targetTick, requestedTick);
    if (!context) return null;
    const subject = context.subject;
    if (!predicate(job.enabled, context)) return null;
    let evidenceHash;
    if (subject && job.action.kind === 'task') {
        const projection = projectInformation(base, subject.viewId, { purpose: 'context', onScan: count => budget.scan(count) });
        budget.readValue(projection.items);
        evidenceHash = hashNativeDocument(projection.items);
    }
    return { job, context, tick: budget.typed(template(job.due, context), simulationInstantSchema),
        relevance: budget.typed(template(job.relevance, context), relevanceSchema), ...(evidenceHash ? { evidenceHash } : {}) };
}

// Pure bounded preparation. The caller charges one declared clock advance (or
// uses this as a zero-time Task-result reaction). No repository/provider access.
export async function prepareWorldSimulation(base, installed, untilTick, budget, { admit = true, attention = false, excludeJobId = null } = {}) {
    const contract = base.manifest.runtime.experienceContract;
    const simulation = contract.simulationRuntime;
    validateCandidate(base, contract);
    if (!simulation || !budget || !base.states.atri_lifecycle.ready) throw new TypeError('Ready simulation authority required');
    const start = base.states.atri_lifecycle.clocks[simulation.clockId];
    budget.typed(untilTick, simulationInstantSchema);
    if (untilTick < start || untilTick - start > simulation.policy.maxAdvanceTicks) throw new TypeError('Simulation advance outside declared bounds');
    const requestedTick = untilTick;
    if (attention) untilTick = nextAttentionTick(base, untilTick, budget);
    let candidate = base;
    const mutable = () => {
        if (candidate !== base) return;
        candidate = createTaskCandidate(base, budget);
    };
    const occurrences = new Set();
    const evaluateJob = simulationEvaluator(contract, budget, evaluate);
    let steps = 0;
    while (true) {
        let next = null;
        for (const job of simulation.jobs) {
            if (job.action.kind !== 'transaction') continue;
            const item = evaluateJob(candidate, job, untilTick, requestedTick);
            if (item && item.tick <= untilTick && (!next || compare(item, next) < 0)) next = item;
        }
        if (!next) break;
        const occurrence = next.job.id + ':' + next.tick + (next.context.subject ? ':' + next.context.subject.id : '');
        if (occurrences.has(occurrence) || ++steps > simulation.policy.maxSteps) throw new TypeError('Simulation progress/work limit');
        occurrences.add(occurrence);
        mutable();
        const tick = Math.max(candidate.states.atri_lifecycle.clocks[simulation.clockId], next.tick);
        candidate.states.atri_lifecycle.clocks[simulation.clockId] = tick;
        candidate = await prepareSimulationStep(candidate, installed, next.job.id, tick, budget, untilTick, requestedTick);
    }
    if (candidate.states.atri_lifecycle.clocks[simulation.clockId] !== untilTick) {
        mutable(); candidate.states.atri_lifecycle.clocks[simulation.clockId] = untilTick;
    }
    // Admission is after deterministic catch-up, not once per event or model.
    if (admit && simulation.policy.maxDeliberations) {
        let state = candidate.states.atri_lifecycle;
        const pending = state.outbox.some(item => item.status === 'pending' && item.simulation);
        if (!pending) {
            const candidates = simulation.jobs.filter(job => job.action.kind === 'task' && job.id !== excludeJobId)
                .map(job => evaluate(candidate, contract, job, budget, untilTick, requestedTick)).filter(item => item && item.tick <= untilTick && item.relevance !== 'cold')
                .map(item => {
                    const task = contract.taskRuntime.tasks.find(task => task.id === item.job.action.taskId);
                    const input = budget.typed(template(item.job.action.input, item.context), task.inputSchema);
                    return { ...item, input, inputHash: hashNativeDocument(item.context.subject
                        ? { input, subject: item.context.subject, evidenceHash: item.evidenceHash } : input) };
                }).filter(item => {
                    const previous = state.automations['simulation:' + item.job.id];
                    if (!previous || previous.epoch !== state.scopes[item.job.scopeId].epoch || previous.cursor < item.tick || previous.inputHash !== item.inputHash) return true;
                    const last = state.outbox.find(queued => queued.invocationId === previous.invocationId);
                    return ['cancelled', 'stale', 'failed'].includes(last?.status) && untilTick > previous.admittedAtTick;
                });
            candidates.sort((a, b) => (a.relevance === b.relevance ? 0 : a.relevance === 'hot' ? -1 : 1) || compare(a, b));
            const selected = candidates[0];
            if (selected) {
                mutable(); state = candidate.states.atri_lifecycle;
                const { job, tick, input, inputHash } = selected;
                const task = contract.taskRuntime.tasks.find(item => item.id === job.action.taskId);
                const action = { kind: 'task', taskId: job.action.taskId, variantId: job.action.variantId, input };
                budget.effect(action);
                const occurrence = hashNativeDocument({ jobId: job.id, dueTick: tick, tick: untilTick, inputHash });
                const queued = addOutbox(state, action, job.scopeId, 'simulation:' + occurrence);
                const variant = task.variants.find(item => item.id === job.action.variantId);
                if (variant.resultBinding?.kind === 'cognition.appraise') queued.appraisalEvent = captureAppraisalEvent(candidate, task, variant, input);
                queued.simulation = { jobId: job.id, tick: untilTick, dueTick: tick, anchorRevisionId: base.revision.revisionId,
                    ...(selected.context.subject ? { subject: selected.context.subject, evidenceHash: selected.evidenceHash } : {}) };
                // This is an admission identity, never proof that the matter or
                // its Domain action completed. New evidence can wake it at the
                // same Tick; a cancelled attempt can retry on later game time.
                state.automations['simulation:' + job.id] = { cursor: tick, epoch: state.scopes[job.scopeId].epoch,
                    inputHash, admittedAtTick: untilTick, invocationId: queued.invocationId };
            }
        }
    }
    validateCandidate(candidate, contract);
    return candidate;
}

export function simulationTaskCurrent(base, item, budget) {
    if (!item.simulation) return true;
    const contract = base.manifest.runtime.experienceContract;
    const simulation = contract.simulationRuntime;
    const job = simulation?.jobs.find(job => job.id === item.simulation.jobId);
    if (!simulation?.policy.maxDeliberations || !job || job.action.kind !== 'task' || job.action.taskId !== item.taskId || job.action.variantId !== item.variantId
        || job.scopeId !== item.scopeId || item.simulation.tick !== base.states.atri_lifecycle.clocks[simulation.clockId]) return false;
    const evaluated = evaluate(base, contract, job, budget);
    if (!evaluated || evaluated.relevance === 'cold' || evaluated.tick !== item.simulation.dueTick) return false;
    if (hashNativeDocument(evaluated.context.subject ?? null) !== hashNativeDocument(item.simulation.subject ?? null)) return false;
    if (evaluated.evidenceHash !== item.simulation.evidenceHash) return false;
    const task = contract.taskRuntime.tasks.find(task => task.id === job.action.taskId);
    const input = budget.typed(template(job.action.input, evaluated.context), task.inputSchema);
    return hashNativeDocument(input) === hashNativeDocument(item.input);
}
