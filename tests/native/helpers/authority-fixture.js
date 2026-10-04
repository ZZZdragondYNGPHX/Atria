import { lifecycleFixture } from './lifecycle-fixture.js';

export const closed = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export function authorityFixture() {
    const { lifecycleRuntime } = lifecycleFixture();
    lifecycleRuntime.workflows[0].nodes = [{ id: 'start', kind: 'user_gate' }, { id: 'done', kind: 'terminal' }];
    lifecycleRuntime.workflows[0].transitions = [{ id: 'begin', from: 'start', to: 'done' }];
    lifecycleRuntime.domains.push({ ...structuredClone(lifecycleRuntime.domains[0]), id: 'public_notes' });
    const contract = { schemaVersion: 1, capabilities: [{ id: 'authority-transaction', version: 1, required: true }], dataResources: [],
        lifecycleRuntime,
        informationRuntime: { schemaVersion: 1, actors: [], graphs: [],
            sources: [{ id: 'public.notes', kind: 'application', semantic: 'truth', scopeId: 'session', domainId: 'public_notes', fields: [['text']] }],
            views: [{ id: 'player.notes', audience: 'player', sources: ['public.notes'], exposure: ['display'], knowledge: false, memory: false, maxItems: 64, maxCharacters: 16384 }] },
        authorityRuntime: { schemaVersion: 1, canonicalClockId: 'world',
            intentObservation: { viewIds: ['player.notes'], maxItems: 64, maxBytes: 16384 },
            policy: { maxReadGrants: 16, maxWorldEvents: 16, maxAppCommands: 24, maxEffects: 32, maxReceiptBytes: 32768 } } };
    const logic = { schemaVersion: 3, commands: [], rules: [], interpretations: [],
        reducers: [{ type: 'NoteChanged', payloadSchema: closed({ amount: { type: 'integer', minimum: 1, maximum: 8 } }), assign: { hp: { formula: 'max(0, world.hp - args.amount)' } } }],
        derivedPublications: [{ id: 'notes.publication', reads: [{ id: 'note', domainId: 'notes', recordId: 'main', fields: ['text'] }],
            effects: [{ kind: 'app.command', domainId: 'public_notes', commandId: 'save', recordId: 'main', args: { text: { formula: 'reads.note.text' } } }] }],
        transactions: [{ id: 'note.update', verb: 'update_note', inputSchema: closed({ target: { type: 'string', maxLength: 64 },
            text: { type: 'string', maxLength: 256 }, amount: { type: 'integer', minimum: 1, maximum: 8 } }),
        intent: { expose: true, description: 'Update the selected note using a bounded authored operation.' },
        reads: [{ id: 'note', domainId: 'notes', recordId: { formula: 'args.target' }, fields: ['text'] }],
        validators: [{ id: 'unlocked', formula: 'reads.note.text != "locked"', error: 'The note is locked.' }],
        resolution: { kind: 'bounded_fortune', sides: 6, cases: [{ id: 'pass', when: 'resolution.roll >= 2', outcome: 'success' }], fallback: 'failure' },
        effects: [
            { kind: 'world.event', type: 'NoteChanged', payload: { amount: { formula: 'args.amount' } } },
            { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: { formula: 'args.target' }, args: { text: { formula: 'args.text' } }, when: 'resolution.outcome == "success"' },
            { kind: 'clock.advance', commandId: 'advance', ticks: 1 },
            { kind: 'workflow.transition', workflowId: 'onboarding', transitionId: 'begin' },
        ], derivedPublications: ['notes.publication'],
        receipt: { schema: closed({ outcome: { type: 'string', maxLength: 64 }, label: { type: 'string', maxLength: 64 } }),
            projection: { outcome: { formula: 'resolution.outcome' }, label: 'Note action resolved.' }, maxBytes: 32768 } }],
    };
    return { contract, logic };
}
