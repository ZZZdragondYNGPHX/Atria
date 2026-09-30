import { describe, test, expect } from '@jest/globals';
import { simulationTaskFixture as fixture } from './helpers/simulation-task-fixture.js';
import { createAuthorityPublicationBudget, prepareAuthorityPublications } from '../../src/native/authority-transaction.js';
import { prepareLifecycle, prepareDeclaredTaskResult } from '../../src/native/lifecycle-authority.js';
import { prepareWorldSimulation, simulationTaskCurrent } from '../../src/native/simulation-authority.js';

async function advance(f) {
    const budget = await createAuthorityPublicationBudget(f.base, f.installed);
    const prepared = await prepareLifecycle(f.base, f.installed, { kind: 'clock.advance', commandId: 'advance', ticks: 4320 }, budget);
    return { ...f.base, states: prepared.states };
}
describe('Bounded simulation Task admission', () => {
    test('current scoped input is materialized only after deterministic catch-up', async () => {
        const f = fixture(); const base = await advance(f);
        const [item] = base.states.atri_lifecycle.outbox;
        expect(base.states.atri_lifecycle.outbox).toHaveLength(1);
        expect(item.input).toEqual({ known: 'advanced', tick: 4320 });
        expect(item.simulation).toMatchObject({ jobId: 'archive.choose', tick: 4320, dueTick: 4320 });
        expect(simulationTaskCurrent(base, item, await createAuthorityPublicationBudget(base, f.installed))).toBe(true);
        const repeat = await prepareWorldSimulation(base, f.installed, 4320, await createAuthorityPublicationBudget(base, f.installed));
        expect(repeat.states.atri_lifecycle.outbox).toEqual(base.states.atri_lifecycle.outbox);
    });
    test('Cold deliberation stays silent while deterministic institutions progress', async () => {
        const f = fixture('cold'); const base = await advance(f);
        expect(base.states.atri_lifecycle.outbox).toEqual([]);
        expect(base.states.atri_lifecycle.domains.notes.records[0].value.visits).toBe(3);
    });
    test('zero budget does not invoke or enqueue a model', async () => {
        const f = fixture(); f.contract.simulationRuntime.policy.maxDeliberations = 0;
        expect((await advance(f)).states.atri_lifecycle.outbox).toEqual([]);
    });
    test.each(['input', 'clock', 'scope'])('stale %s fails eligibility before dispatch', async what => {
        const f = fixture(); const base = structuredClone(await advance(f)); const [item] = base.states.atri_lifecycle.outbox;
        if (what === 'input') base.states.atri_lifecycle.domains.notes.records[0].value.text = 'changed';
        if (what === 'clock') base.states.atri_lifecycle.clocks.world++;
        if (what === 'scope') base.states.atri_lifecycle.scopes.session.status = 'suspended';
        expect(simulationTaskCurrent(base, item, await createAuthorityPublicationBudget(base, f.installed))).toBe(false);
    });
    test('only the bounded intent command accepts model output; projection remains an authority hook', async () => {
        const f = fixture(); const base = await advance(f); const [queued] = base.states.atri_lifecycle.outbox;
        const task = f.contract.taskRuntime.tasks[0]; const budget = await createAuthorityPublicationBudget(base, f.installed);
        const prepared = await prepareDeclaredTaskResult(base, f.installed, queued, task, task.variants[0], { invocationId: queued.invocationId, payload: { text: 'filed' } }, budget);
        const published = await prepareAuthorityPublications({ ...base, states: prepared.states }, f.installed, budget);
        expect(published.candidate.states.atri_lifecycle.domains.notes.records[0].value.text).toBe('filed');
        expect(published.candidate.states.atri_lifecycle.domains.public_notes.records[0].value.text).toBe('filed');
        expect(base.states.atri_lifecycle.domains.notes.records[0].value.text).toBe('advanced');
        await expect(prepareDeclaredTaskResult(base, f.installed, queued, task, task.variants[0], { invocationId: queued.invocationId, payload: { text: 'invent arbitrary world fact' } }, await createAuthorityPublicationBudget(base, f.installed))).rejects.toThrow();
    });
});
