import { prepareActivity, validateActivities } from './activity-authority.js';
import { compileDeclarativeLogic } from '../../public/scripts/native/experience/logic/declarative.js';
import { compileUiDocument } from '../../public/scripts/native/experience/ui/v2-document.js';
import { fieldErrors } from '../../public/scripts/native/experience/ui/v2-state.js';
import { fields, json } from '../../public/scripts/native/experience/ui/v2-values.js';
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
        opening: { completed: false, step: null, history: [], values: {}, variant: null },
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
    if (typeof state.ready !== 'boolean' || typeof state.opening.completed !== 'boolean') throw new TypeError('Invalid lifecycle barrier');
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
                kind: record.kind, requestHash: record.requestHash ?? null, status: record.status, branchId: record.branchId, storedRevisionId: record.storedRevisionId });
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
function addOutbox(state, action, scopeId, occurrence, workflowId = null) {
    if (state.outbox.length >= 128) throw new TypeError('Scheduled interaction backpressure');
    const invocationId = 'lc:' + hashNativeDocument({ occurrence, scopeId, epoch: state.scopes[scopeId].epoch }).slice(0, 48);
    if (state.outbox.some(item => item.invocationId === invocationId)) return;
    state.outbox.push({ ...copy(action), invocationId, scopeId, scopeEpoch: state.scopes[scopeId].epoch, status: 'pending', workflowId });
}

export async function prepareLifecycle(base, installed, action) {
    const def = lifecycleDefinition(base);
    if (!def) throw new TypeError('Package lifecycle contract required');
    const candidate = { ...base, states: copy(base.states) }; const state = candidate.states[NS];
    const events = []; let budget = 32; let taskResolution = null; const drafts = [];
    const apply = async (request, occurrence = 'direct', scopeId = null) => {
        if (--budget < 0) throw new TypeError('Lifecycle transaction work limit');
        if (request.kind === 'app.command') {
            fields(request, ['kind', 'domainId', 'recordId', 'commandId', 'args'], 'App Command');
            const domain = def.domains.find(item => item.id === request.domainId); const command = domain?.commands.find(item => item.id === request.commandId);
            if (!command) throw new TypeError('Unknown App Command');
            active(state, domain.scopeId); taskId(request.recordId);
            const args = assertTaskValue(request.args, command.argsSchema);
            const records = state.domains[domain.id].records; let record = records.find(item => item.id === request.recordId);
            if (record?.status === 'terminal') throw new TypeError('App record is terminal');
            if (!record) { record = { id: request.recordId, scopeId: domain.scopeId, value: copy(domain.initial), status: 'active', pinned: false, createdLogicalTime: state.logicalTime }; records.push(record); }
            const { terminal: _terminal, ...mutation } = command;
            const logic = compileDeclarativeLogic({ schemaVersion: 2, mutations: [mutation] });
            const event = { type: command.event, payload: args };
            record.value = assertTaskValue(logic.reducers[0].reduce(record.value, event), domain.recordSchema);
            record.updatedLogicalTime = state.logicalTime + 1;
            if (command.terminal) { record.status = 'terminal'; record.terminalTicks = copy(state.clocks); }
            events.push({ type: event.type, domainId: domain.id, recordId: record.id, payload: args });
        } else if (request.kind === 'world.command') {
            fields(request, ['kind', 'commandId', 'args'], 'World Process Command');
            Object.assign(candidate.states, await prepareTaskAuthority(candidate, installed, { command: { id: request.commandId, args: request.args } }));
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
            if (node.kind === 'opening' && !state.opening.completed) throw new TypeError('Workflow Opening is not complete');
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
        if (node.kind === 'model_task') {
            const occurrence = `workflow:${flow.id}:${current.instance}`;
            addOutbox(state, node.action, flow.scopeId, occurrence, flow.id);
            current.taskInvocationId = state.outbox.at(-1).invocationId;
        } else if (node.kind === 'action') await apply(node.action, `workflow:${flow.id}:${current.instance}`, flow.scopeId);
        if (node.kind === 'terminal') current.status = 'completed';
        current.entered = true;
    };
    const pump = async () => {
        if (!state.ready) throw new TypeError('Experience Ready Barrier required');
        for (const flow of def.workflows) if (budget > 8) await enter(flow);
        let remaining = Math.min(24, budget);
        for (const item of state.interactions) {
            if (!remaining || item.status !== 'scheduled' || state.clocks[item.clockId] < item.dueTick) continue;
            if (state.scopes[item.scopeId].status !== 'active' || state.scopes[item.scopeId].epoch !== item.scopeEpoch) { item.status = 'stale'; continue; }
            await apply({ kind: 'app.command', domainId: item.domainId, recordId: item.recordId, commandId: item.commandId, args: item.args });
            item.status = 'delivered'; item.deliveredLogicalTime = state.logicalTime + 1; remaining--;
            events.push({ type: 'interaction.delivered', proposalId: item.proposalId, clockId: item.clockId, dueTick: item.dueTick });
        }
        for (const automation of def.automations) {
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
        const command = def.advances.find(item => item.id === action.commandId);
        if (!command || !Number.isSafeInteger(action.ticks) || action.ticks < 1 || action.ticks > command.maxTicks
            || !integer(state.clocks[command.clockId] + action.ticks)) throw new TypeError('Invalid declared World Clock advance');
        state.clocks[command.clockId] += action.ticks;
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
        active(state, mapping.scopeId);
        const payload = proposal.payload;
        fields(payload, ['recordId', 'dueTick', 'args'], 'Scheduled interaction payload'); taskId(payload.recordId);
        const clock = state.clocks[mapping.clockId];
        if (!integer(payload.dueTick) || payload.dueTick < clock || payload.dueTick - clock > mapping.maxDelay) throw new TypeError('Scheduled interaction WorldInstant outside declared bounds');
        const domain = def.domains.find(item => item.id === mapping.domainId);
        const command = domain.commands.find(item => item.id === mapping.commandId);
        const args = assertTaskValue(payload.args, command.argsSchema);
        if (state.interactions.length >= 128) compactLifecycle(candidate, state);
        if (state.interactions.length >= 128) throw new TypeError('Scheduled interaction backpressure');
        state.interactions.push({ proposalId: action.proposalId, interactionId: mapping.id, scopeId: mapping.scopeId,
            scopeEpoch: state.scopes[mapping.scopeId].epoch, clockId: mapping.clockId, dueTick: payload.dueTick,
            domainId: mapping.domainId, commandId: mapping.commandId, recordId: payload.recordId, args,
            anchorRevisionId: proposal.storedRevisionId, taskId: proposal.taskId, variantId: proposal.variantId, status: 'scheduled' });
        proposal.status = 'applied'; proposal.authorityReceipt = { kind: 'authority', decision: 'schedule', baseRevisionId: base.revision.revisionId };
        taskResolution = proposal.invocationId;
        events.push({ type: 'interaction.scheduled', proposalId: proposal.invocationId, clockId: mapping.clockId, dueTick: payload.dueTick });
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
    } else if (action.kind.startsWith('activity.')) {
        await prepareActivity(candidate, action, { apply, addOutbox, events });
    } else if (action.kind.startsWith('opening.')) {
        const draft = await prepareOpening(candidate, installed, action, state, events);
        if (draft) drafts.push(draft);
    } else if (['app.command', 'workflow.transition'].includes(action.kind)) await apply(action);
    else throw new TypeError('Undeclared lifecycle command');
    compactLifecycle(candidate, state, { pruneInteractions: action.kind === 'retention.compact' });
    return { states: candidate.states, events, taskResolution, drafts };
}

function openingContext(base, installed, definition, values, preferences = {}) {
    const ui = Object.fromEntries(Object.entries(definition.localState).map(([key, field]) => [key, copy(field.default)]));
    for (const [key, value] of Object.entries(values)) {
        if (!Object.hasOwn(definition.localState, key)) throw new TypeError('Unknown Opening setup field');
        fieldErrors(definition.localState[key], value); ui[key] = value;
    }
    const prefs = Object.fromEntries(Object.entries(definition.preferences).map(([key, field]) => [key, copy(field.default)]));
    for (const [key, value] of Object.entries(preferences)) {
        if (!Object.hasOwn(definition.preferences, key) || fieldErrors(definition.preferences[key], value).length) throw new TypeError('Invalid Opening preference');
        prefs[key] = value;
    }
    const data = {};
    for (const ref of installed.manifest.runtime.experienceContract.dataResources) {
        const bytes = installed.assets.get(ref.assetId); if (!bytes || bytes.length > 2 * 1024 * 1024) throw new TypeError('Missing Package Data');
        const keys = ref.resourceId.split('.'); let target = data;
        for (const key of keys.slice(0, -1)) { target[key] ??= {}; target = target[key]; }
        target[keys.at(-1)] = JSON.parse(bytes.toString('utf8'));
    }
    const primary = base.states.atri_world_state.primaryWorldId;
    const ctx = { ui, prefs, world: base.states.atri_world_state.worlds[primary]?.state ?? {}, data, env: {}, form: { ...ui } };
    const evaluating = new Set();
    ctx.selectors = {};
    for (const [key, expression] of Object.entries(definition.selectors)) Object.defineProperty(ctx.selectors, key, { enumerable: true, get() {
        if (evaluating.has(key)) throw new TypeError('Cyclic Opening selector');
        evaluating.add(key); try { return expression.read(ctx); } finally { evaluating.delete(key); }
    } });
    return ctx;
}
function validOpeningFields(definition, step, ctx) {
    for (const path of step.fields) {
        const key = path.slice(3);
        if (fieldErrors(definition.localState[key], ctx.ui[key]).length) throw new TypeError('Invalid Opening fields');
    }
}
async function prepareOpening(base, installed, action, state, events) {
    const experience = installed.entryPoint.runtime?.experience ?? installed.manifest.runtime?.experience;
    const bytes = installed.sourceFiles.get(experience?.component);
    if (experience?.componentModelVersion !== 2 || !bytes || bytes.length > 2 * 1024 * 1024) throw new TypeError('Pinned Opening Document required');
    const definition = compileUiDocument(JSON.parse(bytes.toString('utf8')), { mode: experience.mode });
    if (!definition.opening) throw new TypeError('Opening is not declared');
    if (state.opening.completed) throw new TypeError('Opening is complete');
    const oldStep = state.opening.step ?? definition.opening.initial;
    if (action.kind === 'opening.progress') {
        fields(action, ['kind', 'step', 'history', 'values', 'variant'], 'Opening progress');
        if (!definition.opening.steps.some(step => step.id === action.step) || !Array.isArray(action.history) || action.history.length > 64
            || action.history.some(id => !definition.opening.steps.some(step => step.id === id)) || action.variant !== null && action.variant !== undefined) throw new TypeError('Invalid Opening progress');
        const values = json(action.values); const ctx = openingContext(base, installed, definition, values);
        const oldHistory = state.opening.history;
        if (action.step !== oldStep) {
            const back = oldHistory.at(-1) === action.step && JSON.stringify(action.history) === JSON.stringify(oldHistory.slice(0, -1));
            const from = definition.opening.steps.find(step => step.id === oldStep);
            const forward = JSON.stringify(action.history) === JSON.stringify([...oldHistory, oldStep])
                && from.next.find(edge => edge.when.read(ctx) === true)?.to === action.step;
            if (!back && !forward) throw new TypeError('Opening transition is not allowed');
            if (forward) validOpeningFields(definition, from, ctx);
        } else if (JSON.stringify(action.history) !== JSON.stringify(oldHistory)) throw new TypeError('Opening history mismatch');
        state.opening = { completed: false, step: action.step, history: copy(action.history), values: copy(values), variant: null };
    } else if (action.kind === 'opening.complete') {
        fields(action, ['kind', 'confirmation', 'submission', 'preferences'], 'Opening complete');
        const ctx = openingContext(base, installed, definition, state.opening.values, action.preferences === undefined ? {} : json(action.preferences));
        validOpeningFields(definition, definition.opening.steps.find(step => step.id === oldStep), ctx);
        const confirm = definition.actions[definition.opening.confirmAction];
        if (confirm.constraints.some(rule => rule.status === 'blocked' && rule.when.read(ctx) === true)) throw new TypeError('Opening confirmation is blocked');
        let expectedCommand = null; let composer = null; let expectedSubmission = null;
        for (const step of confirm.steps) {
            if (step.when && step.when.read(ctx) !== true) continue;
            const value = step.value?.read(ctx);
            if (step.op.startsWith('ui.')) {
                const [root, key] = step.path.split('.'); const field = root === 'ui' ? definition.localState[key] : definition.preferences[key];
                ctx[root][key] = step.op === 'ui.set' ? value : step.op === 'ui.toggle' ? !ctx[root][key] : copy(field.default);
                fieldErrors(field, ctx[root][key]);
            } else if (step.op === 'command.dispatch') expectedCommand = { commandId: step.commandId, args: json(step.args.read(ctx)) };
            else if (step.op === 'action.compensate') throw new TypeError('Opening requires a declared confirmation Command');
            else if (step.op === 'composer.set') composer = value;
            else if (step.op === 'composer.clear') composer = '';
            else if (step.op === 'composer.append') { if (composer === null) throw new TypeError('Opening requires a declared Composer draft'); composer += value; } else if (step.op === 'composer.submit') {
                if (expectedSubmission || typeof composer !== 'string' || !composer.trim()) throw new TypeError('Opening requires one declared Composer submission');
                expectedSubmission = { text: composer.trim() };
            }
        }
        if (hashNativeDocument(expectedCommand) !== hashNativeDocument(action.confirmation ?? null)
            || hashNativeDocument(expectedSubmission) !== hashNativeDocument(action.submission ?? null)) throw new TypeError('Opening confirmation does not match pinned Action');
        if (expectedCommand) {
            Object.assign(base.states, await prepareTaskAuthority(base, installed, { command: { id: expectedCommand.commandId, args: expectedCommand.args } }));
            events.push({ type: 'opening.confirmed', commandId: expectedCommand.commandId });
        }
        state.opening.completed = true; state.opening.values = copy(ctx.ui);
        if (expectedSubmission) return { role: 'user', content: expectedSubmission.text };
    } else throw new TypeError('Unknown Opening operation');
}

export function projectApplication(base, domainId) {
    const def = lifecycleDefinition(base); const domain = def?.domains.find(item => item.id === domainId);
    if (!domain || base.states[NS].scopes[domain.scopeId].status !== 'active') return [];
    return copy(base.states[NS].domains[domainId].records);
}
