import { loadNativeGamePackage, loadGamePackageJsonResource, loadExperienceData } from './experience/package-loader.js';
import { compileUiDocument } from './experience/ui/v2-document.js';
import { mountUiDocument } from './experience/ui/v2-runtime.js';
import { createIsolatedExperienceSlots } from './isolated-experience-slots.js';

// Host-owned, mount-scoped HTTP transport. It holds only a disposable display
// projection; the canonical Session and permission checks stay on the server.
// Packages receive the frozen methods, never the transport/auth configuration.
export function createNativeSharedClient({ owner, sessionId, fetchImpl = (...args) => fetch(...args),
    headers = () => globalThis.Atria?.getContext?.()?.getRequestHeaders?.() ?? {},
    invocationId = () => 'shared-' + crypto.randomUUID(), onProjection = () => {}, timeoutMs = 30000 } = {}) {
    const controller = new AbortController();
    let snapshot = null, pending = null, busy = false, sequence = 0;
    const current = () => { if (controller.signal.aborted) throw new Error('native_shared_disposed'); };
    async function request(method, body = {}) {
        current();
        const requestController = new AbortController();
        const abort = () => requestController.abort();
        controller.signal.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(abort, timeoutMs);
        try {
            const response = await fetchImpl('/api/native/session/shared/' + method, { method: 'POST', signal: requestController.signal,
                headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ owner, sessionId, ...body }) });
            const payload = await response.json(); current();
            if (!response.ok) {
                const error = Object.assign(new Error(payload.error ?? 'native_shared_request_failed'), { status: response.status });
                if ([400, 401, 403, 404].includes(error.status)) { snapshot = null; onProjection(null); }
                throw error;
            }
            if (payload.sessionId !== sessionId || payload.kind !== 'shared-session') throw new Error('native_shared_identity_changed');
            return payload;
        } finally { clearTimeout(timer); controller.signal.removeEventListener('abort', abort); }
    }
    function accept(value) {
        current();
        if (snapshot && (value.packageContentHash !== snapshot.packageContentHash || value.seatId !== snapshot.seatId)) snapshot = null;
        if (value.projection === null && (!snapshot || value.cursor !== snapshot.cursor)) throw new Error('native_shared_cursor_changed');
        snapshot = { ...value, projection: value.projection ?? snapshot?.projection };
        onProjection(structuredClone(snapshot)); return structuredClone(snapshot);
    }
    async function refresh() {
        if (busy) throw new Error('native_shared_busy');
        const token = ++sequence;
        const value = await request('snapshot', { cursor: snapshot?.cursor ?? null });
        if (token !== sequence) throw new Error('native_shared_stale');
        return accept(value);
    }
    async function send(action, type) {
        current(); if (!snapshot || busy) throw new Error('native_shared_not_ready_or_busy');
        const key = JSON.stringify([type, action]);
        if (pending && pending.key !== key) throw new Error('native_shared_retry_pending');
        pending ??= { key, body: type === 'realm' ? { expectedRevisionId: snapshot.revisionId, expectedAccessRevisionId: snapshot.accessRevisionId,
            command: { type: 'realm', invocationId: invocationId(), action: structuredClone(action) } } : {
            action: { ...structuredClone(action), invocationId: invocationId(), expectedRevisionId: snapshot.revisionId, expectedAccessRevisionId: snapshot.accessRevisionId } } };
        busy = true; ++sequence;
        try { const value = await request(type, pending.body); const result = accept(value); pending = null; return result; } catch (error) {
            if (error.status >= 400 && error.status < 500) pending = null; throw error;
        } finally { busy = false; }
    }
    return Object.freeze({ refresh,
        getProjection: () => { current(); return structuredClone(snapshot?.projection ?? {}); },
        getSnapshot: () => { current(); return structuredClone(snapshot); },
        async heartbeat() { current(); await request('heartbeat'); },
        command: action => send(action, 'command'),
        realmCommand: action => send(action, 'realm'),
        async loadPackage() {
            current(); if (!snapshot) throw new Error('native_shared_not_ready');
            const options = { fetchImpl, headers: headers(), sharedOwner: owner, signal: controller.signal };
            const selected = snapshot.packageContentHash;
            const state = await loadNativeGamePackage(sessionId, options); current();
            if (!state.active || state.descriptor?.packageContentHash !== selected || snapshot?.packageContentHash !== selected) throw new Error('native_shared_package_changed');
            const data = await loadExperienceData(state, options); current();
            const document = state.runtime.experience.component ? await loadGamePackageJsonResource(state, state.runtime.experience.component, options) : null; current();
            return { state, data, document };
        },
        dispose() { controller.abort(); ++sequence; snapshot = null; pending = null; onProjection(null); },
    });
}

// Reuse the production v2 renderer; no participant-side World/Session clone.
// The Host chooses DOM surfaces, connection and refresh cadence. P9 owns lobby UI.
export async function mountNativeSharedExperience(options) {
    let mounted = null;
    const client = createNativeSharedClient({ ...options, onProjection: value => { mounted?.refresh(); options.onProjection?.(value); } });
    try {
        await client.refresh(); const selected = await client.loadPackage();
        if (selected.document) {
            const definition = compileUiDocument(selected.document, { mode: selected.state.runtime.experience.mode });
            mounted = mountUiDocument(definition, { document: options.document, window: options.window, surfaceHost: options.surfaceHost,
                nativePlayHost: createIsolatedExperienceSlots(options.document, true),
                environmentRoot: options.environmentRoot, stateStorage: options.stateStorage, data: selected.data, sharedClient: client, realm: client.realmCommand });
        }
        return Object.freeze({ client, packageState: selected.state, refresh: client.refresh, dispose() { mounted?.dispose(); mounted = null; client.dispose(); } });
    } catch (error) { mounted?.dispose(); mounted = null; client.dispose(); throw error; }
}
