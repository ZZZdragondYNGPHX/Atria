import { jest } from '@jest/globals';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { sessionFixture, services } from './helpers/session-fixture.js';
import { lifecycleFixture } from './helpers/lifecycle-fixture.js';

const emptySchema = { type: 'object', properties: {}, required: [], additionalProperties: false };
const lifecycle = snapshot => snapshot.states.atri_lifecycle;
const durable = snapshot => ({ revision: snapshot.revision, states: snapshot.states, timeline: snapshot.timeline });
const app = (recordId, text = 'saved') => ({ kind: 'app.command', domainId: 'notes', recordId, commandId: 'save', args: { text } });
const finish = recordId => ({ kind: 'app.command', domainId: 'notes', recordId, commandId: 'finish', args: {} });
const advance = ticks => ({ kind: 'clock.advance', commandId: 'advance', ticks });
const transition = transitionId => ({ kind: 'workflow.transition', workflowId: 'onboarding', transitionId });
const taskAction = { kind: 'task', taskId: 'summarize', variantId: 'default', input: {} };
const taskRecord = (invocationId, extra = {}) => ({ invocationId, taskId: 'summarize', variantId: 'default',
    payload: { text: 'durable result' }, fingerprint: `fingerprint:${invocationId}`, ...extra });

function isolated({ lifecycleRuntime }) {
    lifecycleRuntime.automations = [];
    lifecycleRuntime.workflows = [];
}

function scheduledInteractions(value) {
    isolated(value);
    const task = value.taskRuntime.tasks[0];
    task.resultPolicy = { resultClass: 'advisory', sink: 'proposal' };
    task.variants[0].outputSchema = { type: 'object', additionalProperties: false, required: ['recordId', 'dueTick', 'args'],
        properties: { recordId: { type: 'string', maxLength: 128 }, dueTick: { type: 'integer', minimum: 0, maximum: 64 },
            args: structuredClone(value.lifecycleRuntime.domains[0].commands[0].argsSchema) } };
    value.lifecycleRuntime.interactions = [{ id: 'reminder', scopeId: 'session', taskId: task.id,
        clockId: 'world', domainId: 'notes', commandId: 'save', maxDelay: 5 }];
}
const interactionPayload = (dueTick = 3) => ({ recordId: 'reminder-note', dueTick, args: { text: 'delivered via App command' } });
const schedule = proposalId => ({ kind: 'interaction.schedule', interactionId: 'reminder', proposalId });

// Use the same Package installation and real repositories as P3. No provider,
// scheduler timing, network, or generated model output is needed for finalization.
describe.each(CONTRACT_HARNESSES)('P4 Session lifecycle - $name', ({ make }) => {
    let h, f, base, serial;
    beforeEach(async () => { h = await make(); serial = 0; });
    afterEach(async () => { jest.restoreAllMocks(); await h?.cleanup(); });

    async function open(configure = () => {}) {
        f = { ...sessionFixture(), ...services(h) };
        const declarations = lifecycleFixture();
        configure(declarations, f);
        const variant = declarations.taskRuntime.tasks[0].variants[0];
        f.manifest.resources = [
            { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId,
                revision: variant.prompt.revision, displayName: 'Lifecycle task', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
            { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId,
                revision: variant.generation.revision, displayName: 'Lifecycle task', output: { maxTokens: 128 } } },
        ].map(item => ({ ...item, origin: { scope: 'package', packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId } }));
        f.manifest.runtime = { game: { logic: 'logic.json' },
            experienceContract: { schemaVersion: 1, capabilities: [], dataResources: [], ...declarations } };
        const logic = { schemaVersion: 2, mutations: [
            { id: 'heal', event: 'healed', argsSchema: emptySchema, assign: { hp: { formula: 'world.hp + 1' } } },
        ] };
        const { archive } = buildAtriaPackageContainer({ manifest: f.manifest,
            sourceFiles: new Map([['logic.json', Buffer.from(JSON.stringify(logic))]]), assetPayloads: new Map() });
        await f.packageInstaller.install(h.handle, archive);
        base = await f.core.create(h.handle, { packageId: f.manifest.packageId,
            packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
        return base;
    }

    const read = () => f.core.load(h.handle, base.session.sessionId);
    const apply = (snapshot, action, invocationId = `lifecycle-${++serial}`) => f.core.applyLifecycleCommand(
        h.handle, base.session.sessionId, { type: 'lifecycle', invocationId, action }, { expectedRevisionId: snapshot.revision.revisionId });
    const finalize = (snapshot, record) => f.core.recordTaskResult(h.handle, base.session.sessionId, record,
        { expectedRevisionId: snapshot.revision.revisionId });
    const records = snapshot => lifecycle(snapshot).domains.notes.records;
    const hp = snapshot => snapshot.states.atri_world_state.worlds[f.worldId].state.hp;

    test('creates versioned protected state; startup waits for Ready and exact replay stays once-only', async () => {
        await open();
        expect(lifecycle(base)).toMatchObject({ schemaVersion: 1, logicalTime: expect.any(Number), clocks: { world: 0 },
            scopes: { session: { status: 'active', epoch: 0 } }, domains: { notes: { records: [] } },
            workflows: { onboarding: { phase: 'start', instance: 0, status: 'active' } },
            automations: {}, outbox: [], receipts: [], taskTombstones: [] });
        await expect(apply(base, { kind: 'pump' })).rejects.toThrow(/Ready/i);
        await expect(read()).resolves.toMatchObject(durable(base));
        const ready = await apply(base, { kind: 'experience.ready' }, 'ready');
        expect(records(ready)).toEqual([expect.objectContaining({ id: 'main', value: { text: 'ready' }, status: 'active' })]);
        expect(lifecycle(ready).automations['on-ready']).toMatchObject({ cursor: 0 });
        expect(lifecycle(ready).receipts).toEqual([expect.objectContaining({ invocationId: 'ready', kind: 'authority',
            baseRevisionId: base.revision.revisionId, committedRevisionId: ready.revision.revisionId })]);
        await expect(apply(base, { kind: 'experience.ready' }, 'ready')).resolves.toMatchObject(durable(ready));
        const again = await apply(ready, { kind: 'experience.ready' }, 'ready-again');
        expect(records(again)).toEqual(records(ready));
        expect(lifecycle(again).workflows.onboarding.phase).toBe('start');
    });

    test('CAS rejects new stale work; identical replay reads current HEAD without applying twice', async () => {
        await open(isolated);
        const first = await apply(base, app('one'), 'once');
        const current = await apply(first, app('two'), 'second');
        await expect(apply(base, app('three'), 'stale')).rejects.toMatchObject({ code: 'native_session_head_conflict' });
        await expect(apply(base, app('one'), 'once')).resolves.toMatchObject(durable(current));
        await expect(apply(current, app('one', 'changed'), 'once')).rejects.toThrow(/invocation conflict/i);
        await expect(read()).resolves.toMatchObject(durable(current));
        expect(lifecycle(current).receipts.map(item => item.invocationId)).toEqual(['once', 'second']);
        expect(lifecycle(current).logicalTime).toBe(lifecycle(base).logicalTime + 2);
    });

    test('two writers at one revision publish exactly one complete record and receipt', async () => {
        await open(isolated);
        const results = await Promise.allSettled([apply(base, app('left'), 'left'), apply(base, app('right'), 'right')]);
        const winners = results.filter(result => result.status === 'fulfilled');
        const losers = results.filter(result => result.status === 'rejected');
        expect(winners).toHaveLength(1);
        expect(losers).toHaveLength(1);
        expect(losers[0].reason).toMatchObject({ code: 'native_session_head_conflict' });
        const current = await read();
        expect(current.revision).toEqual(winners[0].value.revision);
        expect(records(current)).toHaveLength(1);
        expect(lifecycle(current).receipts).toHaveLength(1);
        expect(lifecycle(current).receipts[0].invocationId).toBe(records(current)[0].id);
    });

    test.each([
        ['unknown action', { kind: 'state.patch', patch: { atri_world_state: {} } }],
        ['unknown domain', { ...app('one'), domainId: 'missing' }],
        ['unknown command', { ...app('one'), commandId: 'missing' }],
        ['unknown command field', { ...app('one'), assign: { text: 'bypass' } }],
        ['wrong argument type', { ...app('one'), args: { text: 42 } }],
        ['unknown argument', { ...app('one'), args: { text: 'ok', pinned: true } }],
        ['unsafe record identifier', app('__proto__')],
        ['undeclared World advance', { ...advance(1), commandId: 'missing' }],
    ])('rejects %s without publishing state or a receipt', async (_label, action) => {
        await open(isolated);
        await expect(apply(base, action)).rejects.toThrow();
        await expect(read()).resolves.toMatchObject(durable(base));
    });

    test('requires a typed lifecycle envelope, invocation and explicit revision', async () => {
        await open(isolated);
        const valid = { type: 'lifecycle', invocationId: 'valid', action: app('one') };
        for (const command of [{ ...valid, type: 'patch' }, { ...valid, invocationId: '' }, { ...valid, patch: {} }]) {
            await expect(f.core.applyLifecycleCommand(h.handle, base.session.sessionId, command,
                { expectedRevisionId: base.revision.revisionId })).rejects.toThrow();
        }
        await expect(f.core.applyLifecycleCommand(h.handle, base.session.sessionId, valid)).rejects.toThrow();
        await expect(read()).resolves.toMatchObject(durable(base));
    });

    test.each(['atri_lifecycle', 'atri_task_results'])('generic runtime commits cannot replace or delete %s', async namespace => {
        await open();
        const options = { expectedRevisionId: base.revision.revisionId };
        await expect(f.core.updateState(h.handle, base.session.sessionId, { [namespace]: {} }, options)).rejects.toThrow(/Reserved/);
        await expect(f.core.applyRuntimeCommit(h.handle, base.session.sessionId,
            { commands: [{ type: 'append', draft: { role: 'assistant', content: 'must not leak' } }], statePatch: { [namespace]: {} } }, options)).rejects.toThrow(/Reserved/);
        await expect(f.core.applyRuntimeCommit(h.handle, base.session.sessionId,
            { deleteNamespaces: [namespace] }, options)).rejects.toThrow(/Reserved/);
        await expect(read()).resolves.toMatchObject(durable(base));
    });

    test('typed per-record reducer starts from initial data and rejects invalid computed output atomically', async () => {
        await open(value => {
            isolated(value);
            const domain = value.lifecycleRuntime.domains[0];
            domain.recordSchema = { type: 'object', additionalProperties: false, required: ['count', 'text'],
                properties: { count: { type: 'integer', minimum: 0, maximum: 10 }, text: { type: 'string', maxLength: 256 } } };
            domain.initial = { count: 1, text: 'initial' };
            domain.commands = [{ id: 'increment', event: 'notes.incremented',
                argsSchema: { type: 'object', additionalProperties: false, required: ['delta'], properties: { delta: { type: 'integer', minimum: -10, maximum: 10 } } },
                assign: { count: { formula: 'world.count + args.delta' } } }];
        });
        const increment = delta => ({ kind: 'app.command', domainId: 'notes', recordId: 'counter', commandId: 'increment', args: { delta } });
        const first = await apply(base, increment(2));
        const second = await apply(first, increment(3));
        expect(records(second)[0]).toMatchObject({ value: { count: 6, text: 'initial' }, status: 'active', pinned: false });
        expect(records(base)).toEqual([]);
        expect(hp(second)).toBe(hp(base));
        await expect(apply(second, increment(10))).rejects.toThrow();
        await expect(read()).resolves.toMatchObject(durable(second));
        expect(lifecycle(second).receipts.at(-1).events).toEqual([expect.objectContaining({ type: 'notes.incremented',
            domainId: 'notes', recordId: 'counter', payload: { delta: 3 } })]);
    });

    test('scope suspend freezes records, thaw preserves data, archive is irreversible and isolated', async () => {
        await open(value => {
            isolated(value);
            value.lifecycleRuntime.scopes.push({ id: 'other', kind: 'scene', sceneId: 'elsewhere' });
            value.lifecycleRuntime.domains.push({ ...structuredClone(value.lifecycleRuntime.domains[0]), id: 'other-notes', scopeId: 'other' });
        });
        const created = await apply(base, app('one', 'keep'));
        const frozen = await apply(created, { kind: 'scope.transition', scopeId: 'session', status: 'suspended' });
        expect(lifecycle(frozen).scopes.session).toEqual({ status: 'suspended', epoch: 1 });
        expect(records(frozen)).toEqual(records(created));
        await expect(apply(frozen, app('one', 'lost'))).rejects.toThrow(/Scope/);
        await expect(read()).resolves.toMatchObject(durable(frozen));
        const other = await apply(frozen, { ...app('other'), domainId: 'other-notes' });
        const thawed = await apply(other, { kind: 'scope.transition', scopeId: 'session', status: 'active' });
        expect(lifecycle(thawed).scopes.session).toEqual({ status: 'active', epoch: 2 });
        expect(records(thawed)).toEqual(records(created));
        const edited = await apply(thawed, app('one', 'resumed'));
        const archived = await apply(edited, { kind: 'scope.transition', scopeId: 'session', status: 'archived' });
        await expect(apply(archived, { kind: 'scope.transition', scopeId: 'session', status: 'active' })).rejects.toThrow(/scope/i);
        await expect(apply(archived, app('new'))).rejects.toThrow(/Scope/);
        await expect(read()).resolves.toMatchObject(durable(archived));
        expect(lifecycle(archived).domains['other-notes'].records).toHaveLength(1);
    });

    test('World Clock advances only through its declared command, not wall time or unrelated revisions', async () => {
        await open(isolated);
        jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 86400000 * 365);
        const narrative = await f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'A year of wall time is not a World tick.' });
        expect(lifecycle(narrative).logicalTime).toBe(lifecycle(base).logicalTime + 1);
        expect(lifecycle(narrative).clocks.world).toBe(0);
        const clock = await apply(narrative, advance(3));
        expect(lifecycle(clock).clocks.world).toBe(3);
        expect(lifecycle(clock).logicalTime).toBe(lifecycle(narrative).logicalTime + 1);
        const reloaded = await services(h).core.load(h.handle, base.session.sessionId);
        expect(lifecycle(reloaded)).toEqual(lifecycle(clock));
        expect(hp(reloaded)).toBe(hp(base));
    });

    test.each([0, -1, 1.5, 9, Number.MAX_SAFE_INTEGER])('invalid World Clock ticks %s cannot advance HEAD', async ticks => {
        await open(isolated);
        await expect(apply(base, advance(ticks))).rejects.toThrow();
        await expect(read()).resolves.toMatchObject(durable(base));
    });

    test.each([
        ['all', [2, 4, 6], [2, 4, 6]],
        ['latest', [1, 1, 1], [6, 6, 6]],
        ['skip', [0, 0, 0], [6, 6, 6]],
    ])('World Process catchUp=%s is bounded, resumable and uses existing World Command/Reducer', async (catchUp, counts, cursors) => {
        await open(value => {
            isolated(value);
            value.lifecycleRuntime.automations = [{ id: 'process', scopeId: 'session', maxCatchUp: 2,
                trigger: { kind: 'world.schedule', clockId: 'world', at: 1, every: 1, catchUp },
                action: { kind: 'world.command', commandId: 'heal', args: {} } }];
        });
        let head = await apply(base, advance(6));
        expect(hp(head)).toBe(hp(base));
        for (let index = 0; index < counts.length; index++) {
            f.core = services(h).core;
            head = await read();
            head = await apply(head, { kind: index === 0 ? 'experience.ready' : 'pump' });
            expect(hp(head)).toBe(hp(base) + counts[index]);
            expect(lifecycle(head).automations.process.cursor).toBe(cursors[index]);
            expect(lifecycle(head).clocks.world).toBe(6);
            expect((head.states.atri_game_runtime?.events ?? []).filter(event => event.type === 'healed')).toHaveLength(counts[index]);
        }
        const exhausted = await apply(head, { kind: 'pump' });
        expect(hp(exhausted)).toBe(hp(head));
        expect(lifecycle(exhausted).automations).toEqual(lifecycle(head).automations);
        const nextTick = await apply(exhausted, advance(1));
        const onTime = await apply(nextTick, { kind: 'pump' });
        expect(hp(onTime)).toBe(hp(head) + 1);
        expect(lifecycle(onTime).automations.process.cursor).toBe(7);
    });

    test('one pump runs at most 24 occurrences across automations; further pump drains remaining work', async () => {
        await open(value => {
            isolated(value);
            value.lifecycleRuntime.advances[0].maxTicks = 40;
            value.lifecycleRuntime.automations = ['first', 'second'].map(id => ({ id, scopeId: 'session', maxCatchUp: 32,
                trigger: { kind: 'world.schedule', clockId: 'world', at: 1, every: 1, catchUp: 'all' },
                action: { kind: 'world.command', commandId: 'heal', args: {} } }));
        });
        let head = await apply(base, advance(40));
        head = await apply(head, { kind: 'experience.ready' });
        expect(hp(head)).toBe(hp(base) + 24);
        expect(lifecycle(head).automations.first.cursor).toBe(24);
        expect(lifecycle(head).automations.second).toBeUndefined();
        head = await apply(head, { kind: 'pump' });
        expect(hp(head)).toBe(hp(base) + 48);
        expect(lifecycle(head).automations).toMatchObject({ first: { cursor: 40 }, second: { cursor: 8 } });
    });

    test('logical interval observes revision time rather than World ticks', async () => {
        await open(value => {
            isolated(value);
            value.lifecycleRuntime.automations = [{ id: 'logical', scopeId: 'session', maxCatchUp: 1,
                trigger: { kind: 'logical.interval', every: 3, catchUp: 'all' }, action: app('interval') }];
        });
        const clock = await apply(base, advance(8));
        expect(lifecycle(clock).logicalTime).toBe(lifecycle(base).logicalTime + 1);
        const ready = await apply(clock, { kind: 'experience.ready' });
        expect(records(ready)).toEqual([]);
        const due = await apply(ready, { kind: 'pump' });
        expect(records(due)[0]).toMatchObject({ id: 'interval', value: { text: 'saved' } });
        expect(lifecycle(due).automations.logical.cursor).toBe(3);
        expect(lifecycle(due).clocks.world).toBe(8);
    });

    test('failed World Process rolls back earlier actions, cursors, Ready and lifecycle receipt in the same pump', async () => {
        await open(value => {
            isolated(value);
            value.lifecycleRuntime.automations = ['heal', 'absent'].map((commandId, index) => ({ id: `process-${index}`,
                scopeId: 'session', maxCatchUp: 1, trigger: { kind: 'experience.ready' },
                action: { kind: 'world.command', commandId, args: {} } }));
        });
        await expect(apply(base, { kind: 'experience.ready' })).rejects.toThrow();
        await expect(read()).resolves.toMatchObject(durable(base));
        expect(hp(await read())).toBe(8);
    });

    test('Workflow user and task gates require explicit transitions; temporal wait uses World Clock', async () => {
        await open();
        let head = await apply(base, { kind: 'experience.ready' });
        head = await apply(head, { kind: 'pump' });
        expect(lifecycle(head).workflows.onboarding).toMatchObject({ phase: 'start', instance: 0, status: 'active' });
        await expect(apply(head, transition('wait'))).rejects.toThrow(/transition/i);
        head = await apply(head, transition('begin'));
        expect(lifecycle(head).workflows.onboarding).toMatchObject({ phase: 'write', instance: 1 });
        head = await apply(head, transition('summarize'));
        const queued = lifecycle(head).outbox[0];
        expect(queued).toMatchObject({ ...taskAction, workflowId: 'onboarding', status: 'pending' });
        expect(head.states.atri_task_results).toBeUndefined();
        await expect(apply(head, transition('wait'))).rejects.toThrow(/Task.*complete/i);
        head = await finalize(head, taskRecord(queued.invocationId));
        expect(head.states.atri_task_results.records).toEqual([expect.objectContaining({ invocationId: queued.invocationId,
            status: 'completed', storedRevisionId: head.revision.revisionId })]);
        head = await apply(head, transition('wait'));
        await expect(apply(head, transition('finish'))).rejects.toThrow(/wait.*due/i);
        head = await apply(head, advance(5));
        const beforeFinish = head;
        head = await apply(head, transition('finish'), 'finish-workflow');
        expect(lifecycle(head).workflows.onboarding).toMatchObject({ phase: 'done', instance: 4, status: 'completed' });
        await expect(apply(beforeFinish, transition('finish'), 'finish-workflow')).resolves.toMatchObject(durable(head));
        await expect(apply(head, transition('begin'))).rejects.toThrow(/transition/i);
        await expect(read()).resolves.toMatchObject(durable(head));
    });

    test('pending outbox survives a fresh Core; only finalized Task results become durable and never requeue', async () => {
        await open(value => {
            isolated(value);
            value.lifecycleRuntime.automations = [{ id: 'startup-task', scopeId: 'session', maxCatchUp: 1,
                trigger: { kind: 'experience.ready' }, action: taskAction }];
        });
        const ready = await apply(base, { kind: 'experience.ready' });
        const queued = lifecycle(ready).outbox[0];
        expect(queued).toMatchObject({ ...taskAction, status: 'pending', scopeId: 'session', scopeEpoch: 0 });
        expect(queued.invocationId).toMatch(/^lc:/);
        expect(ready.states.atri_task_results).toBeUndefined();
        f.core = services(h).core;
        let head = await read();
        head = await apply(head, { kind: 'pump' });
        expect(lifecycle(head).outbox).toEqual(lifecycle(ready).outbox);
        expect(head.states.atri_task_results).toBeUndefined();
        await expect(finalize(head, taskRecord(queued.invocationId, { payload: { text: 1 } }))).rejects.toThrow();
        await expect(finalize(head, taskRecord(queued.invocationId, { variantId: 'missing' }))).rejects.toThrow();
        await expect(read()).resolves.toMatchObject(durable(head));
        const committed = await finalize(head, taskRecord(queued.invocationId));
        expect(committed.states.atri_task_results.records).toHaveLength(1);
        expect(lifecycle(committed).outbox.filter(item => item.status === 'pending')).toEqual([]);
        await expect(finalize(committed, taskRecord(queued.invocationId))).rejects.toThrow();
        f.core = services(h).core;
        head = await apply(await read(), { kind: 'pump' });
        head = await apply(head, { kind: 'experience.ready' });
        expect(lifecycle(head).outbox).toEqual([]);
        expect(head.states.atri_task_results.records).toEqual(committed.states.atri_task_results.records);
    });

    test.each(['workflow.cancel', 'scheduled.cancel'])('%s prevents late result publication and pump resurrection', async kind => {
        await open(value => {
            value.lifecycleRuntime.automations = [];
            value.lifecycleRuntime.workflows[0].initial = 'summary';
        });
        const ready = await apply(base, { kind: 'experience.ready' });
        const queued = lifecycle(ready).outbox[0];
        const action = kind === 'workflow.cancel' ? { kind, workflowId: 'onboarding' } : { kind, invocationId: queued.invocationId };
        const cancelled = await apply(ready, action);
        expect(lifecycle(cancelled).outbox).toEqual([]);
        await expect(finalize(ready, taskRecord(queued.invocationId))).rejects.toMatchObject({ code: 'native_session_head_conflict' });
        await expect(finalize(cancelled, taskRecord(queued.invocationId))).rejects.toThrow(/Scheduled/);
        const pumped = await apply(cancelled, { kind: 'pump' });
        expect(lifecycle(pumped).outbox).toEqual([]);
        expect(pumped.states.atri_task_results).toBeUndefined();
        await expect(read()).resolves.toMatchObject(durable(pumped));
    });

    test.each(['suspended', 'archived'])('scope %s invalidates pending task epoch and suppresses late finalize', async status => {
        await open(value => {
            value.lifecycleRuntime.automations = [];
            value.lifecycleRuntime.workflows[0].initial = 'summary';
        });
        const ready = await apply(base, { kind: 'experience.ready' });
        const queued = lifecycle(ready).outbox[0];
        const stopped = await apply(ready, { kind: 'scope.transition', scopeId: 'session', status });
        expect(lifecycle(stopped).scopes.session).toEqual({ status, epoch: 1 });
        expect(lifecycle(stopped).outbox).toEqual([]);
        await expect(finalize(stopped, taskRecord(queued.invocationId))).rejects.toThrow(/Scheduled/);
        const pumped = await apply(stopped, { kind: 'pump' });
        expect(lifecycle(pumped).outbox).toEqual([]);
        expect(pumped.states.atri_task_results).toBeUndefined();
    });

    test('scope thaw schedules a fresh Workflow epoch; old invocation cannot finalize against the new HEAD', async () => {
        await open(value => {
            value.lifecycleRuntime.automations = [];
            value.lifecycleRuntime.workflows[0].initial = 'summary';
        });
        const ready = await apply(base, { kind: 'experience.ready' });
        const old = lifecycle(ready).outbox[0];
        const frozen = await apply(ready, { kind: 'scope.transition', scopeId: 'session', status: 'suspended' });
        const thawed = await apply(frozen, { kind: 'scope.transition', scopeId: 'session', status: 'active' });
        f.core = services(h).core;
        const resumed = await apply(await read(), { kind: 'pump' });
        expect(lifecycle(resumed).scopes.session).toEqual({ status: 'active', epoch: 2 });
        expect(lifecycle(resumed).outbox).toHaveLength(1);
        const current = lifecycle(resumed).outbox[0];
        expect(current).toMatchObject({ scopeEpoch: 2, status: 'pending', workflowId: 'onboarding' });
        expect(current.invocationId).not.toBe(old.invocationId);
        expect(lifecycle(resumed).workflows.onboarding.instance).toBeGreaterThan(lifecycle(ready).workflows.onboarding.instance);
        await expect(finalize(resumed, taskRecord(old.invocationId))).rejects.toThrow(/Scheduled/);
        await expect(read()).resolves.toMatchObject(durable(resumed));
        const completed = await finalize(resumed, taskRecord(current.invocationId));
        expect(completed.states.atri_task_results.records.map(record => record.invocationId)).toEqual([current.invocationId]);
        expect(lifecycle(thawed).outbox).toEqual([]);
    });

    test('compacted scheduled Task remains once-only after fresh Core load, Ready replay and pump', async () => {
        await open(value => {
            isolated(value);
            value.lifecycleRuntime.retention.maxTaskResults = 1;
            value.lifecycleRuntime.automations = [{ id: 'once', scopeId: 'session', maxCatchUp: 1,
                trigger: { kind: 'experience.ready' }, action: taskAction }];
        });
        const ready = await apply(base, { kind: 'experience.ready' });
        const queued = lifecycle(ready).outbox[0];
        const completed = await finalize(ready, taskRecord(queued.invocationId));
        const compacted = await finalize(completed, taskRecord('newer-result'));
        expect(compacted.states.atri_task_results.records.map(record => record.invocationId)).toEqual(['newer-result']);
        expect(lifecycle(compacted).taskTombstones).toEqual([expect.objectContaining({ invocationId: queued.invocationId, status: 'completed' })]);
        f.core = services(h).core;
        const replay = await apply(await read(), { kind: 'experience.ready' });
        const pumped = await apply(replay, { kind: 'pump' });
        expect(lifecycle(pumped).outbox).toEqual([]);
        expect(lifecycle(pumped).taskTombstones).toEqual(lifecycle(compacted).taskTombstones);
        await expect(finalize(pumped, taskRecord(queued.invocationId))).rejects.toThrow();
        await expect(read()).resolves.toMatchObject(durable(pumped));
    });

    test('terminal App records cannot be reopened; TTL compacts only unpinned, unreferenced terminal records', async () => {
        await open(isolated);
        let head = await apply(base, app('active'));
        head = await apply(head, finish('pinned'));
        head = await apply(head, { kind: 'app.pin', domainId: 'notes', recordId: 'pinned', pinned: true });
        head = await apply(head, finish('referenced'));
        head = await apply(head, app('referrer', 'referenced'));
        head = await apply(head, finish('expired'));
        await expect(apply(head, app('expired', 'reopen'))).rejects.toThrow(/terminal/);
        head = await apply(head, advance(8));
        expect(records(head)).toHaveLength(5);
        head = await apply(head, advance(2));
        head = await apply(head, { kind: 'retention.compact' });
        expect(records(head).map(record => record.id).sort()).toEqual(['active', 'pinned', 'referenced', 'referrer']);
        expect(records(head).find(record => record.id === 'pinned')).toMatchObject({ pinned: true, status: 'terminal' });
        head = await apply(head, { kind: 'app.pin', domainId: 'notes', recordId: 'pinned', pinned: false });
        expect(records(head).map(record => record.id).sort()).toEqual(['active', 'referenced', 'referrer']);
    });

    test.each([['maxItems', 1], ['maxLogicalBytes', 220]])('domain %s pressure rejects admission rather than deleting live data', async (limit, maximum) => {
        await open(value => { isolated(value); value.lifecycleRuntime.domains[0].retention[limit] = maximum; });
        const head = await apply(base, app('active'));
        await expect(apply(head, app('overflow'))).rejects.toThrow(/retention/i);
        await expect(read()).resolves.toMatchObject(durable(head));
    });

    test('Task compaction leaves exact replay tombstones, survives reload and rolls back coherently on fork', async () => {
        await open(value => { isolated(value); value.lifecycleRuntime.retention.maxTaskResults = 2; });
        const firstRecord = taskRecord('first');
        const first = await finalize(base, firstRecord);
        const second = await finalize(first, taskRecord('second'));
        let head = await finalize(second, taskRecord('third'));
        expect(head.states.atri_task_results.records.map(record => record.invocationId)).toEqual(['second', 'third']);
        expect(lifecycle(head).taskTombstones).toEqual([expect.objectContaining({ invocationId: 'first', fingerprint: firstRecord.fingerprint,
            kind: 'task', status: 'completed', branchId: first.revision.branchId, storedRevisionId: first.revision.revisionId })]);
        f.core = services(h).core;
        head = await read();
        await expect(finalize(head, firstRecord)).rejects.toThrow(/compacted/i);
        await expect(finalize(head, { ...firstRecord, payload: { text: 'different replay' } })).rejects.toThrow(/compacted/i);
        await expect(read()).resolves.toMatchObject(durable(head));
        const fork = await f.core.forkBranch(h.handle, base.session.sessionId,
            { revisionId: first.revision.revisionId, expectedRevisionId: head.revision.revisionId });
        expect(fork.states.atri_task_results).toEqual(first.states.atri_task_results);
        expect(lifecycle(fork).taskTombstones).toEqual([]);
        const original = await f.core.load(h.handle, base.session.sessionId, { revisionId: head.revision.revisionId });
        expect(lifecycle(original).taskTombstones).toEqual(lifecycle(head).taskTombstones);
    });

    test.each(['draft', 'pinned', 'referenced', 'current-workflow'])('Task retention preserves %s result and fails closed at capacity', async protection => {
        await open(value => {
            value.lifecycleRuntime.automations = [];
            value.lifecycleRuntime.retention.maxTaskResults = 1;
            if (protection === 'draft') value.taskRuntime.tasks[0].resultPolicy = { resultClass: 'advisory', sink: 'proposal' };
            if (protection === 'current-workflow') value.lifecycleRuntime.workflows[0].initial = 'summary';
            else value.lifecycleRuntime.workflows = [];
        });
        let head = base;
        let invocationId = 'protected-task';
        if (protection === 'current-workflow') {
            head = await apply(head, { kind: 'experience.ready' });
            invocationId = lifecycle(head).outbox[0].invocationId;
        }
        head = await finalize(head, taskRecord(invocationId, protection === 'pinned' ? { pinned: true } : {}));
        if (protection === 'referenced') head = await apply(head, app('reference', invocationId));
        await expect(finalize(head, taskRecord('overflow'))).rejects.toThrow(/retention/i);
        await expect(read()).resolves.toMatchObject(durable(head));
        expect(head.states.atri_task_results.records.map(record => record.invocationId)).toEqual([invocationId]);
        expect(lifecycle(head).taskTombstones).toEqual([]);
    });

    test('Scheduled Interaction consumes an anchored draft, reloads and delivers once only at its WorldInstant', async () => {
        await open(scheduledInteractions);
        const ready = await apply(base, { kind: 'experience.ready' });
        const proposal = await finalize(ready, taskRecord('reminder-proposal', { payload: interactionPayload() }));
        expect(proposal.states.atri_task_results.records[0]).toMatchObject({ status: 'draft', storedRevisionId: proposal.revision.revisionId });
        expect(records(proposal)).toEqual([]);
        const scheduled = await apply(proposal, schedule('reminder-proposal'), 'schedule-once');
        expect(scheduled.states.atri_task_results.records[0]).toMatchObject({ status: 'applied', authorityReceipt: {
            kind: 'authority', baseRevisionId: proposal.revision.revisionId, committedRevisionId: scheduled.revision.revisionId } });
        expect(lifecycle(scheduled).interactions).toEqual([expect.objectContaining({ proposalId: 'reminder-proposal',
            interactionId: 'reminder', scopeId: 'session', scopeEpoch: 0, clockId: 'world', ...interactionPayload(),
            domainId: 'notes', commandId: 'save', status: 'scheduled' })]);
        expect(records(scheduled)).toEqual([]);
        f.core = services(h).core;
        jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 86400000);
        let head = await apply(await read(), { kind: 'pump' });
        expect(records(head)).toEqual([]);
        head = await apply(head, advance(2));
        head = await apply(head, { kind: 'pump' });
        expect(records(head)).toEqual([]);
        head = await apply(head, advance(1));
        expect(records(head)).toEqual([]);
        const beforeDelivery = head;
        head = await apply(head, { kind: 'pump' }, 'deliver-once');
        expect(records(head)).toEqual([expect.objectContaining({ id: 'reminder-note', value: interactionPayload().args })]);
        expect(lifecycle(head).interactions[0]).toMatchObject({ proposalId: 'reminder-proposal', status: 'delivered' });
        expect(lifecycle(head).receipts.at(-1)).toMatchObject({ kind: 'authority', invocationId: 'deliver-once', events: [
            { type: 'notes.saved', domainId: 'notes', recordId: 'reminder-note', payload: interactionPayload().args },
            { type: 'interaction.delivered', proposalId: 'reminder-proposal', clockId: 'world', dueTick: 3 },
        ] });
        await expect(apply(beforeDelivery, { kind: 'pump' }, 'deliver-once')).resolves.toMatchObject(durable(head));
        await expect(apply(proposal, schedule('reminder-proposal'), 'schedule-once')).resolves.toMatchObject(durable(head));
        await expect(apply(head, schedule('reminder-proposal'))).rejects.toThrow(/stale|closed/i);
        f.core = services(h).core;
        const again = await apply(await read(), { kind: 'pump' });
        expect(records(again)).toEqual(records(head));
        expect(lifecycle(again).receipts).toEqual(lifecycle(head).receipts);
    });

    test('Scheduled Interaction rejects unknown mapping and draft whose revision anchor has advanced', async () => {
        await open(scheduledInteractions);
        const proposal = await finalize(base, taskRecord('reminder-proposal', { payload: interactionPayload() }));
        await expect(apply(proposal, { ...schedule('reminder-proposal'), interactionId: 'missing' })).rejects.toThrow();
        await expect(apply(proposal, { ...schedule('reminder-proposal'), commandId: 'finish' })).rejects.toThrow();
        await expect(read()).resolves.toMatchObject(durable(proposal));
        const newer = await apply(proposal, app('unrelated'));
        await expect(apply(newer, schedule('reminder-proposal'))).rejects.toThrow(/stale|closed/i);
        await expect(read()).resolves.toMatchObject(durable(newer));
        expect(newer.states.atri_task_results.records[0].status).toBe('draft');
        expect(lifecycle(newer).interactions).toEqual([]);
    });

    test.each([
        ['cancelled', { kind: 'interaction.cancel', proposalId: 'reminder-proposal' }, 'cancelled'],
        ['suspended', { kind: 'scope.transition', scopeId: 'session', status: 'suspended' }, 'stale'],
        ['archived', { kind: 'scope.transition', scopeId: 'session', status: 'archived' }, 'stale'],
    ])('Scheduled Interaction %s stays undelivered across fresh Core load and due-time pump', async (_label, action, status) => {
        await open(scheduledInteractions);
        const ready = await apply(base, { kind: 'experience.ready' });
        const proposal = await finalize(ready, taskRecord('reminder-proposal', { payload: interactionPayload() }));
        const scheduled = await apply(proposal, schedule('reminder-proposal'));
        const stopped = await apply(scheduled, action);
        expect(lifecycle(stopped).interactions[0]).toMatchObject({ proposalId: 'reminder-proposal', status });
        f.core = services(h).core;
        const clock = await apply(await read(), advance(3));
        const pumped = await apply(clock, { kind: 'pump' });
        expect(records(pumped)).toEqual([]);
        expect(lifecycle(pumped).interactions[0].status).toBe(status);
        await expect(apply(pumped, schedule('reminder-proposal'))).rejects.toThrow(/stale|closed/i);
        await expect(read()).resolves.toMatchObject(durable(pumped));
    });

    test.each([1, 8])('Scheduled Interaction dueTick=%s outside [now, now + maxDelay] leaves proposal draft and state unchanged', async dueTick => {
        await open(scheduledInteractions);
        const clock = await apply(base, advance(2));
        const proposal = await finalize(clock, taskRecord('invalid-due', { payload: interactionPayload(dueTick) }));
        await expect(apply(proposal, schedule('invalid-due'))).rejects.toThrow(/WorldInstant.*bounds/i);
        await expect(read()).resolves.toMatchObject(durable(proposal));
        expect(proposal.states.atri_task_results.records[0].status).toBe('draft');
        expect(lifecycle(proposal).interactions).toEqual([]);
        expect(records(proposal)).toEqual([]);
    });

    test('Scheduled Interaction validates typed result args before proposal storage or scheduling', async () => {
        await open(scheduledInteractions);
        await expect(finalize(base, taskRecord('invalid-result', {
            payload: { ...interactionPayload(), args: { text: 123 } },
        }))).rejects.toThrow();
        await expect(read()).resolves.toMatchObject(durable(base));
        expect(lifecycle(base).interactions).toEqual([]);
    });

    test('receipt capacity keeps once-only authority history and still permits exact replay', async () => {
        await open(value => { isolated(value); value.lifecycleRuntime.retention.maxReceipts = 1; });
        const head = await apply(base, app('first'), 'retained-receipt');
        await expect(apply(head, app('second'), 'overflow')).rejects.toThrow(/retention/i);
        await expect(apply(base, app('first'), 'retained-receipt')).resolves.toMatchObject(durable(head));
        await expect(read()).resolves.toMatchObject(durable(head));
    });

    test('fork from an earlier revision restores domains, scopes, clocks, Workflow, receipts and task authority together', async () => {
        await open();
        let head = await apply(base, { kind: 'experience.ready' });
        head = await apply(head, transition('begin'));
        head = await apply(head, advance(3));
        head = await finalize(head, taskRecord('branch-task'));
        head = await apply(head, { kind: 'scope.transition', scopeId: 'session', status: 'suspended' });
        const fork = await f.core.forkBranch(h.handle, base.session.sessionId,
            { revisionId: base.revision.revisionId, expectedRevisionId: head.revision.revisionId });
        expect(fork.revision.branchId).not.toBe(head.revision.branchId);
        for (const key of ['domains', 'scopes', 'clocks', 'workflows', 'automations', 'outbox', 'interactions', 'receipts', 'taskTombstones']) {
            expect(lifecycle(fork)[key]).toEqual(lifecycle(base)[key]);
        }
        expect(fork.states.atri_task_results).toBeUndefined();
        expect(fork.timeline).toEqual(base.timeline);
        const historical = await f.core.load(h.handle, base.session.sessionId, { revisionId: head.revision.revisionId });
        expect(durable(historical)).toEqual(durable(head));
        const replayOnFork = await apply(fork, { kind: 'experience.ready' });
        expect(records(replayOnFork)).toHaveLength(1);
        expect(lifecycle(replayOnFork).scopes.session.status).toBe('active');
    });
});
