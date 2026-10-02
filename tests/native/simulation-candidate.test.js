import { describe, test, expect } from '@jest/globals';
import { simulationCandidateFixture } from './helpers/simulation-candidate-fixture.js';
import { createAuthorityPublicationBudget, prepareAuthorityPublications, prepareSimulationStep, prepareAuthorityTransaction } from '../../src/native/authority-transaction.js';
import { prepareLifecycle } from '../../src/native/lifecycle-authority.js';

const run = async f => {
    const budget = await createAuthorityPublicationBudget(f.base, f.installed);
    const prepared = await prepareLifecycle(f.base, f.installed, { kind: 'clock.advance', commandId: 'advance', ticks: 4320 }, budget);
    return prepareAuthorityPublications({ ...f.base, states: prepared.states }, f.installed, budget);
};
describe('Pure bounded World Simulation preparation', () => {
    test('event-driven three-day Cold catch-up uses one shared budget and no player/model', async () => {
        const f = simulationCandidateFixture(); f.base.timeline = [];
        const before = structuredClone(f.base);
        const prepared = await run(f);
        expect(f.base).toEqual(before);
        expect(prepared.candidate.timeline).toEqual([]);
        expect(prepared.candidate.states.atri_lifecycle.clocks.world).toBe(4320);
        expect(prepared.candidate.states.atri_lifecycle.domains.notes.records[0].value).toMatchObject({ visits: 3, due: 5760, text: 'advanced' });
        expect(prepared.candidate.states.atri_lifecycle.outbox).toEqual([]);
        expect(prepared.candidate.states.atri_game_runtime.events).toHaveLength(3);
        expect(prepared.candidate.states.atri_world_state.initialState.hp).toBe(5);
        expect(prepared.candidate.states.atri_lifecycle.domains.public_notes.records[0].value.text).toBe('advanced');
        expect(prepared.work).toMatchObject({ clockAdvances: 1, appCommands: 4, worldEvents: 3, effects: 8, readGrants: 8 });
        expect(await run(f)).toEqual(prepared);
    });
    test('a 200-year sparse interval has constant work and preserves the shared clock', async () => {
        const span = 200 * 365 * 1440;
        const f = simulationCandidateFixture(({ contract }) => {
            contract.simulationRuntime.policy.maxAdvanceTicks = span;
            contract.lifecycleRuntime.advances[0].maxTicks = span;
        });
        const before = structuredClone(f.base);
        const budget = await createAuthorityPublicationBudget(f.base, f.installed);
        const result = await prepareLifecycle(f.base, f.installed, { kind: 'clock.advance', commandId: 'advance', ticks: span }, budget);
        expect(result.states.atri_lifecycle.clocks.world).toBe(span);
        expect(result.states.atri_lifecycle.domains.notes.records[0].value.visits).toBe(3);
        expect(budget.counts).toMatchObject({ clockAdvances: 1, worldEvents: 3, appCommands: 3 });
        expect(f.base).toEqual(before);
    });
    test.each([1440, 200 * 365 * 1440, 5000 * 365 * 1440])('target-tick interval resolution is one step at %i minutes', async span => {
        const f = simulationCandidateFixture(({ contract }) => {
            contract.simulationRuntime.policy = { maxSteps: 1, maxDeliberations: 0, maxAdvanceTicks: span };
            contract.lifecycleRuntime.advances[0].maxTicks = span;
            const job = contract.simulationRuntime.jobs[0];
            job.due = { formula: 'clock.targetTick' };
            job.enabled = 'reads.calendar.visits < 1';
        });
        const budget = await createAuthorityPublicationBudget(f.base, f.installed);
        const result = await prepareLifecycle(f.base, f.installed, { kind: 'clock.advance', commandId: 'advance', ticks: span }, budget);
        expect(result.states.atri_lifecycle.clocks.world).toBe(span);
        expect(result.states.atri_lifecycle.domains.notes.records[0].value.visits).toBe(1);
        expect(budget.counts).toMatchObject({ clockAdvances: 1, worldEvents: 1, appCommands: 1 });
    });
    test('safe-integer overflow still refuses atomically', async () => {
        const f = simulationCandidateFixture(({ contract }) => {
            contract.simulationRuntime.policy.maxAdvanceTicks = Number.MAX_SAFE_INTEGER;
            contract.lifecycleRuntime.advances[0].maxTicks = Number.MAX_SAFE_INTEGER;
            contract.simulationRuntime.jobs = [];
        });
        f.base.states.atri_lifecycle.clocks.world = Number.MAX_SAFE_INTEGER;
        const before = structuredClone(f.base);
        const budget = await createAuthorityPublicationBudget(f.base, f.installed);
        await expect(prepareLifecycle(f.base, f.installed, { kind: 'clock.advance', commandId: 'advance', ticks: 1 }, budget)).rejects.toThrow();
        expect(f.base).toEqual(before);
    });
    test('same-tick priority/id ordering is independent of declaration order; invalidated later work is not reinterpreted', async () => {
        const f = simulationCandidateFixture();
        const job = f.contract.simulationRuntime.jobs[0];
        f.contract.simulationRuntime.jobs = ['z', 'a'].map(id => ({ ...structuredClone(job), id, due: 1440,
            reads: [{ id: 'note', domainId: 'notes', recordId: 'main', fields: ['text'] }], enabled: 'reads.note.text == "PRIVATE SENTINEL"',
            action: { kind: 'transaction', transactionId: 'ordered.' + id, input: {} } }));
        for (const id of ['z', 'a']) {
            const tx = structuredClone(f.logic.transactions[1]); tx.id = 'ordered.' + id; tx.verb = 'ordered_' + id;
            tx.effects = [{ kind: 'world.event', type: 'NoteChanged', payload: { amount: id === 'a' ? 1 : 2 } },
                { kind: 'app.command', domainId: 'notes', recordId: 'main', commandId: 'save', args: { text: id } }];
            f.logic.transactions.push(tx);
        }
        f.sync(); const result = await run(f);
        expect(result.candidate.states.atri_lifecycle.domains.notes.records[0].value.text).toBe('a');
        expect(result.candidate.states.atri_game_runtime.events).toHaveLength(1);
        expect(result.candidate.states.atri_world_state.initialState.hp).toBe(7);
    });
    test('player selection cannot call a non-player Transaction', async () => {
        const f = simulationCandidateFixture(); f.request.transactionId = 'calendar.advance'; f.request.input = {};
        await expect(prepareAuthorityTransaction(f.base, f.installed, f.request)).rejects.toMatchObject({ code: 'AUTHORITY_PREPARATION_FAILED' });
    });
    test.each([
        ['Ready', f => { f.base.states.atri_lifecycle.ready = false; }],
        ['horizon', f => { f.contract.simulationRuntime.policy.maxAdvanceTicks = 1000; }],
        ['step budget', f => { f.contract.simulationRuntime.policy.maxSteps = 2; }],
        ['App budget', f => { f.contract.authorityRuntime.policy.maxAppCommands = 2; }],
        ['non-progress', f => { f.contract.lifecycleRuntime.domains[0].commands.at(-1).assign.due = 1440; }],
        ['computed due schema', f => { f.contract.simulationRuntime.jobs[0].due = { formula: 'reads.calendar.due - 10000' }; }],
    ])('%s failure does not mutate the source', async (_name, mutate) => {
        const f = simulationCandidateFixture(); mutate(f); f.sync(); const before = structuredClone(f.base);
        await expect(run(f)).rejects.toThrow(); expect(f.base).toEqual(before);
    });
    test.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])('invalid interval target %s cannot mutate a candidate', async target => {
        const f = simulationCandidateFixture();
        const before = structuredClone(f.base);
        const budget = await createAuthorityPublicationBudget(f.base, f.installed);
        await expect(prepareSimulationStep(f.base, f.installed, 'calendar.day', 0, budget, target)).rejects.toThrow();
        expect(f.base).toEqual(before);
    });
    test('internal job entrypoint cannot invent a job or run before its due time', async () => {
        const f = simulationCandidateFixture(); const budget = await createAuthorityPublicationBudget(f.base, f.installed);
        await expect(prepareSimulationStep(f.base, f.installed, 'missing', 0, budget)).rejects.toThrow();
        await expect(prepareSimulationStep(f.base, f.installed, 'calendar.day', 0, budget)).rejects.toThrow();
    });
});
