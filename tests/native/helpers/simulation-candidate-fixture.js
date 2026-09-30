import { authorityCandidateFixture } from './authority-candidate-fixture.js';
import { closed } from './authority-fixture.js';

export function simulationCandidateFixture(change = () => {}) {
    const f = authorityCandidateFixture(({ contract, logic }) => {
        contract.capabilities.push({ id: 'world-simulation', version: 1, required: true });
        const notes = contract.lifecycleRuntime.domains.find(d => d.id === 'notes');
        notes.recordSchema = closed({ text: { type: 'string', maxLength: 256 }, due: { type: 'integer', minimum: 0, maximum: 10080 }, visits: { type: 'integer', minimum: 0, maximum: 8 } });
        notes.initial = { text: '', due: 1440, visits: 0 };
        notes.commands.push({ id: 'tick', argsSchema: closed({}), event: 'notes.tick', assign: { text: 'advanced', due: { formula: 'world.due + 1440' }, visits: { formula: 'world.visits + 1' } } });
        contract.lifecycleRuntime.advances[0].maxTicks = 4320;
        contract.simulationRuntime = { schemaVersion: 1, clockId: 'world', policy: { maxSteps: 8, maxDeliberations: 0, maxAdvanceTicks: 4320 }, jobs: [{
            id: 'calendar.day', scopeId: 'session', reads: [{ id: 'calendar', domainId: 'notes', recordId: 'main', fields: ['due', 'visits'] }],
            enabled: 'reads.calendar.visits < 3', due: { formula: 'reads.calendar.due' }, priority: 1, relevance: 'cold',
            action: { kind: 'transaction', transactionId: 'calendar.advance', input: {} },
        }] };
        logic.transactions.push({ id: 'calendar.advance', verb: 'calendar_advance', origin: 'simulation', inputSchema: closed({}),
            intent: { expose: false, description: 'Deterministic daily transition.' }, reads: [], validators: [], resolution: { kind: 'deterministic', cases: [], fallback: 'advanced' },
            effects: [{ kind: 'world.event', type: 'NoteChanged', payload: { amount: 1 } }, { kind: 'app.command', domainId: 'notes', recordId: 'main', commandId: 'tick', args: {} }],
            derivedPublications: ['notes.publication'], receipt: { schema: closed({}), projection: {}, maxBytes: 1024 } });
        change({ contract, logic });
    });
    Object.assign(f.base.states.atri_lifecycle.domains.notes.records[0].value, { due: 1440, visits: 0 });
    return f;
}
