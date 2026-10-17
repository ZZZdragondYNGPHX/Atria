import { assertNativeId } from './identity.js';
import { randomUUID } from 'node:crypto';
import { NATIVE_GENERATION_DEFAULTS } from '../../public/shared/native-generation-defaults.js';
import { immutable } from './model-prompt-runtime/execution-utils.js';
import { hashNativeDocument } from './repositories/common.js';

const terminal = new Set(['completed', 'failed', 'cancelled', 'stale']);
const failure = code => Object.assign(new Error(code), { code });
const boundaries = new WeakMap();
const finalizationBoundaries = new WeakMap();
const operationGroups = new WeakMap();
const operationCompletions = new WeakMap();
const resourceSet = resources => [...new Set(resources)].sort();

function assertOperationFrame(scheduler, boundary, captured, expected, statuses) {
    const operation = captured?.operation, fields = ['owner', 'anchor', 'kind', 'executionClass', 'key', 'fingerprint', 'resources'];
    if (!captured || captured.scheduler !== scheduler || !expected || Object.keys(expected).some(key => !fields.includes(key))
        || fields.some(key => !Object.hasOwn(expected, key)) || !Array.isArray(expected.resources)
        || expected.resources.some(value => typeof value !== 'string') || scheduler.operations.get(operation.view.operationId) !== operation
        || !scheduler.running.has(operation) || !statuses.includes(operation.view.status) || operation.view.attempt !== captured.attempt
        || !operation.controller || operation.controller.signal !== boundary.signal || boundary.signal.aborted
        || operation.owner !== expected.owner || operation.view.kind !== expected.kind || operation.view.executionClass !== expected.executionClass
        || operation.key !== expected.key || operation.fingerprint !== expected.fingerprint
        || hashNativeDocument(operation.view.anchor) !== hashNativeDocument(expected.anchor)
        || hashNativeDocument(resourceSet(operation.resources)) !== hashNativeDocument(resourceSet(expected.resources))) throw failure('operation_boundary_denied');
    return Object.freeze({ ...immutable({ operationId: operation.view.operationId, owner: operation.owner,
        anchor: operation.view.anchor, kind: operation.view.kind, executionClass: operation.view.executionClass,
        key: operation.key, fingerprint: operation.fingerprint, resources: resourceSet(operation.resources), attempt: captured.attempt }), signal: boundary.signal });
}

// Host-only transient projection. Session records are published by SessionCore.
// Workers that ignore abort retain their permits until they actually settle.
export class NativeTaskScheduler {
    #submittingGroup = null;
    constructor({ concurrency = 4, perResource = 2, queueLimit = 64, retention = 256, timeoutMs = NATIVE_GENERATION_DEFAULTS.timeoutMs, retries = 1, backoffMs = 250 } = {}) {
        for (const value of [concurrency, perResource, queueLimit, retention, timeoutMs]) if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Invalid scheduler limit');
        Object.assign(this, { concurrency, perResource, queueLimit, retention, timeoutMs, retries, backoffMs });
        this.operations = new Map(); this.running = new Set(); this.suspended = new Set(); this.queue = []; this.serial = 0;
    }
    hasSessionWork(owner, sessionId) {
        return [...this.operations.values()].some(operation => operation.owner === owner && operation.view.anchor?.sessionId === sessionId
            && (!terminal.has(operation.view.status) || this.running.has(operation) || this.suspended.has(operation)));
    }
    hasOwnerWork(owner) { return [...this.operations.values()].some(operation => operation.owner === owner && (!terminal.has(operation.view.status) || this.running.has(operation) || this.suspended.has(operation))); }
    hasProjectWork(owner, projectId) { return [...this.operations.values()].some(operation => operation.owner === owner && operation.view.anchor?.projectId === projectId && (!terminal.has(operation.view.status) || this.running.has(operation) || this.suspended.has(operation))); }
    hasForegroundWork(owner) {
        return [...this.running, ...this.suspended, ...this.queue].some(item => (owner === undefined || item.owner === owner)
            && ['turn_blocking', 'interactive'].includes(item.view.executionClass));
    }
    assertActiveBoundary(boundary, expected) {
        return assertOperationFrame(this, boundary, boundaries.get(boundary), expected, ['running', 'streaming']);
    }

    // Read-only navigation metadata, attached only by the actual domain worker
    // after its durable Root exists; it grants no continuation or output right.
    associateRun(boundary, expected, runId) {
        this.assertActiveBoundary(boundary, expected);
        assertNativeId(runId, 'orchestrationRun');
        const { operation } = boundaries.get(boundary);
        if (operation.view.runId && operation.view.runId !== runId) throw failure('operation_run_conflict');
        operation.view.runId = runId;
    }

    /** Output finalization only. It cannot validate a running-generation boundary. */
    assertFinalizationBoundary(capture, executionBoundary, expected) {
        const finalized = finalizationBoundaries.get(capture), execution = boundaries.get(executionBoundary);
        if (!finalized || finalized.scheduler !== this || finalized.executionBoundary !== executionBoundary
            || !execution || execution.scheduler !== this || finalized.operation !== execution.operation || finalized.attempt !== execution.attempt)
            throw failure('operation_finalization_boundary_denied');
        try { return assertOperationFrame(this, executionBoundary, execution, expected, ['finalizing']); } catch (error) { if (error.code === 'operation_boundary_denied') throw failure('operation_finalization_boundary_denied'); throw error; }
    }
    /** Scheduling only: the domain must authorize its durable child before calling. */
    async withResourceHandoff(boundary, expected, child) {
        return (await this.withResourceFanout(boundary, expected, [child], { maxConcurrency: 1 }))[0];
    }
    /** The passive callback only decides the original durable Join. Model
     * work resumes after reacquiring the real parent permit. Unselected
     * workers retain theirs; wait() yields before the final domain write. */
    async withResourceFanout(boundary, expected, children, { maxConcurrency, timeoutMs = this.timeoutMs, until = null, deadlineAt = null, onSettled = null } = {}) {
        const parent = this.assertActiveBoundary(boundary, expected);
        expected = immutable(Object.fromEntries(['owner', 'anchor', 'kind', 'executionClass', 'key', 'fingerprint', 'resources'].map(field => [field, parent[field]])));
        const allowed = ['kind', 'executionClass', 'resources', 'key', 'fingerprint', 'run', 'finalize', 'fresh'];
        const keys = new Set();
        if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1 || !Array.isArray(children) || !children.length
            || until !== null && typeof until !== 'function' || onSettled !== null && typeof onSettled !== 'function'
            || deadlineAt !== null && (!until || !Number.isSafeInteger(deadlineAt) || deadlineAt < 0)) throw failure('operation_handoff_denied');
        for (const child of children) {
            if (!child || Object.keys(child).some(key => !allowed.includes(key)) || child.key === expected.key
                || typeof child.key !== 'string' || !child.key || keys.has(child.key) || typeof child.fingerprint !== 'string' || !child.fingerprint
                || !Array.isArray(child.resources) || !child.resources.length || child.resources.some(resource => !expected.resources.includes(resource))
                || child.executionClass !== expected.executionClass || !['model_task', 'auxiliary_task'].includes(child.kind)
                || ['run', 'finalize', 'fresh'].some(key => typeof child[key] !== 'function')) throw failure('operation_handoff_denied');
            if ([...this.operations.values()].some(item => item.owner === expected.owner && item.key === child.key)) throw failure('operation_handoff_duplicate');
            keys.add(child.key);
        }
        const operation = boundaries.get(boundary).operation, group = { maxConcurrency, pauseForDecision: !!until, paused: false }, submitted = [];
        const suspend = () => {
            this.suspended.add(operation); this.running.delete(operation);
            if (!boundary.signal.aborted) operation.view.status = 'waiting_child';
            operation.view.provisionalPresentation = ''; this.drain();
        };
        const resume = async () => {
            if (boundary.signal.aborted) return;
            await new Promise((resolve, reject) => {
                const abort = () => reject(failure('operation_cancelled'));
                boundary.signal.addEventListener('abort', abort, { once: true });
                operation.resume = () => { boundary.signal.removeEventListener('abort', abort); resolve(); };
                operation.view.status = 'queued'; this.queue.push(operation); this.drain();
            });
            this.suspended.delete(operation); delete operation.resume;
            this.assertActiveBoundary(boundary, expected);
        };
        suspend();
        let admissionError, callbackError, finished = false, revision = 0, wake = null;
        const results = [], cancelRemaining = () => { for (const item of submitted) this.cancel(expected.owner, item.handle.operationId); };
        const notify = () => { revision++; wake?.(); };
        let settled;
        const wait = async () => {
            try {
                if (!finished) { group.pauseForDecision = false; group.paused = false; suspend(); await settled; await resume(); }
                return results;
            } finally { this.suspended.delete(operation); delete operation.resume; }
        };
        const cancelPending = () => {
            const cancelled = [];
            for (const [index, item] of submitted.entries()) {
                const child = this.operations.get(item.handle.operationId);
                if (this.queue.includes(child) && !this.running.has(child) && !this.suspended.has(child) && this.cancel(expected.owner, item.handle.operationId)) cancelled.push(index);
            }
            return cancelled;
        };
        try {
            for (const child of children) {
                try {
                    this.#submittingGroup = group;
                    const handle = this.submit({ ...child, owner: expected.owner, anchor: expected.anchor, signal: boundary.signal, retry: false, timeoutMs });
                    submitted.push({ handle, completion: operationCompletions.get(this.operations.get(handle.operationId)).promise });
                } catch (error) { admissionError = error; break; } finally { this.#submittingGroup = null; }
            }
            if (admissionError) cancelRemaining();
            settled = Promise.all(submitted.map(async (item, index) => {
                const result = await item.handle.result.then(value => ({ value }), error => ({ error }));
                await item.completion;
                results[index] = result.error ? { status: 'rejected', reason: result.error } : { status: 'fulfilled', value: result.value };
                try { await onSettled?.({ index, ...results[index] }, { cancelRemaining }); } catch (error) { callbackError ??= error; cancelRemaining(); }
                notify();
            })).then(() => { finished = true; notify(); });
            if (until && !admissionError) {
                let seen = 0;
                while (true) {
                    if (seen === revision && (!finished || deadlineAt !== null) && (deadlineAt === null || Date.now() < deadlineAt)) await new Promise(resolve => {
                        let timer;
                        const done = () => { clearTimeout(timer); boundary.signal.removeEventListener('abort', done); wake = null; resolve(); };
                        wake = done; boundary.signal.addEventListener('abort', done, { once: true });
                        if (deadlineAt !== null) timer = setTimeout(done, Math.max(0, deadlineAt - Date.now()));
                    });
                    seen = revision;
                    if (boundary.signal.aborted || callbackError) break;
                    if (await until({ finished, expired: deadlineAt !== null && Date.now() >= deadlineAt })) { await resume(); return { wait, cancelRemaining, cancelPending }; }
                    if (finished && deadlineAt === null || deadlineAt !== null && Date.now() >= deadlineAt) throw failure('operation_handoff_unready');
                    group.paused = false;
                    suspend();
                }
            }
            await settled;
            await resume();
            if (boundary.signal.aborted) throw failure('operation_cancelled');
            if (admissionError) throw admissionError;
            if (callbackError) throw callbackError;
            const failed = results.find(result => result.status === 'rejected');
            if (failed) throw Object.assign(failure('operation_child_failed'), { cause: failed.reason });
            return results.map(result => result.value);
        } catch (error) {
            cancelRemaining();
            if (settled) { suspend(); await settled; }
            throw error;
        } finally { this.suspended.delete(operation); delete operation.resume; }
    }
    releaseOperation(operation) {
        for (const field of ['run', 'finalize', 'fresh', 'onChunk', 'resolve', 'reject', 'handle', 'controller', 'cleanup', 'timer', 'signal']) delete operation[field];
    }
    project(owner, id) {
        const operation = this.operations.get(id);
        if (!operation || operation.owner !== owner) throw failure('operation_not_found');
        return immutable(operation.view);
    }
    result(owner, id) {
        const operation = this.operations.get(id);
        if (!operation || operation.owner !== owner) throw failure('operation_not_found');
        if (operation.view.status !== 'completed' || operation.resultValue === undefined) throw failure('operation_result_unavailable');
        return immutable(operation.resultValue);
    }
    cancel(owner, id, status = 'cancelled') {
        const operation = this.operations.get(id);
        if (!operation || operation.owner !== owner) throw failure('operation_not_found');
        if (terminal.has(operation.view.status) || operation.view.status === 'finalizing') return false;
        operation.view.status = status;
        operation.view.provisionalPresentation = '';
        operation.controller.abort(); operation.reject(failure('operation_' + status));
        if (!this.running.has(operation) && !this.suspended.has(operation)) { operation.cleanup(); this.releaseOperation(operation); operationCompletions.get(operation)?.resolve(); }
        this.queue = this.queue.filter(item => item !== operation); this.drain(); return true;
    }
    submit({ owner, anchor, kind = 'model_task', executionClass, resources, key, fingerprint, supersede = false, retry = true, timeoutMs = this.timeoutMs, signal, run, finalize, fresh, onChunk, projectResult = null, retainResult = false }) {
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) throw failure('operation_timeout_invalid');
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
            if (terminal.has(operation.view.status) && !this.running.has(operation) && !this.suspended.has(operation)) this.operations.delete(id);
        }
        if (this.operations.size >= this.retention) throw failure('operation_retention_limit');
        const operationId = randomUUID();
        const controller = new AbortController();
        let resolve, reject;
        const result = new Promise((yes, no) => { resolve = yes; reject = no; });
        // Cancellation can precede the caller attaching a handler.
        result.catch(() => {});
        const operation = { owner, key, fingerprint, retry, resources: [...new Set(resources)], controller, run, finalize, fresh, onChunk, projectResult, retainResult,
            resolve, reject, sequence: this.serial++, queuedAt: Date.now(),
            view: { operationId, kind, anchor, executionClass, status: 'queued', attempt: 0, provisionalPresentation: '', deliveryReceipt: null } };
        let settled;
        operationCompletions.set(operation, { promise: new Promise(resolve => { settled = resolve; }), resolve: () => settled() });
        if (this.#submittingGroup) operationGroups.set(operation, this.#submittingGroup);
        const abort = () => this.cancel(owner, operationId);
        signal?.addEventListener('abort', abort, { once: true });
        operation.cleanup = () => { clearTimeout(operation.timer); signal?.removeEventListener('abort', abort); };
        operation.handle = Object.freeze({ operationId, result });
        this.operations.set(operationId, operation);
        operation.timer = setTimeout(() => this.cancel(owner, operationId), timeoutMs);
        this.queue.push(operation); this.drain();
        return operation.handle;
    }
    drain() {
        const priority = { turn_blocking: 0, interactive: 1, background: 2, maintenance: 3 };
        const weight = item => priority[item.view.executionClass] < 2 ? priority[item.view.executionClass]
            : Math.max(2, priority[item.view.executionClass] - Math.floor((Date.now() - item.queuedAt) / 5000));
        this.queue.sort((a, b) => weight(a) - weight(b) || a.sequence - b.sequence);
        while (this.running.size < this.concurrency) {
            const index = this.queue.findIndex(item => {
                const group = operationGroups.get(item);
                return (!group || !group.paused && [...this.running].filter(active => operationGroups.get(active) === group).length < group.maxConcurrency)
                    && item.resources.every(resource => [...this.running].filter(active => active.resources.includes(resource)).length < this.perResource);
            });
            if (index < 0) return;
            const operation = this.queue.splice(index, 1)[0];
            this.running.add(operation);
            if (operation.resume) { operation.view.status = 'running'; operation.resume(); continue; }
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
            let output, executionBoundary;
            for (let attempt = 0; ; attempt++) {
                await check(); view.status = 'running'; view.attempt = attempt;
                try {
                    const boundary = Object.freeze({ signal: controller.signal, operationId: view.operationId, onChunk: chunk => {
                        if (controller.signal.aborted || terminal.has(view.status) || !this.running.has(operation)) return;
                        if (typeof chunk.text !== 'string' || chunk.text.length > 65536 || !chunk.text.startsWith(view.provisionalPresentation)) throw failure('operation_stream_invalid');
                        view.status = 'streaming'; view.provisionalPresentation = chunk.text;
                        try { operation.onChunk?.(immutable({ ...chunk, operationId: view.operationId, provisional: true, attempt })); } catch { /* Observer only. */ }
                    } });
                    boundaries.set(boundary, { scheduler: this, operation, attempt });
                    executionBoundary = boundary;
                    output = await operation.run(boundary);
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
            const finalizationBoundary = Object.freeze({});
            finalizationBoundaries.set(finalizationBoundary, { scheduler: this, operation, executionBoundary, attempt: view.attempt });
            let result;
            try { result = await operation.finalize(output, view.deliveryReceipt, finalizationBoundary); } finally { finalizationBoundaries.delete(finalizationBoundary); }
            // Optional owner-scoped observations share this operation's bounded
            // retention. No second journal, persistent result or implicit retry.
            if (operation.projectResult) try {
                const observation = operation.projectResult(result);
                if (Buffer.byteLength(JSON.stringify(observation)) <= 65536) view.observation = immutable(observation);
            } catch { /* Missing usage remains unknown; successful effects remain accepted. */ }
            if (operation.retainResult) {
                if (Buffer.byteLength(JSON.stringify(result)) <= 1048576) { operation.resultValue = immutable(result); view.resultAvailable = true; } else { view.resultAvailable = false; view.resultUnavailableReason = 'result_capacity_exceeded'; }
            }
            view.status = 'completed'; view.provisionalPresentation = ''; operation.resolve(result);
        } catch (error) {
            if (!terminal.has(view.status)) view.status = error.code === 'native_session_head_conflict' ? 'stale' : 'failed';
            if (/^(?:native_illustration_|native_speech_|native_mcp_|native_a2a_|native_generation_|native_orchestration_|generation_|operation_|prompt_)[a-z_]{1,100}$/.test(error.code ?? '')) view.errorCode = error.code;
            view.provisionalPresentation = ''; operation.reject(error);
        } finally {
            clearTimeout(timer); operation.cleanup(); this.running.delete(operation); this.releaseOperation(operation);
            const group = operationGroups.get(operation);
            if (group?.pauseForDecision) group.paused = true;
            operationCompletions.get(operation)?.resolve(); this.drain();
        }
    }
}

export const nativeTaskScheduler = new NativeTaskScheduler();
