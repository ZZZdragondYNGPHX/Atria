let channel, installed = false, getHandle;
async function applyChange(detail) {
    if (!detail || detail.handle !== getHandle?.() || !Array.isArray(detail.targets)) return;
    const runtime = globalThis.Atria?.nativeSessionRuntime;
    const session = runtime?.snapshot?.session;
    if (session && detail.targets.some(target => target.type === 'session' && target.id === session.sessionId
        || target.type === 'package' && target.id === session.packageId)) await runtime.invalidateStorageState(session.sessionId);
    const controller = globalThis.Atria?.shell, workspace = controller?.getWorkspaceHost?.(), route = controller?.getNavigation?.()?.getRoute?.();
    const child = route?.child?.id || '';
    workspace?.refreshSearch?.();
    if (detail.targets.some(target => child.includes(target.id) || child.includes(encodeURIComponent(target.id)))) workspace?.refreshActive?.();
    document.dispatchEvent(new CustomEvent('atria:resources-changed', { detail }));
}
export function installStorageChangeListener(handleReader) {
    getHandle = handleReader;
    if (installed) return; installed = true;
    if (typeof BroadcastChannel === 'function') {
        channel = new BroadcastChannel('atria-resource-lifecycle');
        channel.onmessage = event => { void applyChange(event.data).catch(error => console.warn('Resource state refresh failed:', error)); };
    }
}
export async function notifyStorageChange(handle, targets) {
    const detail = { handle, targets, at: Date.now() }; channel?.postMessage(detail); await applyChange(detail);
}
