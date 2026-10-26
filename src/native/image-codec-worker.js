import { parentPort } from 'node:worker_threads';
import { normalizeImage, canonicalMaskPng } from './adapters/image-codec.js';

parentPort.on('message', async job => {
    try {
        const bytes = Buffer.from(job.bytes.buffer, job.bytes.byteOffset, job.bytes.byteLength);
        const value = job.kind === 'normalize' ? await normalizeImage(bytes)
            : { bytes: canonicalMaskPng(bytes, job.width, job.height, job.alpha) };
        const output = Uint8Array.from(value.bytes);
        parentPort.postMessage({ value: { ...value, bytes: output } }, [output.buffer]);
    } catch (error) { parentPort.postMessage({ error: { message: error.message, code: error.code } }); }
});
