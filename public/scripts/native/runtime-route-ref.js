export function normalizeRuntimeRouteRef(value) {
    if (value == null) return undefined;
    if (value.scope !== 'player' || !/^route_[a-f0-9]{32}$/.test(value.runtimeRouteId || '')
        || Object.keys(value).some(key => !['scope', 'runtimeRouteId'].includes(key))) {
        throw new TypeError('Select an exact player Runtime Route.');
    }
    return { scope: 'player', runtimeRouteId: value.runtimeRouteId };
}

export function configuredNativeRoute(config) {
    const ref = normalizeRuntimeRouteRef(config?.nativeRouteRef);
    return ref ? { nativeRouteRef: ref } : {};
}
