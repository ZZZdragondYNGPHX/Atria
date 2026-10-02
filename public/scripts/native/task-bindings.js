export function getTaskBindings(packageId) {
    const { capabilitySettings } = globalThis.Atria.getContext();
    return structuredClone(capabilitySettings.atri_task_bindings?.[packageId] ?? {});
}

// Player settings authority; Package declarations cannot write these bindings.
export function setTaskBinding(packageId, slotId, routeRef) {
    if (!/^pkg_[a-f0-9]{32}$/.test(packageId) || !/^[a-z][a-z0-9._-]{0,63}$/.test(slotId)
        || ['constructor', 'prototype', '__proto__'].includes(slotId)
        || routeRef?.scope !== 'player' || !/^route_[a-f0-9]{32}$/.test(routeRef.runtimeRouteId)
        || Object.keys(routeRef).some(key => !['scope', 'runtimeRouteId'].includes(key))) throw new TypeError('Invalid Task Binding Slot');
    const { capabilitySettings, saveSettingsDebounced } = globalThis.Atria.getContext();
    capabilitySettings.atri_task_bindings ??= {};
    capabilitySettings.atri_task_bindings[packageId] ??= {};
    capabilitySettings.atri_task_bindings[packageId][slotId] = structuredClone(routeRef);
    saveSettingsDebounced?.();
    return getTaskBindings(packageId);
}
