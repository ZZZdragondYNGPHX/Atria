import { OFFICIAL_ILLUSTRATION_ID } from '../../shared/illustration-plugin-contract.js';
import { createIllustrationExtensionApi, illustrationSettingsClient } from './illustration-client.js';
import { createExtensionRuntime } from './extension-runtime.js';
import { nativeExtensionsClient, onExtensionsChanged } from './extensions-client.js';
import { nativeSessionRuntime } from './session-runtime.js';
import { NATIVE_SESSION_LIFECYCLE, onNativeSessionLifecycle } from './session-lifecycle.js';
import { runtimeRequest, onRuntimeConfigurationChanged } from './runtime-client.js';

const RESET_EVENTS = new Set(['REVISION_RESTORED', 'BRANCH_ACTIVATED']);

export function extensionHostContext(runtime, presetId, epoch, ready) {
    const snapshot = runtime.snapshot;
    return {
        sessionId: snapshot?.session?.sessionId ?? null, packageId: snapshot?.session?.packageId ?? null,
        packageVersionId: snapshot?.session?.packageVersionId ?? null, entryPointId: snapshot?.session?.entryPointId ?? null,
        branchId: snapshot?.revision?.branchId ?? null, presetId: presetId ?? null,
        historical: Boolean(runtime.history), ready, epoch,
    };
}

export function createNativeExtensionsHost({ document: doc = globalThis.document, runtime = nativeSessionRuntime,
    client = nativeExtensionsClient, officialSettings = illustrationSettingsClient, readPreset = () => runtimeRequest('/prompt-scope'),
    onLifecycle = onNativeSessionLifecycle, onConfiguration = onRuntimeConfigurationChanged, onChanged = onExtensionsChanged,
    nativeApi = () => globalThis.Atria?.getContext?.()?.getCapabilityApi?.('game-runtime'), importModule } = {}) {
    let disposed = false, sequence = 0, epoch = 0, presetId = null, plugins = [], refreshing = false;
    let error = null;
    const observers = new Set();
    const events = new Map(Object.values(NATIVE_SESSION_LIFECYCLE).map(type => [type, new Set()]));
    const notify = () => { for (const observer of observers) { try { observer(); } catch { /* Observer only. */ } } };
    const context = () => extensionHostContext(runtime, presetId, epoch, Boolean(runtime.active && nativeApi()?.isExperienceReady?.()));
    let contextIdentity = JSON.stringify(context());
    const host = createExtensionRuntime({ document: doc, nativeApi, illustrationApi: createIllustrationExtensionApi({ runtime, document: doc }), importModule, onStatus: notify,
        isContextCurrent: captured => !refreshing && JSON.stringify(captured) === JSON.stringify(context()),
        subscribe(type, callback) {
            const bucket = events.get(type); if (!bucket) throw new TypeError('Unknown Native lifecycle event');
            bucket.add(callback); return () => bucket.delete(callback);
        } });
    function suspend() { sequence++; refreshing = true; host.suspend(); }
    async function refresh() {
        if (disposed) return;
        const token = ++sequence;
        host.suspend();
        refreshing = true;
        try {
            const [inventory, scope, official] = await Promise.all([client.list(), readPreset(), officialSettings.read().catch(failure => ({ value: { enabled: false }, error: String(failure.message || failure) }))]);
            if (disposed || token !== sequence) return;
            plugins = [...inventory, { id: OFFICIAL_ILLUSTRATION_ID, name: 'Atria 插图', kind: 'official', enabled: official.value.enabled, revision: 's2', entrypoint: 'official-illustration.js', targets: { global: true, presets: [], works: [] } }]; presetId = scope.preset?.presetId ?? null; error = official.error ?? null; refreshing = false;
            contextIdentity = JSON.stringify(context());
            notify();
            // Module activation is never awaited by Session lifecycle publication.
            await host.reconcile(plugins, context());
        } catch (failure) {
            if (disposed || token !== sequence) return;
            plugins = []; refreshing = false; host.suspend(); error = String(failure.message || failure); notify();
        }
    }
    const unsubscribers = Object.values(NATIVE_SESSION_LIFECYCLE).map(type => onLifecycle(type, () => {
        if (disposed) return;
        if (RESET_EVENTS.has(type)) epoch++;
        const currentIdentity = JSON.stringify(context());
        if (contextIdentity !== currentIdentity) {
            contextIdentity = currentIdentity; suspend(); void refresh();
        } else if (!refreshing) void host.reconcile(plugins, context());
        // Only Host identity metadata is forwarded, never the raw lifecycle snapshot.
        for (const callback of events.get(type)) callback(Object.freeze({ type, context: Object.freeze(context()) }));
    }));
    const changed = () => { suspend(); void refresh(); };
    unsubscribers.push(onConfiguration(changed), onChanged(event => { if (event.path === '/official/illustration' && plugins.find(item => item.id === OFFICIAL_ILLUSTRATION_ID)?.enabled === event.enabled) return; if (event.path !== '/settings') changed(); }));
    return Object.freeze({
        refresh, suspend,
        getStatus: () => ({ error, plugins: host.getStatus() }),
        subscribe(listener) { observers.add(listener); return () => observers.delete(listener); },
        dispose() { disposed = true; sequence++; unsubscribers.forEach(unsubscribe => unsubscribe()); observers.clear(); return host.dispose(); },
    });
}

let activeHost;
export function initializeNativeExtensions() {
    if (activeHost || globalThis.Atria?.shell?.isRecoveryMode?.()) return activeHost;
    activeHost = createNativeExtensionsHost();
    const host = activeHost;
    globalThis.Atria.extensions = Object.freeze({ client: nativeExtensionsClient, refresh: host.refresh, getStatus: host.getStatus, subscribe: host.subscribe });
    window.addEventListener('pagehide', host.suspend);
    window.addEventListener('pageshow', () => { void host.refresh(); });
    void host.refresh();
    return host;
}
