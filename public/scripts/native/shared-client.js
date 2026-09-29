import { loadNativeGamePackage } from './experience/package-loader.js';

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
            return { state };
        },
        dispose() { controller.abort(); ++sequence; snapshot = null; pending = null; onProjection(null); },
    });
}

// Shared participation stays in the Host's scoped projection / turn controls.
// It must not mount a Package renderer with the owner's Session capabilities.
export async function mountNativeSharedExperience(options) {
    const client = createNativeSharedClient(options);
    try {
        await client.refresh(); const selected = await client.loadPackage();
        return Object.freeze({ client, packageState: selected.state, refresh: client.refresh, dispose: client.dispose });
    } catch (error) { client.dispose(); throw error; }
}
