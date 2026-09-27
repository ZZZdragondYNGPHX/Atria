import { describe, expect, test } from '@jest/globals';
import { assertLifecycleAction, assertLifecycleRuntime, LIFECYCLE_STATE_NAMESPACE } from '../../public/shared/native-lifecycle-contract.js';
import { assertNativeExperienceContract, ATRIA_EXPERIENCE_CAPABILITIES } from '../../public/shared/native-experience-contract.js';
import { assertTaskRuntime, assertTaskValue } from '../../public/shared/native-task-contract.js';
import { compileDeclarativeLogic } from '../../public/scripts/native/experience/logic/declarative.js';
import { lifecycleFixture } from './helpers/lifecycle-fixture.js';

function validate({ lifecycleRuntime, taskRuntime }) {
    return assertLifecycleRuntime(lifecycleRuntime, taskRuntime);
}
function at(value, path) {
    return path.split('.').reduce((value, key) => value[key], value);
}
function set(value, path, next) {
    const parts = path.split('.');
    const key = parts.pop();
    const target = parts.length ? at(value, parts.join('.')) : value;
    target[key] = next;
}
function frozen(value) {
    return !value || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(frozen));
}
const empty = () => ({ schemaVersion: 1, scopes: [], domains: [], clocks: [], advances: [], automations: [], workflows: [], interactions: [], retention: { maxTaskResults: 1, maxReceipts: 1 } });
const taskAction = () => ({ kind: 'task', taskId: 'summarize', variantId: 'default', input: {} });
const worldAction = () => ({ kind: 'world.command', commandId: 'move', args: { direction: 'north' } });

describe('P4 shared lifecycle declarations', () => {
    test('exports namespace and a fresh reusable fixture; normalizes without mutating or aliasing input', () => {
        const fixture = lifecycleFixture();
        const before = JSON.stringify(fixture);
        const normalized = validate(fixture);
        expect(LIFECYCLE_STATE_NAMESPACE).toBe('atri_lifecycle');
        expect(frozen(normalized)).toBe(true);
        expect(JSON.stringify(fixture)).toBe(before);
        expect(validate({ ...fixture, lifecycleRuntime: normalized })).toEqual(normalized);
        fixture.lifecycleRuntime.domains[0].initial.text = 'changed';
        expect(normalized.domains[0].initial.text).toBe('');
        expect(lifecycleFixture().lifecycleRuntime.domains[0].initial.text).toBe('');
        expect(() => { normalized.domains[0].initial.text = 'changed'; }).toThrow();
    });
    test('keeps Experience lifecycle optional and normalizes Task runtime before resolving lifecycle Tasks', () => {
        const base = { schemaVersion: 1, capabilities: [], dataResources: [] };
        expect(assertNativeExperienceContract(base)).toEqual(base);
        const fixture = lifecycleFixture();
        const value = assertNativeExperienceContract({ ...base, ...fixture });
        expect(frozen(value)).toBe(true);
        expect(value.taskRuntime.tasks[0].queuePolicy).toBe('fifo');
        expect(value.lifecycleRuntime).toEqual(validate(fixture));
        expect(() => assertNativeExperienceContract({ ...base, lifecycleRuntime: fixture.lifecycleRuntime })).toThrow(/Task/);
        expect(assertLifecycleRuntime(empty())).toEqual(empty());
    });
    test('supports exactly the four P4 additions, retaining existing and reserved capabilities', () => {
        const supported = ['component-model', 'local-ui-state', 'player-preference-state', 'package-data', 'composer', 'action',
            'declarative-mutation', 'message-projection', 'turn-contract', 'turn-envelope', 'narrative-outcome', 'opening',
            'reply-variant', 'conversation-presentation', 'auxiliary-task', 'model-task',
            'session-application', 'temporal', 'runtime-automation', 'workflow'];
        expect(Object.entries(ATRIA_EXPERIENCE_CAPABILITIES).filter(([, value]) => value.supported.length).map(([id]) => id).sort()).toEqual(supported.sort());
        for (const id of ['session-application', 'temporal', 'runtime-automation', 'workflow']) expect(ATRIA_EXPERIENCE_CAPABILITIES[id].supported).toEqual([1]);
    });
    test.each([
        { id: 'world', kind: 'world', worldId: 'world_' + 'a'.repeat(32) },
        { id: 'scene', kind: 'scene', sceneId: 'stable.scene-1' },
        { id: 'scene', kind: 'scene', worldId: 'world_' + 'b'.repeat(32), sceneId: 'stable.scene-1' },
    ])('accepts exact scope %j', scope => {
        const fixture = lifecycleFixture();
        fixture.lifecycleRuntime.scopes.push(scope);
        expect(validate(fixture).scopes.at(-1)).toEqual(scope);
    });
    test.each([
        { id: 'other', kind: 'account' }, { id: 'other', kind: 'world' },
        { id: 'other', kind: 'world', worldId: 'world_named' },
        { id: 'other', kind: 'world', worldId: 'world_' + 'A'.repeat(32) },
        { id: 'other', kind: 'world', worldId: 'ses_' + 'a'.repeat(32) },
        { id: 'other', kind: 'session', worldId: 'world_' + 'a'.repeat(32) },
        { id: 'other', kind: 'session', sceneId: 'scene' },
        { id: 'other', kind: 'scene' }, { id: 'other', kind: 'scene', sceneId: 'unstable/scene' },
    ])('rejects invalid scope %j', scope => {
        const fixture = lifecycleFixture();
        fixture.lifecycleRuntime.scopes.push(scope);
        expect(() => validate(fixture)).toThrow();
    });
    test.each(['', 'scopes.0', 'domains.0', 'domains.0.commands.0', 'domains.0.retention', 'domains.0.retention.terminalTtl',
        'clocks.0', 'advances.0', 'automations.0', 'automations.0.trigger', 'automations.0.action',
        'workflows.0', 'workflows.0.nodes.0', 'workflows.0.nodes.3.wait', 'workflows.0.transitions.0', 'retention'])('rejects undeclared fields at %s', path => {
        const fixture = lifecycleFixture();
        const target = path ? at(fixture.lifecycleRuntime, path) : fixture.lifecycleRuntime;
        target.undeclared = true;
        expect(() => validate(fixture)).toThrow();
    });
    test.each(['schemaVersion', 'domains.0.schemaVersion'])('rejects unknown version at %s', path => {
        const fixture = lifecycleFixture();
        set(fixture.lifecycleRuntime, path, 2);
        expect(() => validate(fixture)).toThrow(/schemaVersion/);
    });
    test.each(['scopes', 'domains', 'clocks', 'advances', 'automations', 'workflows', 'retention'])('requires explicit %s', key => {
        const fixture = lifecycleFixture();
        delete fixture.lifecycleRuntime[key];
        expect(() => validate(fixture)).toThrow();
    });
    test.each(['scopes', 'domains', 'clocks', 'advances', 'automations', 'workflows', 'domains.0.commands', 'workflows.0.nodes', 'workflows.0.transitions'])('rejects duplicate identities in %s', path => {
        const fixture = lifecycleFixture();
        const items = at(fixture.lifecycleRuntime, path);
        items.push(items[0]);
        expect(() => validate(fixture)).toThrow(/Duplicate|collision/);
    });
    test.each(['domains.0.scopeId', 'domains.0.retention.terminalTtl.clockId', 'advances.0.clockId', 'automations.0.scopeId',
        'automations.0.action.domainId', 'automations.0.action.commandId', 'workflows.0.scopeId', 'workflows.0.initial',
        'workflows.0.nodes.3.wait.clockId', 'workflows.0.transitions.0.from', 'workflows.0.transitions.0.to',
        'workflows.0.nodes.2.action.taskId', 'workflows.0.nodes.2.action.variantId'])('rejects dangling reference %s', path => {
        const fixture = lifecycleFixture();
        set(fixture.lifecycleRuntime, path, 'missing');
        expect(() => validate(fixture)).toThrow(/reference/);
    });
    test.each(['constructor', 'prototype', '__proto__', 'Upper', 'not an id', 'x'.repeat(65)])('rejects unsafe/unstable identity %s', id => {
        const fixture = lifecycleFixture();
        fixture.lifecycleRuntime.scopes[0].id = id;
        expect(() => validate(fixture)).toThrow();
    });
    test.each(['__proto__', 'prototype', 'constructor'])('rejects unsafe nested JSON key %s', key => {
        const fixture = lifecycleFixture();
        fixture.lifecycleRuntime.domains[0].initial = JSON.parse('{"text":"", "' + key + '":{}}');
        expect(() => validate(fixture)).toThrow(/Blocked/);
    });
    test.each([new Date(), Object.create({ inherited: 1 }), { fn() {} }, { value: undefined }, { value: Infinity }, { value: 1n }, new Array(2)])('rejects non-JSON declaration %p', value => {
        expect(() => assertLifecycleRuntime(value)).toThrow();
    });
    test('rejects accessors, symbols, hidden fields, custom array properties and recursive graphs before copying', () => {
        const values = [Object.defineProperty({}, 'x', { get() { throw new Error('getter executed'); }, enumerable: true }),
            { [Symbol('hidden')]: 1 }, Object.defineProperty({}, 'hidden', { value: 1 }), Object.assign([], { extra: 1 })];
        const cycle = {}; cycle.self = cycle; values.push(cycle);
        for (const value of values) expect(() => assertLifecycleRuntime(value)).toThrow(/Lifecycle/);
    });
});

describe('P4 bounded schemas and fixed data reducers', () => {
    test('lowers fixed assign through existing Command/Event/Reducer; record metadata is not an assignment root', () => {
        const domain = validate(lifecycleFixture()).domains[0];
        const logic = compileDeclarativeLogic({ schemaVersion: 2, mutations: domain.commands.map(({ terminal: _terminal, ...command }) => command) });
        const args = assertTaskValue({ text: 'saved' }, domain.commands[0].argsSchema);
        const events = logic.commands[0].execute({ world: domain.initial, args });
        expect(events).toEqual([{ type: 'notes.saved', payload: { text: 'saved' } }]);
        expect(assertTaskValue(logic.reducers[0].reduce(domain.initial, events[0]), domain.recordSchema)).toEqual({ text: 'saved' });
        expect(domain.initial).toEqual({ text: '' });
        expect(domain.commands[1].terminal).toBe(true);
    });
    test.each([
        ['domains.0.recordSchema.additionalProperties', true], ['domains.0.recordSchema.properties.text.pattern', '.*'],
        ['domains.0.recordSchema.properties.text.maxLength', 65537], ['domains.0.recordSchema', { type: 'integer' }],
        ['domains.0.initial', { text: 1 }], ['domains.0.initial', { text: '', pinned: true }],
        ['domains.0.commands.0.argsSchema.additionalProperties', true], ['domains.0.commands.0.argsSchema.required', ['missing']],
        ['domains.0.commands.0.terminal', 'yes'], ['domains.0.commands.0.event', 'constructor'],
        ['domains.0.commands.0.assign', {}], ['domains.0.commands.0.assign', { 'metadata.pinned': true }],
        ['domains.0.commands.0.assign', { 'text.__proto__': 1 }], ['domains.0.commands.0.assign', { 'args.path': 1 }],
        ['domains.0.commands.0.assign', { text: 123 }], ['domains.0.commands.0.assign', { text: { formula: 'args.' } }],
        ['domains.0.commands.0.assign', { text: { formula: 'window.secret' } }],
        ['domains.0.commands.0.assign', { text: { formula: 'rng.int(1, 6)' } }],
        ['domains.0.commands.0.assign', { text: { formula: '('.repeat(65) + 'args.text' + ')'.repeat(65) } }],
        ['domains.0.retention.keepPinned', false], ['domains.0.retention.keepReferenced', false],
        ['domains.0.retention.maxLogicalBytes', 1],
    ])('rejects invalid schema/data/reducer at %s: %j', (path, value) => {
        const fixture = lifecycleFixture(); set(fixture.lifecycleRuntime, path, value);
        expect(() => validate(fixture)).toThrow();
    });
    test('rejects event collisions and overlapping assign paths', () => {
        const fixture = lifecycleFixture();
        fixture.lifecycleRuntime.domains[0].commands[1].event = 'notes.saved';
        expect(() => validate(fixture)).toThrow(/collision/);
        const domain = lifecycleFixture().lifecycleRuntime.domains[0];
        domain.recordSchema.properties.nested = { type: 'object', properties: { flag: { type: 'boolean' } }, additionalProperties: false };
        domain.commands[0].assign = { nested: { flag: true }, 'nested.flag': false };
        fixture.lifecycleRuntime.domains[0] = domain;
        expect(() => validate(fixture)).toThrow(/Overlapping/);
    });
    test.each([
        ['retention.maxTaskResults', 1, 256], ['retention.maxReceipts', 1, 4096], ['domains.0.retention.maxItems', 1, 4096],
        ['domains.0.retention.maxLogicalBytes', 11, 1048576], ['automations.0.maxCatchUp', 1, 32],
        ['clocks.0.initialTick', 0, Number.MAX_SAFE_INTEGER], ['advances.0.maxTicks', 1, Number.MAX_SAFE_INTEGER],
        ['domains.0.retention.terminalTtl.ticks', 1, Number.MAX_SAFE_INTEGER], ['workflows.0.nodes.3.wait.tick', 0, Number.MAX_SAFE_INTEGER],
    ])('enforces exact integer budget %s', (path, min, max) => {
        for (const valid of [min, max]) {
            const fixture = lifecycleFixture(); set(fixture.lifecycleRuntime, path, valid);
            expect(at(validate(fixture), path)).toBe(valid);
        }
        for (const invalid of [0.5, min - 1, max + 1, '1', null, NaN]) {
            const fixture = lifecycleFixture(); set(fixture.lifecycleRuntime, path, invalid);
            expect(() => validate(fixture)).toThrow();
        }
    });
    test.each([['scopes', 32], ['domains', 32], ['clocks', 32], ['advances', 64], ['automations', 128], ['workflows', 32],
        ['domains.0.commands', 64], ['workflows.0.nodes', 64], ['workflows.0.transitions', 128]])('bounds declaration list %s at %i', (path, max) => {
        const fixture = lifecycleFixture();
        const items = at(fixture.lifecycleRuntime, path);
        const seed = items[0];
        while (items.length < max) items.push({ ...seed, id: 'extra-' + items.length, ...(path.endsWith('commands') ? { event: 'event-' + items.length } : {}) });
        expect(at(validate(fixture), path)).toHaveLength(max);
        items.push({ ...seed, id: 'overflow' });
        expect(() => validate(fixture)).toThrow(/limit/);
    });
    test('enforces total logical bytes, depth and JSON node budgets', () => {
        const fixture = lifecycleFixture();
        fixture.lifecycleRuntime.automations[0].action = worldAction();
        fixture.lifecycleRuntime.automations[0].action.args = Object.fromEntries(Array.from({ length: 20 }, (_, i) => ['x' + i, '文'.repeat(30000)]));
        expect(() => validate(fixture)).toThrow(/byte limit/);
        let nested = {}; for (let i = 0; i < 25; i++) nested = { child: nested };
        expect(() => assertLifecycleRuntime(nested)).toThrow(/complexity/);
        expect(() => assertLifecycleRuntime(Array.from({ length: 32769 }, () => null))).toThrow(/complexity/);
    });
    test('applies the byte cap after schema default normalization as well as before it', () => {
        const fixture = lifecycleFixture();
        fixture.lifecycleRuntime.domains[0].recordSchema.properties.count = { type: 'integer' };
        const action = worldAction();
        fixture.lifecycleRuntime.automations[0].action = action;
        action.args = Object.fromEntries(Array.from({ length: 16 }, (_, i) => ['x' + i, 'x'.repeat(65000)]));
        action.args.padding = '';
        const remaining = 1048576 - new TextEncoder().encode(JSON.stringify(fixture.lifecycleRuntime)).byteLength;
        action.args.padding = 'x'.repeat(remaining);
        expect(new TextEncoder().encode(JSON.stringify(fixture.lifecycleRuntime)).byteLength).toBe(1048576);
        expect(() => validate(fixture)).toThrow(/byte limit/);
    });
    test('retention exposes no receipt TTL/eviction switch or metadata override', () => {
        for (const field of ['receiptTtl', 'evictOldest', 'dedupWindow', 'keepReceipts', 'onOverflow']) {
            const fixture = lifecycleFixture(); fixture.lifecycleRuntime.retention[field] = 'drop';
            expect(() => validate(fixture)).toThrow();
        }
        const fixture = lifecycleFixture(); fixture.lifecycleRuntime.domains[0].metadata = { pinned: false };
        expect(() => validate(fixture)).toThrow();
    });
});

describe('P4 typed temporal, automation and workflow actions', () => {
    test.each(['all', 'latest', 'skip'])('normalizes declared catch-up policy %s with no clock conversion', catchUp => {
        const fixture = lifecycleFixture();
        fixture.lifecycleRuntime.automations[0].trigger = { kind: 'world.schedule', clockId: 'world', at: 0, catchUp };
        expect(validate(fixture).automations[0].trigger.catchUp).toBe(catchUp);
        fixture.lifecycleRuntime.automations[0].trigger = { kind: 'logical.interval', every: 2, catchUp };
        expect(validate(fixture).automations[0].trigger.every).toBe(2);
        delete fixture.lifecycleRuntime.automations[0].trigger.catchUp;
        expect(validate(fixture).automations[0].trigger.catchUp).toBe('skip');
        expect(fixture.lifecycleRuntime.clocks[0].initialTick).toBe(0);
    });
    test('supports periodic World schedules and offset logical intervals without a second clock domain', () => {
        const fixture = lifecycleFixture();
        for (const trigger of [
            { kind: 'world.schedule', clockId: 'world', at: 3, every: 2 },
            { kind: 'world.schedule', clockId: 'world', every: 2 },
            { kind: 'logical.interval', at: 0, every: 1 },
        ]) {
            fixture.lifecycleRuntime.automations[0].trigger = trigger;
            expect(validate(fixture).automations[0].trigger).toEqual({ ...trigger, catchUp: 'skip' });
        }
    });
    test.each([
        { kind: 'logical.interval', clockId: 'world', every: 1 },
        { kind: 'world.schedule', clockId: 'world', at: 0, every: 0 },
        { kind: 'logical.interval', every: 1, at: -1 },
        { kind: 'session.loaded' }, { kind: 'wall.interval', every: 1 }, { kind: 'experience.ready', clockId: 'world' },
        { kind: 'experience.ready', catchUp: 'all' }, { kind: 'world.schedule', clockId: 'world' },
        { kind: 'world.schedule', clockId: 'missing', at: 0 }, { kind: 'world.schedule', clockId: 'world', at: -1 },
        { kind: 'world.schedule', clockId: 'world', at: 0.5 }, { kind: 'world.schedule', clockId: 'world', at: 0, catchUp: 'unbounded' },
        { kind: 'logical.interval', every: 0 }, { kind: 'logical.interval', every: 1.5 },
        { kind: 'logical.interval', every: 1, wallTime: 100 },
    ])('rejects invalid temporal trigger %j', trigger => {
        const fixture = lifecycleFixture(); fixture.lifecycleRuntime.automations[0].trigger = trigger;
        expect(() => validate(fixture)).toThrow();
    });
    test('accepts all four action kinds, forward workflow references and stable dynamic record IDs', () => {
        const fixture = lifecycleFixture();
        const runtime = validate(fixture);
        const actions = [fixture.lifecycleRuntime.automations[0].action, worldAction(), taskAction(),
            { kind: 'workflow.transition', workflowId: 'onboarding', transitionId: 'begin' }];
        for (const action of actions) {
            fixture.lifecycleRuntime.automations[0].action = action;
            expect(validate(fixture).automations[0].action).toEqual(action);
            expect(assertLifecycleAction(action, runtime, assertTaskRuntime(fixture.taskRuntime))).toEqual(action);
        }
        fixture.lifecycleRuntime.workflows[0].nodes[1].action = actions[3];
        expect(validate(fixture).workflows[0].nodes[1].action).toEqual(actions[3]);
    });
    test.each([
        { kind: 'patch', data: {} }, { kind: 'task', taskId: 'summarize', variantId: 'missing', input: {} },
        { kind: 'task', taskId: 'summarize', variantId: 'default', input: { patch: {} } },
        { kind: 'task', taskId: 'summarize', variantId: 'default', input: {}, sink: 'world' },
        { kind: 'world.command', commandId: 'move', args: [], patch: {} }, { kind: 'world.command', commandId: 'move' },
        { kind: 'workflow.transition', workflowId: 'missing', transitionId: 'begin' },
        { kind: 'workflow.transition', workflowId: 'onboarding', transitionId: 'missing' },
        { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: 1 } },
        { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: '__proto__', args: { text: '' } },
        { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: '', pinned: true } },
    ])('rejects invalid typed action %j', action => {
        const fixture = lifecycleFixture(); fixture.lifecycleRuntime.automations[0].action = action;
        expect(() => validate(fixture)).toThrow();
    });
    test('Task actions require a declared Task/Variant and durable P3 artifact or proposal sink', () => {
        const fixture = lifecycleFixture();
        expect(() => assertLifecycleRuntime(fixture.lifecycleRuntime)).toThrow(/Task/);
        fixture.taskRuntime.tasks[0].resultPolicy = { resultClass: 'advisory', sink: 'proposal' };
        expect(validate(fixture).workflows[0].nodes[2].action).toEqual(taskAction());
        fixture.taskRuntime.tasks[0].resultPolicy = { resultClass: 'turn_context', sink: 'turn' };
        expect(() => validate(fixture)).toThrow(/durable P3 sink/);
    });
    test.each(['opening', 'automation_gate', 'projection'])('accepts inert %s workflow nodes', kind => {
        const fixture = lifecycleFixture(); fixture.lifecycleRuntime.workflows[0].nodes[0].kind = kind;
        expect(validate(fixture).workflows[0].nodes[0].kind).toBe(kind);
    });
    test.each([
        ['workflows.0.nodes.0.kind', 'script'], ['workflows.0.nodes.0.action', worldAction()],
        ['workflows.0.nodes.0.wait', { clockId: 'world', tick: 1 }], ['workflows.0.nodes.1.action', null],
        ['workflows.0.nodes.2.action', worldAction()], ['workflows.0.nodes.3.wait', null],
        ['workflows.0.transitions.0.from', 'done'], ['clocks.0.wallTime', 1000], ['advances.0.elapsedMs', 1000],
    ])('rejects invalid workflow/clock semantics at %s', (path, value) => {
        const fixture = lifecycleFixture(); set(fixture.lifecycleRuntime, path, value);
        expect(() => validate(fixture)).toThrow();
    });
});

function interactionFixture() {
    const fixture = lifecycleFixture();
    const task = fixture.taskRuntime.tasks[0];
    task.resultPolicy = { resultClass: 'advisory', sink: 'proposal' };
    task.variants[0].outputSchema = {
        type: 'object', additionalProperties: false, required: ['recordId', 'dueTick', 'args'],
        properties: {
            recordId: { type: 'string', maxLength: 64 },
            dueTick: { type: 'integer', minimum: 0 },
            args: structuredClone(fixture.lifecycleRuntime.domains[0].commands[0].argsSchema),
        },
    };
    fixture.lifecycleRuntime.interactions = [{ id: 'reply-later', scopeId: 'session', taskId: 'summarize',
        clockId: 'world', domainId: 'notes', commandId: 'save', maxDelay: 8 }];
    return fixture;
}

describe('P4 Scheduled Interaction proposal declarations', () => {
    test('always returns a fresh deeply frozen interactions list, including omitted declarations', () => {
        const fixture = lifecycleFixture();
        expect(fixture.lifecycleRuntime.interactions).toEqual([]);
        delete fixture.lifecycleRuntime.interactions;
        const normalized = validate(fixture);
        expect(normalized.interactions).toEqual([]);
        expect(Object.isFrozen(normalized.interactions)).toBe(true);
        const declared = interactionFixture();
        const result = validate(declared);
        expect(result.interactions).toEqual(declared.lifecycleRuntime.interactions);
        expect(frozen(result.interactions)).toBe(true);
        expect(validate({ ...declared, lifecycleRuntime: result })).toEqual(result);
        declared.lifecycleRuntime.interactions[0].maxDelay = 2;
        expect(result.interactions[0].maxDelay).toBe(8);
        expect(assertNativeExperienceContract({ schemaVersion: 1, capabilities: [], dataResources: [], ...declared }).lifecycleRuntime.interactions[0].maxDelay).toBe(2);
    });
    test.each(['id', 'scopeId', 'taskId', 'clockId', 'domainId', 'commandId', 'maxDelay'])('requires interaction field %s', key => {
        const fixture = interactionFixture(); delete fixture.lifecycleRuntime.interactions[0][key];
        expect(() => validate(fixture)).toThrow();
    });
    test.each(['scopeId', 'taskId', 'clockId', 'domainId', 'commandId'])('rejects unknown interaction reference %s', key => {
        const fixture = interactionFixture(); fixture.lifecycleRuntime.interactions[0][key] = 'missing';
        expect(() => validate(fixture)).toThrow(/reference/);
    });
    test('requires matching domain scope and a command from that domain', () => {
        const fixture = interactionFixture();
        fixture.lifecycleRuntime.scopes.push({ id: 'elsewhere', kind: 'session' });
        fixture.lifecycleRuntime.interactions[0].scopeId = 'elsewhere';
        expect(() => validate(fixture)).toThrow(/scope mismatch/);
        fixture.lifecycleRuntime.interactions[0].scopeId = 'session';
        fixture.lifecycleRuntime.domains.push({ ...fixture.lifecycleRuntime.domains[0], id: 'other', commands: [] });
        fixture.lifecycleRuntime.interactions[0].domainId = 'other';
        expect(() => validate(fixture)).toThrow(/command reference/);
    });
    test.each([null, {}, [null]])('rejects malformed interactions %j rather than silently defaulting', interactions => {
        const fixture = lifecycleFixture(); fixture.lifecycleRuntime.interactions = interactions;
        expect(() => validate(fixture)).toThrow();
    });
    test.each(['variantId', 'outputSchema', 'patch', 'wallDelay', 'dueTick', 'proposalId'])('rejects undeclared mapping override %s', key => {
        const fixture = interactionFixture(); fixture.lifecycleRuntime.interactions[0][key] = 'override';
        expect(() => validate(fixture)).toThrow();
    });
    test('bounds mapping IDs, duplicates and list cardinality', () => {
        const fixture = interactionFixture();
        fixture.lifecycleRuntime.interactions.push(fixture.lifecycleRuntime.interactions[0]);
        expect(() => validate(fixture)).toThrow(/Duplicate/);
        fixture.lifecycleRuntime.interactions.pop();
        fixture.lifecycleRuntime.interactions[0].id = 'constructor';
        expect(() => validate(fixture)).toThrow();
        fixture.lifecycleRuntime.interactions = Array.from({ length: 128 }, (_, i) => ({ ...interactionFixture().lifecycleRuntime.interactions[0], id: 'interaction-' + i }));
        expect(validate(fixture).interactions).toHaveLength(128);
        fixture.lifecycleRuntime.interactions.push({ ...fixture.lifecycleRuntime.interactions[0], id: 'overflow' });
        expect(() => validate(fixture)).toThrow(/limit/);
    });
    test.each([0, -1, 0.5, '1', null, Number.MAX_SAFE_INTEGER + 1])('rejects invalid maxDelay %j', maxDelay => {
        const fixture = interactionFixture(); fixture.lifecycleRuntime.interactions[0].maxDelay = maxDelay;
        expect(() => validate(fixture)).toThrow();
    });
    test.each([1, Number.MAX_SAFE_INTEGER])('accepts positive safe maxDelay %i', maxDelay => {
        const fixture = interactionFixture(); fixture.lifecycleRuntime.interactions[0].maxDelay = maxDelay;
        expect(validate(fixture).interactions[0].maxDelay).toBe(maxDelay);
    });
    test('requires a Task runtime and applies the advisory/proposal ceiling, not merely a durable sink', () => {
        const fixture = interactionFixture();
        expect(() => assertLifecycleRuntime(fixture.lifecycleRuntime)).toThrow(/Task/);
        for (const resultPolicy of [{ resultClass: 'presentation', sink: 'artifact' }, { resultClass: 'turn_context', sink: 'turn' }]) {
            fixture.taskRuntime.tasks[0].resultPolicy = resultPolicy;
            expect(() => validate(fixture)).toThrow(/advisory\/proposal/);
        }
        fixture.taskRuntime.tasks[0].resultPolicy = { resultClass: 'world_outcome_proposal', sink: 'proposal' };
        fixture.taskRuntime.tasks[0].interpretation = { id: 'outcome', instruction: 'Semantic only', allowedEventTypes: ['healed'], confidenceThreshold: 0.7 };
        expect(assertTaskRuntime(fixture.taskRuntime).tasks[0].resultPolicy.sink).toBe('proposal');
        expect(() => validate(fixture)).toThrow(/advisory\/proposal/);
    });
    test.each([
        ['type', 'array'], ['additionalProperties', true], ['required', ['recordId', 'dueTick']],
        ['properties.recordId', { type: 'integer' }], ['properties.recordId', { type: 'string' }],
        ['properties.dueTick', { type: 'number', minimum: 0 }], ['properties.dueTick', { type: 'integer' }],
        ['properties.dueTick.minimum', -1], ['properties.extra', { type: 'boolean' }],
        ['properties.args.properties.text.type', 'boolean'], ['properties.args.properties.text.maxLength', 128],
        ['properties.args.required', []], ['properties.args.additionalProperties', true],
    ])('rejects source Variant output mismatch %s: %j', (path, value) => {
        const fixture = interactionFixture(); set(fixture.taskRuntime.tasks[0].variants[0].outputSchema, path, value);
        expect(() => validate(fixture)).toThrow();
    });
    test.each(['recordId', 'dueTick', 'args'])('requires the output property %s even if removed from required', key => {
        const fixture = interactionFixture();
        const schema = fixture.taskRuntime.tasks[0].variants[0].outputSchema;
        delete schema.properties[key]; schema.required = schema.required.filter(item => item !== key);
        expect(() => validate(fixture)).toThrow();
    });
    test('validates every Variant and compares normalized App args schema independently of key/set ordering', () => {
        const fixture = interactionFixture();
        const variants = fixture.taskRuntime.tasks[0].variants;
        variants.push(structuredClone({ ...variants[0], id: 'compact' }));
        const source = variants[1].outputSchema;
        source.required.reverse();
        source.properties.args = Object.fromEntries(Object.entries(source.properties.args).reverse());
        expect(validate(fixture).interactions).toHaveLength(1);
        source.properties.dueTick.minimum = -1;
        expect(() => validate(fixture)).toThrow(/output/);
    });
    test('output schemas remain P3 data contracts; Host acceptance owns actual identity, freshness and delay checks', () => {
        const fixture = interactionFixture();
        const output = assertTaskRuntime(fixture.taskRuntime).tasks[0].variants[0].outputSchema;
        expect(assertTaskValue({ recordId: 'reply', dueTick: 5, args: { text: 'Later' } }, output)).toEqual({ recordId: 'reply', dueTick: 5, args: { text: 'Later' } });
        expect(() => assertTaskValue({ recordId: 'reply', dueTick: -1, args: { text: 'Later' } }, output)).toThrow();
        expect(() => assertTaskValue({ recordId: 'reply', dueTick: 5, args: { text: 'Later' }, patch: {} }, output)).toThrow();
    });
    test('validates explicit Host proposal acceptance but excludes it from package automation/workflow actions', () => {
        const fixture = interactionFixture();
        const runtime = validate(fixture);
        const action = { kind: 'interaction.schedule', interactionId: 'reply-later', proposalId: 'Task:proposal-1' };
        expect(assertLifecycleAction(action, runtime)).toEqual(action);
        expect(Object.isFrozen(assertLifecycleAction(action, runtime))).toBe(true);
        expect(() => assertLifecycleAction({ ...action, interactionId: 'missing' }, runtime)).toThrow(/reference/);
        expect(() => assertLifecycleAction({ ...action, proposalId: '' }, runtime)).toThrow();
        expect(() => assertLifecycleAction({ ...action, proposalId: 'x'.repeat(129) }, runtime)).toThrow();
        expect(() => assertLifecycleAction({ ...action, dueTick: 3 }, runtime)).toThrow();
        fixture.lifecycleRuntime.automations[0].action = action;
        expect(() => validate(fixture)).toThrow(/action kind/);
        fixture.lifecycleRuntime.automations = [];
        fixture.lifecycleRuntime.workflows[0].nodes[1].action = action;
        expect(() => validate(fixture)).toThrow(/action kind/);
    });
});
