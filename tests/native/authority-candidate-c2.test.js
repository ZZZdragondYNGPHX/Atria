import { describe, test, expect } from '@jest/globals';
import { authorityCandidateFixture } from './helpers/authority-candidate-fixture.js';
import { closed } from './helpers/authority-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { prepareAuthorityTransaction, prepareAuthorityPublications } from '../../src/native/authority-transaction.js';

const run = f => prepareAuthorityTransaction(f.base, f.installed, f.request);
const note = (candidate, id = 'notes') => candidate.states.atri_lifecycle.domains[id].records[0].value.text;
const fail = async f => {
    f.sync(); const before = structuredClone(f.base);
    await expect(run(f)).rejects.toMatchObject({ code: 'AUTHORITY_PREPARATION_FAILED' });
    expect(f.base).toEqual(before);
};

describe('C2 private Authority candidate', () => {
    test('World + multiple domains + clock + workflow + derived projection compose privately', async () => {
        const f = authorityCandidateFixture(); const before = structuredClone(f.base);
        const prepared = await run(f);
        expect(prepared.candidate.states.atri_world_state.initialState.hp).toBe(6);
        expect(prepared.candidate.states.atri_game_runtime.events).toHaveLength(1);
        expect(note(prepared.candidate)).toBe('visible new note');
        expect(note(prepared.candidate, 'other')).toBe('other changed');
        expect(note(prepared.candidate, 'public_notes')).toBe('visible new note');
        expect(prepared.candidate.states.atri_lifecycle.clocks.world).toBe(1);
        expect(prepared.candidate.states.atri_lifecycle.workflows.onboarding.status).toBe('completed');
        expect(prepared.candidate.states.atri_lifecycle.logicalTime).toBe(0);
        expect(prepared.candidate.revision).toEqual(before.revision);
        expect(prepared.candidate.timeline).toEqual(before.timeline);
        expect(prepared.candidate.states).not.toHaveProperty('atri_action_receipts');
        expect(f.base).toEqual(before);
        expect(Object.isFrozen(prepared.candidate.states.atri_lifecycle.domains.notes.records[0].value)).toBe(true);
        expect(prepared.work).toMatchObject({ effects: 6, worldEvents: 1, appCommands: 3, clockAdvances: 1, workflowTransitions: 1, readGrants: 2 });
        expect(prepared.receipt.result).toEqual({ outcome: 'success', label: 'Note action resolved.' });
        expect(JSON.stringify(prepared.receipt)).not.toContain('PRIVATE SENTINEL');
        expect(Object.isFrozen(prepared.receipt.result)).toBe(true);
    });
    test('preparation is deterministic across provider retry and restored snapshot', async () => {
        const f = authorityCandidateFixture(({ logic }) => { logic.transactions[0].resolution = { kind: 'bounded_fortune', sides: 1000,
            cases: [], fallback: 'success' }; logic.transactions[0].receipt = { schema: closed({ roll: { type: 'integer', minimum: 1, maximum: 1000 } }),
            projection: { roll: { formula: 'resolution.roll' } }, maxBytes: 32768 }; });
        const first = await run(f); const again = await run(f);
        f.base = structuredClone(f.base); const restored = await run(f);
        expect(again).toEqual(first); expect(restored).toEqual(first);
        f.request.ordinal++; const another = await run(f); expect(another.identity).not.toBe(first.identity);
        f.base.revision.branchId = createNativeId('branch'); f.request.anchor.branchId = f.base.revision.branchId;
        expect((await run(f)).identity).not.toBe(another.identity);
    });
    test('regenerated input does not silently reseed the same anchored action', async () => {
        const f = authorityCandidateFixture(); const first = await run(f);
        f.request.input.text = 'rephrased input'; const second = await run(f);
        expect(second.identity).toBe(first.identity); expect(second.inputHash).not.toBe(first.inputHash);
    });
    test('Experience Ready Barrier cannot be bypassed to omit clock-triggered work', async () => {
        const f = authorityCandidateFixture(); f.base.states.atri_lifecycle.ready = false;
        expect.hasAssertions(); await fail(f);
    });
    test('canonical input key order does not change identity', async () => {
        const f = authorityCandidateFixture(); const first = await run(f);
        f.request.input = { amount: 2, text: 'visible new note', target: 'main' };
        expect((await run(f)).identity).toBe(first.identity);
    });
    test.each(['revisionId', 'branchId', 'sessionId', 'packageVersionId'])('stale %s anchor fails closed', async key => {
        const f = authorityCandidateFixture(); f.request.anchor[key] = 'stale'; expect.hasAssertions(); await fail(f);
    });
    test.each(['missing-player', 'assistant', 'ordinal', 'input-type', 'input-bound', 'extra-field', 'ungranted-target', 'unknown-transaction', 'validator', 'scope',
        'missing-read', 'wrong-scope', 'terminal-write', 'bad-world', 'computed-record', 'computed-args', 'bad-clock', 'workflow-stale', 'retention', 'derived-missing', 'derived-invalid'])('%s failure publishes nothing', async kind => {
        const f = authorityCandidateFixture(); const tx = f.logic.transactions[0]; const state = f.base.states.atri_lifecycle;
        if (kind === 'missing-player') f.request.playerMessageId = createNativeId('message');
        if (kind === 'assistant') f.base.timeline[0].role = 'assistant';
        if (kind === 'ordinal') f.request.ordinal = 64;
        if (kind === 'input-type') f.request.input.amount = '2';
        if (kind === 'input-bound') f.request.input.amount = 9;
        if (kind === 'extra-field') f.request.input.domainId = 'notes';
        if (kind === 'ungranted-target') f.request.input.target = '__proto__';
        if (kind === 'unknown-transaction') f.request.transactionId = 'missing';
        if (kind === 'validator') state.domains.notes.records[0].value.text = 'locked';
        if (kind === 'scope') state.scopes.session.status = 'suspended';
        if (kind === 'missing-read') state.domains.notes.records = [];
        if (kind === 'wrong-scope') state.domains.notes.records[0].scopeId = 'other';
        if (kind === 'terminal-write') state.domains.other.records[0].status = 'terminal';
        if (kind === 'bad-world') tx.effects[0].payload.amount = { formula: 'args.amount * 10' };
        if (kind === 'computed-record') f.contract.lifecycleRuntime.domains[2].commands[0].assign.text = { formula: '42' };
        if (kind === 'computed-args') tx.effects[2].args.text = { formula: '1 / 0' };
        if (kind === 'bad-clock') tx.effects[3].ticks = { formula: 'args.amount * 10' };
        if (kind === 'workflow-stale') state.workflows.onboarding.phase = 'done';
        if (kind === 'retention') f.contract.lifecycleRuntime.domains[2].retention.maxLogicalBytes = 16;
        if (kind === 'derived-missing') f.logic.derivedPublications[0].reads[0].recordId = 'absent';
        if (kind === 'derived-invalid') f.contract.lifecycleRuntime.domains[1].commands[0].assign.text = 42;
        expect.hasAssertions(); await fail(f);
    });
    test('late private formula error never exposes its value or cause', async () => {
        const f = authorityCandidateFixture();
        f.logic.transactions[0].reads[0].fields = ['text'];
        f.logic.transactions[0].effects[1].recordId = { formula: 'reads.note.text' }; f.sync();
        const error = await run(f).catch(error => error);
        expect(error.message).toBe('Authority transaction preparation failed');
        expect(error).not.toHaveProperty('cause'); expect(JSON.stringify(error)).not.toContain('PRIVATE SENTINEL');
    });
    test('a false effect guard has no effect but the hook still runs', async () => {
        const f = authorityCandidateFixture(); f.logic.transactions[0].effects[2].when = 'args.amount < 1'; f.sync();
        const prepared = await run(f); expect(note(prepared.candidate, 'other')).toBe('public note'); expect(prepared.work.appCommands).toBe(2);
    });
    test('standalone publication hook refreshes an ordinary Lifecycle candidate without a player turn', async () => {
        const f = authorityCandidateFixture(); f.base.timeline = []; f.base.states.atri_lifecycle.domains.notes.records[0].value.text = 'background result';
        const before = structuredClone(f.base); const prepared = await prepareAuthorityPublications(f.base, f.installed);
        expect(note(prepared.candidate, 'public_notes')).toBe('background result'); expect(f.base).toEqual(before);
        expect(prepared).not.toHaveProperty('receipt'); expect(prepared.candidate.states).not.toHaveProperty('atri_game_runtime');
    });
    test('standalone hook failure cannot leak an earlier derived write', async () => {
        const f = authorityCandidateFixture();
        f.logic.derivedPublications[0].effects.push({ ...f.logic.derivedPublications[0].effects[0], recordId: 'last', args: { text: { formula: '42' } } });
        f.sync(); const before = structuredClone(f.base);
        await expect(prepareAuthorityPublications(f.base, f.installed)).rejects.toThrow(); expect(f.base).toEqual(before);
    });
});
