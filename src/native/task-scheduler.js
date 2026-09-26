import { randomUUID } from 'node:crypto';
import { immutable } from './model-prompt-runtime/execution-utils.js';

const terminal = new Set(['completed', 'failed', 'cancelled', 'stale']);
const failure = code => Object.assign(new Error(code), { code });

// Host-only transient projection. Session records are published by SessionCore.
// Workers that ignore abort retain their permits until they actually settle.
export class NativeTaskScheduler {
    constructor({ concurrency = 4, perResource = 2, queueLimit = 64, retention = 256, timeoutMs = 120000, retries = 1, backoffMs = 250 } = {}) {
        for (const value of [concurrency, perResource, queueLimit, retention, timeoutMs]) if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Invalid scheduler limit');
        Object.assign(this, { concurrency, perResource, queueLimit, retention, timeoutMs, retries, backoffMs });
        this.operations = new Map(); this.running = new Set(); this.queue = []; this.serial = 0;
    }
    project(owner, id) {
        const operation = this.operations.get(id);
        if (!operation || operation.owner !== owner) throw failure('operation_not_found');
        return immutable(operation.view);
    }
    cancel(owner, id, status = 'cancelled') {
        const operation = this.operations.get(id);
        if (!operation || operation.owner !== owner) throw failure('operation_not_found');
        if (terminal.has(operation.view.status) || operation.view.status === 'finalizing') return false;
        operation.view.status = status;
        operation.view.provisionalPresentation = '';
        operation.controller.abort(); operation.reject(failure('operation_' + status));
        if (!this.running.has(operation)) operation.cleanup();
        this.queue = this.queue.filter(item => item !== operation); this.drain(); return true;
    }
    submit({ owner, anchor, kind = 'model_task', executionClass, resources, key, fingerprint, supersede = false, retry = true, signal, run, finalize, fresh, onChunk }) {
        if (!['turn', 'model_task', 'auxiliary_task'].includes(kind)) throw failure('operation_kind_invalid');
        if (!['turn_blocking', 'interactive', 'background', 'maintenance'].includes(executionClass)) throw failure('operation_class_invalid');
        for (const operation of this.operations.values()) {
            if (operation.owner !== owner || operation.key !== key || terminal.has(operation.view.status)) continue;
            if (supersede && operation.view.status !== 'finalizing') this.cancel(owner, operation.view.operationId, 'stale');
            else if (operation.fingerprint === fingerprint) return operation.handle;
            else throw failure('operation_key_conflict');
        }
        if (signal?.aborted) throw failure('operation_cancelled');
        if (this.queue.length >= this.queueLimit) throw failure('operation_backpressure');
        for (const [id, operation] of this.operations) {
            if (this.operations.size < this.retention) break;
            if (terminal.has(operation.view.status) && !this.running.has(operation)) this.operations.delete(id);
        }
        if (this.operations.size >= this.retention) throw failure('operation_retention_limit');
        const operationId = randomUUID();
        const controller = new AbortController();
        let resolve, reject;
        const result = new Promise((yes, no) => { resolve = yes; reject = no; });
        // Cancellation can precede the caller attaching a handler.
        result.catch(() => {});
        const operation = { owner, key, fingerprint, retry, resources: [...new Set(resources)], controller, run, finalize, fresh, onChunk,
            resolve, reject, sequence: this.serial++, queuedAt: Date.now(),
            view: { operationId, kind, anchor, executionClass, status: 'queued', attempt: 0, provisionalPresentation: '', deliveryReceipt: null } };
        const abort = () => this.cancel(owner, operationId);
        signal?.addEventListener('abort', abort, { once: true });
        operation.cleanup = () => { clearTimeout(operation.timer); signal?.removeEventListener('abort', abort); };
        operation.handle = Object.freeze({ operationId, result });
        this.operations.set(operationId, operation);
        operation.timer = setTimeout(() => this.cancel(owner, operationId), this.timeoutMs);
        this.queue.push(operation); this.drain();
        return operation.handle;
    }
    drain() {
        const priority = { turn_blocking: 0, interactive: 1, background: 2, maintenance: 3 };
        this.queue.sort((a, b) => (priority[a.view.executionClass] - Math.floor((Date.now() - a.queuedAt) / 5000))
            - (priority[b.view.executionClass] - Math.floor((Date.now() - b.queuedAt) / 5000)) || a.sequence - b.sequence);
        while (this.running.size < this.concurrency) {
            const index = this.queue.findIndex(item => item.resources.every(resource => [...this.running].filter(active => active.resources.includes(resource)).length < this.perResource));
            if (index < 0) return;
            const operation = this.queue.splice(index, 1)[0];
            this.running.add(operation);
            void this.execute(operation);
        }
    }
    async execute(operation) {
        const { view, controller } = operation;
        const timer = operation.timer;
        const check = async () => {
            if (controller.signal.aborted) throw failure('operation_cancelled');
            if (!await operation.fresh()) { view.status = 'stale'; throw failure('operation_stale'); }
            if (controller.signal.aborted) throw failure('operation_cancelled');
        };
        try {
            let output;
            for (let attempt = 0; ; attempt++) {
                await check(); view.status = 'running'; view.attempt = attempt;
                try {
                    output = await operation.run({ signal: controller.signal, onChunk: chunk => {
                        if (controller.signal.aborted || terminal.has(view.status)) return;
                        if (typeof chunk.text !== 'string' || chunk.text.length > 65536 || !chunk.text.startsWith(view.provisionalPresentation)) throw failure('operation_stream_invalid');
                        view.status = 'streaming'; view.provisionalPresentation = chunk.text;
                        try { operation.onChunk?.(immutable({ ...chunk, operationId: view.operationId, provisional: true, attempt })); } catch { /* Observer only. */ }
                    } });
                    break;
                } catch (error) {
                    if (!operation.retry || controller.signal.aborted || attempt >= this.retries || error.code !== 'generation_provider_failed') throw error;
                    view.status = 'retrying'; view.provisionalPresentation = '';
                    try { operation.onChunk?.({ operationId: view.operationId, text: '', reset: true, provisional: true, attempt: attempt + 1 }); } catch { /* Observer only. */ }
                    await new Promise(resolve => {
                        const done = () => { clearTimeout(delay); controller.signal.removeEventListener('abort', done); resolve(); };
                        const delay = setTimeout(done, this.backoffMs * 2 ** attempt);
                        controller.signal.addEventListener('abort', done, { once: true });
                    });
                }
            }
            await check();
            view.deliveryReceipt = { kind: 'model_delivery', operationId: view.operationId, delivered: true };
            // Commit is an uninterruptible CAS boundary. Cancel never claims to undo it.
            view.status = 'finalizing'; clearTimeout(timer);
            const result = await operation.finalize(output, view.deliveryReceipt);
            view.status = 'completed'; view.provisionalPresentation = ''; operation.resolve(result);
        } catch (error) {
            if (!terminal.has(view.status)) view.status = error.code === 'native_session_head_conflict' ? 'stale' : 'failed';
            view.provisionalPresentation = ''; operation.reject(error);
        } finally {
            clearTimeout(timer); operation.cleanup(); this.running.delete(operation); this.drain();
        }
    }
}

export const nativeTaskScheduler = new NativeTaskScheduler();
