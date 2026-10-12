import express from 'express';
import request from 'supertest';
import { expect, test, jest } from '@jest/globals';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installCognitionFixture } from './helpers/cognition-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { SpeechService } from '../../src/native/speech-service.js';
import { NativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { createWindowsSapiProvider } from '../../src/native/adapters/windows-sapi-provider.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';

async function fixture(harness = makeTempFsEngineHarness, maxJobs = 32, provider) {
    const h = await harness();
    const f = await installCognitionFixture(h, 'limited', { intent: 'inform', sourceIds: ['speech-lines'] }, ({ contract }) => {
        const def = contract.informationRuntime;
        def.sources.push({ id: 'speech-lines', kind: 'timeline', semantic: 'narrative', scopeId: 'session', fields: [['content'], ['actorId']] });
        for (const view of def.views.filter(view => ['pov', 'player'].includes(view.id))) view.sources.push('speech-lines');
    });
    const base = await f.core.appendTimeline(h.handle, f.snapshot.session.sessionId,
        { role: 'assistant', actorId: f.actorId, content: '这是 Atria 的本地语音测试。' }, { expectedRevisionId: f.snapshot.revision.revisionId });
    const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/not-used' });
    const route = { ...seeded.routes[0], executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId],
        computeBudget: { maxRequests: 1, maxTokens: 4096, localWork: { maxJobs, maxItems: 10000, maxInputBytes: 16777216 } } } };
    await seeded.persistence.saveRuntimeRoute(h.handle, route);
    const host = { ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller };
    const scheduler = new NativeTaskScheduler(), speech = new SpeechService({ host, scheduler, ...(provider ? { provider } : {}) });
    const body = { sessionId: base.session.sessionId, revisionId: base.revision.revisionId,
        itemId: 'speech-lines:' + base.timeline.at(-1).messageId, voiceId: 'synthetic-voice', rate: 2, volume: 80 };
    return { h, f, host, scheduler, speech, body, base, route, cleanup: async () => {
        for (const record of scheduler.operations.values()) scheduler.cancel(h.handle, record.view.operationId);
        while (scheduler.running.size) await new Promise(resolve => setTimeout(resolve, 5));
        await h.cleanup();
    } };
}

const syntheticAudio = voiceId => ({ bytes: Buffer.from('local synthetic adapter fixture'), voiceId, voiceName: 'Fixture', language: '804', durationMs: 100,
    capabilities: { plainText: true, rate: true, volume: true, prosody: false, phonemeTiming: false } });
const providerFixture = () => ({ synthesize: jest.fn(async input => syntheticAudio(input.voiceId)), listVoices: jest.fn(async () => []) });

if (process.platform === 'win32') {
    test.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('S28 %s actual SAPI consumes a public original message, creates exact WAV and caches without replay or state publication', async (_kind, harness) => {
        const provider = createWindowsSapiProvider(), voices = await provider.listVoices(), voice = voices.find(voice => voice.language === '804') ?? voices[0];
        const f = await fixture(harness, 32, provider);
        try {
            f.body.voiceId = voice.voiceId;
            const started = await f.speech.start(f.h.handle, f.body), artifact = await f.scheduler.operations.get(started.operationId).handle.result;
            expect(artifact.voice.voiceId).toBe(voice.voiceId); expect(artifact.durationMs).toBeGreaterThan(0);
            expect(artifact.timing).toBe('total_duration_only'); expect(artifact.capabilities.phonemeTiming).toBe(false);
            const asset = await f.speech.assets.read(f.h.handle, artifact.asset.assetId);
            expect(asset.bytes.toString('ascii', 0, 4)).toBe('RIFF'); expect(asset.bytes.toString('ascii', 8, 12)).toBe('WAVE');
            expect(asset.bytes.length).toBeGreaterThan(44);
            expect(await f.f.core.load(f.h.handle, f.body.sessionId)).toEqual(f.base);
            const bank = await f.f.core.runs.status(f.h.handle, f.body.sessionId), ledger = Object.values(bank.operations).find(op => op.compute)?.compute;
            expect(ledger.attempts).toEqual([]);
            expect(ledger.localWork.map(work => work.kind)).toEqual(['context_build', 'speech_synthesis', 'speech_publish']);
            expect(ledger.localWork.every(work => work.status === 'settled' && work.usage.outcome === 'completed')).toBe(true);
            expect(await f.speech.start(f.h.handle, f.body)).toMatchObject({ operationId: started.operationId, cached: true });
            expect(await f.f.core.runs.status(f.h.handle, f.body.sessionId)).toEqual(bank);
            const rebuilt = new SpeechService({ host: { ...f.host }, scheduler: f.scheduler, provider });
            expect((await rebuilt.status(f.h.handle, { operationId: started.operationId })).artifact).toEqual(artifact);
            await expect(rebuilt.status('another-owner', { operationId: started.operationId })).rejects.toThrow(/operation_missing/);
        } finally { await f.cleanup(); }
    });
}

test('S28 absent local budget, private or caller supplied text cannot start audio and an exhausted bank never synthesizes', async () => {
    const provider = providerFixture(), f = await fixture(makeTempFsEngineHarness, 1, provider);
    try {
        expect(await f.speech.start(f.h.handle, { ...f.body, itemId: 'beliefs:other-private' })).toMatchObject({ status: 'fallback' });
        await expect(f.speech.start(f.h.handle, { ...f.body, text: 'caller private text' })).rejects.toThrow();
        const started = await f.speech.start(f.h.handle, f.body);
        await expect(f.scheduler.operations.get(started.operationId).handle.result).rejects.toThrow(/budget/);
        expect(provider.synthesize).not.toHaveBeenCalled(); expect((await f.speech.status(f.h.handle, { operationId: started.operationId })).fallback).toBe('text');
        await f.host.persistence.saveRuntimeRoute(f.h.handle, { ...f.route, executionPolicy: undefined });
        expect(await f.speech.start(f.h.handle, f.body)).toMatchObject({ status: 'fallback', reason: 'native_speech_budget_unavailable' });
    } finally { await f.cleanup(); }
});

test('S28 cancelled worker retains Scheduler permit until actual completion and retains failed local work without creating an asset', async () => {
    let release, entered; const began = new Promise(resolve => { entered = resolve; });
    const provider = providerFixture(); provider.synthesize.mockImplementation(input => { entered(); return new Promise(resolve => { release = () => resolve(syntheticAudio(input.voiceId)); }); });
    const f = await fixture(makeTempFsEngineHarness, 32, provider);
    try {
        const started = await f.speech.start(f.h.handle, f.body), worker = f.scheduler.operations.get(started.operationId);
        await began; expect(f.speech.cancel(f.h.handle, { operationId: started.operationId })).toEqual({ cancelled: true });
        await expect(worker.handle.result).rejects.toThrow(/cancelled/); expect(f.scheduler.running.has(worker)).toBe(true);
        release(); while (f.scheduler.running.has(worker)) await new Promise(resolve => setTimeout(resolve, 5));
        expect(await f.speech.assets.listRefs(f.h.handle)).toEqual([]);
        const bank = await f.f.core.runs.status(f.h.handle, f.body.sessionId), jobs = Object.values(bank.operations).flatMap(op => op.compute?.localWork ?? []);
        expect(jobs).toHaveLength(2); expect(jobs[1]).toMatchObject({ kind: 'speech_synthesis', status: 'settled', usage: { outcome: 'cancelled' } });
        expect(await f.f.core.load(f.h.handle, f.body.sessionId)).toEqual(f.base);
    } finally { release?.(); await f.cleanup(); }
});

test.each(['Route', 'revision'])('S28 changed %s during synthesis cannot publish audio; cost stays in the original bank', async kind => {
    const provider = providerFixture(), f = await fixture(makeTempFsEngineHarness, 32, provider);
    try {
        provider.synthesize.mockImplementation(async input => {
            if (kind === 'Route') await f.host.persistence.saveRuntimeRoute(f.h.handle, { ...f.route, displayName: 'Changed Route' });
            else await f.f.core.appendTimeline(f.h.handle, f.body.sessionId, { role: 'user', content: '进入下一回合。' }, { expectedRevisionId: f.body.revisionId });
            return syntheticAudio(input.voiceId);
        });
        const started = await f.speech.start(f.h.handle, f.body);
        await expect(f.scheduler.operations.get(started.operationId).handle.result).rejects.toThrow(/stale/);
        expect(await f.speech.assets.listRefs(f.h.handle)).toEqual([]);
        expect((await f.speech.status(f.h.handle, { operationId: started.operationId })).current).toBe(false);
        const bank = await f.f.core.runs.status(f.h.handle, f.body.sessionId);
        expect(Object.values(bank.operations).flatMap(op => op.compute?.localWork ?? []).length + (bank.retiredCompute?.localJobs ?? 0)).toBe(2);
        expect(Object.values(bank.operations).flatMap(op => op.compute?.attempts ?? []).length + (bank.retiredCompute?.modelAttempts ?? 0)).toBe(0);
    } finally { await f.cleanup(); }
});

if (process.platform === 'win32') {
    test('S28 HTTP authenticates and shares the real producer record across requests, rejecting fake audio and foreign owner', async () => {
        const f = await fixture(), provider = createWindowsSapiProvider();
        try {
            const voices = await provider.listVoices(); f.body.voiceId = voices[0].voiceId;
            const appFor = handle => { const app = express(); app.use(express.json()); if (handle) app.use((req, _res, next) => { req.user = { profile: { handle } }; next(); });
                app.use(createNativeGenerationRouter(() => f.host)); return app; };
            const app = appFor(f.h.handle);
            expect((await request(appFor(null)).post('/speech/start').send(f.body)).status).toBe(401);
            const started = await request(app).post('/speech/start').send(f.body);
            expect(started.status).toBe(200); expect(started.headers['cache-control']).toBe('no-store');
            let polled;
            do { polled = await request(app).post('/speech/status').send({ operationId: started.body.operationId });
                if (!['completed', 'failed', 'cancelled', 'stale'].includes(polled.body.status)) await new Promise(resolve => setTimeout(resolve, 10));
            } while (!['completed', 'failed', 'cancelled', 'stale'].includes(polled.body.status));
            expect(polled.body.status).toBe('completed'); expect(polled.body.artifact.asset.mediaType).toBe('audio/wav');
            expect((await request(app).post('/speech/status').send({ operationId: started.body.operationId, artifact: {} })).status).toBe(400);
            expect((await request(appFor('another-owner')).post('/speech/status').send({ operationId: started.body.operationId })).status).toBe(400);
        } finally { await f.cleanup(); }
    });
}

test('S28 concurrent duplicate requests retain the original shared artifact and expiry cleans its unreferenced asset', async () => {
    const provider = providerFixture(), f = await fixture(makeTempFsEngineHarness, 32, provider);
    try {
        let now = Date.now(); f.speech.now = () => now;
        let count = 0, release; const both = new Promise(resolve => { release = resolve; });
        const work = f.speech._work.bind(f.speech);
        jest.spyOn(f.speech, '_work').mockImplementation(async (...args) => {
            const result = await work(...args);
            if (args[2] === 'context_build') { if (++count === 2) release(); await both; }
            return result;
        });
        const [first, second] = await Promise.all([f.speech.start(f.h.handle, f.body), f.speech.start(f.h.handle, f.body)]);
        expect(first.operationId).toBe(second.operationId);
        const artifact = await f.scheduler.operations.get(first.operationId).handle.result;
        expect(provider.synthesize).toHaveBeenCalledTimes(1);
        expect((await f.speech.status(f.h.handle, { operationId: first.operationId })).artifact).toEqual(artifact);
        now += 600001;
        await expect(f.speech.status(f.h.handle, { operationId: first.operationId })).rejects.toThrow(/missing/);
        expect(await f.speech.assets.getRef(f.h.handle, artifact.asset.assetId)).toBeNull();
    } finally { await f.cleanup(); }
});

test('S28 expiry keeps an audio asset protected by the original Timeline authority and does not block future speech', async () => {
    const provider = providerFixture(), f = await fixture(makeTempFsEngineHarness, 32, provider);
    try {
        let now = Date.now(); f.speech.now = () => now;
        const started = await f.speech.start(f.h.handle, f.body), artifact = await f.scheduler.operations.get(started.operationId).handle.result;
        const next = await f.f.core.appendTimeline(f.h.handle, f.body.sessionId, { role: 'user', content: '保存这份语音。', metadata: { attachments: [{ assetId: artifact.asset.assetId }] } },
            { expectedRevisionId: f.body.revisionId });
        now += 600001;
        await expect(f.speech.status(f.h.handle, { operationId: started.operationId })).rejects.toThrow(/missing/);
        expect(await f.speech.assets.getRef(f.h.handle, artifact.asset.assetId)).toEqual(artifact.asset);
        const again = await f.speech.start(f.h.handle, { ...f.body, revisionId: next.revision.revisionId });
        expect(again.operationId).toBeDefined(); await f.scheduler.operations.get(again.operationId).handle.result;
    } finally { await f.cleanup(); }
});

test('S28 audio is discarded if original local settlement fails after AssetStore publication', async () => {
    const provider = providerFixture(), f = await fixture(makeTempFsEngineHarness, 32, provider);
    try {
        const settle = f.f.core.runs.settleLocalWork.bind(f.f.core.runs); let calls = 0;
        jest.spyOn(f.f.core.runs, 'settleLocalWork').mockImplementation((...args) => {
            if (++calls === 3) throw Object.assign(new Error('Local durable store unavailable'), { code: 'native_generation_attempt_conflict' });
            return settle(...args);
        });
        const started = await f.speech.start(f.h.handle, f.body);
        await expect(f.scheduler.operations.get(started.operationId).handle.result).rejects.toMatchObject({ code: 'native_generation_attempt_conflict' });
        expect(await f.speech.assets.listRefs(f.h.handle)).toEqual([]);
        const status = await f.speech.status(f.h.handle, { operationId: started.operationId });
        expect(status.artifact).toBeNull(); expect(status.fallback).toBe('text');
        const bank = await f.f.core.runs.status(f.h.handle, f.body.sessionId);
        expect(Object.values(bank.operations).flatMap(op => op.compute?.localWork ?? []).at(-1)).toMatchObject({ kind: 'speech_publish', status: 'charged' });
    } finally { await f.cleanup(); }
});

test('S28 another storage Engine with the same owner cannot read a speech producer record', async () => {
    const provider = providerFixture(), first = await fixture(makeTempFsEngineHarness, 32, provider), second = await fixture(makeTempFsEngineHarness, 32, provider);
    try {
        const started = await first.speech.start(first.h.handle, first.body); await first.scheduler.operations.get(started.operationId).handle.result;
        await expect(second.speech.status(first.h.handle, { operationId: started.operationId })).rejects.toThrow(/missing/);
    } finally { await first.cleanup(); await second.cleanup(); }
});

if (process.platform === 'win32') {
    test('S28 actual later public message retains the explicit exact voice while invalidating the previous source artifact', async () => {
        const provider = createWindowsSapiProvider(), voices = await provider.listVoices(), voice = voices.find(value => value.language === '804') ?? voices[0];
        const f = await fixture(makeTempFsEngineHarness, 32, provider);
        try {
            f.body.voiceId = voice.voiceId;
            const first = await f.speech.start(f.h.handle, f.body), before = await f.scheduler.operations.get(first.operationId).handle.result;
            const next = await f.f.core.appendTimeline(f.h.handle, f.body.sessionId, { role: 'assistant', actorId: f.f.actorId, content: '这是下一条公开文字。' },
                { expectedRevisionId: f.body.revisionId });
            const second = await f.speech.start(f.h.handle, { ...f.body, revisionId: next.revision.revisionId, itemId: 'speech-lines:' + next.timeline.at(-1).messageId });
            const after = await f.scheduler.operations.get(second.operationId).handle.result;
            expect(after.voice).toEqual(before.voice); expect(after.asset.assetId).not.toBe(before.asset.assetId);
            expect(after.text).toBe('这是下一条公开文字。'); expect(after.durationMs).toBeGreaterThan(0);
            expect(await f.speech.status(f.h.handle, { operationId: first.operationId })).toMatchObject({ current: false, artifact: null });
            expect(await f.speech.status(f.h.handle, { operationId: second.operationId })).toMatchObject({ current: true, artifact: after });
            const bank = await f.f.core.runs.status(f.h.handle, f.body.sessionId);
            expect(bank.retiredCompute).toMatchObject({ modelAttempts: 0, localJobs: 3 });
        } finally { await f.cleanup(); }
    });
}
