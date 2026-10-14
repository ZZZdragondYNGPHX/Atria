// Transient references to mounted first-party renderers; never a business store.
const surfaces = new Map();
let sequence = 0;
export function registerMcpSurface({ identity, controls, interact, region = () => null }) {
    if (surfaces.size >= 64) return { surfaceId: null, dispose() {} };
    const surfaceId = 'native.frontend.' + (++sequence);
    surfaces.set(surfaceId, { identity, controls, interact, region });
    return { surfaceId, dispose: () => surfaces.delete(surfaceId) };
}
export function observeMcpSurfaces() {
    return [...surfaces].map(([surfaceId, entry]) => ({ surfaceId, identity: entry.identity(), controls: entry.controls(), region: entry.region() }));
}
export async function interactMcpSurface(input) {
    if (!input || Object.keys(input).some(key => !['surfaceId', 'instanceId', 'componentId', 'controlId', 'actionId', 'expectedIdentity', 'event'].includes(key))) throw Error('semantic_ui_schema');
    const entry = surfaces.get(input.surfaceId);
    if (!entry || JSON.stringify(entry.identity()) !== JSON.stringify(input.expectedIdentity)) throw Error('semantic_ui_stale');
    const control = entry.controls().find(item => item.instanceId === input.instanceId && item.componentId === input.componentId && item.controlId === input.controlId && item.actionId === input.actionId);
    if (!control) throw Error('semantic_ui_unsupported');
    await entry.interact(control, input.event ?? {});
    return { surfaceId: input.surfaceId, identity: entry.identity(), effect: 'local-presentation-state-only', businessCommit: false };
}
