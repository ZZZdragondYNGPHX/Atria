// Host-owned preference adapter. All values remain in existing account settings;
// the browser stores only its non-secret device identity, never Session facts.
// Declarative components receive read/write closures for declared scalar fields.
export function createNativeUiStateStorage({ packageId, entryPointId, stateVersion, sessionId, branchId, settings, save,
    deviceStorage = () => globalThis.localStorage, createDeviceId = () => globalThis.crypto.randomUUID() }) {
    let deviceId;
    function keyFor(root, key, scope) {
        if (scope === 'device' && !deviceId) {
            const storage = deviceStorage();
            deviceId = storage.getItem('atri_ui_device_id');
            if (!/^[a-f0-9-]{36}$/.test(deviceId || '')) {
                deviceId = createDeviceId(); storage.setItem('atri_ui_device_id', deviceId);
            }
        }
        return [packageId, entryPointId, stateVersion, root, key, scope,
            ...(scope === 'session' ? [sessionId, branchId] : []), ...(scope === 'device' ? [deviceId] : []),
        ].join(':');
    }
    return Object.freeze({
        read(root, key, scope) { return settings().atri_ui_preferences?.[keyFor(root, key, scope)]; },
        write(root, key, scope, value) {
            const target = settings(); target.atri_ui_preferences ||= {};
            const storageKey = keyFor(root, key, scope);
            if (!Object.hasOwn(target.atri_ui_preferences, storageKey) && Object.keys(target.atri_ui_preferences).length >= 16384) throw new Error('UI preference limit reached');
            target.atri_ui_preferences[storageKey] = value; save?.();
        },
    });
}
