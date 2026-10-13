import { spawn } from 'node:child_process';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fields, assertJsonDeclaration } from '../../../public/shared/native-values.js';
import { parseSpeechWav } from './speech-audio.js';

export const ESPEAK_CAPABILITIES = Object.freeze({ plainText: true, rate: true, volume: true, prosody: false, phonemeTiming: false });
const failure = code => Object.assign(new Error(code), { code });
const check = signal => { if (signal?.aborted) throw failure('native_speech_cancelled'); };

// Command/data paths are server installation options, never caller inputs.
// Public text is written to stdin; shell execution, SSML and playback are absent.
export function createEspeakProvider({ executable = process.env.ATRIA_ESPEAK_EXECUTABLE || 'espeak-ng',
    dataPath = process.env.ATRIA_ESPEAK_DATA_PATH, spawnImpl = spawn, timeoutMs = 30000, tempRoot = tmpdir() } = {}) {
    if (typeof executable !== 'string' || !executable || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000
        || dataPath !== undefined && typeof dataPath !== 'string') throw failure('native_speech_request_invalid');
    const execute = (args, input, signal) => new Promise((resolve, reject) => {
        check(signal); let child;
        try { child = spawnImpl(executable, [...(dataPath ? ['--path=' + dataPath] : []), ...args], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); } catch { reject(failure('native_speech_unavailable')); return; }
        let primary, bytes = 0; const chunks = [];
        const stop = code => { primary ??= failure(code); try { child.kill(); } catch { /* Release only on close. */ } };
        const abort = () => stop('native_speech_cancelled');
        signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(() => stop('native_speech_timeout'), timeoutMs);
        child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > 65536) stop('native_speech_response_invalid'); else chunks.push(chunk); });
        child.stderr.on('data', () => {}); child.stdin.on('error', () => stop('native_speech_provider_failed'));
        child.on('error', () => { primary ??= failure('native_speech_unavailable'); });
        child.on('close', code => {
            clearTimeout(timer); signal?.removeEventListener('abort', abort);
            if (primary || code !== 0) { reject(primary ?? failure('native_speech_provider_failed')); return; }
            try { resolve(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); } catch { reject(failure('native_speech_response_invalid')); }
        });
        if (signal?.aborted) abort(); child.stdin.end(input);
    });
    const listVoices = async ({ signal } = {}) => {
        const response = await execute(['--voices'], '', signal), voices = [], seen = new Set();
        for (const line of response.split(/\r?\n/).slice(1)) {
            if (!line.trim()) continue;
            const row = line.trim().split(/\s+/), language = row[1], name = row[3]?.replaceAll('_', ' '), file = row[4];
            if (!language || !name || !file || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(file) || seen.has(file)) throw failure('native_speech_response_invalid');
            seen.add(file); voices.push(Object.freeze({ voiceId: 'espeak:' + file, name, language }));
        }
        if (!voices.length || voices.length > 256) throw failure('native_speech_response_invalid');
        return Object.freeze(voices);
    };
    return Object.freeze({ id: 'espeak.ng', capabilities: ESPEAK_CAPABILITIES, listVoices,
        async synthesize(raw, { signal } = {}) {
            check(signal); let input;
            try {
                input = assertJsonDeclaration(raw, 'Speech request', 16384); fields(input, ['text', 'voiceId', 'rate', 'volume']);
                if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 2048 || input.text.includes('\0')
                    || typeof input.voiceId !== 'string' || !input.voiceId.startsWith('espeak:')
                    || !Number.isInteger(input.rate ?? 0) || Math.abs(input.rate ?? 0) > 10
                    || !Number.isInteger(input.volume ?? 100) || (input.volume ?? 100) < 0 || (input.volume ?? 100) > 100) throw failure('native_speech_request_invalid');
            } catch { throw failure('native_speech_request_invalid'); }
            const voice = (await listVoices({ signal })).find(voice => voice.voiceId === input.voiceId);
            if (!voice) throw failure('native_speech_voice_unavailable');
            const started = performance.now(), directory = await mkdtemp(join(tempRoot, 'atria-espeak-'));
            try {
                const output = join(directory, 'speech.wav'), rate = Math.max(80, Math.min(450, Math.round(175 * 1.1 ** (input.rate ?? 0))));
                await execute(['-b', '1', '-v', input.voiceId.slice(7), '-s', String(rate), '-a', String(input.volume ?? 100), '-w', output, '--stdin'], input.text, signal);
                check(signal); if ((await stat(output)).size > 16777216) throw failure('native_speech_audio_limit');
                const bytes = await readFile(output), audio = parseSpeechWav(bytes); check(signal);
                return Object.freeze({ ...audio, bytes, providerId: 'espeak.ng', voiceId: voice.voiceId, voiceName: voice.name, language: voice.language,
                    mediaType: 'audio/wav', elapsedMs: performance.now() - started, totalElapsedMs: performance.now() - started,
                    capabilities: ESPEAK_CAPABILITIES, format: Object.freeze(audio.format) });
            } finally { await rm(directory, { recursive: true, force: true }); }
        },
    });
}
