import { describe, test, expect } from '@jest/globals';
import { authorityCandidateFixture } from './helpers/authority-candidate-fixture.js';
import { closed } from './helpers/authority-fixture.js';
import { lifecycleFixture } from './helpers/lifecycle-fixture.js';
import { compileDeclarativeLogic } from '../../public/scripts/native/experience/logic/declarative.js';
import { prepareAuthorityTransaction, prepareAuthorityPublications, buildAuthorityObservation } from '../../src/native/authority-transaction.js';

const run = f => prepareAuthorityTransaction(f.base, f.installed, f.request);
const compile = f => { f.sync(); return compileDeclarativeLogic(f.logic, { experienceContract: f.contract }); };
const fail = async f => {
    compile(f); const before = structuredClone(f.base);
    await expect(run(f)).rejects.toMatchObject({ code: 'AUTHORITY_PREPARATION_FAILED' });
    expect(f.base).toEqual(before);
};
const app = (domainId = 'notes', text = 'clock result') => ({ kind: 'app.command', domainId, commandId: 'save', recordId: 'main', args: { text } });
const automation = action => ({ id: 'due', scopeId: 'session', trigger: { kind: 'world.schedule', clockId: 'world', at: 1, catchUp: 'all' }, action, maxCatchUp: 1 });
const rule = (events, id = 'after') => ({ id, on: ['NoteChanged'], events });
const event = (type = 'Chained', amount = 1) => ({ type, payload: { amount } });
function chained(f, count = 1) {
    f.logic.reducers.push({ ...structuredClone(f.logic.reducers[0]), type: 'Chained' });
    f.logic.rules.push(rule(Array.from({ length: count }, () => event())));
}

describe('C2 expanded-work and runtime value limits', () => {
    test('World rules use existing reducers and add to the same private journal', async () => {
        const f = authorityCandidateFixture(); chained(f, 2); compile(f);
        const prepared = await run(f);
        expect(prepared.candidate.states.atri_world_state.initialState.hp).toBe(4);
        expect(prepared.work.worldEvents).toBe(3); expect(prepared.work.ruleEvaluations).toBe(1);
        expect(prepared.candidate.states.atri_game_runtime.events.map(item => item.type)).toEqual(['NoteChanged', 'Chained', 'Chained']);
    });
    test.each(['world', 'total', 'cycle', 'payload'])('expanded rule %s limit rejects an otherwise valid declaration', async kind => {
        const f = authorityCandidateFixture(); chained(f, 2);
        if (kind === 'world') f.contract.authorityRuntime.policy.maxWorldEvents = 1;
        if (kind === 'total') f.contract.authorityRuntime.policy.maxEffects = 6;
        if (kind === 'cycle') f.logic.rules = [rule([event('NoteChanged')])];
        if (kind === 'payload') f.logic.rules[0].events[0].payload.amount = 100;
        expect.hasAssertions(); await fail(f);
    });
    test('actual computed values are validated after static scalar type validation', async () => {
        const f = authorityCandidateFixture(); f.logic.transactions[0].effects[0].payload.amount = { formula: 'args.amount * 100' }; expect.hasAssertions(); await fail(f);
    });
    test('nonfinite computed World payload fails before any state assignment', async () => {
        const f = authorityCandidateFixture(); f.logic.reducers[0].payloadSchema.properties.amount.type = 'number';
        f.logic.transactions[0].effects[0].payload.amount = { formula: 'args.amount / 0' }; expect.hasAssertions(); await fail(f);
    });
    test('computed App record violates destination schema after valid command args', async () => {
        const f = authorityCandidateFixture(); f.contract.lifecycleRuntime.domains[2].commands[0].assign.text = { formula: '42' }; expect.hasAssertions(); await fail(f);
    });
    test('clock triggers App + World command + rules privately, before derived publication', async () => {
        const f = authorityCandidateFixture(); chained(f);
        f.logic.commands.push({ id: 'tick', argsSchema: closed({}), events: [event()] });
        f.contract.lifecycleRuntime.automations = [automation(app()), { ...automation({ kind: 'world.command', commandId: 'tick', args: {} }), id: 'world-due' }];
        compile(f); const prepared = await run(f);
        expect(prepared.work.appCommands).toBe(4); expect(prepared.work.worldEvents).toBe(3);
        expect(prepared.candidate.states.atri_lifecycle.domains.public_notes.records[0].value.text).toBe('clock result');
        expect(prepared.candidate.states.atri_lifecycle.automations.due.cursor).toBe(1);
    });
    test.each(['app', 'world', 'total', 'derived-write'])('clock-expanded %s bypass is rejected', async kind => {
        const f = authorityCandidateFixture();
        f.contract.lifecycleRuntime.automations = [automation(app(kind === 'derived-write' ? 'public_notes' : 'notes'))];
        if (kind === 'app') f.contract.authorityRuntime.policy.maxAppCommands = 3;
        if (kind === 'total') f.contract.authorityRuntime.policy.maxEffects = 6;
        if (kind === 'world') {
            f.logic.commands.push({ id: 'tick', argsSchema: closed({}), events: [event('NoteChanged')] });
            f.contract.lifecycleRuntime.automations[0].action = { kind: 'world.command', commandId: 'tick', args: {} };
            f.contract.authorityRuntime.policy.maxWorldEvents = 1;
        }
        expect.hasAssertions(); await fail(f);
    });
    test('workflows expand into typed commands inside the same bound', async () => {
        const f = authorityCandidateFixture(); const flow = f.contract.lifecycleRuntime.workflows[0];
        flow.nodes[1] = { id: 'done', kind: 'action', action: app('other', 'workflow result') }; compile(f);
        const prepared = await run(f); expect(prepared.work.appCommands).toBe(4);
        expect(prepared.candidate.states.atri_lifecycle.domains.other.records[0].value.text).toBe('workflow result');
        f.contract.authorityRuntime.policy.maxAppCommands = 3; expect.hasAssertions(); await fail(f);
    });
    test('task scheduling is bounded private outbox preparation, not model execution', async () => {
        const f = authorityCandidateFixture(); f.contract.taskRuntime = lifecycleFixture().taskRuntime;
        f.contract.lifecycleRuntime.workflows[0].nodes[1] = { id: 'done', kind: 'model_task',
            action: { kind: 'task', taskId: 'summarize', variantId: 'default', input: {} } };
        compile(f); const prepared = await run(f);
        expect(prepared.candidate.states.atri_lifecycle.outbox).toHaveLength(1);
        expect(f.base.states.atri_lifecycle.outbox).toEqual([]);
        expect(prepared.work.effects).toBe(7);
        f.contract.authorityRuntime.policy.maxEffects = 6; expect.hasAssertions(); await fail(f);
    });
    test('total rule evaluations are bounded across repeated commands, not per World instance', async () => {
        const f = authorityCandidateFixture(); f.logic.rules = Array.from({ length: 129 }, (_, i) => rule([], 'rule.' + i));
        f.logic.transactions[0].effects.unshift(structuredClone(f.logic.transactions[0].effects[0])); expect.hasAssertions(); await fail(f);
    });
    test('private selected field UTF-8 bytes are bounded even below schema character limits', async () => {
        const f = authorityCandidateFixture(); const domain = f.contract.lifecycleRuntime.domains[0];
        domain.recordSchema.properties.text.maxLength = 65536; domain.retention.maxLogicalBytes = 1048576;
        f.base.states.atri_lifecycle.domains.notes.records[0].value.text = '界'.repeat(22000); expect.hasAssertions(); await fail(f);
    });
    test('computed UTF-8 receipt envelope is bounded, not just declaration characters', async () => {
        const f = authorityCandidateFixture(); f.logic.transactions[0].receipt = { schema: closed({ text: { type: 'string', maxLength: 256 } }),
            projection: { text: { formula: 'args.text' } }, maxBytes: 700 };
        f.request.input.text = '界'.repeat(200); expect.hasAssertions(); await fail(f);
    });
    test('safe receipt schema validates runtime projection enum', async () => {
        const f = authorityCandidateFixture(); f.logic.transactions[0].receipt.schema.properties.outcome.enum = ['failure']; expect.hasAssertions(); await fail(f);
    });
    test('aggregate private read bytes cannot be multiplied through aliases', async () => {
        const f = authorityCandidateFixture(); f.contract.lifecycleRuntime.domains[0].recordSchema.properties.text.maxLength = 65536;
        f.contract.lifecycleRuntime.domains[0].retention.maxLogicalBytes = 1048576;
        f.base.states.atri_lifecycle.domains.notes.records[0].value.text = 'x'.repeat(40000);
        const grant = f.logic.transactions[0].reads[0];
        f.logic.transactions[0].reads.push(...Array.from({ length: 6 }, (_, i) => ({ ...grant, id: 'alias.' + i })));
        expect.hasAssertions(); await fail(f);
    });
    test('aggregate record scans include private and derived reads', async () => {
        const f = authorityCandidateFixture(); const domain = f.contract.lifecycleRuntime.domains[0];
        domain.retention.maxItems = 4096; domain.retention.maxLogicalBytes = 1048576;
        const record = f.base.states.atri_lifecycle.domains.notes.records[0];
        f.base.states.atri_lifecycle.domains.notes.records.push(...Array.from({ length: 4095 }, (_, i) => ({ ...structuredClone(record), id: 'record.' + i })));
        expect.hasAssertions(); await fail(f);
    });
    test('clock pumps cannot silently defer excess work at the legacy 24-command boundary', async () => {
        const f = authorityCandidateFixture();
        f.contract.lifecycleRuntime.automations = Array.from({ length: 25 }, (_, i) => ({ ...automation(app()), id: 'due.' + i }));
        expect.hasAssertions(); await fail(f);
    });
    test('aggregate computed UTF-8 bytes bound repeated rule projections', async () => {
        const f = authorityCandidateFixture(); f.base.states.atri_world_state.initialState.padding = 'x'.repeat(60000);
        f.logic.transactions[0].effects.unshift(...Array.from({ length: 8 }, () => structuredClone(f.logic.transactions[0].effects[0])));
        expect.hasAssertions(); await fail(f);
    });
    test('input objects cannot smuggle getters, functions or executable toJSON', async () => {
        for (const input of [{ target: 'main', text: () => 'x', amount: 1 }, { target: 'main', text: 'x', amount: 1, toJSON() { throw Error('private'); } }]) {
            const f = authorityCandidateFixture(); f.request.input = input;
            await expect(run(f)).rejects.toThrow('Authority transaction preparation failed');
        }
        const f = authorityCandidateFixture(); let called = false;
        Object.defineProperty(f.request.input, 'text', { enumerable: true, get() { called = true; return 'private'; } });
        await expect(run(f)).rejects.toThrow(); expect(called).toBe(false);
    });
    test('Package pin mismatch fails before preparation', async () => {
        const f = authorityCandidateFixture(); f.installed.manifest = structuredClone(f.installed.manifest); f.installed.manifest.version = 'different'; expect.hasAssertions(); await fail(f);
    });
    test('read-only transaction still refreshes the bounded derived hook', async () => {
        const f = authorityCandidateFixture(); f.logic.transactions[0].effects = []; compile(f);
        const prepared = await run(f); expect(prepared.work.effects).toBe(1);
        expect(prepared.candidate.states).not.toHaveProperty('atri_game_runtime');
    });
});

describe('C2 player-safe observation', () => {
    test('only explicit player/display fields are copied; no private records, World, Memory, rollups or providers', () => {
        const f = authorityCandidateFixture(); f.base.states.atri_world_state.initialState.secret = 'WORLD SECRET';
        f.base.states.atri_context_derived = { narrative: [{ content: 'ROLLUP SECRET' }] };
        const before = structuredClone(f.base); const observation = buildAuthorityObservation(f.base);
        expect(observation.items).toHaveLength(1);
        expect(JSON.stringify(observation)).toContain('public note');
        for (const secret of ['PRIVATE SENTINEL', 'WORLD SECRET', 'ROLLUP SECRET']) expect(JSON.stringify(observation)).not.toContain(secret);
        expect(observation.anchor).toEqual(f.request.anchor); expect(f.base).toEqual(before); expect(Object.isFrozen(observation.items)).toBe(true);
    });
    test('inactive scope is not exposed', () => {
        const f = authorityCandidateFixture(); f.base.states.atri_lifecycle.scopes.session.status = 'suspended';
        expect(buildAuthorityObservation(f.base).items).toEqual([]);
    });
    test('global item cap spans multiple Views', () => {
        const f = authorityCandidateFixture(); const view = structuredClone(f.contract.informationRuntime.views[0]); view.id = 'second';
        f.contract.informationRuntime.views.push(view); f.contract.authorityRuntime.intentObservation.viewIds.push('second');
        f.contract.authorityRuntime.intentObservation.maxItems = 1;
        const observation = buildAuthorityObservation(f.base); expect(observation.items).toHaveLength(1); expect(observation.truncated).toBe(true);
    });
    test('UTF-8 cap includes wrapper and anchor, with deterministic truncation', () => {
        const f = authorityCandidateFixture(); f.contract.authorityRuntime.intentObservation.maxBytes = 650;
        f.base.states.atri_lifecycle.domains.public_notes.records[0].value.text = '界'.repeat(200);
        const observation = buildAuthorityObservation(f.base); expect(observation.items).toEqual([]); expect(observation.truncated).toBe(true);
        expect(Buffer.byteLength(JSON.stringify(observation))).toBeLessThanOrEqual(650);
        f.contract.authorityRuntime.intentObservation.maxBytes = 1; expect(() => buildAuthorityObservation(f.base)).toThrow();
    });
    test('observation scanning has a global cap across Views, not one cap per projection', () => {
        const f = authorityCandidateFixture(); const record = f.base.states.atri_lifecycle.domains.public_notes.records[0];
        f.contract.lifecycleRuntime.domains[1].retention.maxItems = 4096; f.contract.lifecycleRuntime.domains[1].retention.maxLogicalBytes = 1048576;
        f.base.states.atri_lifecycle.domains.public_notes.records.push(...Array.from({ length: 2099 }, (_, i) => ({ ...record, id: 'record.' + i })));
        const view = { ...f.contract.informationRuntime.views[0], id: 'second' };
        f.contract.informationRuntime.views.push(view); f.contract.authorityRuntime.intentObservation.viewIds.push('second');
        expect(() => buildAuthorityObservation(f.base)).toThrow('Authority observation failed');
    });
    test.each(['narrator', 'context', 'knowledge', 'memory'])('unsafe %s declaration is not exposed', kind => {
        const f = authorityCandidateFixture(); const view = f.contract.informationRuntime.views[0];
        if (kind === 'narrator') view.audience = 'narrator';
        if (kind === 'context') view.exposure.push('context');
        if (kind === 'knowledge' || kind === 'memory') view[kind] = true;
        expect(() => buildAuthorityObservation(f.base)).toThrow('Authority observation failed');
    });
    test('corrupted projection record types fail instead of exposing unvalidated nested data', () => {
        const f = authorityCandidateFixture(); f.base.states.atri_lifecycle.domains.public_notes.records[0].value.text = { secret: 'hidden' };
        expect(() => buildAuthorityObservation(f.base)).toThrow('Authority observation failed');
    });
    test('World-only Transactions do not invent a Lifecycle requirement absent from C1', async () => {
        const f = authorityCandidateFixture(); delete f.contract.lifecycleRuntime; delete f.contract.informationRuntime;
        delete f.contract.authorityRuntime.canonicalClockId; f.contract.authorityRuntime.intentObservation.viewIds = [];
        delete f.base.states.atri_lifecycle; f.logic.derivedPublications = [];
        const tx = f.logic.transactions[0]; tx.reads = []; tx.validators = []; tx.effects = [tx.effects[0]]; tx.derivedPublications = [];
        compile(f); const prepared = await run(f);
        expect(prepared.candidate.states.atri_world_state.initialState.hp).toBe(6);
        expect(prepared.candidate.states).not.toHaveProperty('atri_lifecycle');
        expect(buildAuthorityObservation(f.base).items).toEqual([]);
    });
    test('without capability all new APIs fail closed instead of inferring authority', async () => {
        const f = authorityCandidateFixture(); f.contract.capabilities = []; delete f.contract.authorityRuntime;
        expect(() => buildAuthorityObservation(f.base)).toThrow();
        await expect(run(f)).rejects.toThrow(); await expect(prepareAuthorityPublications(f.base, f.installed)).rejects.toThrow();
    });
});
