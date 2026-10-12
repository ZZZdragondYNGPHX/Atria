import { expect, test } from '@jest/globals';
import { createServer } from 'node:http';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installCognitionFixture } from './helpers/cognition-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { compileNativeContextPlan } from '../../public/scripts/native/context-compiler.js';

async function localFixture(harness = makeTempFsEngineHarness, expression = { intent: 'inform', sourceIds: ['beliefs'] }) {
    const h = await harness(), wire = [];
    let respond = (_body, response) => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ choices: [{ message: { content: '本地测试文字。' } }],
            usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 } }));
    };
    const server = createServer(async (request, response) => {
        let bytes = ''; for await (const chunk of request) bytes += chunk;
        wire.push(JSON.parse(bytes)); await respond(wire.at(-1), response);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const f = await installCognitionFixture(h, 'limited', expression);
    const seeded = await seedGenerationProfiles({ ...h, endpoint: `http://127.0.0.1:${server.address().port}/v1/chat/completions` });
    await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1,
        allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests: 4, maxTokens: 4096,
            localWork: { maxJobs: 32, maxItems: 10000, maxInputBytes: 16777216 } } } });
    const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller,
        providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'local-s27-fixture' } });
    const request = { role: 'narrator', sessionId: f.snapshot.session.sessionId, revisionId: f.snapshot.revision.revisionId, requestId: 's27-text' };
    return { h, f, host, request, wire, setRespond: value => { respond = value; }, cleanup: async () => {
        server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup();
    } };
}

test.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('S27 %s original Host sends one public text plan through the existing adapter and retains source and costs', async (_label, harness) => {
    const f = await localFixture(harness);
    try {
        const before = await f.f.core.load(f.h.handle, f.request.sessionId);
        const result = await f.host.execute(f.h.handle, f.request);
        const plan = result.snapshot.contextPlan.items.find(item => item.id === 'projection:expression:text');
        expect(plan).toBeDefined(); expect(plan.content).toContain('"intent":"inform"');
        expect(plan.content).toContain('林舟'); expect(plan.content).toContain('suspected');
        for (const hidden of ['真实身份是沈墨', '有人跟踪自己', '未署名信']) expect(plan.content).not.toContain(hidden);
        expect(JSON.stringify(f.wire[0])).toContain('Native text ExpressionPlan');
        expect(JSON.stringify(f.wire[0])).toContain('not a performed action');
        expect(f.wire).toHaveLength(1); expect(result.response.text).toBe('本地测试文字。');
        expect(await f.f.core.load(f.h.handle, f.request.sessionId)).toEqual(before);
        const bank = await f.f.core.runs.status(f.h.handle, f.request.sessionId);
        const ledgers = Object.values(bank.operations).map(operation => operation.compute).filter(Boolean);
        expect(ledgers.flatMap(ledger => ledger.attempts)).toEqual([expect.objectContaining({ status: 'settled', usage: expect.objectContaining({ totalTokens: 17 }) })]);
        expect(ledgers.flatMap(ledger => ledger.localWork).some(work => work.kind === 'context_build' && work.status === 'settled')).toBe(true);
    } finally { await f.cleanup(); }
});

test('S27 Actor and Task compilation do not receive narrator expression, and missing public support keeps the ordinary text fallback', async () => {
    const f = await localFixture();
    try {
        const options = { modelContextLimit: 16000, responseReserve: 512 };
        const base = f.f.snapshot;
        const actor = await compileNativeContextPlan(base, { ...options, target: { kind: 'actor', id: f.f.actorId } });
        const task = await compileNativeContextPlan(base, { ...options, informationTaskId: 'summarize' });
        for (const plan of [actor, task]) expect(plan.included.some(item => item.contextItemId === 'projection:expression:text')).toBe(false);
        await f.f.write('beliefs', 'alan-rumor', { actor: f.f.otherActorId });
        const result = await f.host.execute(f.h.handle, { ...f.request, revisionId: f.f.current().revision.revisionId });
        const expression = result.snapshot.contextPlan.items.find(item => item.id === 'projection:expression:text');
        expect(expression.content).toContain('"status":"fallback"');
        expect(expression.content).not.toContain('林舟');
        expect(result.response.text).toBe('本地测试文字。'); expect(f.wire).toHaveLength(1);
    } finally { await f.cleanup(); }
});

test('S27 source changes during the original transport refuse the stale text result and retain its reported cost', async () => {
    const f = await localFixture();
    try {
        f.setRespond(async (_body, response) => {
            await f.f.write('beliefs', 'alan-rumor', { text: '新公开传闻。' });
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ choices: [{ message: { content: '旧源表达结果。' } }], usage: { total_tokens: 17 } }));
        });
        await expect(f.host.execute(f.h.handle, f.request)).rejects.toThrow();
        expect(f.wire).toHaveLength(1);
        const current = await f.f.core.load(f.h.handle, f.request.sessionId);
        expect(JSON.stringify(current)).not.toContain('旧源表达结果。');
        const bank = await f.f.core.runs.status(f.h.handle, f.request.sessionId);
        expect(bank.retiredCompute).toMatchObject({ modelAttempts: 1, knownTotalTokens: 17 });
    } finally { await f.cleanup(); }
});

test('S27 cancellation uses the original transport without publishing text or refunding the sent attempt', async () => {
    const f = await localFixture(), controller = new AbortController();
    try {
        const before = await f.f.core.load(f.h.handle, f.request.sessionId);
        f.setRespond(async () => { controller.abort(); });
        await expect(f.host.execute(f.h.handle, f.request, controller.signal)).rejects.toThrow();
        expect(f.wire).toHaveLength(1);
        expect(await f.f.core.load(f.h.handle, f.request.sessionId)).toEqual(before);
        const bank = await f.f.core.runs.status(f.h.handle, f.request.sessionId);
        expect(Object.values(bank.operations).flatMap(operation => operation.compute?.attempts ?? []))
            .toHaveLength(1);
        expect(Object.values(bank.operations).flatMap(operation => operation.compute?.attempts ?? [])[0]).toMatchObject({ status: 'unknown', usage: null });
    } finally { await f.cleanup(); }
});

test('S27 undeclared expression retains the old compiler and transport path with no plan or additional send', async () => {
    const f = await localFixture(makeTempFsEngineHarness, null);
    try {
        const result = await f.host.execute(f.h.handle, f.request);
        expect(result.snapshot.contextPlan.items.some(item => item.id === 'projection:expression:text')).toBe(false);
        expect(result.response.text).toBe('本地测试文字。'); expect(f.wire).toHaveLength(1);
    } finally { await f.cleanup(); }
});
