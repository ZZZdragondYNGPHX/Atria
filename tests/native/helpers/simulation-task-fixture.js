import { simulationCandidateFixture } from './simulation-candidate-fixture.js';
import { lifecycleFixture } from './lifecycle-fixture.js';
import { closed } from './authority-fixture.js';

export function simulationTaskFixture(relevance = 'hot') {
    const f = simulationCandidateFixture();
    f.contract.taskRuntime = lifecycleFixture().taskRuntime;
    const task = f.contract.taskRuntime.tasks[0];
    const argsSchema = closed({ text: { type: 'string', maxLength: 16, enum: ['filed', 'defer'] } });
    Object.assign(task, { inputSchema: closed({ known: { type: 'string', maxLength: 256 }, tick: { type: 'integer', minimum: 0, maximum: 10080 } }),
        queuePolicy: 'fifo', resultPolicy: { resultClass: 'declared_app_command', sink: 'app_command' } });
    Object.assign(task.variants[0], { outputSchema: argsSchema, resultBinding: { kind: 'app.command', domainId: 'notes', commandId: 'intent', recordId: 'main' } });
    f.contract.lifecycleRuntime.domains[0].commands.push({ id: 'intent', argsSchema, event: 'notes.intent', assign: { text: { formula: 'args.text' } } });
    f.contract.simulationRuntime.policy.maxDeliberations = 1;
    f.contract.simulationRuntime.jobs.push({ id: 'archive.choose', scopeId: 'session', reads: [{ id: 'archive', domainId: 'notes', recordId: 'main', fields: ['text'] }],
        enabled: 'reads.archive.text == "advanced"', due: 4320, priority: 1, relevance,
        action: { kind: 'task', taskId: task.id, variantId: 'default', input: { known: { formula: 'reads.archive.text' }, tick: { formula: 'clock.tick' } } } });
    f.contract.simulationRuntime.jobs.push({ id: 'archive.execute', scopeId: 'session', reads: [{ id: 'intent', domainId: 'notes', recordId: 'main', fields: ['text'] }],
        enabled: 'reads.intent.text == "filed"', due: 4320, priority: 2, relevance: 'hot',
        action: { kind: 'transaction', transactionId: 'archive.execute', input: {} } });
    f.logic.transactions.push({ id: 'archive.execute', verb: 'archive_execute', origin: 'simulation', inputSchema: closed({}), intent: { expose: false, description: 'Accept the bounded filing intent.' },
        reads: [], validators: [], resolution: { kind: 'deterministic', cases: [], fallback: 'accepted' },
        effects: [{ kind: 'world.event', type: 'NoteChanged', payload: { amount: 1 } },
            { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: 'resolved' } },
            { kind: 'app.command', domainId: 'other', commandId: 'save', recordId: 'main', args: { text: 'accepted' } }],
        derivedPublications: ['notes.publication'], receipt: { schema: closed({}), projection: {}, maxBytes: 1024 } });
    f.sync(); return f;
}
