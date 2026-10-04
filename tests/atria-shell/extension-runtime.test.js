/** @jest-environment jsdom */
import { afterEach, expect, jest, test } from '@jest/globals';
import { serialize, deserialize } from 'node:v8';
import { createExtensionRuntime } from '../../public/scripts/native/extension-runtime.js';
import { createNativeExtensionsHost } from '../../public/scripts/native/extensions-host.js';

const plugin = (patch = {}) => ({ id: 'ext_test', revision: 'r1', enabled: true, kind: 'local', entrypoint: 'index.js',
    targets: { global: true, presets: [], works: [] }, ...patch });
const context = { packageId: 'work', presetId: 'preset', sessionId: 'session', branchId: 'branch', ready: true };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
globalThis.structuredClone ??= value => deserialize(serialize(value));
afterEach(() => { jest.useRealTimers(); document.body.replaceChildren(); });

test('OR matching activates once, retains unchanged context, disposes on edit/disable/delete', async () => {
    const cleanup = jest.fn(); const activate = jest.fn(() => cleanup);
    const host = createExtensionRuntime({ document, importModule: async () => ({ activate }) });
    const item = plugin({ targets: { global: true, presets: ['preset'], works: ['work'] } });
    await host.reconcile([item], context); await host.reconcile([item], { ...context });
    expect(activate).toHaveBeenCalledTimes(1);
    await host.reconcile([{ ...item, revision: 'r2' }], context);
    expect(cleanup).toHaveBeenCalledTimes(1); expect(activate).toHaveBeenCalledTimes(2);
    await host.reconcile([{ ...item, enabled: false }], context);
    expect(cleanup).toHaveBeenCalledTimes(2);
    await host.reconcile([item], context); await host.reconcile([], context);
    expect(cleanup).toHaveBeenCalledTimes(3);
    expect(document.querySelector('[data-atri-extension]')).toBeNull();
    await host.dispose();
});

test('Work and preset scope changes clean listeners, timers, mounts and reject the old SDK', async () => {
    jest.useFakeTimers(); let sdk; const callback = jest.fn();
    const host = createExtensionRuntime({ document, importModule: async () => ({ activate(api) {
        sdk = api; const node = document.createElement('p'); api.ui.mount(node);
        api.events.listen(document, 'sample', callback); api.timers.interval(callback, 10);
    } }) });
    const item = plugin({ targets: { global: false, presets: ['preset'], works: ['work'] } });
    await host.reconcile([item], context); const previous = sdk;
    document.dispatchEvent(new Event('sample')); jest.advanceTimersByTime(10);
    expect(callback).toHaveBeenCalledTimes(2);
    await host.reconcile([item], { ...context, packageId: 'another', presetId: 'another' });
    expect(previous.signal.aborted).toBe(true);
    document.dispatchEvent(new Event('sample')); jest.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(() => previous.ui.mount(document.createElement('p'))).toThrow('disposed');
    expect(document.body.children).toHaveLength(0);
    await host.dispose();
});

test('late module import never activates, late activation cleans up without reviving its resources', async () => {
    const loaded = deferred(); const late = deferred(); const lateCleanup = jest.fn(); let oldSdk;
    const activate = jest.fn(); let call = 0;
    const host = createExtensionRuntime({ document, importModule: () => ++call === 1 ? loaded.promise : Promise.resolve({ activate: async sdk => {
        oldSdk = sdk; sdk.ui.mount(document.createElement('p')); await late.promise; return lateCleanup;
    } }) });
    const first = host.reconcile([plugin()], context);
    await Promise.resolve();
    await host.reconcile([], context);
    loaded.resolve({ activate }); await first; expect(activate).not.toHaveBeenCalled();
    const second = host.reconcile([plugin()], context);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(oldSdk).toBeDefined();
    await host.reconcile([], context); expect(oldSdk.signal.aborted).toBe(true);
    late.resolve(); await second;
    expect(lateCleanup).toHaveBeenCalledTimes(1);
    expect(document.body.children).toHaveLength(0);
    await host.dispose();
});

test('known async cleanup finishes before the successor activates even across suspend/refresh', async () => {
    const stopped = deferred(); const order = [];
    const host = createExtensionRuntime({ document, importModule: async () => ({ activate: () => {
        order.push('activate'); return async () => { await stopped.promise; order.push('cleanup'); };
    } }) });
    await host.reconcile([plugin()], context); host.suspend();
    const next = host.reconcile([plugin({ revision: 'r2' })], context);
    await Promise.resolve(); expect(order).toEqual(['activate']);
    stopped.resolve(); await next; expect(order).toEqual(['activate', 'cleanup', 'activate']);
    await host.dispose();
});

test('typed Native adapters delegate to the existing API and reject late results', async () => {
    let sdk; const pending = deferred(); const lifecycleCommand = jest.fn(() => pending.promise);
    const host = createExtensionRuntime({ document, nativeApi: () => ({ lifecycleCommand }), importModule: async () => ({ activate: api => { sdk = api; } }) });
    await host.reconcile([plugin()], context);
    const action = { kind: 'app.command', appId: 'inventory', commandId: 'inspect', args: {} };
    const result = sdk.native.lifecycleCommand(action);
    expect(lifecycleCommand).toHaveBeenCalledWith(action);
    await host.reconcile([], context); pending.resolve({ completed: true });
    await expect(result).rejects.toThrow('disposed');
    await host.dispose();
});

test('activation errors are isolated, cleaned and inspectable without blocking another plugin', async () => {
    const host = createExtensionRuntime({ document, importModule: async url => ({ activate: sdk => {
        sdk.ui.mount(document.createElement('p'));
        if (url.includes('ext_bad')) throw new Error('fixture activation failed');
    } }) });
    await host.reconcile([plugin({ id: 'ext_bad' }), plugin()], context);
    expect(host.getStatus()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'ext_bad', state: 'error' }), expect.objectContaining({ id: 'ext_test', state: 'active' })]));
    expect(document.querySelector('[data-atri-extension="ext_bad"]')).toBeNull();
    expect(document.querySelector('[data-atri-extension="ext_test"]')).not.toBeNull();
    await host.dispose();
});

test('Host follows lifecycle/config/CRUD signals without polling, rejects stale fetches and forwards metadata only', async () => {
    const lifecycle = new Map(); let configuration; let changed; let sdk;
    let inventory = [plugin()]; let presetId = 'one'; const cleanups = [];
    const runtime = { active: true, snapshot: { session: { sessionId: 's', packageId: 'w', packageVersionId: 'v' }, revision: { branchId: 'b' } } };
    const client = { list: jest.fn(async () => inventory) };
    const activate = jest.fn(api => { sdk = api; const cleanup = jest.fn(); cleanups.push(cleanup); return cleanup; });
    const host = createNativeExtensionsHost({ document, runtime, officialSettings: { read: async () => ({ value: { enabled: false } }) }, client, readPreset: async () => ({ preset: { presetId } }),
        nativeApi: () => ({ isExperienceReady: () => true }), importModule: async () => ({ activate }),
        onLifecycle: (type, callback) => { lifecycle.set(type, callback); return () => lifecycle.delete(type); },
        onConfiguration: callback => { configuration = callback; return () => {}; }, onChanged: callback => { changed = callback; return () => {}; } });
    await host.refresh(); expect(sdk.context.presetId).toBe('one');
    const event = jest.fn(); sdk.events.on('REVISION_COMMITTED', event);
    lifecycle.get('REVISION_COMMITTED')({ snapshot: { private: 'never forward' } });
    expect(activate).toHaveBeenCalledTimes(1); expect(JSON.stringify(event.mock.calls)).not.toContain('never forward');
    // SessionCore accepts typed operations through SESSION_LOADED too; that is
    // not a new Host context and must not invalidate its own command's SDK.
    lifecycle.get('SESSION_LOADED')();
    expect(sdk.signal.aborted).toBe(false); expect(activate).toHaveBeenCalledTimes(1);
    const pending = deferred(); client.list.mockImplementationOnce(() => pending.promise);
    const old = host.refresh();
    inventory = []; changed({ path: '/plugins', id: 'ext_test' }); await host.refresh();
    pending.resolve([plugin()]); await old;
    expect(document.body.children).toHaveLength(0);
    inventory = [plugin()]; presetId = 'two'; configuration(); await host.refresh();
    expect(sdk.context.presetId).toBe('two'); expect(cleanups[0]).toHaveBeenCalledTimes(1);
    runtime.snapshot = null; runtime.active = false; lifecycle.get('SESSION_CLOSED')(); await host.refresh();
    expect(sdk.context.packageId).toBeNull();
    await host.dispose(); expect(lifecycle.size).toBe(0);
});

test('nested Ready/load ordering and own command publication preserve the active SDK, but a switched snapshot invalidates it immediately', async () => {
    const lifecycle = new Map(); let sdk; let ready = false;
    const runtime = { active: false, snapshot: null };
    const activate = jest.fn(api => { sdk = api; });
    const api = { isExperienceReady: () => ready, lifecycleCommand: async () => {
        lifecycle.get('SESSION_LOADED')(); return { committed: true };
    } };
    const host = createNativeExtensionsHost({ document, runtime, officialSettings: { read: async () => ({ value: { enabled: false } }) }, client: { list: async () => [plugin()] },
        readPreset: async () => ({ preset: null }), nativeApi: () => api, importModule: async () => ({ activate }),
        onLifecycle: (type, callback) => { lifecycle.set(type, callback); return () => lifecycle.delete(type); },
        onConfiguration: () => () => {}, onChanged: () => () => {} });
    await host.refresh();
    runtime.active = true; runtime.snapshot = { session: { sessionId: 's', packageId: 'work', packageVersionId: 'exact' }, revision: { branchId: 'b' } };
    ready = true; lifecycle.get('EXPERIENCE_READY')(); await host.refresh();
    const active = sdk; const count = activate.mock.calls.length;
    lifecycle.get('SESSION_LOADED')();
    expect(activate).toHaveBeenCalledTimes(count);
    await expect(active.native.lifecycleCommand({ kind: 'pump' })).resolves.toEqual({ committed: true });
    expect(active.signal.aborted).toBe(false);
    runtime.snapshot.session.sessionId = 'new-session';
    await expect(active.native.lifecycleCommand({ kind: 'pump' })).rejects.toThrow('disposed');
    await host.dispose();
});
