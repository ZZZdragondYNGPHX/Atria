import { jest } from '@jest/globals';
import { prepareIndependent } from '../../public/shared/native-independent-preparation.js';
import { contextTokenCounter } from '../../public/scripts/native/exact-token-count.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { NativeSessionRuntime } from '../../public/scripts/native/session-runtime.js';
import { informationSnapshot } from './helpers/information-fixture.js';

test('fragment memo binds counter/scope and complete count is freshly serialized and non-additive', async () => {
    const count = jest.fn(async text => text === 'ab' ? 1 : text.length), memo = contextTokenCounter(count, 'owner/session/branch');
    expect(await memo('a')).toBe(1); expect(await memo('b')).toBe(1); expect(await memo('a')).toBe(1);
    expect(count).toHaveBeenCalledTimes(2);
    expect(await memo.complete('ab')).toBe(1); expect(await memo.complete('ab')).toBe(1);
    expect(count).toHaveBeenCalledTimes(4);
    expect(await contextTokenCounter(count, 'other-owner')('a')).toBe(1); expect(count).toHaveBeenCalledTimes(5);
    const other = jest.fn(async () => 7); expect(await contextTokenCounter(other, 'owner/session/branch')('a')).toBe(7);
});

test('Package Turn joins two independent transient stages in declaration order before Narrator', async () => {
    const base = informationSnapshot(), events = []; let narratorInput; base.entryPoint = {}; base.manifest = structuredClone(base.manifest);
    base.manifest.runtime.experienceContract.taskRuntime = { turn: { stages: ['one', 'two'], narratorTaskId: 'narrate' },
        tasks: ['one', 'two', 'narrate'].map(id => ({ id, variants: [{ id: 'v' }] })) };
    const host = new NativeGenerationHost({ sessionCore: { load: async () => base } });
    let release;
    const first = new Promise(resolve => { release = resolve; });
    host.executeTask = jest.fn(async (_owner, request) => {
        events.push(request.taskId);
        if (request.taskId === 'one') await first;
        if (request.taskId === 'two') release();
        if (request.taskId === 'narrate') narratorInput = request.input;
        return { record: { taskId: request.taskId, payload: request.taskId === 'narrate'
            ? { schemaVersion: 1, narrative: 'Joined', outcomes: [], diagnostics: [] } : request.taskId } };
    });
    const result = await host.prepareTurn('owner', { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, invocationId: 'parallel' }, undefined, undefined, () => {}, {});
    expect(narratorInput.stages).toEqual(['one', 'two']);
    expect(events).toEqual(['one', 'two', 'narrate']); expect(result.provenance.map(item => item.taskId)).toEqual(events);
});

test('failed preparation cancels and settles a sibling before returning, preventing Narrator', async () => {
    let settled = false, peak = 0, live = 0;
    await expect(prepareIndependent(['fail', 'wait', 'never'], async (item, _index, signal) => {
        live++; peak = Math.max(peak, live);
        try {
            if (item === 'fail') { await Promise.resolve(); throw new Error('required evidence failed'); }
            await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); settled = true;
        } finally { live--; }
    })).rejects.toThrow('required evidence failed');
    expect(settled).toBe(true); expect(live).toBe(0); expect(peak).toBe(2);
});

test('late Context compilation after closing Runtime cannot refill its Plan', async () => {
    const runtime = new NativeSessionRuntime(); runtime.snapshot = informationSnapshot();
    let resume; const pause = new Promise(resolve => { resume = resolve; });
    const pending = runtime.prepareContext({ modelContextLimit: 16000, responseReserve: 1000, countTokens: async text => { await pause; return text.length; } });
    await Promise.resolve(); runtime.snapshot = null; resume();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(runtime.lastContextPlan).toBeNull();
});
