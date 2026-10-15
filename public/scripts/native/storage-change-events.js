let channel, installed = false, getHandle;
async function applyChange(detail) {
    if (!detail || detail.handle !== getHandle?.() || !Array.isArray(detail.targets)) return;
    const runtime = globalThis.Atria?.nativeSessionRuntime;
    const session = runtime?.snapshot?.session;
    if (detail.destructive !== false && session && detail.targets.some(target => target.type === 'session' && target.id === session.sessionId
        || target.type === 'package' && target.id === session.packageId)) await runtime.invalidateStorageState(session.sessionId);
    const controller = globalThis.Atria?.shell, workspace = controller?.getWorkspaceHost?.(), route = controller?.getNavigation?.()?.getRoute?.();
    const child = route?.child?.id || '';
    workspace?.refreshSearch?.()?.catch?.(error => console.warn('Resource search refresh failed:', error));
    const sections = { world: 'worlds', knowledge: 'knowledge', package: 'works', persona: 'personas', connection: 'connections', model: 'models', route: 'routes', project: 'projects' };
    if (detail.targets.some(target => child.includes(target.id) || child.includes(encodeURIComponent(target.id))
        || sections[target.type] && (child === sections[target.type] || !child && route?.domain === 'library' && target.type === 'package'))) workspace?.refreshForResourceChange?.();
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
export async function notifyStorageChange(handle, targets, { destructive = true } = {}) {
    const detail = { handle, targets, destructive, at: Date.now() };
    try { channel?.postMessage(detail); await applyChange(detail); } catch (error) { console.warn('Resource state refresh failed:', error); }
}
export async function notifyCurrentStorageChange(targets, options) {
    const handle = getHandle?.();
    if (handle) await notifyStorageChange(handle, targets, options);
}
