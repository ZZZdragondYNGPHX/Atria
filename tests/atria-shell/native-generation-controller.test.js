import { expect, jest, test } from '@jest/globals';
import { createNativeGenerationController } from '../../public/scripts/native/generation-controller.js';
import { nativePlayGenerationBusy } from '../../public/scripts/native/play-generation.js';

function fixture(run) {
    const scope = { sessionId: 'session', branchId: 'branch', revisionId: 'revision' };
    const runtime = { active: true, assertWritable: jest.fn(), snapshot: { session: { sessionId: scope.sessionId }, revision: { branchId: scope.branchId, revisionId: scope.revisionId } } };
    const host = { submitUser: jest.fn(), commitAssistant: jest.fn() };
    const controller = createNativeGenerationController({ runtime, host, run });
    return { runtime, host, controller, scope };
}

test('one operation keeps its lock through Stop cleanup and passes explicit input with exact scope', async () => {
    let finish, request;
    const f = fixture(args => { request = args; return new Promise(resolve => { finish = resolve; }); });
    const task = f.controller.generate('normal', { input: 'Read the inscription.', scope: f.scope });
    expect(request.input).toBe('Read the inscription.');
    await expect(f.controller.generate('normal', { scope: f.scope })).rejects.toMatchObject({ code: 'native_generation_busy' });
    expect(f.controller.cancel()).toBe(true);
    expect(f.controller.cancel()).toBe(false);
    expect(request.signal.aborted).toBe(true);
    expect(() => request.host.commitAssistant('normal', 'late')).toThrow(/cancelled/);
    expect(f.controller.isRunning()).toBe(true);
    finish(); await task;
    expect(f.controller.isRunning()).toBe(false);
});

test('a stale revision cannot start, and a late result cannot publish into another session', async () => {
    const run = jest.fn(async request => {
        f.runtime.snapshot.session.sessionId = 'other';
        request.host.commitAssistant('normal', 'old result');
    });
    const f = fixture(run);
    await expect(f.controller.generate('normal', { scope: { ...f.scope, revisionId: 'old' } })).rejects.toMatchObject({ code: 'native_generation_revision_conflict' });
    expect(run).not.toHaveBeenCalled();
    await expect(f.controller.generate('normal', { scope: f.scope })).rejects.toMatchObject({ code: 'native_generation_revision_conflict' });
    expect(f.host.commitAssistant).not.toHaveBeenCalled();
    expect(f.controller.isRunning()).toBe(false);
});

test('a host preparation failure releases the operation for a corrected retry', async () => {
    const f = fixture(jest.fn().mockRejectedValueOnce(new Error('preparation failed')).mockResolvedValue('ready'));
    await expect(f.controller.generate('normal', { scope: f.scope })).rejects.toThrow('preparation failed');
    expect(f.controller.isRunning()).toBe(false);
    await expect(f.controller.generate('normal', { scope: f.scope })).resolves.toBe('ready');
});

test('preparation can stop before input acceptance and UI remains busy until cleanup releases its owner', async () => {
    const f = fixture(); let prepare, finish, cleanupReached;
    const cleanup = new Promise(resolve => { cleanupReached = resolve; });
    const states = [];
    f.runtime.host = { isGenerating: () => f.controller.isRunning() };
    f.runtime.prepareGeneration = jest.fn(() => new Promise(resolve => { prepare = resolve; }));
    f.runtime.finalizeStoppedGeneration = jest.fn(async () => { f.runtime.generationProjection = { state: 'idle', text: '' }; });
    f.host.onState = value => states.push({ phase: value.state, busy: nativePlayGenerationBusy(f.runtime) });
    f.host.ended = jest.fn(() => new Promise(resolve => { finish = resolve; cleanupReached(); }));
    const task = f.controller.generate('normal', { input: 'An unaccepted thought', scope: f.scope });
    expect(states.at(-1)).toEqual({ phase: 'preparing', busy: true });
    f.controller.cancel(); expect(states.at(-1)).toEqual({ phase: 'cancelling', busy: true });
    prepare('normal'); await cleanup;
    expect(f.host.submitUser).not.toHaveBeenCalled(); expect(nativePlayGenerationBusy(f.runtime)).toBe(true);
    finish(); await expect(task).rejects.toMatchObject({ code: 'generation_cancelled' });
    expect(states.at(-1)).toEqual({ phase: 'idle', busy: false });
});
