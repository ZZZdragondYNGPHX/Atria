import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { PROVENANCE_NAMESPACE } from '../../public/scripts/agents/memory/source-lifecycle.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { RpRunControl, rpOperationInput } from '../../src/native/rp-run-control.js';

const memorySettings = { enabled: true, sourceWritesEnabled: false, memoryOsTokenBudget: 2400 };
describe.each(CONTRACT_HARNESSES)('$name original RP Memory producer', ({ make }) => {
    test('actual model reads original ChatRepo Memory, never a fabricated Session or new writer', async () => {
        const f = await rpModelFixture(make, { memorySettings, seedMemory: true });
        try {
            const before = hash(await f.chats.getState(f.h.handle, 'Actor', 'main', PROVENANCE_NAMESPACE));
            await f.run();
            expect(JSON.stringify(f.requests)).toContain('Original RP remembered context promise');
            expect(JSON.stringify(f.requests)).not.toContain('FUTURE FORBIDDEN MEMORY');
            expect(hash(await f.chats.getState(f.h.handle, 'Actor', 'main', PROVENANCE_NAMESPACE))).toBe(before);
            const compute = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(compute.localWork.filter(row => row.kind === 'context_build')).toHaveLength(1);
            expect(compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
        } finally { await f.cleanup(); }
    }, 60000);

    test('original Memory sidecars use the current Engine transaction without nested reads', async () => {
        const f = await rpModelFixture(make, { memorySettings, seedMemory: true });
        try {
            const chat = await f.chats.get(f.h.handle, 'Actor', 'main');
            const source = { input: rpOperationInput(chat.body[1], 1), purpose: 'narration', outputSlot: 'assistant' };
            const original = f.h.engine.withTransaction;
            await original.call(f.h.engine, f.h.handle, async tx => {
                f.h.engine.withTransaction = () => { throw new Error('unexpected_nested_transaction'); };
                try {
                    const context = await RpRunControl.prototype.memoryContext.call(f.control, f.h.handle, f.controlId, source, { tx });
                    expect(context.chat).toHaveLength(2);
                    expect(context.states[PROVENANCE_NAMESPACE].facts['rp-memory-fact'].text).toContain('remembered context promise');
                } finally { f.h.engine.withTransaction = original; }
            });
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['settings', 'ledger'])('%s changes during actual Provider HTTP withhold recall response without refund', async change => {
        const f = await rpModelFixture(make, { memorySettings, seedMemory: true });
        try {
            f.onResponse(async () => {
                if (change === 'settings') return new SettingsRepo({ engine: f.h.engine }).save(f.h.handle,
                    { atri_capabilities: { memory_graph: { ...memorySettings, recallEnabled: false } } });
                const state = await f.chats.getState(f.h.handle, 'Actor', 'main', PROVENANCE_NAMESPACE);
                state.facts['rp-memory-fact'].text = 'Independent original Memory update';
                await f.chats.setState(f.h.handle, 'Actor', 'main', PROVENANCE_NAMESPACE, state);
            });
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_memory_source_stale' });
            expect(f.requests).toHaveLength(1);
            expect(Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute.attempts[0])
                .toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    }, 60000);

    test('missing historical source IDs refuse recall before any model send', async () => {
        const f = await rpModelFixture(make, { memorySettings, seedMemory: true });
        try {
            const chat = await f.chats.get(f.h.handle, 'Actor', 'main'); delete chat.body[0].memory_os_source_id;
            await f.chats.save(f.h.handle, 'Actor', 'main', chat.header, chat.body, chat.integrity);
            await expect(f.run()).rejects.toMatchObject({ code: 'native_rp_source_unavailable' });
            expect(f.requests).toHaveLength(0);
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body[0].memory_os_source_id).toBeUndefined();
        } finally { await f.cleanup(); }
    }, 60000);
});
