import { test, expect } from '@jest/globals';
import { createNativeUiStateStorage } from '../../public/scripts/native/ui-state-storage.js';

test('UI state shares account settings while isolating package, version, branch and device scopes', () => {
    const settings = {};
    function device(id) {
        const data = new Map();
        return { deviceStorage: () => ({ getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }), createDeviceId: () => id };
    }
    const firstDevice = device('11111111-1111-4111-8111-111111111111');
    const secondDevice = device('22222222-2222-4222-8222-222222222222');
    const base = { packageId: 'p', entryPointId: 'e', stateVersion: 1, sessionId: 's', branchId: 'b', settings: () => settings, ...firstDevice };
    const first = createNativeUiStateStorage(base);
    first.write('ui', 'name', 'session', 'Draft'); first.write('prefs', 'quality', 'device', 2); first.write('prefs', 'compact', 'player', true);
    const another = createNativeUiStateStorage({ ...base, ...secondDevice, branchId: 'other' });
    expect(another.read('ui', 'name', 'session')).toBeUndefined();
    expect(another.read('prefs', 'quality', 'device')).toBeUndefined();
    expect(another.read('prefs', 'compact', 'player')).toBe(true);
    expect(createNativeUiStateStorage(base).read('prefs', 'quality', 'device')).toBe(2);
    expect(createNativeUiStateStorage({ ...base, stateVersion: 2 }).read('prefs', 'compact', 'player')).toBeUndefined();
    expect(createNativeUiStateStorage({ ...base, packageId: 'other' }).read('prefs', 'compact', 'player')).toBeUndefined();
});
