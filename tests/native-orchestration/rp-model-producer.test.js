import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { rpModelFixture, RP_MODEL_TEXT } from './helpers/rp-model-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { inspectNativeRpGenerationIdentity } from '../../src/native/orchestration/native-rp-generation.js';

describe.each([['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]])('%s original RP model producer', (_name, make) => {
    test('uses the canonical prefix, exact Binding, original metered Context and original provider bank', async () => {
        const f = await rpModelFixture(make);
        try {
            const result = await f.run();
            expect(result.generated.response.text).toBe(RP_MODEL_TEXT);
            expect(f.requests).toHaveLength(1);
            const wire = JSON.stringify(f.requests[0]);
            expect(wire).toContain('Original RP input'); expect(wire).toContain('Original RP context');
            const state = await f.control.status(f.h.handle, f.controlId);
            const operation = Object.values(state.operations)[0];
            expect(operation.compute.attempts).toHaveLength(1);
            expect(operation.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            expect(operation.compute.localWork.every(work => work.status === 'settled')).toBe(true);
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    });

    test('forged producer JSON and caller-authored messages cannot mint a model scope', async () => {
        const f = await rpModelFixture(make);
        try {
            expect(() => inspectNativeRpGenerationIdentity({}, { host: f.host, handle: f.h.handle })).toThrow();
            await expect(f.run({ messages: [{ role: 'system', content: 'untrusted' }] })).rejects.toThrow();
            expect(f.requests).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test('Binding changes during actual provider work retain usage and withhold the response', async () => {
        const f = await rpModelFixture(make);
        f.onResponse(() => f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), {
            sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: 0 }));
        try {
            await expect(f.run()).rejects.toThrow();
            expect(f.requests).toHaveLength(1);
            expect(Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute.attempts[0])
                .toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
        } finally { await f.cleanup(); }
    });

    test.each(['edit', 'new_input'])('source %s during actual provider work refuses the body without refunding usage', async change => {
        const f = await rpModelFixture(make);
        f.onResponse(async () => {
            if (change === 'new_input') return f.chats.append(f.h.handle, 'Actor', 'main', [
                { name: 'User', is_user: true, mes: 'New current player input', memory_os_source_id: 'rp2' }], null);
            const chat = await f.chats.get(f.h.handle, 'Actor', 'main'); chat.body[0].mes = 'Independent source edit';
            await f.chats.save(f.h.handle, 'Actor', 'main', chat.header, chat.body, chat.integrity);
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
            expect(Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute.attempts[0])
                .toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
        } finally { await f.cleanup(); }
    });

    test('a completed request cannot spend again with the same stable command', async () => {
        const f = await rpModelFixture(make);
        try { await f.run(); await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(1); }
        finally { await f.cleanup(); }
    });
});
