import { expect, test, jest } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import './_mocks/main-module-stack.js';
import { emptyProvenance, captureEpisodes } from '../../public/scripts/agents/memory/source-provenance.js';
import { createSourceLifecycle } from '../../public/scripts/agents/memory/source-lifecycle.js';
import { retrieveMemory } from '../../public/scripts/agents/memory/hybrid-retrieval.js';
import { resolveMemoryEligibility, eligibleMemorySnapshot } from '../../public/scripts/agents/memory/eligibility.js';
import { frozen, memoryFixture } from './hm1-fixture.js';
import { informationActor, informationOtherActor } from '../native/helpers/information-fixture.js';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
function fixture() {
    const chat = Array.from({ length: 20 }, (_, index) => ({ memory_os_source_id: 'h4-' + index, mes: `林澈在港口记录第${index}次巡逻。` }));
    let state = emptyProvenance(); state.scopeId = 'h4-' + crypto.randomUUID();
    captureEpisodes(state, chat, chat.map((_, index) => index), state.scopeId, 1000);
    const context = { key: state.scopeId, chat, enabled: true, getChatState: async () => ({ ok: true, state: structuredClone(state) }),
        updateChatState: async (_namespace, reducer) => { state = structuredClone(reducer(state)); return { ok: true }; } };
    const options = { getContext: () => context, resolveScope: ctx => ({ key: ctx.key, target: { key: ctx.key } }), enabled: ctx => ctx.enabled };
    const lifecycle = createSourceLifecycle(options), remote = new Map();
    const service = { listHashes: async () => [...remote.keys()], deleteByHashes: async ({ hashes }) => hashes.forEach(hash => remote.delete(hash)),
        insert: jest.fn(async ({ items }) => items.forEach(item => remote.set(item.hash, item))),
        query: async () => ({ metadata: [...remote.values()].map(item => item.metadata).concat({ id: 'foreign', fingerprint: 'forged' }) }) };
    return { context, options, lifecycle, service, opts: { service, profile: { source: 'test', model: 'h4' }, budget: 2400, countTokens: async text => text.length } };
}
test('H4 exact source proof reuses immutable corpus/hash only; recompute and JSON copies use the full path', async () => {
    const f = fixture();
    const first = await retrieveMemory(await f.lifecycle.retrievalSnapshot(f.context), '林澈在港口', f.opts);
    const snapshot = await f.lifecycle.retrievalSnapshot(f.context);
    const warm = await retrieveMemory(snapshot, '林澈在港口', f.opts);
    expect(first.reuse.status).toBe('miss'); expect(warm.reuse.status).toBe('valid_hit');
    expect(warm.metrics.work).toMatchObject({ documentsHashed: 0, hashReused: 20, embeddingTextsRequested: 1 });
    expect(warm.evidence).toEqual(first.evidence); expect(warm.text).toBe(first.text); expect(f.service.insert).toHaveBeenCalledTimes(1);
    const bypass = await retrieveMemory(snapshot, '林澈在港口', { ...f.opts, reuseDerived: false });
    expect(bypass.reuse.reason).toBe('manual_bypass'); expect(bypass.metrics.work.documentsHashed).toBe(20); expect(bypass.evidence).toEqual(warm.evidence);
    const copied = { ...snapshot, state: structuredClone(snapshot.state), chat: structuredClone(snapshot.chat) };
    const restored = await retrieveMemory(copied, '林澈在港口', f.opts);
    expect(restored.reuse.reason).toBe('authority_proof_unavailable'); expect(restored.metrics.work.documentsHashed).toBe(20);
    const restarted = createSourceLifecycle(f.options);
    expect((await retrieveMemory(await restarted.retrievalSnapshot(f.context), '林澈在港口', f.opts)).reuse.status).toBe('miss');
});
test('H4 cold read-only complete ledger issues original proof and reuses exact corpus without access writes', async () => {
    const f = fixture(); f.context.updateChatState = jest.fn(f.context.updateChatState);
    const cold = await retrieveMemory(await f.lifecycle.retrievalSnapshot(f.context, { readOnly: true }), '林澈在港口', f.opts);
    const warm = await retrieveMemory(await f.lifecycle.retrievalSnapshot(f.context, { readOnly: true }), '林澈在港口', f.opts);
    expect(cold.reuse).toMatchObject({ status: 'miss', reason: 'dependency_not_cached' });
    expect(warm.reuse.status).toBe('valid_hit');
    expect(warm.metrics.work).toMatchObject({ documentsHashed: 0, hashReused: 20 });
    expect(warm.evidence).toEqual(cold.evidence); expect(warm.text).toBe(cold.text);
    expect(f.context.updateChatState).not.toHaveBeenCalled(); expect(f.service.insert).toHaveBeenCalledTimes(1);
});
test('H4 read-only observed external ledger change rejects a warm corpus before service IO and rebuilds on new proof', async () => {
    const f = fixture(); f.service.query = jest.fn(f.service.query);
    await retrieveMemory(await f.lifecycle.retrievalSnapshot(f.context, { readOnly: true }), '林澈在港口', f.opts);
    const prior = await f.lifecycle.retrievalSnapshot(f.context, { readOnly: true });
    const warm = await retrieveMemory(prior, '林澈在港口', f.opts);
    expect(warm.reuse.status).toBe('valid_hit');
    const writer = createSourceLifecycle(f.options);
    await writer.correct(f.context, { action: 'entity', name: 'Other authority', type: 'Concept', reason: 'Another writer' },
        await writer.retrievalSnapshot(f.context));
    const current = await f.lifecycle.retrievalSnapshot(f.context, { readOnly: true });
    const calls = f.service.query.mock.calls.length;
    await expect(retrieveMemory(prior, '林澈在港口', f.opts)).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.service.query).toHaveBeenCalledTimes(calls);
    const rebuilt = await retrieveMemory(current, '林澈在港口', f.opts);
    expect(rebuilt.reuse.status).toBe('miss'); expect(rebuilt.metrics.work.documentsHashed).toBe(20);
    expect(rebuilt.evidence).toEqual(warm.evidence);
});
test('H4 time/profile/new ledger/late source changes reject stale reuse and forged vector metadata', async () => {
    const f = fixture();
    const snapshot = await f.lifecycle.retrievalSnapshot(f.context);
    await retrieveMemory(snapshot, '林澈在港口', f.opts);
    const changedProfile = await retrieveMemory(await f.lifecycle.retrievalSnapshot(f.context), '林澈在港口', { ...f.opts, profile: { source: 'test', model: 'changed' } });
    expect(changedProfile.metrics.work.documentsHashed).toBe(20); expect(changedProfile.metrics.work.hashReused).toBe(0);
    expect((await retrieveMemory(snapshot, '林澈在港口', { ...f.opts, at: 2 })).reuse.status).toBe('miss');
    f.context.chat[0].mes = '撤回港口记录'; f.lifecycle.observeMutation(f.context, 0);
    await expect(retrieveMemory(snapshot, '林澈在港口', f.opts)).rejects.toMatchObject({ name: 'AbortError' });
    const rebuilt = await retrieveMemory(await f.lifecycle.retrievalSnapshot(f.context), '林澈在港口', f.opts);
    expect(rebuilt.reuse.status).toBe('miss'); expect(rebuilt.sourceMessageIds).not.toContain('h4-0');
    expect(rebuilt.selected).not.toContain('foreign');
    const current = await f.lifecycle.retrievalSnapshot(f.context);
    f.service.query = async () => { f.context.chat[1].mes = 'Late deletion'; return { metadata: [] }; };
    await expect(retrieveMemory(current, '林澈在港口', f.opts)).rejects.toMatchObject({ name: 'AbortError' });
});
test('H4 native Information Actor/Branch domain isolates corpus proof and grant revocation rejects warm candidates', async () => {
    const f = memoryFixture(frozen.cases[4], { native: true });
    const information = f.snapshot.manifest.runtime.experienceContract.informationRuntime;
    information.actors.push({ ...structuredClone(information.actors[0]), id: informationOtherActor });
    information.views.push({ ...structuredClone(information.views.find(view => view.id === 'actor')), id: 'actor-other', actorId: informationOtherActor });
    await f.lifecycle.retrievalSnapshot(f.context);
    const legal = async actor => eligibleMemorySnapshot(await f.retrievalSnapshot(), resolveMemoryEligibility(f.context, { requester: { kind: 'actor', id: actor } }));
    const opts = { countTokens: async text => text.length, budget: 2400 };
    await retrieveMemory(await legal(informationActor), '秘密', opts);
    const warmSnapshot = await legal(informationActor);
    expect((await retrieveMemory(warmSnapshot, '秘密', opts)).reuse.status).toBe('valid_hit');
    const other = await retrieveMemory(await legal(informationOtherActor), '秘密', opts);
    expect(other.reuse.status).toBe('miss');
    f.snapshot.revision.branchId = 'other-branch';
    await expect(retrieveMemory(warmSnapshot, '秘密', opts)).rejects.toMatchObject({ name: 'AbortError' });
    expect((await retrieveMemory(await legal(informationActor), '秘密', opts)).reuse.status).toBe('miss');
    const fresh = await legal(informationActor);
    f.snapshot.manifest.runtime.experienceContract.informationRuntime.views.find(view => view.id === 'actor').memory = false;
    await expect(retrieveMemory(fresh, '秘密', opts)).rejects.toMatchObject({ name: 'AbortError' });
});
