import { spawn } from 'node:child_process';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { StringDecoder } from 'node:string_decoder';
import { assertJsonDeclaration, fields } from '../../../public/shared/native-values.js';

export const WINDOWS_SAPI_CAPABILITIES = Object.freeze({ plainText: true, rate: true, volume: true, prosody: false, phonemeTiming: false });
const MAX_WAV_BYTES = 16 * 1024 * 1024;
const error = code => Object.assign(new Error(code), { code });
const check = signal => { if (signal?.aborted) throw error('native_speech_cancelled'); };
const helper = fileURLToPath(new URL('./windows-sapi.ps1', import.meta.url));

function parseWav(bytes) {
    if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE'
        || bytes.readUInt32LE(4) !== bytes.length - 8) throw error('native_speech_audio_invalid');
    let offset = 12, format, dataBytes = 0;
    while (offset + 8 <= bytes.length) {
        const type = bytes.toString('ascii', offset, offset + 4), size = bytes.readUInt32LE(offset + 4), start = offset + 8;
        if (start + size > bytes.length) throw error('native_speech_audio_invalid');
        if (type === 'fmt ') {
            if (format || size < 16 || bytes.readUInt16LE(start) !== 1) throw error('native_speech_audio_invalid');
            format = { channels: bytes.readUInt16LE(start + 2), sampleRate: bytes.readUInt32LE(start + 4),
                byteRate: bytes.readUInt32LE(start + 8), blockAlign: bytes.readUInt16LE(start + 12), bitsPerSample: bytes.readUInt16LE(start + 14) };
        } else if (type === 'data') {
            if (dataBytes || !size) throw error('native_speech_audio_invalid');
            dataBytes = size;
        }
        offset = start + size + size % 2;
    }
    if (!format || !dataBytes || offset !== bytes.length || format.channels !== 1 || format.sampleRate !== 22050 || format.bitsPerSample !== 16
        || format.blockAlign !== 2 || format.byteRate !== 44100 || dataBytes % format.blockAlign) throw error('native_speech_audio_invalid');
    return { format, dataBytes, durationMs: dataBytes / format.byteRate * 1000 };
}

function subprocess(spawnImpl, input, signal, timeoutMs) {
    return new Promise((resolve, reject) => {
        check(signal);
        let child;
        try {
            child = spawnImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', helper],
                { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        } catch { reject(error('native_speech_unavailable')); return; }
        let primary, stdout = '', outputBytes = 0;
        const decoder = new StringDecoder('utf8');
        const stop = code => { if (!primary) primary = error(code); try { child.kill(); } catch { /* Wait for process close; never release a live worker. */ } };
        const abort = () => stop('native_speech_cancelled');
        signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(() => stop('native_speech_timeout'), timeoutMs);
        child.stdout.on('data', bytes => {
            outputBytes += bytes.length;
            if (outputBytes > 65536) stop('native_speech_response_invalid');
            else stdout += decoder.write(bytes);
        });
        // Diagnostics are intentionally discarded, never exposed with user text.
        child.stderr.on('data', () => {});
        child.stdin.on('error', () => stop('native_speech_provider_failed'));
        child.on('error', () => { primary ??= error('native_speech_unavailable'); });
        child.on('close', code => {
            clearTimeout(timer); signal?.removeEventListener('abort', abort);
            if (primary) { reject(primary); return; }
            stdout += decoder.end();
            let result;
            try { result = assertJsonDeclaration(JSON.parse(stdout.replace(/^\uFEFF/, '').trim()), 'SAPI response', 65536); } catch { reject(error('native_speech_response_invalid')); return; }
            if (code !== 0 || result.error) {
                reject(error(['native_speech_voice_unavailable', 'native_speech_request_invalid'].includes(result.error) ? result.error : 'native_speech_provider_failed')); return;
            }
            resolve(result);
        });
        if (signal?.aborted) abort();
        try { child.stdin.end(JSON.stringify(input)); } catch { stop('native_speech_provider_failed'); }
    });
}

export function createWindowsSapiProvider({ spawnImpl = spawn, platform = process.platform, tempRoot = tmpdir(), timeoutMs = 30000,
    maxBytes = MAX_WAV_BYTES } = {}) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000 || !Number.isSafeInteger(maxBytes) || maxBytes < 44 || maxBytes > MAX_WAV_BYTES) throw error('native_speech_request_invalid');
    const available = signal => { check(signal); if (platform !== 'win32') throw error('native_speech_unavailable'); };
    return Object.freeze({
        capabilities: WINDOWS_SAPI_CAPABILITIES,
        async listVoices({ signal } = {}) {
            available(signal);
            const result = await subprocess(spawnImpl, { action: 'listVoices' }, signal, timeoutMs);
            try {
                fields(result, ['voices'], 'SAPI voices');
                if (!Array.isArray(result.voices) || result.voices.length > 64) throw error('native_speech_response_invalid');
                const ids = new Set();
                return Object.freeze(result.voices.map(voice => {
                    fields(voice, ['voiceId', 'name', 'language'], 'SAPI voice');
                    if ([voice.voiceId, voice.name, voice.language].some(value => typeof value !== 'string' || !value || value.length > 1024) || ids.has(voice.voiceId)) throw error('native_speech_response_invalid');
                    ids.add(voice.voiceId); return Object.freeze(voice);
                }));
            } catch { throw error('native_speech_response_invalid'); }
        },
        async synthesize(raw, { signal } = {}) {
            available(signal);
            let request;
            try {
                request = assertJsonDeclaration(raw, 'SAPI request', 16384); fields(request, ['text', 'voiceId', 'rate', 'volume'], 'SAPI request');
                if (typeof request.text !== 'string' || !request.text.trim() || request.text.length > 2048 || request.text.includes('\0')
                    || typeof request.voiceId !== 'string' || !request.voiceId || request.voiceId.length > 1024
                    || !Number.isInteger(request.rate ?? 0) || (request.rate ?? 0) < -10 || (request.rate ?? 0) > 10
                    || !Number.isInteger(request.volume ?? 100) || (request.volume ?? 100) < 0 || (request.volume ?? 100) > 100) throw error('native_speech_request_invalid');
            } catch { throw error('native_speech_request_invalid'); }
            let directory, primary, output, cleanupFailed = false;
            const started = performance.now();
            try {
                directory = await mkdtemp(join(tempRoot, 'atria-sapi-')); check(signal);
                const outputPath = join(directory, 'speech.wav');
                const result = await subprocess(spawnImpl, { action: 'synthesize', text: request.text, voiceId: request.voiceId,
                    rate: request.rate ?? 0, volume: request.volume ?? 100, outputPath }, signal, timeoutMs);
                check(signal); fields(result, ['voiceId', 'voiceName', 'language', 'rate', 'volume', 'elapsedMs'], 'SAPI output');
                if (result.voiceId !== request.voiceId || result.rate !== (request.rate ?? 0) || result.volume !== (request.volume ?? 100)
                    || typeof result.voiceName !== 'string' || result.voiceName.length > 1024 || typeof result.language !== 'string' || result.language.length > 1024
                    || !Number.isFinite(result.elapsedMs) || result.elapsedMs < 0) throw error('native_speech_response_invalid');
                if ((await stat(outputPath)).size > maxBytes) throw error('native_speech_audio_limit');
                const bytes = await readFile(outputPath); check(signal);
                if (bytes.length > maxBytes) throw error('native_speech_audio_limit');
                const audio = parseWav(bytes);
                output = Object.freeze({ bytes, mediaType: 'audio/wav', voiceId: result.voiceId, voiceName: result.voiceName, language: result.language,
                    durationMs: audio.durationMs, elapsedMs: result.elapsedMs, totalElapsedMs: performance.now() - started,
                    format: Object.freeze(audio.format), dataBytes: audio.dataBytes, capabilities: WINDOWS_SAPI_CAPABILITIES });
            } catch (cause) { primary = cause.code?.startsWith('native_speech_') ? cause : error('native_speech_provider_failed'); throw primary; } finally {
                if (directory) try {
                    if (dirname(resolve(directory)) !== resolve(tempRoot) || !basename(directory).startsWith('atria-sapi-')) cleanupFailed = true;
                    else await rm(directory, { recursive: true, force: true });
                } catch { cleanupFailed = true; }
            }
            if (cleanupFailed && !primary) throw error('native_speech_cleanup_failed');
            return output;
        },
    });
}
