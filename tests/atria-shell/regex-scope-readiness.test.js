import { beforeEach, expect, jest, test } from '@jest/globals';

const reads = [];
const runtime = { snapshot: null };
jest.unstable_mockModule('../../public/scripts/native/runtime-client.js', () => ({
    runtimeRequest: () => new Promise((resolve, reject) => reads.push({ resolve, reject })),
    onRuntimeConfigurationChanged: jest.fn(),
}));
jest.unstable_mockModule('../../public/scripts/native/product-client.js', () => ({ nativeProductClient: {} }));
jest.unstable_mockModule('../../public/scripts/native/session-runtime.js', () => ({ nativeSessionRuntime: runtime }));
jest.unstable_mockModule('../../public/scripts/extensions/regex/engine.js', () => ({
    SCRIPT_TYPES: { PRESET: 1, GAME: 2 }, registerNativeRegexScope: jest.fn(), notifyRuntimeRegexScriptsChanged: jest.fn(),
}));
const { refreshNativeRegexScopes, getNativeRegexScopeStatus } = await import('../../public/scripts/native/regex-scopes.js');
beforeEach(() => { reads.length = 0; });

test('an opening caller waits for the newer scope when its own read is superseded', async () => {
    let opened = false;
    const old = refreshNativeRegexScopes().then(() => { opened = true; });
    const latest = refreshNativeRegexScopes();
    reads[0].resolve({ preset: { presetId: 'old' } });
    await Promise.resolve(); await Promise.resolve();
    expect(opened).toBe(false);
    reads[1].resolve({ preset: { presetId: 'current' } });
    await Promise.all([old, latest]);
    expect(opened).toBe(true);
    expect(getNativeRegexScopeStatus().preset.presetId).toBe('current');
});

test('a late failure cannot clear the newer scope or let the caller finish early', async () => {
    const old = refreshNativeRegexScopes();
    const latest = refreshNativeRegexScopes();
    reads[1].resolve({ preset: { presetId: 'current' } }); await latest;
    reads[0].reject(new Error('old failure')); await old;
    expect(getNativeRegexScopeStatus()).toMatchObject({ preset: { presetId: 'current' }, errorMessage: '' });
});

test('failure in the current scope clears old rules and retains a recoverable error', async () => {
    const pending = refreshNativeRegexScopes(); reads[0].reject(new Error('unavailable')); await pending;
    expect(getNativeRegexScopeStatus()).toMatchObject({ preset: null, game: null, errorMessage: 'unavailable' });
    const retry = refreshNativeRegexScopes(); reads[1].resolve({ preset: { presetId: 'recovered' } }); await retry;
    expect(getNativeRegexScopeStatus()).toMatchObject({ preset: { presetId: 'recovered' }, errorMessage: '' });
});
