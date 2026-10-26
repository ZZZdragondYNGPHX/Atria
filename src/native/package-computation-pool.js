import { fork } from 'node:child_process';
import { computationPolicy } from './computation-policy.js';

// Keep capacity for I/O, persistence and the UI. Parallelize independent calls;
// transaction ordering and revision checks remain with the existing authority.
const workers = new Set(), queue = [];
let queuedBytes = 0;

export function runComputationJob(payload, { signal } = {}) {
    const bytes = payload.bytes;
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('Computation cancelled'));
    if (queue.length >= 64 || queuedBytes + bytes > payload.limits.computationQueueBytes) {
        return Promise.reject(Object.assign(new Error('World computation queue is full'), { code: 'computation_busy' }));
    }
    return new Promise((resolve, reject) => {
        const job = { payload, bytes, resolve, reject, cleanup: () => signal?.removeEventListener('abort', abort) };
        const abort = () => {
            const error = signal.reason ?? new Error('Computation cancelled');
            const index = queue.indexOf(job);
            if (index >= 0) { queue.splice(index, 1); queuedBytes -= bytes; job.cleanup(); reject(error); } else {
                const slot = [...workers].find(item => item.job === job);
                if (slot) retire(slot, error);
            }
        };
        signal?.addEventListener('abort', abort, { once: true });
        queue.push(job); queuedBytes += bytes;
        dispatch();
    });
}

function spawn() {
    const worker = fork(new URL('./package-computation-worker.js', import.meta.url), [], {
        execArgv: ['--no-node-snapshot'], serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const slot = { worker, job: null, timer: null, programs: new Set() };
    workers.add(slot);
    worker.on('message', result => {
        const job = slot.job;
        if (!job) return;
        job.cleanup();
        clearTimeout(slot.timer); slot.timer = null; slot.job = null;
        slot.programs = new Set(result.programs);
        worker.unref(); worker.channel?.unref();
        if (result.error) job.reject(Object.assign(new TypeError(result.error.message), { code: result.error.code }));
        else job.resolve(result.value);
        dispatch();
    });
    worker.on('error', error => retire(slot, error));
    worker.on('exit', code => retire(slot, new Error('World computation worker exited: ' + code)));
    worker.unref(); worker.channel.unref();
    return slot;
}

function retire(slot, error) {
    if (!workers.delete(slot)) return;
    slot.worker.removeAllListeners('message');
    clearTimeout(slot.timer);
    slot.job?.cleanup(); slot.job?.reject(error); slot.job = null;
    slot.worker.kill();
    dispatch();
}

function dispatch() {
    while (queue.length) {
        const hash = queue[0].payload.resourceHash;
        const slot = [...workers].find(item => !item.job && item.programs.has(hash))
            ?? [...workers].find(item => !item.job) ?? (workers.size < computationPolicy().workers ? spawn() : null);
        if (!slot) return;
        const job = queue.shift(); queuedBytes -= job.bytes;
        slot.job = job; slot.worker.ref(); slot.worker.channel.ref();
        // Guest interruption is the normal deadline. This also covers a broken
        // worker/engine so a queued transaction cannot wait indefinitely.
        slot.timer = setTimeout(() => retire(slot, Object.assign(new Error('World computation timed out'),
            { code: 'computation_timeout' })), job.payload.limits.computationWallMs + 5000);
        const { artifact, ...request } = job.payload;
        try {
            slot.worker.send({ ...request, ...(slot.programs.has(request.resourceHash) ? {} : { artifact }) }, error => { if (error) retire(slot, error); });
        } catch (error) { retire(slot, error); }
    }
}
