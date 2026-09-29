import { fields } from '../../public/shared/native-values.js';
import { assertTaskValue } from '../../public/shared/native-task-contract.js';

const copy = value => structuredClone(value);
const identity = value => typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const elapsed = value => integer(value) && value <= 604800000;
const terminal = status => ['completed', 'cancelled', 'stale'].includes(status);
export const activityDefinitions = base => base.manifest.runtime?.experienceContract?.presentationRuntime?.activities ?? [];

export function validateActivities(base) {
    const state = base.states.atri_lifecycle;
    if (!state) return;
    const records = state.activities ?? [];
    const tombstones = state.activityTombstones ?? [];
    if (!Array.isArray(records) || records.length > 128 || !Array.isArray(tombstones)) throw new TypeError('Activity retention limit');
    const ids = new Set();
    for (const record of [...records, ...tombstones]) {
        if (!identity(record.instanceId) || ids.has(record.instanceId)
            || !activityDefinitions(base).some(item => item.id === record.activityId)) throw new TypeError('Invalid Activity identity');
        ids.add(record.instanceId);
    }
    for (const record of records) {
        const definition = activityDefinitions(base).find(item => item.id === record.activityId);
        if (definition.scopeId !== record.scopeId || !state.scopes[record.scopeId] || !integer(record.scopeEpoch)
            || !integer(record.runEpoch) || !elapsed(record.activityElapsedMs)
            || !['active', 'paused', 'settled', 'completed', 'cancelled', 'stale'].includes(record.status)) throw new TypeError('Invalid Activity state');
        if (record.observation) {
            assertTaskValue(record.observation.outcome, definition.outcomeSchema);
            if (record.observation.instanceId !== record.instanceId || record.observation.activityId !== record.activityId
                || record.observation.scopeId !== record.scopeId || record.observation.scopeEpoch !== record.scopeEpoch
                || record.observation.activityElapsedMs !== record.activityElapsedMs
                || !/^rev_[a-f0-9]{32}$/.test(record.observation.committedRevisionId)
                || !/^br_[a-f0-9]{32}$/.test(record.observation.branchId)) throw new TypeError('Invalid committed Activity Observation');
        } else if (['settled', 'completed'].includes(record.status)) throw new TypeError('Activity settlement Observation required');
    }
    for (const record of tombstones) if (!terminal(record.status)) throw new TypeError('Invalid Activity tombstone');
}

// Called inside the existing lifecycle candidate transaction. Neither elapsed
// samples nor a presentation outcome may mutate World clocks or select reducers.
export async function prepareActivity(base, action, { apply, addOutbox, events }) {
    const state = base.states.atri_lifecycle;
    if (!state.ready) throw new TypeError('Experience Ready Barrier required');
    state.activities ??= []; state.activityTombstones ??= [];
    if (!identity(action.instanceId)) throw new TypeError('Invalid Activity instance');
    if (action.kind === 'activity.start') {
        fields(action, ['kind', 'activityId', 'instanceId'], 'Activity start');
        const definition = activityDefinitions(base).find(item => item.id === action.activityId);
        if (!definition || state.scopes[definition.scopeId]?.status !== 'active') throw new TypeError('Activity scope is not active');
        if ([...state.activities, ...state.activityTombstones].some(item => item.instanceId === action.instanceId)) throw new TypeError('Activity instance already exists');
        if (state.activities.length >= 128) throw new TypeError('Activity backpressure');
        state.activities.push({ activityId: definition.id, instanceId: action.instanceId, scopeId: definition.scopeId,
            scopeEpoch: state.scopes[definition.scopeId].epoch, status: 'active', runEpoch: 0, activityElapsedMs: 0,
            startedLogicalTime: state.logicalTime + 1 });
    } else {
        const record = state.activities.find(item => item.instanceId === action.instanceId);
        if (!record || terminal(record.status)) throw new TypeError('Activity is closed or missing');
        if (state.scopes[record.scopeId]?.status !== 'active' || state.scopes[record.scopeId].epoch !== record.scopeEpoch) throw new TypeError('Activity scope is stale');
        const definition = activityDefinitions(base).find(item => item.id === record.activityId);
        if (action.kind === 'activity.cancel') {
            fields(action, ['kind', 'instanceId'], 'Activity cancel');
            record.status = 'cancelled';
            for (const item of state.outbox) if (item.activityInstanceId === record.instanceId && item.status === 'pending') item.status = 'cancelled';
        } else if (action.kind === 'activity.resume') {
            fields(action, ['kind', 'instanceId'], 'Activity resume');
            if (!['active', 'paused'].includes(record.status)) throw new TypeError('Settled Activity cannot resume');
            record.status = 'active'; record.runEpoch++;
        } else if (['activity.pause', 'activity.settle'].includes(action.kind)) {
            fields(action, ['kind', 'instanceId', 'runEpoch', 'activityElapsedMs', ...(action.kind === 'activity.settle' ? ['outcome'] : [])], 'Activity sample');
            if (record.status !== 'active' || action.runEpoch !== record.runEpoch || !elapsed(action.activityElapsedMs)
                || action.activityElapsedMs < record.activityElapsedMs) throw new TypeError('Stale or invalid Activity elapsed sample');
            record.activityElapsedMs = action.activityElapsedMs;
            if (action.kind === 'activity.pause') record.status = 'paused';
            else {
                const outcome = assertTaskValue(action.outcome, definition.outcomeSchema);
                await apply({ ...definition.settlement, args: copy(outcome) });
                record.observation = { activityId: definition.id, instanceId: record.instanceId, outcome: copy(outcome),
                    committedRevisionId: null, branchId: null, scopeId: record.scopeId, scopeEpoch: record.scopeEpoch,
                    activityElapsedMs: record.activityElapsedMs };
                record.status = definition.narrator ? 'settled' : 'completed';
                if (definition.narrator) {
                    addOutbox(state, { kind: 'task', ...definition.narrator, input: null }, record.scopeId, 'activity:' + record.instanceId);
                    const queued = state.outbox.at(-1);
                    queued.activityInstanceId = record.instanceId;
                    record.narrativeInvocationId = queued.invocationId;
                }
            }
        } else throw new TypeError('Unknown Activity action');
    }
    events.push({ type: action.kind, instanceId: action.instanceId });
}

// The real Revision id is assigned only by SessionCore. Validate the declared
// Task input before CAS publication; an incompatible Narrator cannot leave facts
// partially committed or receive a speculative Observation.
export function publishActivities(base, revisionId, branchId, taskRecord) {
    const state = base.states.atri_lifecycle;
    if (!state) return;
    for (const record of state.activities ?? []) {
        if (record.observation?.committedRevisionId === null) {
            Object.assign(record.observation, { committedRevisionId: revisionId, branchId });
            const queued = state.outbox.find(item => item.activityInstanceId === record.instanceId && item.status === 'pending');
            if (queued) {
                const task = base.manifest.runtime.experienceContract.taskRuntime.tasks.find(item => item.id === queued.taskId);
                queued.input = copy(assertTaskValue({ observation: record.observation }, task.inputSchema));
            }
        }
        if (taskRecord && record.narrativeInvocationId === taskRecord.invocationId) {
            if (record.status !== 'settled') throw new TypeError('Activity narrative is closed');
            record.status = 'completed'; record.narrativeRevisionId = revisionId;
        }
    }
}

export function activityNarrative(base, queued, record, payload) {
    if (!queued?.activityInstanceId) return null;
    const activity = base.states.atri_lifecycle.activities?.find(item => item.instanceId === queued.activityInstanceId);
    const definition = activityDefinitions(base).find(item => item.id === activity?.activityId);
    if (!activity || activity.status !== 'settled' || activity.narrativeInvocationId !== record.invocationId
        || definition?.narrator?.taskId !== record.taskId || definition.narrator.variantId !== record.variantId
        || typeof payload !== 'string' || !payload.trim()
        || JSON.stringify(queued.input) !== JSON.stringify({ observation: activity.observation })) throw new TypeError('Activity narrative is stale or invalid');
    // The Narrator supplies prose only. Interpretation and settlement are over;
    // no HTML scene, semantic outcomes or authority proposal is accepted here.
    return { role: 'assistant', content: payload };
}
