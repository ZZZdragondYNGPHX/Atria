import { SCRIPT_LIMITS, assertScriptArtifact, scriptMessage } from '../../../shared/native-frontend-script.js';

export function createScriptSupervisor({ window, scheduler, onDiagnostic = () => {}, workerFactory = () => new window.Worker('/atria-script.bundle.js', { type: 'module' }) }) {
    const controllers = new Set(); let disposed = false, used = 0, since = Date.now();
    function account(cpu) {
        if (Date.now() - since > SCRIPT_LIMITS.windowMs) { used = 0; since = Date.now(); }
        used += Math.max(0, Number(cpu) || 0);
        if (used > SCRIPT_LIMITS.experienceCpuMs) throw new Error('script_experience_budget');
    }
    async function attach({ artifact, snapshot, capability, required, failure, revoked = () => {} }) {
        assertScriptArtifact(artifact); account(0);
        if (disposed || controllers.size >= SCRIPT_LIMITS.controllers) throw new Error('script_controller_budget');
        let worker, pending = null, sequence = 0, generation = 0, dead = false, recovering = false, retries = 0, queued = 0, outstanding = 0, chain = Promise.resolve(), faulting = null;
        const cancellations = new Set(), operations = new Set(), intents = new Set();
        function stop() {
            generation++; intents.clear(); worker?.terminate(); worker = null;
            pending?.reject(new Error('script_revoked')); pending = null;
            cancellations.forEach(cancel => cancel()); cancellations.clear(); revoked(); outstanding = 0;
        }
        function send(body) {
            if (dead || disposed || !worker) return Promise.reject(new Error('script_unavailable'));
            return new Promise((resolve, reject) => {
                const id = ++sequence, timer = window.setTimeout(() => {
                    if (pending?.id !== id) return;
                    pending = null; worker?.terminate(); worker = null; reject(new Error('script_wall_budget'));
                }, body.kind === 'init' ? 10000 : SCRIPT_LIMITS.wallMs);
                pending = { id, resolve: value => { window.clearTimeout(timer); resolve(value); }, reject: error => { window.clearTimeout(timer); reject(error); } };
                worker.postMessage({ ...body, sequence: id });
            });
        }
        async function boot() {
            account(0);
            worker = workerFactory();
            worker.onmessage = event => { if (pending && event.data?.sequence === pending.id) { const task = pending; pending = null; task.resolve(event.data); } };
            worker.onerror = () => pending?.reject(new Error('script_worker_failed'));
            const result = await send({ kind: 'init', artifact });
            if (result.error) throw Object.assign(new Error(result.error.reasonCode), { diagnostic: result.error });
        }
        function delay(ms, frame = false) {
            return new Promise(resolve => {
                const done = value => { cancellations.delete(cancel); resolve(value); };
                let cancel;
                if (frame) cancel = scheduler.frame(time => done({ time, animation: !window.document?.hidden && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches }));
                else { const timer = window.setTimeout(() => done(Date.now()), ms); cancel = () => window.clearTimeout(timer); }
                cancellations.add(cancel);
            });
        }
        async function dispatch(call, token) {
            if (dead || token !== generation) return;
            if (!call || !Array.isArray(call.args) || typeof call.method !== 'string') throw new Error('script_protocol');
            const { method, args } = call;
            const allowWrite = intents.has(call.intent);
            if (recovering && !allowWrite && method === 'emit') throw new Error('script_recovery_no_replay');
            if (['timer', 'frame', 'yield'].includes(method)) {
                const ms = method === 'timer' ? args[0] : 0;
                if (!Number.isFinite(ms) || ms < 0 || ms > 10000) throw new Error('script_timer_budget');
                return delay(ms, method === 'frame');
            }
            if (method === 'bridge') {
                if (!['snapshot', 'page', 'invoke', 'start', 'operation', 'cancel'].includes(args[0])) throw new Error('script_method_denied');
                if (recovering && !allowWrite && ['invoke', 'start', 'cancel'].includes(args[0])) throw new Error('script_recovery_no_replay');
                if (args[0] === 'start' && operations.size >= SCRIPT_LIMITS.operations) throw new Error('script_operation_budget');
                const reservation = {}; if (args[0] === 'start') operations.add(reservation);
                try {
                    const result = await capability(method, args);
                    if (args[0] === 'start' && result.ok && result.operationId) operations.add(result.operationId);
                    if (['operation', 'cancel'].includes(args[0]) && result.ok && ['completed', 'failed', 'cancelled'].includes(result.status)) operations.delete(args[2]);
                    return result;
                } finally { operations.delete(reservation); }
            }
            if (!['state', 'emit', 'node', 'media', 'canvas'].includes(method)) throw new Error('script_method_denied');
            return capability(method, args);
        }
        async function process(result, token) {
            if (dead || token !== generation) return;
            account(result.cpu);
            if (result.error) throw Object.assign(new Error(result.error.reasonCode), { diagnostic: result.error });
            const calls = scriptMessage(result.calls);
            if (!Array.isArray(calls) || calls.length > SCRIPT_LIMITS.queue) throw new Error('script_queue_budget');
            for (const call of calls) {
                if (dead || token !== generation) return;
                if (call.id === undefined) { if (!['state', 'emit', 'canvas'].includes(call.method)) throw new Error('script_protocol'); await dispatch(call, token); continue; }
                if (['state', 'emit', 'canvas'].includes(call.method)) throw new Error('script_protocol');
                if (!Number.isSafeInteger(call.id) || call.id <= 0 || outstanding >= SCRIPT_LIMITS.outstanding) throw new Error('script_outstanding_budget');
                outstanding++;
                const settle = (ok, value) => {
                    if (dead || token !== generation) return;
                    outstanding--;
                    void enqueue({ kind: 'settle', id: call.id, ok, value: scriptMessage(value ?? null) });
                };
                void dispatch(call, token).then(value => settle(true, value), () => settle(false, { code: 'script_capability_rejected' })).catch(error => fault(error));
            }
        }
        function fault(error) {
            if (dead) return Promise.resolve();
            if (faulting) return faulting;
            faulting = (async () => {
                while (!dead) {
                    const detail = error.diagnostic ?? { category: 'script', reasonCode: error.message?.includes('budget') ? 'script_budget_exceeded' : 'script_worker_failed', source: { file: artifact.entry, line: 1, column: 1 }, message: 'Controller failed.' };
                    onDiagnostic(detail); stop();
                    if (detail.reasonCode === 'script_exception' || retries++ >= SCRIPT_LIMITS.restarts || disposed) {
                        dead = true; controllers.delete(handle); if (required) { error.scriptFatal = detail.reasonCode !== 'script_exception'; failure(error); } return;
                    }
                    // Rehydration never replays Authority writes. Only a fresh
                    // explicit user event may issue a new write after recovery.
                    recovering = true;
                    try {
                        await boot();
                        await process(await send({ kind: 'invoke', method: 'init', snapshot: scriptMessage(snapshot()), event: { recovery: true } }), generation);
                        return;
                    } catch (next) { error = next; }
                }
            })().finally(() => { faulting = null; });
            return faulting;
        }
        function enqueue(body) {
            if (dead || disposed) return Promise.resolve();
            if (queued >= SCRIPT_LIMITS.queue) return fault(new Error('script_queue_budget'));
            const token = generation; queued++;
            chain = chain.then(async () => {
                if (dead || token !== generation) return;
                const intent = body.kind === 'invoke' && body.method === 'event' ? globalThis.crypto.randomUUID() : null;
                if (intent) { if (intents.size >= 64) intents.delete(intents.values().next().value); intents.add(intent); }
                const message = { ...body, intent, snapshot: scriptMessage(snapshot()) };
                await process(await send(message), token);
            }).catch(fault).finally(() => { queued--; });
            return chain;
        }
        const handle = { invoke(method, event = {}) { return enqueue({ kind: 'invoke', method, event: scriptMessage(event) }); },
            get status() { return dead ? 'unavailable' : recovering ? 'recovered' : 'available'; },
            dispose() { if (dead) return; dead = true; stop(); controllers.delete(handle); } };
        controllers.add(handle);
        try { await boot(); await handle.invoke('init'); } catch (error) { await fault(error); }
        return handle;
    }
    return { attach, dispose() { disposed = true; [...controllers].forEach(controller => controller.dispose()); } };
}
