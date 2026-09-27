import { fields, json } from '../scripts/native/experience/ui/v2-values.js';
import { compileDataSchema } from '../scripts/native/experience/ui/message-templates.js';
import { compileDeclarativeLogic } from '../scripts/native/experience/logic/declarative.js';
import { assertTaskRuntime, assertTaskValue, taskId } from './native-task-contract.js';

export const LIFECYCLE_STATE_NAMESPACE = 'atri_lifecycle';

const MAX_BYTES = 1048576;
const NODE_KINDS = ['user_gate', 'opening', 'model_task', 'wait_until', 'action', 'automation_gate', 'projection', 'terminal'];

function integer(value, min, max = Number.MAX_SAFE_INTEGER) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError('Lifecycle integer out of bounds');
    return value;
}
function choice(value, allowed) {
    if (!allowed.includes(value)) throw new TypeError('Unknown lifecycle kind/policy');
    return value;
}
function list(value, limit, normalize, label) {
    if (!Array.isArray(value) || value.length > limit) throw new TypeError('Lifecycle ' + label + ' list limit');
    const result = value.map(normalize);
    if (new Set(result.map(item => item.id)).size !== result.length) throw new TypeError('Duplicate lifecycle ' + label + ' identifier');
    return result;
}
function reference(items, id, label) {
    taskId(id);
    const item = items.find(item => item.id === id);
    if (!item) throw new TypeError('Unknown lifecycle ' + label + ' reference: ' + id);
    return item;
}
function logicalBytes(value) {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
// json supplies the existing depth/node/string budgets and immutable copying.
// Reject non-JSON objects/hidden fields before it can erase their provenance.
function declaration(value) {
    function inspect(item, depth = 0, budget = { nodes: 0 }) {
        if (depth > 24 || ++budget.nodes > 32768) throw new TypeError('Lifecycle JSON complexity limit');
        if (!item || typeof item !== 'object') return;
        const array = Array.isArray(item);
        const proto = Object.getPrototypeOf(item);
        if (!array && proto !== null && Object.getPrototypeOf(proto) !== null) throw new TypeError('Lifecycle requires plain JSON objects');
        const keys = Reflect.ownKeys(item).filter(key => !(array && key === 'length'));
        if (array && keys.length !== item.length) throw new TypeError('Lifecycle requires dense JSON arrays');
        for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(item, key);
            if (typeof key !== 'string' || key.length > 256 || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
                || (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= item.length))) throw new TypeError('Lifecycle requires JSON fields');
            inspect(descriptor.value, depth + 1, budget);
        }
    }
    inspect(value);
    const result = json(value);
    if (logicalBytes(result) > MAX_BYTES) throw new TypeError('Lifecycle declaration byte limit');
    return result;
}
function objectSchema(value) {
    const schema = compileDataSchema(value);
    if (schema.type !== 'object') throw new TypeError('Lifecycle record/args schema must be a closed object');
    return schema;
}
function scope(item) {
    fields(item, ['id', 'kind', 'worldId', 'sceneId'], 'Lifecycle scope');
    taskId(item.id);
    choice(item.kind, ['session', 'world', 'scene']);
    if (item.worldId !== undefined && (typeof item.worldId !== 'string' || !/^world_[a-f0-9]{32}$/.test(item.worldId))) throw new TypeError('Lifecycle worldId must be an exact Native world');
    if (item.kind === 'world' && item.worldId === undefined) throw new TypeError('World scope requires worldId');
    if (item.kind === 'scene') taskId(item.sceneId);
    else if (item.sceneId !== undefined) throw new TypeError('Only scene scope accepts sceneId');
    if (item.kind === 'session' && item.worldId !== undefined) throw new TypeError('Session scope cannot select a world');
    return item;
}
function clockPoint(item, clocks, field) {
    fields(item, ['clockId', field], 'Lifecycle clock point');
    reference(clocks, item.clockId, 'clock');
    integer(item[field], field === 'ticks' ? 1 : 0);
    return item;
}
function retention(item, clocks) {
    fields(item, ['maxItems', 'maxLogicalBytes', 'terminalTtl', 'keepPinned', 'keepReferenced'], 'Lifecycle domain retention');
    integer(item.maxItems, 1, 4096);
    integer(item.maxLogicalBytes, 1, MAX_BYTES);
    if (item.keepPinned !== true || item.keepReferenced !== true) throw new TypeError('Lifecycle retention must preserve pinned/referenced records');
    if (item.terminalTtl !== undefined) clockPoint(item.terminalTtl, clocks, 'ticks');
    return item;
}
function assignmentSchema(schema, path) {
    let target = schema;
    for (const part of path.split('.')) {
        if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(part) || target.type !== 'object' || !Object.hasOwn(target.properties, part)) throw new TypeError('Lifecycle assignment must target declared record data');
        target = target.properties[part];
    }
    return target;
}
function hasFormula(value) {
    if (!value || typeof value !== 'object') return false;
    if (Object.hasOwn(value, 'formula') && Object.keys(value).length === 1) {
        if (typeof value.formula !== 'string' || value.formula.length > 2048 || (value.formula.match(/[(!+-]/g) || []).length > 64) throw new TypeError('Lifecycle formula complexity limit');
        return true;
    }
    // Visit every child even after finding a formula so every parser input is bounded.
    return Object.values(value).map(hasFormula).some(Boolean);
}
function domain(item, scopes, clocks) {
    fields(item, ['id', 'scopeId', 'schemaVersion', 'recordSchema', 'initial', 'commands', 'retention'], 'Lifecycle domain');
    taskId(item.id);
    reference(scopes, item.scopeId, 'scope');
    if (item.schemaVersion !== 1) throw new TypeError('Lifecycle domain schemaVersion must be 1');
    const recordSchema = objectSchema(item.recordSchema);
    const initial = assertTaskValue(item.initial, recordSchema);
    retention(item.retention, clocks);
    if (logicalBytes(initial) > item.retention.maxLogicalBytes) throw new TypeError('Lifecycle initial data exceeds retention bytes');
    const commands = list(item.commands, 64, command => {
        fields(command, ['id', 'argsSchema', 'event', 'assign', 'terminal'], 'Lifecycle command');
        taskId(command.id);
        if (typeof command.event !== 'string' || !/^[a-z][a-z0-9._-]{0,127}$/.test(command.event)
            || ['constructor', 'prototype', '__proto__'].includes(command.event)) throw new TypeError('Invalid lifecycle event');
        if (command.terminal !== undefined && typeof command.terminal !== 'boolean') throw new TypeError('Lifecycle terminal must be boolean');
        const argsSchema = objectSchema(command.argsSchema);
        fields(command.assign, Object.keys(command.assign ?? {}), 'Lifecycle assignments');
        const paths = Object.keys(command.assign);
        if (!paths.length || paths.length > 128) throw new TypeError('Lifecycle fixed assignment limit');
        for (const path of paths) {
            const schema = assignmentSchema(recordSchema, path);
            if (paths.some(other => other !== path && other.startsWith(path + '.'))) throw new TypeError('Overlapping lifecycle assignments');
            if (!hasFormula(command.assign[path])) assertTaskValue(command.assign[path], schema);
        }
        return { ...command, argsSchema };
    }, 'command');
    // Lower only author-declared data reducers, never record metadata or dynamic paths.
    compileDeclarativeLogic({ schemaVersion: 2, mutations: commands.map(({ terminal: _terminal, ...command }) => command) });
    return { ...item, recordSchema, initial, commands };
}
// Compiled schema object key order and required/enum ordering carry no meaning.
function schemaSignature(value) {
    if (Array.isArray(value)) return '[' + value.map(schemaSignature).sort().join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + schemaSignature(value[key])).join(',') + '}';
    return JSON.stringify(value);
}
function interaction(item, runtime, taskRuntime) {
    fields(item, ['id', 'scopeId', 'taskId', 'clockId', 'domainId', 'commandId', 'maxDelay'], 'Lifecycle interaction');
    taskId(item.id);
    reference(runtime.scopes, item.scopeId, 'scope');
    reference(runtime.clocks, item.clockId, 'clock');
    const domain = reference(runtime.domains, item.domainId, 'domain');
    const command = reference(domain.commands, item.commandId, 'command');
    if (item.scopeId !== domain.scopeId) throw new TypeError('Lifecycle interaction/domain scope mismatch');
    integer(item.maxDelay, 1);
    const task = reference(taskRuntime?.tasks ?? [], item.taskId, 'interaction Task');
    if (task.resultPolicy.resultClass !== 'advisory' || task.resultPolicy.sink !== 'proposal') throw new TypeError('Lifecycle interaction requires an advisory/proposal Task');
    for (const variant of task.variants) {
        const schema = variant.outputSchema;
        const keys = ['recordId', 'dueTick', 'args'];
        if (schema.type !== 'object' || schema.additionalProperties !== false
            || Object.keys(schema.properties).length !== keys.length || keys.some(key => !Object.hasOwn(schema.properties, key))
            || schema.required?.length !== keys.length || keys.some(key => !schema.required.includes(key))) throw new TypeError('Lifecycle interaction output requires exactly recordId/dueTick/args');
        const { recordId, dueTick, args } = schema.properties;
        // compileDataSchema already bounds strings and safe integers. Actual
        // record identity, WorldInstant, maxDelay and freshness are checked at acceptance.
        if (recordId.type !== 'string' || dueTick.type !== 'integer' || dueTick.minimum < 0
            || schemaSignature(args) !== schemaSignature(command.argsSchema)) throw new TypeError('Lifecycle interaction output must match its App Command');
    }
    return item;
}
function normalizeAction(item, runtime, taskRuntime) {
    switch (item?.kind) {
        case 'app.command': {
            fields(item, ['kind', 'domainId', 'recordId', 'commandId', 'args'], 'Lifecycle app action');
            const domain = reference(runtime.domains, item.domainId, 'domain');
            const command = reference(domain.commands, item.commandId, 'command');
            taskId(item.recordId);
            return { ...item, args: assertTaskValue(item.args, command.argsSchema) };
        }
        case 'world.command':
            fields(item, ['kind', 'commandId', 'args'], 'Lifecycle world action');
            taskId(item.commandId);
            fields(item.args, Object.keys(item.args ?? {}), 'Lifecycle world args');
            // Exact World command/schema resolution belongs to the pinned World runtime.
            return item;
        case 'workflow.transition': {
            fields(item, ['kind', 'workflowId', 'transitionId'], 'Lifecycle workflow action');
            const workflow = reference(runtime.workflows, item.workflowId, 'workflow');
            reference(workflow.transitions, item.transitionId, 'transition');
            return item;
        }
        case 'task': {
            fields(item, ['kind', 'taskId', 'variantId', 'input'], 'Lifecycle Task action');
            const task = reference(taskRuntime?.tasks ?? [], item.taskId, 'Task');
            reference(task.variants, item.variantId, 'Task Variant');
            if (!['artifact', 'proposal'].includes(task.resultPolicy.sink)) throw new TypeError('Lifecycle Task requires a durable P3 sink');
            return { ...item, input: assertTaskValue(item.input, task.inputSchema) };
        }
        default: throw new TypeError('Unknown lifecycle action kind');
    }
}
// For Host typed requests, after validating the immutable runtime declaration.
export function assertLifecycleAction(value, runtime, taskRuntime) {
    value = declaration(value);
    // Explicit Host acceptance only: package automations/workflow nodes cannot
    // consume a player's still-fresh P3 proposal by declaring this action.
    if (value?.kind === 'interaction.schedule') {
        fields(value, ['kind', 'interactionId', 'proposalId'], 'Lifecycle interaction acceptance');
        reference(runtime.interactions, value.interactionId, 'interaction');
        if (typeof value.proposalId !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(value.proposalId)) throw new TypeError('Invalid lifecycle proposal invocation');
        return value;
    }
    return json(normalizeAction(value, runtime, taskRuntime === undefined ? undefined : assertTaskRuntime(taskRuntime)));
}
function trigger(item, clocks) {
    fields(item, ['kind', 'clockId', 'at', 'every', 'catchUp'], 'Lifecycle trigger');
    choice(item.kind, ['experience.ready', 'world.schedule', 'logical.interval']);
    if (item.kind === 'experience.ready') {
        fields(item, ['kind'], 'Lifecycle ready trigger');
        return item;
    }
    if (item.kind === 'world.schedule') {
        reference(clocks, item.clockId, 'clock');
        if (item.at === undefined && item.every === undefined) throw new TypeError('Lifecycle schedule requires at/every');
        if (item.every !== undefined) integer(item.every, 1);
    } else {
        // Logical intervals use Session revision time, never a declared World clock.
        fields(item, ['kind', 'at', 'every', 'catchUp'], 'Lifecycle interval');
        integer(item.every, 1);
    }
    if (item.at !== undefined) integer(item.at, 0);
    return { ...item, catchUp: choice(item.catchUp ?? 'skip', ['all', 'latest', 'skip']) };
}
function workflow(item, scopes, clocks) {
    fields(item, ['id', 'scopeId', 'initial', 'nodes', 'transitions'], 'Lifecycle workflow');
    taskId(item.id);
    reference(scopes, item.scopeId, 'scope');
    const nodes = list(item.nodes, 64, node => {
        fields(node, ['id', 'kind', 'action', 'wait'], 'Lifecycle workflow node');
        taskId(node.id);
        choice(node.kind, NODE_KINDS);
        if (['action', 'model_task'].includes(node.kind)) {
            if (!node.action) throw new TypeError('Lifecycle action node requires action');
            if (node.kind === 'model_task' && node.action.kind !== 'task') throw new TypeError('Lifecycle model_task node requires Task action');
        } else if (node.action !== undefined) throw new TypeError('Lifecycle gate/projection cannot execute action');
        if (node.kind === 'wait_until') clockPoint(node.wait, clocks, 'tick');
        else if (node.wait !== undefined) throw new TypeError('Lifecycle wait only belongs to wait_until');
        return node;
    }, 'node');
    reference(nodes, item.initial, 'initial node');
    const transitions = list(item.transitions, 128, transition => {
        fields(transition, ['id', 'from', 'to'], 'Lifecycle transition');
        taskId(transition.id);
        const from = reference(nodes, transition.from, 'transition source');
        reference(nodes, transition.to, 'transition target');
        if (from.kind === 'terminal') throw new TypeError('Lifecycle terminal node cannot transition');
        return transition;
    }, 'transition');
    return { ...item, nodes, transitions };
}

export function assertLifecycleRuntime(value, taskRuntime) {
    value = declaration(value);
    fields(value, ['schemaVersion', 'scopes', 'domains', 'clocks', 'advances', 'automations', 'workflows', 'interactions', 'retention'], 'Lifecycle runtime');
    if (value.schemaVersion !== 1) throw new TypeError('Lifecycle schemaVersion must be 1');
    const tasks = taskRuntime === undefined ? undefined : assertTaskRuntime(taskRuntime);
    const scopes = list(value.scopes, 32, scope, 'scope');
    // These are declared logical units only. No Date/elapsed/wall-clock conversion.
    const clocks = list(value.clocks, 32, item => {
        fields(item, ['id', 'unit', 'initialTick'], 'Lifecycle clock');
        return { id: taskId(item.id), unit: taskId(item.unit), initialTick: integer(item.initialTick, 0) };
    }, 'clock');
    const domains = list(value.domains, 32, item => domain(item, scopes, clocks), 'domain');
    const advances = list(value.advances, 64, item => {
        fields(item, ['id', 'clockId', 'maxTicks'], 'Lifecycle advance');
        taskId(item.id);
        reference(clocks, item.clockId, 'clock');
        integer(item.maxTicks, 1);
        return item;
    }, 'advance');
    const workflows = list(value.workflows, 32, item => workflow(item, scopes, clocks), 'workflow');
    const runtime = { schemaVersion: 1, scopes, domains, clocks, advances, workflows };
    runtime.interactions = list(value.interactions === undefined ? [] : value.interactions, 128, item => interaction(item, runtime, tasks), 'interaction');
    // Resolve actions only after all domains/workflow graphs exist (forward refs allowed).
    runtime.workflows = workflows.map(item => ({ ...item, nodes: item.nodes.map(node => ({ ...node,
        ...(node.action === undefined ? {} : { action: normalizeAction(node.action, runtime, tasks) }),
    })) }));
    runtime.automations = list(value.automations, 128, item => {
        fields(item, ['id', 'scopeId', 'trigger', 'action', 'maxCatchUp'], 'Lifecycle automation');
        taskId(item.id);
        reference(scopes, item.scopeId, 'scope');
        integer(item.maxCatchUp, 1, 32);
        return { ...item, trigger: trigger(item.trigger, clocks), action: normalizeAction(item.action, runtime, tasks) };
    }, 'automation');
    fields(value.retention, ['maxTaskResults', 'maxReceipts'], 'Lifecycle retention');
    runtime.retention = { maxTaskResults: integer(value.retention.maxTaskResults, 1, 256), maxReceipts: integer(value.retention.maxReceipts, 1, 4096) };
    // maxReceipts is a fail-closed admission cap on exact replay history, NOT an
    // eviction window. Host checks exact replay first; new work at cap fails.
    // Task result/terminal compaction must never silently erase receipt dedup.
    return declaration(runtime);
}
