import { expect, jest, test } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn as realSpawn } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWindowsSapiProvider, WINDOWS_SAPI_CAPABILITIES } from '../../src/native/adapters/windows-sapi-provider.js';

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function fakeWorker() {
    const child = new EventEmitter(), input = deferred();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = jest.fn(() => true);
    let body = '';
    child.stdin.on('data', bytes => { body += bytes.toString('utf8'); });
    child.stdin.on('finish', () => input.resolve(JSON.parse(body)));
    return { child, input, spawn: jest.fn(() => child) };
}
function wav() {
    const bytes = Buffer.alloc(48);
    bytes.write('RIFF', 0); bytes.writeUInt32LE(40, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(22050, 24); bytes.writeUInt32LE(44100, 28);
    bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(4, 40); bytes.writeInt16LE(1500, 44);
    return bytes;
}
const synthetic = { text: '本地语音测试。', voiceId: 'exact.fixture.voice', rate: 0, volume: 80 };

if (process.platform === 'win32') {
    test('S28 actual Windows SAPI emits a nonempty PCM WAV for an exact installed voice without playing or retaining a temporary file', async () => {
        const root = await mkdtemp(join(tmpdir(), 'atria-speech-test-'));
        try {
            const provider = createWindowsSapiProvider({ tempRoot: root }), voices = await provider.listVoices();
            expect(voices.length).toBeGreaterThan(0);
            const voice = voices.find(item => item.language === '804') ?? voices[0];
            const result = await provider.synthesize({ text: '这是 Atria 的本地语音测试。', voiceId: voice.voiceId, rate: 2, volume: 80 });
            expect(result.voiceId).toBe(voice.voiceId); expect(result.voiceName).toBe(voice.name);
            expect(result.bytes.toString('ascii', 0, 4)).toBe('RIFF'); expect(result.bytes.toString('ascii', 8, 12)).toBe('WAVE');
            expect(result.dataBytes).toBeGreaterThan(0); expect(result.bytes.subarray(44).some(byte => byte !== 0)).toBe(true);
            expect(result.durationMs).toBeGreaterThan(0); expect(result.elapsedMs).toBeGreaterThanOrEqual(0); expect(result.totalElapsedMs).toBeGreaterThan(result.elapsedMs);
            expect(result.format).toMatchObject({ sampleRate: 22050, channels: 1, bitsPerSample: 16 });
            expect(result.capabilities).toEqual(WINDOWS_SAPI_CAPABILITIES); expect(result.capabilities.phonemeTiming).toBe(false);
            expect(await readdir(root)).toEqual([]);
            await expect(provider.synthesize({ ...synthetic, voiceId: 'not-an-installed-voice' })).rejects.toMatchObject({ code: 'native_speech_voice_unavailable' });
            expect(await readdir(root)).toEqual([]);
        } finally { await rm(root, { recursive: true, force: true }); }
    }, 30000);
    test('S28 actual Windows subprocess cancellation kills a spawned helper and waits for real close before settling and cleaning temporary files', async () => {
        const root = await mkdtemp(join(tmpdir(), 'atria-speech-test-')), controller = new AbortController(), events = [];
        let worker, kill;
        const spawn = jest.fn((...args) => {
            worker = realSpawn(...args);
            const terminate = worker.kill.bind(worker);
            kill = jest.spyOn(worker, 'kill').mockImplementation((...input) => { events.push('kill'); return terminate(...input); });
            worker.once('spawn', () => { events.push('spawn'); controller.abort(); });
            worker.once('close', () => { events.push('close'); });
            return worker;
        });
        try {
            const provider = createWindowsSapiProvider({ spawnImpl: spawn, tempRoot: root });
            const result = provider.synthesize(synthetic, { signal: controller.signal });
            void result.then(() => { events.push('settled'); }, () => { events.push('settled'); });
            await expect(result).rejects.toMatchObject({ code: 'native_speech_cancelled' });
            expect(spawn).toHaveBeenCalledTimes(1); expect(worker.pid).toBeGreaterThan(0); expect(worker.killed).toBe(true);
            expect(kill.mock.results.some(item => item.type === 'return' && item.value === true)).toBe(true);
            expect(events[0]).toBe('spawn'); expect(events.indexOf('kill')).toBeLessThan(events.indexOf('close'));
            expect(events.indexOf('close')).toBeLessThan(events.indexOf('settled')); expect(await readdir(root)).toEqual([]);
        } finally { if (worker && !events.includes('close')) worker.kill(); await rm(root, { recursive: true, force: true }); }
    }, 30000);
} else {
    // Native evidence stays explicitly unavailable rather than replaced by mocks.
    // eslint-disable-next-line jest/no-disabled-tests, jest/expect-expect
    test.skip('S28 actual Windows SAPI requires Windows; no synthetic output substitutes for unavailable native speech', () => {});
}

test('S28 request limits and unsupported platforms reject before subprocess creation', async () => {
    const spawn = jest.fn(), provider = createWindowsSapiProvider({ platform: 'win32', spawnImpl: spawn });
    for (const request of [{ ...synthetic, text: '' }, { ...synthetic, text: 'a'.repeat(2049) }, { ...synthetic, rate: 11 },
        { ...synthetic, volume: -1 }, { ...synthetic, ssml: '<speak>hidden</speak>' }, { ...synthetic, text: 'x\0y' }]) {
        await expect(provider.synthesize(request)).rejects.toMatchObject({ code: 'native_speech_request_invalid' });
    }
    const stopped = new AbortController(); stopped.abort();
    await expect(provider.synthesize(synthetic, { signal: stopped.signal })).rejects.toMatchObject({ code: 'native_speech_cancelled' });
    await expect(createWindowsSapiProvider({ platform: 'linux', spawnImpl: spawn }).listVoices()).rejects.toMatchObject({ code: 'native_speech_unavailable' });
    expect(spawn).not.toHaveBeenCalled();
});

test('S28 simulated cancellation kills the worker and waits for process close before cleaning the private output directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'atria-speech-test-')), worker = fakeWorker(), controller = new AbortController();
    try {
        const provider = createWindowsSapiProvider({ platform: 'win32', spawnImpl: worker.spawn, tempRoot: root });
        const promise = provider.synthesize(synthetic, { signal: controller.signal });
        let settled = false; void promise.then(() => { settled = true; }, () => { settled = true; });
        const request = await worker.input.promise; await writeFile(request.outputPath, 'partial synthetic bytes');
        expect(worker.spawn.mock.calls[0][2]).toMatchObject({ windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        expect(worker.spawn.mock.calls[0][1]).not.toContain(synthetic.text);
        controller.abort(); await Promise.resolve();
        expect(worker.child.kill).toHaveBeenCalledTimes(1); expect(settled).toBe(false);
        expect((await readdir(root)).length).toBe(1); expect((await readFile(request.outputPath)).length).toBeGreaterThan(0);
        worker.child.emit('close', null);
        await expect(promise).rejects.toMatchObject({ code: 'native_speech_cancelled' }); expect(await readdir(root)).toEqual([]);
    } finally { worker.child.emit('close', null); await rm(root, { recursive: true, force: true }); }
});

test('S28 simulated timeout retains the live worker boundary until close and preserves the timeout error over incomplete WAV diagnostics', async () => {
    const root = await mkdtemp(join(tmpdir(), 'atria-speech-test-')), worker = fakeWorker(), killed = deferred();
    worker.child.kill.mockImplementation(() => { killed.resolve(); return true; });
    try {
        const promise = createWindowsSapiProvider({ platform: 'win32', spawnImpl: worker.spawn, tempRoot: root, timeoutMs: 20 }).synthesize(synthetic);
        let settled = false; void promise.then(() => { settled = true; }, () => { settled = true; });
        const request = await worker.input.promise; await writeFile(request.outputPath, 'incomplete');
        await killed.promise;
        expect(settled).toBe(false); expect((await readdir(root)).length).toBe(1);
        worker.child.stdout.write('invalid response'); worker.child.emit('close', null);
        await expect(promise).rejects.toMatchObject({ code: 'native_speech_timeout' }); expect(await readdir(root)).toEqual([]);
    } finally { worker.child.emit('close', null); await rm(root, { recursive: true, force: true }); }
});

test('S28 simulated output enforces WAV byte limits and exact voice provenance while passing plain markup as stdin data', async () => {
    for (const failure of ['voice', 'size']) {
        const root = await mkdtemp(join(tmpdir(), 'atria-speech-test-')), worker = fakeWorker();
        try {
            const promise = createWindowsSapiProvider({ platform: 'win32', spawnImpl: worker.spawn, tempRoot: root, maxBytes: failure === 'size' ? 44 : 1024 })
                .synthesize({ ...synthetic, text: '<speak>只是普通文字</speak>' });
            const request = await worker.input.promise; await writeFile(request.outputPath, wav());
            expect(request.text).toBe('<speak>只是普通文字</speak>');
            worker.child.stdout.write(JSON.stringify({ voiceId: failure === 'voice' ? 'different.voice' : synthetic.voiceId,
                voiceName: 'Synthetic voice', language: '804', rate: 0, volume: 80, elapsedMs: 1 }));
            worker.child.emit('close', 0);
            await expect(promise).rejects.toMatchObject({ code: failure === 'voice' ? 'native_speech_response_invalid' : 'native_speech_audio_limit' });
            expect(await readdir(root)).toEqual([]);
        } finally { worker.child.emit('close', null); await rm(root, { recursive: true, force: true }); }
    }
});
