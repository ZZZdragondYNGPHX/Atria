import { projectInformation, queryInformationGraph, actorAvailability } from '../../shared/native-information-runtime.js';
import { NATIVE_SESSION_LIFECYCLE, emitNativeSessionLifecycle } from './session-lifecycle.js';

const ACTIONS = new Set(['information.rollup', 'activity.start', 'activity.pause', 'activity.resume', 'activity.settle', 'activity.cancel', 'opening.progress', 'opening.complete', 'experience.ready', 'pump', 'scope.transition', 'app.command', 'clock.advance', 'workflow.transition', 'retention.compact', 'interaction.schedule', 'interaction.cancel', 'workflow.cancel', 'scheduled.cancel', 'app.pin']);
const clone = value => structuredClone(value);
const failure = (code, message = code) => Object.assign(new Error(message), { code });
const identity = snapshot => [snapshot?.session?.sessionId, snapshot?.revision?.branchId, snapshot?.session?.packageVersionId, snapshot?.session?.entryPointId, snapshot?.session?.packageContentHash].join(':');

// One mount-scoped transport, not a Session, state store or scheduler. All durable
// work belongs to SessionCore and the existing NativeGenerationHost Task outbox.
export function createNativeLifecycleClient({ runtime, fetchImpl = (...args) => fetch(...args),
    headers = () => globalThis.Atria?.getContext?.()?.getRequestHeaders?.() ?? {},
    getBindings = () => ({}), emit = emitNativeSessionLifecycle, timeoutMs = 30000,
    invocationId = () => crypto.randomUUID(), wallNow = () => Date.now(), getActivityElapsed = () => null } = {}) {
    let scope = null;
    let accepting = false;
    function cancel() {
        if (!scope) return;
        clearTimeout(scope.timer);
        scope.controller.abort(failure('native_lifecycle_cancelled'));
        scope = null;
    }
    function current(token, { writable = false, initial = false } = {}) {
        if (!token || scope !== token || token.controller.signal.aborted || !runtime.active
            || identity(runtime.snapshot) !== token.identity
            || (initial && runtime.snapshot.revision.revisionId !== token.revisionId)) throw failure('native_lifecycle_stale');
        if (writable && (runtime.history || runtime.failed || runtime.generation || runtime.host?.isGenerating?.())) throw failure('native_lifecycle_busy_or_historical');
        return runtime.snapshot;
    }
    function race(token, promise) {
        const signal = token.controller.signal;
        if (signal.aborted) return Promise.reject(signal.reason);
        return new Promise((resolve, reject) => {
            const abort = () => reject(signal.reason);
            signal.addEventListener('abort', abort, { once: true });
            Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
        });
    }
    function beginLoad() {
        cancel();
        const token = { identity: identity(runtime.snapshot), revisionId: runtime.snapshot?.revision?.revisionId,
            controller: new AbortController(), ready: false, pending: null, busy: false, pumping: null, packageState: null };
        scope = token;
        token.timer = setTimeout(() => token.controller.abort(failure('native_experience_ready_timeout')), timeoutMs);
        return Object.freeze({ signal: token.controller.signal,
            assertCurrent: () => current(token, { initial: !token.ready }),
            wait: promise => race(token, promise),
            prepare: packageState => prepare(token, packageState),
            ready: () => ready(token),
            client: Object.freeze({ getSnapshot: () => current(token),
                command: action => command(token, action),
                isWritable: () => { try { current(token, { writable: true }); return token.ready; } catch { return false; } },
            }),
        });
    }
    async function request(token, path, body, method = 'POST') {
        return race(token, (async () => {
            const response = await fetchImpl(path, { method, signal: token.controller.signal,
                headers: { ...headers(), 'Content-Type': 'application/json' },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
            const payload = await response.json();
            if (!response.ok) throw Object.assign(failure(payload.error || 'native_lifecycle_request_failed'), { status: response.status });
            return payload;
        })());
    }
    async function prepare(token, packageState) {
        const snapshot = current(token, { initial: true });
        const descriptor = packageState.descriptor;
        if (packageState.status !== 'ready' || !packageState.active || packageState.sessionId !== snapshot.session.sessionId
            || !descriptor || ['packageId', 'packageVersionId', 'entryPointId', 'packageContentHash'].some(key => descriptor[key] !== snapshot.session[key])) throw failure('native_experience_package_changed');
        const tasks = descriptor.experienceContract?.taskRuntime?.tasks ?? [];
        token.bindings = clone(getBindings());
        if (tasks.length) {
            const configuration = await request(token, '/api/native/generation/configuration', undefined, 'GET');
            current(token, { initial: true });
            for (const task of tasks) {
                const binding = token.bindings[task.bindingSlotId];
                if (binding?.scope !== 'player' || !configuration.routes?.some(route => route.runtimeRouteId === binding.runtimeRouteId)) throw failure('native_task_binding_missing');
            }
            // Resolve the exact Package Task resources and required capabilities
            // through the existing Host RouteResolver, without sending inference.
            const prepared = await request(token, '/api/native/generation/lifecycle/prepare', {
                sessionId: snapshot.session.sessionId, revisionId: token.revisionId, slotBindings: clone(token.bindings),
            });
            current(token, { initial: true });
            if (prepared.revisionId !== token.revisionId) throw failure('native_lifecycle_stale');
        }
        token.packageState = packageState;
        return packageState;
    }
    async function accept(token, snapshot, revisionId) {
        const before = current(token, { writable: true });
        if (before.revision.revisionId !== revisionId || identity(snapshot) !== token.identity) throw failure('native_lifecycle_stale');
        accepting = true;
        try {
            await runtime.acceptOperationSnapshot(snapshot, { acceptGuard: () => {
                try { return current(token, { writable: true }).revision.revisionId === revisionId; } catch { return false; }
            } });
        } finally { accepting = false; }
        current(token, { writable: true });
        return runtime.snapshot;
    }
    async function command(token, action) {
        const snapshot = current(token, { writable: true });
        if (!token.ready || !token.packageState?.descriptor.experienceContract?.lifecycleRuntime) throw failure('native_lifecycle_not_ready');
        if (!ACTIONS.has(action?.kind)) throw new TypeError('Unknown lifecycle action');
        if (token.busy) throw failure('native_lifecycle_busy');
        const key = JSON.stringify(action);
        if (token.pending && token.pending.key !== key) throw failure('native_lifecycle_retry_pending');
        const pending = token.pending ?? { key, body: { sessionId: snapshot.session.sessionId, expectedRevisionId: snapshot.revision.revisionId,
            command: { type: 'lifecycle', action: clone(action), invocationId: invocationId() } } };
        if (snapshot.revision.revisionId !== pending.body.expectedRevisionId) throw failure('native_lifecycle_stale');
        token.pending = pending;
        token.busy = true;
        try {
            pending.snapshot ??= await request(token, '/api/native/session/command', pending.body);
            const result = await accept(token, pending.snapshot, pending.body.expectedRevisionId);
            token.pending = null;
            return result;
        } catch (error) {
            // A known rejection did not commit. An uncertain transport failure
            // retains the exact payload, revision and invocation for retry.
            if (error.status >= 400 && error.status < 500) token.pending = null;
            throw error;
        } finally { token.busy = false; }
    }
    async function drain(token) {
        const snapshot = current(token, { writable: true });
        const tasks = token.packageState.descriptor.experienceContract?.taskRuntime?.tasks ?? [];
        const state = snapshot.states?.atri_lifecycle;
        const pending = state?.outbox?.filter(item => item.status === 'pending') ?? [];
        if (!pending.length || token.busy) return snapshot;
        for (const item of pending) {
            if (!tasks.some(task => task.id === item.taskId && token.bindings[task.bindingSlotId]?.scope === 'player')
                || state.scopes?.[item.scopeId]?.status !== 'active') throw failure('native_lifecycle_task_unavailable');
        }
        // The authenticated Host decides whether durable work is pending, and
        // validates declared Tasks and captured player bindings before execution.
        token.busy = true;
        try {
            const result = await request(token, '/api/native/generation/lifecycle', { sessionId: snapshot.session.sessionId,
                revisionId: snapshot.revision.revisionId, slotBindings: clone(token.bindings) });
            return await accept(token, result.snapshot, snapshot.revision.revisionId);
        } catch (error) {
            // Earlier Tasks may already have committed before a later Task
            // failed. Reload canonical authority through the same projection
            // accept path, without remounting or recursively waking automation.
            try { await accept(token, snapshot, snapshot.revision.revisionId); } catch (refreshError) { error.refreshError = refreshError; }
            throw error;
        } finally { token.busy = false; }
    }
    function pump(token = scope) {
        current(token, { writable: true });
        if (token.pumping) return token.pumping;
        if (token.busy) return Promise.reject(failure('native_lifecycle_busy'));
        // No browser clock, catch-up loop or second scheduler. One bounded
        // server pump plus one bounded Task-outbox drain per explicit wakeup.
        token.pumping = (async () => { await command(token, { kind: 'pump' }); return drain(token); })()
            .finally(() => { token.pumping = null; });
        return token.pumping;
    }
    async function ready(token) {
        const snapshot = current(token, { initial: !token.ready });
        if (!token.packageState) throw failure('native_lifecycle_not_prepared');
        if (token.ready) return snapshot;
        // Historical presentation is allowed, never historical automation.
        if (!runtime.history) current(token, { writable: true });
        clearTimeout(token.timer);
        token.ready = true;
        if (runtime.history) return snapshot;
        await emit(NATIVE_SESSION_LIFECYCLE.EXPERIENCE_READY, { sessionId: snapshot.session.sessionId,
            revisionId: snapshot.revision.revisionId, branchId: snapshot.revision.branchId,
            packageVersionId: snapshot.session.packageVersionId, entryPointId: snapshot.session.entryPointId });
        current(token, { writable: true });
        if (token.packageState.descriptor.experienceContract?.lifecycleRuntime) {
            await command(token, { kind: 'experience.ready' });
            await pump(token);
        }
        return runtime.snapshot;
    }
    function getApplicationRecords(domainId) {
        const snapshot = runtime.snapshot;
        if (!runtime.active) return [];
        const definition = snapshot?.manifest?.runtime?.experienceContract?.lifecycleRuntime;
        const domain = definition?.domains.find(item => item.id === domainId);
        const state = snapshot?.states?.atri_lifecycle;
        if (!domain || state?.scopes?.[domain.scopeId]?.status !== 'active') return [];
        return clone((state.domains?.[domainId]?.records ?? []).filter(record => record.scopeId === domain.scopeId));
    }
    function getTemporalProjection() {
        const snapshot = runtime.active ? runtime.snapshot : null;
        const state = snapshot?.states?.atri_lifecycle;
        const clocks = snapshot?.manifest?.runtime?.experienceContract?.lifecycleRuntime?.clocks ?? [];
        const activity = getActivityElapsed();
        const elapsed = activity && typeof activity.activityId === 'string' && activity.activityId.length > 0
            && Number.isFinite(activity.elapsedMs) && activity.elapsedMs >= 0
            ? { activityId: activity.activityId, elapsedMs: activity.elapsedMs } : null;
        return { world: clocks.filter(clock => Number.isSafeInteger(state?.clocks?.[clock.id]))
            .map(clock => ({ clockId: clock.id, tick: state.clocks[clock.id] })),
        logical: { revisionId: snapshot?.revision?.revisionId ?? null, sequence: state?.logicalTime ?? null },
        wall: { epochMs: wallNow() },
        activity: snapshot ? elapsed : null };
    }
    return Object.freeze({ beginLoad, cancel, pump, getApplicationRecords, getTemporalProjection,
        getInformationProjection: (viewId, options) => projectInformation(current(scope), viewId, options),
        queryInformationGraph: (graphId, startId, options) => queryInformationGraph(current(scope), graphId, startId, options),
        getActorAvailability: actorId => actorAvailability(current(scope), actorId),
        get acceptingSnapshot() { return accepting; },
        get busy() { return Boolean(scope?.busy || scope?.pumping); },
        getSnapshot: () => runtime.snapshot,
        command: action => command(scope, action),
    });
}
