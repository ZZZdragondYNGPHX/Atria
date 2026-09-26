import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { createGameWorldSession } from '../../public/scripts/native/experience/world/session.js';
import { compileDeclarativeLogic } from '../../public/scripts/native/experience/logic/declarative.js';
import { lowerDeclarativeMutations } from '../../public/scripts/native/experience/logic/mutations.js';

let h, f, runtime, world;
const definition = () => ({ schemaVersion: 2, mutations: [{
    id: 'damage', event: 'damage.applied',
    argsSchema: { type: 'object', required: ['amount'], additionalProperties: false, properties: { amount: { type: 'integer', minimum: 1, maximum: 5 } } },
    validators: [{ id: 'healthy', formula: 'world.hp >= args.amount', error: 'Not enough HP' }],
    assign: { hp: { formula: 'world.hp - args.amount' } },
}], commands: [{ id: 'refund', argsSchema: { type: 'object', required: ['receiptId'], additionalProperties: false, properties: { receiptId: { type: 'string' } } }, events: [{ type: 'refund.applied', payload: {} }] }], reducers: [{ type: 'refund.applied', assign: { hp: { formula: 'world.hp + 2' } } }] });

beforeEach(async () => {
    h = await makeTempFsEngineHarness(); f = await installFixture(h);
    runtime = {
        active: true, snapshot: await f.core.create(h.handle, f.start),
        async commitStatePatch(statePatch, options = {}) {
            this.snapshot = await f.core.applyRuntimeCommit(h.handle, this.snapshot.session.sessionId,
                { statePatch, actionRequest: options.actionRequest }, { expectedRevisionId: options.expectedRevisionId });
            return this.snapshot;
        },
    };
    const logic = compileDeclarativeLogic(definition());
    world = await createGameWorldSession({ nativeRuntime: runtime, packageState: { snapshot: runtime.snapshot }, ...logic });
});
afterEach(async () => { await h.cleanup(); });
const action = () => ({ actionId: 'buy', commandId: 'damage', args: { amount: 2 }, expectedRevisionId: runtime.snapshot.revision.revisionId, idempotencyKey: 'request-1', compensation: 'refund' });

test('Action persists receipt, World and Journal atomically and replay survives reload/later revisions', async () => {
    const request = action(); const base = runtime.snapshot.revision.revisionId;
    const [first, repeated] = await Promise.all([world.dispatchAction(request), world.dispatchAction(request)]);
    expect(repeated).toEqual(first); expect(world.getState().hp).toBe(6);
    expect(first.baseRevisionId).toBe(base); expect(first.committedRevisionId).toBe(runtime.snapshot.revision.revisionId);
    expect(first.eventRefs).toEqual(world.getJournal().events.map(event => event.id));
    runtime.snapshot = await f.core.appendTimeline(h.handle, runtime.snapshot.session.sessionId, { role: 'user', content: 'Continue' });
    const later = runtime.snapshot.revision.revisionId;
    expect(await world.dispatchAction(request)).toEqual(first);
    expect(runtime.snapshot.revision.revisionId).toBe(later);
    await expect(world.dispatchAction({ ...request, args: { amount: 3 } })).rejects.toThrow(/idempotency/);
    await expect(world.dispatchAction({ ...request, idempotencyKey: 'stale' })).rejects.toThrow(/stale/);
});

test('server receipt replay is idempotent, protected against direct patches and restores with the branch', async () => {
    const request = action(); const sessionId = runtime.snapshot.session.sessionId;
    const before = runtime.snapshot;
    const receipt = await world.dispatchAction(request);
    const head = runtime.snapshot.revision.revisionId;
    const replay = await f.core.applyRuntimeCommit(h.handle, sessionId, { actionRequest: request, statePatch: {} }, { expectedRevisionId: request.expectedRevisionId });
    expect(replay.revision.revisionId).toBe(head);
    await expect(f.core.updateState(h.handle, sessionId, { atri_action_receipts: {} })).rejects.toThrow(/Reserved/);
    const original = await f.core.load(h.handle, sessionId, { revisionId: before.revision.revisionId });
    expect(original.states.atri_action_receipts).toBeUndefined();
    const loaded = await f.core.load(h.handle, sessionId);
    expect(loaded.states.atri_action_receipts.receipts[0]).toEqual(receipt);
    runtime.snapshot = await f.core.forkBranch(h.handle, sessionId, { revisionId: before.revision.revisionId, expectedRevisionId: head });
    expect(runtime.snapshot.states.atri_action_receipts).toBeUndefined();
    expect(world.getState().hp).toBe(8);
});

test('compensation is a new typed transaction, immutable original receipt and no double refund', async () => {
    const receipt = await world.dispatchAction(action());
    const refund = await world.compensateAction(receipt);
    expect(refund.compensates).toBe(receipt.receiptId); expect(refund.committedRevisionId).not.toBe(receipt.committedRevisionId);
    expect(world.getState().hp).toBe(8);
    expect(await world.compensateAction(receipt)).toEqual(refund);
    expect(world.getJournal().events).toHaveLength(2);
    await expect(world.dispatchAction({ actionId: 'buy', commandId: 'refund', args: { receiptId: receipt.receiptId }, expectedRevisionId: runtime.snapshot.revision.revisionId, idempotencyKey: 'another-refund', compensates: receipt.receiptId })).rejects.toThrow();
    expect(world.getState().hp).toBe(8);
});

test('invalid mutation args and simulations do not publish a Revision or receipt', async () => {
    const before = runtime.snapshot.revision.revisionId;
    await expect(world.dispatchAction({ ...action(), args: { amount: 100 } })).rejects.toThrow();
    const result = await world.simulateCommandInternal('damage', { amount: 2 });
    expect(result.afterState.hp).toBe(6); expect(world.getState().hp).toBe(8);
    expect(runtime.snapshot.revision.revisionId).toBe(before); expect(world.getActionReceipts()).toEqual([]);
});

test.each([
    raw => { raw.mutations[0].assign = { 'world[args.path]': 4 }; },
    raw => { raw.mutations[0].argsSchema.additionalProperties = true; },
    raw => { raw.mutations[0].assign.hp = { formula: 'rng.float()' }; },
    raw => { raw.mutations[0].script = 'main.js'; },
])('mutation shorthand rejects escapes before execution %#', mutate => {
    const raw = definition(); mutate(raw); expect(() => compileDeclarativeLogic(raw)).toThrow();
});

test('lowered mutation contains only existing executable-free Command/Event/Reducer IR', () => {
    const lowered = lowerDeclarativeMutations(definition());
    expect(lowered).not.toHaveProperty('mutations');
    expect(lowered.commands.find(item => item.id === 'damage').events[0].type).toBe('damage.applied');
    expect(compileDeclarativeLogic(lowered).commands).toHaveLength(2);
});
