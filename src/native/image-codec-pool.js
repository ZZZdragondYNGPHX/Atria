import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

const slots = new Set(), queue = [];
const capacity = Math.max(1, Math.min(4, availableParallelism() - 1));
let pendingBytes = 0;
export function runImageJob(payload) {
    const size = payload.bytes.byteLength;
    if (size > 32 * 1024 * 1024 || queue.length >= 32 || pendingBytes + size > 128 * 1024 * 1024) {
        return Promise.reject(Object.assign(new Error('Image processing capacity exceeded'), { code: 'native_visual_processing_busy' }));
    }
    // Own the transferable; the provider/caller may still retain its Buffer.
    const bytes = Uint8Array.from(payload.bytes);
    return new Promise((resolve, reject) => {
        pendingBytes += size; queue.push({ payload: { ...payload, bytes }, size, resolve, reject }); dispatch();
    });
}
function spawn() {
    const worker = new Worker(new URL('./image-codec-worker.js', import.meta.url), { execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 256 } });
    const slot = { worker, job: null, timer: null }; slots.add(slot);
    const retire = error => {
        if (!slots.delete(slot)) return;
        clearTimeout(slot.timer); worker.removeAllListeners('message');
        slot.job?.reject(error); slot.job = null; void worker.terminate(); dispatch();
    };
    worker.on('error', retire); worker.on('exit', code => retire(new Error('Image worker exited: ' + code)));
    worker.on('message', result => {
        const job = slot.job; slot.job = null; clearTimeout(slot.timer); worker.unref();
        if (result.error) job.reject(Object.assign(new Error(result.error.message), { code: result.error.code }));
        else {
            const bytes = result.value.bytes;
            job.resolve({ ...result.value, bytes: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) });
        }
        dispatch();
    });
    slot.retire = retire; worker.unref(); return slot;
}
function dispatch() {
    while (queue.length) {
        const slot = [...slots].find(item => !item.job) ?? (slots.size < capacity ? spawn() : null);
        if (!slot) return;
        const job = queue.shift(); pendingBytes -= job.size;
        slot.job = job; slot.worker.ref();
        slot.timer = setTimeout(() => slot.retire(new Error('Image processing timed out')), 30000);
        slot.worker.postMessage(job.payload, [job.payload.bytes.buffer]);
    }
}
