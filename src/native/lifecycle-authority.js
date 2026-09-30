import { prepareActivity, validateActivities } from './activity-authority.js';
import { prepareInformationRollup } from './information-authority.js';
import { validateInformationState } from '../../public/shared/native-information-runtime.js';
import { compileDeclarativeLogic } from '../../public/scripts/native/experience/logic/declarative.js';
import { fields } from '../../public/shared/native-values.js';
import { assertTaskValue, taskId } from '../../public/shared/native-task-contract.js';
import { LIFECYCLE_STATE_NAMESPACE as NS } from '../../public/shared/native-lifecycle-contract.js';
import { hashNativeDocument } from './repositories/common.js';
import { prepareTaskAuthority } from './task-authority.js';

const copy = value => structuredClone(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const invocation = value => typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(value);
export const lifecycleDefinition = base => base.manifest.runtime?.experienceContract?.lifecycleRuntime;

export function initialLifecycle(definition) {
    if (!definition) return null;
    return { schemaVersion: 1, logicalTime: 0,
        clocks: Object.fromEntries(definition.clocks.map(clock => [clock.id, clock.initialTick])),
        scopes: Object.fromEntries(definition.scopes.map(scope => [scope.id, { status: 'active', epoch: 0 }])),
        domains: Object.fromEntries(definition.domains.map(domain => [domain.id, { records: [] }])),
        workflows: Object.fromEntries(definition.workflows.map(flow => [flow.id, { phase: flow.initial, instance: 0, status: 'active', entered: false }])),
        ready: false, automations: {}, outbox: [], interactions: [], receipts: [], taskTombstones: [] };
}

export function validateLifecycle(base) {
    const def = lifecycleDefinition(base); const state = base.states[NS];
    if (!def) { if (state) throw new TypeError('Undeclared lifecycle state'); return; }
    if (!state || state.schemaVersion !== 1 || !integer(state.logicalTime)) throw new TypeError('Invalid lifecycle version or logical time');
    for (const scope of def.scopes) {
        const value = state.scopes[scope.id];
        if (!value || !['active', 'suspended', 'archived'].includes(value.status) || !integer(value.epoch)) throw new TypeError('Invalid scope state');
        if (scope.worldId && !base.manifest.worlds.some(item => item.world.worldId === scope.worldId)) throw new TypeError('Scope World is not in Package');
    }
    for (const clock of def.clocks) if (!integer(state.clocks[clock.id])) throw new TypeError('Invalid World Clock');
    for (const domain of def.domains) {
        const records = state.domains[domain.id]?.records;
        if (!Array.isArray(records) || records.length > domain.retention.maxItems || new Set(records.map(item => item.id)).size !== records.length) throw new TypeError('Invalid domain records');
        for (const record of records) {
            taskId(record.id); assertTaskValue(record.value, domain.recordSchema);
            if (!['active', 'terminal'].includes(record.status) || typeof record.pinned !== 'boolean') throw new TypeError('Invalid scoped record');
        }
    }
    for (const flow of def.workflows) {
        const current = state.workflows[flow.id];
        if (!current || !flow.nodes.some(node => node.id === current.phase) || !integer(current.instance)
            || !['active', 'completed', 'cancelled'].includes(current.status)) throw new TypeError('Invalid Workflow state');
    }
    if (!Array.isArray(state.interactions) || state.interactions.length > 128) throw new TypeError('Scheduled interaction retention limit');
    if (!Array.isArray(state.receipts) || state.receipts.length + state.taskTombstones.length + (state.activityTombstones?.length ?? 0) > def.retention.maxReceipts
        || !Array.isArray(state.outbox) || state.outbox.length > 128) throw new TypeError('Lifecycle retention limit');
    if (new Set(state.receipts.map(item => item.invocationId)).size !== state.receipts.length) throw new TypeError('Duplicate lifecycle receipt');
    for (const receipt of state.receipts) if (!invocation(receipt.invocationId) || receipt.kind !== 'authority') throw new TypeError('Invalid lifecycle receipt');
    validateActivities(base);
    validateInformationState(base);
    if (typeof state.ready !== 'boolean') throw new TypeError('Invalid lifecycle barrier');
}

// A conservative reference walk protects retained records even before P6's richer
// typed projection/index facade. It never exposes the scanned state to a model.
function mentions(value, id) {
    if (typeof value === 'string') return value === id;
    if (Array.isArray(value)) return value.some(item => mentions(item, id));
    return value && typeof value === 'object' && Object.values(value).some(item => mentions(item, id));
}
function protectedRecord(base, state, domainId, record) {
    if (record.pinned || record.status !== 'terminal') return true;
    if (mentions(base.timeline, record.id)) return true;
    for (const [key, value] of Object.entries(base.states)) if (key !== NS && mentions(value, record.id)) return true;
    for (const [id, domain] of Object.entries(state.domains)) {
        if (domain.records.some(item => (id !== domainId || item.id !== record.id) && mentions(item.value, record.id))) return true;
    }
    return mentions(state.outbox, record.id);
}
export function compactLifecycle(base, state, { reserveTask = false, pruneInteractions = false } = {}) {
    const def = lifecycleDefinition(base);
    for (const domain of def.domains) {
        const records = state.domains[domain.id].records;
        const policy = domain.retention;
        for (let index = 0; index < records.length;) {
            const record = records[index];
            const expired = policy.terminalTtl && state.clocks[policy.terminalTtl.clockId] - record.terminalTicks?.[policy.terminalTtl.clockId] >= policy.terminalTtl.ticks;
            const oversized = records.length > policy.maxItems || Buffer.byteLength(JSON.stringify(records)) > policy.maxLogicalBytes;
            if ((expired || oversized) && !protectedRecord(base, state, domain.id, record)) records.splice(index, 1);
            else index++;
        }
        if (records.length > policy.maxItems || Buffer.byteLength(JSON.stringify(records)) > policy.maxLogicalBytes) throw new TypeError('Domain retention is pinned or active');
    }
    const taskState = base.states.atri_task_results;
    if (taskState) {
        const records = copy(taskState.records); const limit = def.retention.maxTaskResults - Number(reserveTask);
        for (let i = 0; records.length > limit && i < records.length;) {
            const record = records[i];
            if (record.status === 'draft' || record.pinned || mentions(base.timeline, record.invocationId)
                || Object.entries(base.states).some(([key, value]) => ![NS, 'atri_task_results'].includes(key) && mentions(value, record.invocationId))
                || Object.values(state.domains).some(domain => mentions(domain.records, record.invocationId))
                || Object.values(state.workflows).some(flow => flow.status === 'active' && flow.taskInvocationId === record.invocationId)
                || state.outbox.some(item => item.status === 'pending' && item.invocationId === record.invocationId)) { i++; continue; }
            state.taskTombstones.push({ invocationId: record.invocationId, fingerprint: record.fingerprint ?? null,
                kind: record.kind, requestHash: record.requestHash ?? null, status: record.status, branchId: record.branchId, storedRevisionId: record.storedRevisionId,
                ...(record.anchorRevisionId ? { anchorRevisionId: record.anchorRevisionId } : {}) });
            records.splice(i, 1);
        }
        if (records.length > limit) throw new TypeError('Task result retention is pinned or active');
        base.states.atri_task_results = { ...taskState, records };
    }
    // Outbox completion receipts live in Task results/tombstones; removing the
    // duplicate queue payload cannot permit an occurrence to run a second time.
    state.outbox = state.outbox.filter(item => item.status === 'pending');
    if (pruneInteractions || (state.activities?.length ?? 0) >= 128) {
        state.activityTombstones ??= [];
        state.activities = (state.activities ?? []).filter(item => {
            if (!['completed', 'cancelled', 'stale'].includes(item.status) || mentions(base.timeline, item.instanceId)
                || Object.values(state.domains).some(domain => mentions(domain.records, item.instanceId))) return true;
            state.activityTombstones.push({ instanceId: item.instanceId, activityId: item.activityId, status: item.status });
            return false;
        });
    }
    if (pruneInteractions || state.interactions.length >= 128) state.interactions = state.interactions.filter(item => item.status === 'scheduled' || mentions(base.timeline, item.proposalId)
        || Object.values(state.domains).some(domain => mentions(domain.records, item.proposalId)));
    if (state.receipts.length + state.taskTombstones.length + (state.activityTombstones?.length ?? 0) > def.retention.maxReceipts) throw new TypeError('Lifecycle receipt retention limit reached');
}

function active(state, scopeId) {
    if (state.scopes[scopeId]?.status !== 'active') throw new TypeError('Scope is not active');
}

// Shared by explicit proposal acceptance and the narrower declared Task sink.
// This only stages durable intent; the existing Lifecycle pump owns delivery.
function scheduleInteraction(base, candidate, mapping, record) {
    const state = candidate.states[NS];
    active(state, mapping.scopeId);
    const payload = record.payload;
    fields(payload, ['recordId', 'dueTick', 'args'], 'Scheduled interaction payload'); taskId(payload.recordId);
    const clock = state.clocks[mapping.clockId];
    if (!integer(payload.dueTick) || payload.dueTick < clock || payload.dueTick - clock > mapping.maxDelay) throw new TypeError('Scheduled interaction WorldInstant outside declared bounds');
    const domain = lifecycleDefinition(base).domains.find(item => item.id === mapping.domainId);
    const command = domain.commands.find(item => item.id === mapping.commandId);
    const args = assertTaskValue(payload.args, command.argsSchema);
    if (state.interactions.length >= 128) compactLifecycle(candidate, state);
    if (state.interactions.length >= 128) throw new TypeError('Scheduled interaction backpressure');
    state.interactions.push({ proposalId: record.invocationId, interactionId: mapping.id, scopeId: mapping.scopeId,
        scopeEpoch: state.scopes[mapping.scopeId].epoch, clockId: mapping.clockId, dueTick: payload.dueTick,
        domainId: mapping.domainId, commandId: mapping.commandId, recordId: payload.recordId, args,
        anchorRevisionId: record.storedRevisionId ?? base.revision.revisionId, taskId: record.taskId, variantId: record.variantId, status: 'scheduled' });
}

export async function prepareDeclaredTaskResult(base, installed, queued, task, variant, record, authority = null) {
    const state = base.states[NS];
    if (!state?.ready || !queued || task.resultPolicy.sink !== 'app_command') throw new TypeError('Declared App Command requires durable Lifecycle intent');
    const binding = variant.resultBinding;
    const def = lifecycleDefinition(base);
    const mapping = binding.kind === 'interaction.schedule' ? def.interactions.find(item => item.id === binding.interactionId) : null;
    const domain = def.domains.find(item => item.id === (mapping?.domainId ?? binding.domainId));
    // A trigger cannot grant authority in another scope, even if both are active.
    if (domain.scopeId !== queued.scopeId || (mapping && mapping.taskId !== task.id)) throw new TypeError('Task result scope/binding mismatch');
    active(state, domain.scopeId);
    if (binding.kind === 'app.command') {
        const action = { ...binding, recordId: binding.recordId ?? 'task-' + hashNativeDocument(record.invocationId).slice(0, 48), args: record.payload };
        const prepared = await prepareLifecycle(base, installed, action, authority);
        return { states: prepared.states, authorityReceipt: { kind: 'authority', decision: 'app.command',
            domainId: action.domainId, commandId: action.commandId, recordId: action.recordId, baseRevisionId: base.revision.revisionId } };
    }
    const candidate = { ...base, states: copy(base.states) };
    authority?.value(record.payload);
    scheduleInteraction(base, candidate, mapping, record);
    compactLifecycle(candidate, candidate.states[NS]);
    return { states: candidate.states, authorityReceipt: { kind: 'authority', decision: 'schedule',
        interactionId: mapping.id, baseRevisionId: base.revision.revisionId } };
}
export function addOutbox(state, action, scopeId, occurrence, workflowId = null) {
    if (state.outbox.length >= 128) throw new TypeError('Scheduled interaction backpressure');
    const invocationId = 'lc:' + hashNativeDocument({ occurrence, scopeId, epoch: state.scopes[scopeId].epoch }).slice(0, 48);
    const existing = state.outbox.find(item => item.invocationId === invocationId);
    if (existing) return existing;
    state.outbox.push({ ...copy(action), invocationId, scopeId, scopeEpoch: state.scopes[scopeId].epoch, status: 'pending', workflowId });
    return state.outbox.at(-1);
}

export async function prepareLifecycle(base, installed, action, authority = null) {
    const def = lifecycleDefinition(base);
    if (!def) throw new TypeError('Package lifecycle contract required');
    const candidate = { ...base, states: copy(base.states) }; const state = candidate.states[NS];
    const events = []; let budget = 32; let taskResolution = null; const drafts = [];
    const apply = async (request, occurrence = 'direct', scopeId = null) => {
        if (--budget < 0) throw new TypeError('Lifecycle transaction work limit');
        authority?.effect(request);
        if (request.kind === 'app.command') {
            fields(request, ['kind', 'domainId', 'recordId', 'commandId', 'args'], 'App Command');
            const domain = def.domains.find(item => item.id === request.domainId); const command = domain?.commands.find(item => item.id === request.commandId);
            if (!command) throw new TypeError('Unknown App Command');
            active(state, domain.scopeId); taskId(request.recordId);
            const args = authority ? authority.typed(request.args, command.argsSchema) : assertTaskValue(request.args, command.argsSchema);
            const records = state.domains[domain.id].records; let record = records.find(item => item.id === request.recordId);
            if (record?.status === 'terminal') throw new TypeError('App record is terminal');
            if (!record) { record = { id: request.recordId, scopeId: domain.scopeId, value: copy(domain.initial), status: 'active', pinned: false, createdLogicalTime: state.logicalTime }; records.push(record); }
            const { terminal: _terminal, ...mutation } = command;
            const logic = compileDeclarativeLogic({ schemaVersion: 2, mutations: [mutation] });
            const event = { type: command.event, payload: args };
            const nextValue = logic.reducers[0].reduce(record.value, event);
            record.value = authority ? authority.typed(nextValue, domain.recordSchema) : assertTaskValue(nextValue, domain.recordSchema);
            record.updatedLogicalTime = state.logicalTime + 1;
            if (command.terminal) { record.status = 'terminal'; record.terminalTicks = copy(state.clocks); }
            events.push({ type: event.type, domainId: domain.id, recordId: record.id, payload: args });
        } else if (request.kind === 'world.command') {
            fields(request, ['kind', 'commandId', 'args'], 'World Process Command');
            Object.assign(candidate.states, await prepareTaskAuthority(candidate, installed, { command: { id: request.commandId, args: request.args } }, authority));
        } else if (request.kind === 'task') {
            active(state, scopeId); addOutbox(state, request, scopeId, occurrence);
        } else if (request.kind === 'workflow.transition') {
            fields(request, ['kind', 'workflowId', 'transitionId'], 'Workflow transition');
            const flow = def.workflows.find(item => item.id === request.workflowId); const current = state.workflows[request.workflowId];
            const edge = flow?.transitions.find(item => item.id === request.transitionId);
            if (!edge || current.status !== 'active' || edge.from !== current.phase) throw new TypeError('Workflow transition is stale or closed');
            active(state, flow.scopeId);
            const node = flow.nodes.find(item => item.id === current.phase);
            if (node.kind === 'wait_until' && state.clocks[node.wait.clockId] < node.wait.tick) throw new TypeError('Workflow temporal wait is not due');
            if (node.kind === 'model_task' && (!current.taskInvocationId || !candidate.states.atri_task_results?.records.some(item => item.invocationId === current.taskInvocationId))) throw new TypeError('Workflow Task is not complete');
            if (node.kind === 'action' && !current.entered) throw new TypeError('Workflow Action is not complete');
            current.phase = edge.to; current.instance++; current.entered = false; delete current.taskInvocationId;
            events.push({ type: 'workflow.transition', workflowId: flow.id, transitionId: edge.id, instance: current.instance });
            await enter(flow);
        } else throw new TypeError('Unsupported lifecycle action');
    };
    const enter = async flow => {
        const current = state.workflows[flow.id]; const node = flow.nodes.find(item => item.id === current.phase);
        if (current.status !== 'active' || current.entered || state.scopes[flow.scopeId].status !== 'active') return;
        authority?.step();
        if (node.kind === 'model_task') {
            authority?.effect(node.action);
            const occurrence = `workflow:${flow.id}:${current.instance}`;
            addOutbox(state, node.action, flow.scopeId, occurrence, flow.id);
            current.taskInvocationId = state.outbox.at(-1).invocationId;
        } else if (node.kind === 'action') await apply(node.action, `workflow:${flow.id}:${current.instance}`, flow.scopeId);
        if (node.kind === 'terminal') current.status = 'completed';
        current.entered = true;
    };
    const pump = async () => {
        if (!state.ready) throw new TypeError('Experience Ready Barrier required');
        for (const flow of def.workflows) if (authority || budget > 8) await enter(flow);
        // Legacy pumps may defer work. A bounded Authority candidate must instead
        // fail if actual expanded work exceeds its shared transaction budget.
        let remaining = authority ? Infinity : Math.min(24, budget);
        for (const item of state.interactions) {
            authority?.step();
            if (!remaining || item.status !== 'scheduled' || state.clocks[item.clockId] < item.dueTick) continue;
            if (state.scopes[item.scopeId].status !== 'active' || state.scopes[item.scopeId].epoch !== item.scopeEpoch) { item.status = 'stale'; continue; }
            await apply({ kind: 'app.command', domainId: item.domainId, recordId: item.recordId, commandId: item.commandId, args: item.args });
            item.status = 'delivered'; item.deliveredLogicalTime = state.logicalTime + 1; remaining--;
            events.push({ type: 'interaction.delivered', proposalId: item.proposalId, clockId: item.clockId, dueTick: item.dueTick });
        }
        for (const automation of def.automations) {
            authority?.step();
            if (remaining <= 0 || state.scopes[automation.scopeId].status !== 'active') continue;
            const trigger = automation.trigger; const epoch = state.scopes[automation.scopeId].epoch;
            const previous = state.automations[automation.id] ?? { cursor: null, epoch };
            if (trigger.kind === 'experience.ready') {
                if (previous.cursor !== null && previous.epoch === epoch) continue;
                await apply(automation.action, `ready:${automation.id}:${epoch}`, automation.scopeId);
                state.automations[automation.id] = { cursor: 0, epoch }; remaining--; continue;
            }
            const now = trigger.kind === 'world.schedule' ? state.clocks[trigger.clockId] : state.logicalTime;
            const first = previous.cursor === null ? trigger.at ?? trigger.every : previous.cursor + trigger.every;
            if (first > now) continue;
            const last = trigger.every ? first + Math.floor((now - first) / trigger.every) * trigger.every : first;
            if (!trigger.every && previous.cursor !== null) continue;
            if (trigger.catchUp === 'skip' && first < now) { state.automations[automation.id] = { cursor: last, epoch }; continue; }
            const occurrences = trigger.catchUp === 'latest' ? [last] : [];
            if (!occurrences.length) {
                let cursor = first;
                while (cursor <= now && occurrences.length < Math.min(automation.maxCatchUp, remaining)) {
                    occurrences.push(cursor); if (!trigger.every) break; cursor += trigger.every;
                }
            }
            for (const tick of occurrences) {
                await apply(automation.action, `automation:${automation.id}:${tick}`, automation.scopeId);
                state.automations[automation.id] = { cursor: tick, epoch }; remaining--;
            }
        }
    };
    if (action.kind === 'experience.ready') {
        fields(action, ['kind'], 'Experience ready'); state.ready = true; await pump();
    } else if (action.kind === 'pump') {
        fields(action, ['kind'], 'Lifecycle pump'); await pump();
    } else if (action.kind === 'clock.advance') {
        fields(action, ['kind', 'commandId', 'ticks'], 'World Clock advance');
        authority?.effect(action);
        const command = def.advances.find(item => item.id === action.commandId);
        if (!command || !Number.isSafeInteger(action.ticks) || action.ticks < 1 || action.ticks > command.maxTicks
            || !integer(state.clocks[command.clockId] + action.ticks)) throw new TypeError('Invalid declared World Clock advance');
        if (candidate.manifest.runtime.experienceContract.simulationRuntime?.clockId === command.clockId) {
            if (!authority) throw new TypeError('Simulation requires a shared Authority budget');
            const { prepareWorldSimulation } = await import('./simulation-authority.js');
            const prepared = await prepareWorldSimulation(candidate, installed, state.clocks[command.clockId] + action.ticks, authority);
            Object.assign(candidate.states, prepared.states);
            Object.assign(state, prepared.states[NS]); candidate.states[NS] = state;
        } else state.clocks[command.clockId] += action.ticks;
        events.push({ type: 'world.clock.advanced', clockId: command.clockId, ticks: action.ticks });
    } else if (action.kind === 'scope.transition') {
        fields(action, ['kind', 'scopeId', 'status'], 'Scope transition'); const scope = state.scopes[action.scopeId];
        if (!scope || !['active', 'suspended', 'archived'].includes(action.status) || scope.status === 'archived') throw new TypeError('Invalid scope transition');
        if (scope.status !== action.status) {
            scope.status = action.status; scope.epoch++;
            for (const item of state.outbox) if (item.scopeId === action.scopeId && item.status === 'pending') item.status = 'cancelled';
            for (const item of state.activities ?? []) if (item.scopeId === action.scopeId && ['active', 'paused', 'settled'].includes(item.status)) item.status = 'stale';
            for (const item of state.interactions) if (item.scopeId === action.scopeId && item.status === 'scheduled') item.status = 'stale';
            for (const flow of def.workflows.filter(item => item.scopeId === action.scopeId)) {
                const current = state.workflows[flow.id];
                if (current.taskInvocationId) { current.entered = false; current.instance++; delete current.taskInvocationId; }
                if (action.status === 'archived' && current.status === 'active') current.status = 'cancelled';
            }
        }
    } else if (action.kind === 'workflow.cancel') {
        fields(action, ['kind', 'workflowId'], 'Workflow cancel'); const current = state.workflows[action.workflowId];
        if (!current || current.status !== 'active') throw new TypeError('Workflow is closed'); current.status = 'cancelled';
        for (const item of state.outbox) if (item.workflowId === action.workflowId && item.status === 'pending') item.status = 'cancelled';
    } else if (action.kind === 'interaction.schedule') {
        fields(action, ['kind', 'interactionId', 'proposalId'], 'Scheduled interaction proposal');
        const mapping = def.interactions.find(item => item.id === action.interactionId);
        const proposal = candidate.states.atri_task_results?.records.find(item => item.invocationId === action.proposalId);
        if (!mapping || !proposal || proposal.taskId !== mapping.taskId || proposal.status !== 'draft'
            || proposal.branchId !== base.revision.branchId || proposal.storedRevisionId !== base.revision.revisionId) throw new TypeError('Scheduled interaction proposal is stale or closed');
        scheduleInteraction(base, candidate, mapping, proposal);
        proposal.status = 'applied'; proposal.authorityReceipt = { kind: 'authority', decision: 'schedule', baseRevisionId: base.revision.revisionId };
        taskResolution = proposal.invocationId;
        events.push({ type: 'interaction.scheduled', proposalId: proposal.invocationId, clockId: mapping.clockId, dueTick: proposal.payload.dueTick });
    } else if (action.kind === 'interaction.cancel') {
        fields(action, ['kind', 'proposalId'], 'Scheduled interaction cancel');
        const item = state.interactions.find(item => item.proposalId === action.proposalId);
        if (!item || item.status !== 'scheduled') throw new TypeError('Scheduled interaction is closed'); item.status = 'cancelled';
        events.push({ type: 'interaction.cancelled', proposalId: action.proposalId });
    } else if (action.kind === 'scheduled.cancel') {
        fields(action, ['kind', 'invocationId'], 'Scheduled cancel'); const item = state.outbox.find(item => item.invocationId === action.invocationId);
        if (!item || item.status !== 'pending') throw new TypeError('Scheduled interaction is closed'); item.status = 'cancelled';
        if (item.workflowId) state.workflows[item.workflowId].status = 'cancelled';
    } else if (action.kind === 'app.pin') {
        fields(action, ['kind', 'domainId', 'recordId', 'pinned'], 'App pin'); const record = state.domains[action.domainId]?.records.find(item => item.id === action.recordId);
        if (!record || typeof action.pinned !== 'boolean') throw new TypeError('Invalid App pin'); active(state, record.scopeId); record.pinned = action.pinned;
    } else if (action.kind === 'retention.compact') {
        fields(action, ['kind'], 'Retention compact');
    } else if (action.kind === 'information.rollup') {
        prepareInformationRollup(candidate, action);
    } else if (action.kind.startsWith('activity.')) {
        await prepareActivity(candidate, action, { apply, addOutbox, events });
    } else if (['app.command', 'workflow.transition'].includes(action.kind)) await apply(action);
    else throw new TypeError('Undeclared lifecycle command');
    compactLifecycle(candidate, state, { pruneInteractions: action.kind === 'retention.compact' });
    return { states: candidate.states, events, taskResolution, drafts };
}

export function projectApplication(base, domainId) {
    const def = lifecycleDefinition(base); const domain = def?.domains.find(item => item.id === domainId);
    if (!domain || base.states[NS].scopes[domain.scopeId].status !== 'active') return [];
    return copy(base.states[NS].domains[domainId].records);
}
