/** @jest-environment jsdom */
import { randomUUID } from 'node:crypto';
Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: randomUUID });
import { serialize, deserialize } from 'node:v8';
globalThis.structuredClone ??= value => deserialize(serialize(value));
import { afterAll, beforeEach, expect, jest, test } from '@jest/globals';
import { NATIVE_SESSION_LIFECYCLE as EVENTS, emitNativeSessionLifecycle, onNativeSessionLifecycle } from '../../public/scripts/native/session-lifecycle.js';

const copy = value => structuredClone(value);
const flush = async () => { for (let index = 0; index < 50; index++) await Promise.resolve(); };
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const snapshot = () => ({ session: { sessionId: 's', packageId: 'p', packageVersionId: 'v', entryPointId: 'e' },
    revision: { revisionId: 'r', branchId: 'b' }, timeline: [], states: { atri_lifecycle: { scopes: { scene: { status: 'active', epoch: 0 } } } } });
const native = { active: false, snapshot: null, host: { isGenerating: () => false },
    acceptOperationSnapshot: jest.fn(async value => { native.snapshot = value; await emitNativeSessionLifecycle(EVENTS.SESSION_LOADED, { sessionId: value.session.sessionId, branchId: value.revision.branchId }); }) };
let presentationRuntime;
const packageState = () => ({ status: 'ready', active: true, sessionId: 's',
    descriptor: { ...native.snapshot.session, experience: { mode: 'component' }, experienceContract: { lifecycleRuntime: { schemaVersion: 1 }, ...(presentationRuntime ? { presentationRuntime } : {}) } },
    runtime: { experience: { mode: 'component', frontend: { kind: 'native', version: 3, entry: 'runtime/frontend/index.json' }, features: [] } }, errors: [] });
const loadPackage = jest.fn(async sessionId => sessionId ? packageState() : { status: 'none', active: false, errors: [] });
const ui = () => ({ dispose: jest.fn(async () => {}), refresh: jest.fn() });
const mount = jest.fn(async () => ui());
const loadLogic = jest.fn(async () => ({}));
const reply = { dispose: jest.fn(), invalidate: jest.fn(async () => {}) };
const api = {};
const priorAtria = globalThis.Atria; const priorFetch = globalThis.fetch;
globalThis.Atria = { getContext: () => ({ eventSource: { on() {} }, eventTypes: { CHAT_CHANGED: 'changed' },
    capabilitySettings: {}, getRequestHeaders: () => ({ 'X-CSRF-Token': 'local-fixture' }), registerCapabilityApi: (name, value) => { api[name] = value; } }) };
globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => { const next = copy(native.snapshot); next.revision.revisionId += 'x'; return next; } }));
await jest.unstable_mockModule('../../public/scripts/native/session-runtime.js', () => ({ nativeSessionRuntime: native }));
await jest.unstable_mockModule('../../public/scripts/native/reply-variants.js', () => ({ createReplyVariantController: () => reply }));
await jest.unstable_mockModule('../../public/scripts/native/experience/package-loader.js', () => ({
    GAME_PACKAGE_STATUS: { NONE: 'none', READY: 'ready', INVALID: 'invalid', ERROR: 'error' }, loadNativeGamePackage: loadPackage,
    loadGamePackageJsonResource: jest.fn(), loadExperienceData: jest.fn(),
}));
await jest.unstable_mockModule('../../public/scripts/native/experience/ui/live.js', () => ({ activateNativeExperienceRuntime: mount }));
await jest.unstable_mockModule('../../public/scripts/native/experience/world/session.js', () => ({ createGameWorldSession: async () => null, GAME_RUNTIME_STATE_NAMESPACE: 'atri_game_runtime' }));
await jest.unstable_mockModule('../../public/scripts/native/experience/logic/package.js', () => ({ loadGameLogicDefinition: loadLogic }));
await jest.unstable_mockModule('../../public/scripts/native/experience/llm/declarative-observations.js', () => ({ loadGameObservationDefinitions: async () => [] }));
const experience = await import('../../public/scripts/native/experience/index.js');
await flush();
const ready = jest.fn(); const unsubscribe = onNativeSessionLifecycle(EVENTS.EXPERIENCE_READY, ready);
beforeEach(async () => {
    await emitNativeSessionLifecycle(EVENTS.SESSION_CLOSED);
    presentationRuntime = null; native.active = true; native.snapshot = snapshot(); native.history = false; native.failed = false;
    ready.mockClear(); globalThis.fetch.mockClear(); loadPackage.mockClear(); mount.mockReset(); mount.mockImplementation(async () => ui());
});
afterAll(async () => { await emitNativeSessionLifecycle(EVENTS.SESSION_CLOSED); unsubscribe(); globalThis.Atria = priorAtria; globalThis.fetch = priorFetch; });

test('real load integration emits Ready only after mounted UI, then accepts its snapshots without remount/loop', async () => {
    const pendingMount = gate(); mount.mockImplementationOnce(() => pendingMount.promise);
    const loading = experience.reloadGamePackage(); await flush();
    expect(ready).not.toHaveBeenCalled(); expect(globalThis.fetch).not.toHaveBeenCalled();
    const session = ui(); pendingMount.resolve(session); await loading;
    expect(ready).toHaveBeenCalledTimes(1); expect(mount).toHaveBeenCalledTimes(1); expect(loadPackage).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2); expect(session.refresh).toHaveBeenCalledTimes(2);
    expect(api['game-runtime'].getApplicationRecords).toEqual(expect.any(Function));
    expect(api['game-runtime'].getTemporalProjection).toEqual(expect.any(Function));
    expect(mount.mock.calls[0][2].getTemporalProjection).toEqual(expect.any(Function));
});

test('UI failure does not emit Ready or start automation', async () => {
    mount.mockRejectedValueOnce(new Error('projection failed'));
    await experience.reloadGamePackage();
    expect(experience.getGamePackageState().status).toBe('invalid'); expect(ready).not.toHaveBeenCalled(); expect(globalThis.fetch).not.toHaveBeenCalled();
});

test('superseded mount is disposed, and only its replacement may emit Ready', async () => {
    const old = gate(); mount.mockImplementationOnce(() => old.promise);
    const first = experience.reloadGamePackage(); await flush();
    const second = experience.reloadGamePackage(); await second;
    const oldUi = ui(); old.resolve(oldUi); await first; await flush();
    expect(oldUi.dispose).toHaveBeenCalledTimes(1); expect(ready).toHaveBeenCalledTimes(1); expect(globalThis.fetch).toHaveBeenCalledTimes(2);
});

test('closing view cancels a pending load and leaves Session authority untouched', async () => {
    const pendingMount = gate(); mount.mockImplementationOnce(() => pendingMount.promise);
    const loading = experience.reloadGamePackage(); await flush();
    const saved = copy(native.snapshot); await api['game-runtime'].exitUi();
    const session = ui(); pendingMount.resolve(session); await loading; await flush();
    expect(session.dispose).toHaveBeenCalledTimes(1); expect(native.snapshot).toEqual(saved);
    expect(ready).not.toHaveBeenCalled(); expect(globalThis.fetch).not.toHaveBeenCalled();
});

test('external revision wakes once, while lifecycle commits are not recursive clock ticks', async () => {
    await experience.reloadGamePackage(); globalThis.fetch.mockClear();
    await emitNativeSessionLifecycle(EVENTS.REVISION_COMMITTED, { stateNamespaces: ['atri_lifecycle'] });
    await new Promise(resolve => setTimeout(resolve, 1)); expect(globalThis.fetch).not.toHaveBeenCalled();
    await emitNativeSessionLifecycle(EVENTS.REVISION_COMMITTED, { messageIds: ['committed-turn'] });
    await new Promise(resolve => setTimeout(resolve, 1)); await flush();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1); expect(ready).toHaveBeenCalledTimes(1);
});

function enablePresentation() {
    native.snapshot.manifest = { assets: [] };
    presentationRuntime = { schemaVersion: 1, assetPacks: [], scenes: [], activities: [], voices: [], host: [] };
}
test('superseded UI cleanup cannot dispose the replacement Presentation Host', async () => {
    enablePresentation();
    const old = gate(); mount.mockImplementationOnce(() => old.promise);
    const first = experience.reloadGamePackage(); await flush();
    await experience.reloadGamePackage();
    const oldUi = ui(); old.resolve(oldUi); await first; await flush();
    expect(oldUi.dispose).toHaveBeenCalledTimes(1);
    expect(experience.getGamePackageState().status).toBe('ready');
    expect(api['game-runtime'].getPresentationCapabilities().requirements).toEqual([]);
    expect(ready).toHaveBeenCalledTimes(1);
});

test('runtime initialization failure releases its prepared Presentation Host', async () => {
    enablePresentation(); loadLogic.mockRejectedValueOnce(new Error('logic initialization failed'));
    await experience.reloadGamePackage();
    expect(experience.getGamePackageState().status).toBe('invalid');
    expect(() => api['game-runtime'].getPresentationCapabilities()).toThrow('native_presentation_stale');
    expect(ready).not.toHaveBeenCalled();
});


test.each(['sync', 'async'])('v3 %s presentation failure cannot reject a committed lifecycle event or replay authority', async kind => {
    const session = ui(); const failure = new Error('presentation unavailable');
    session.refresh.mockImplementation(() => { if (kind === 'sync') throw failure; return Promise.reject(failure); });
    mount.mockResolvedValueOnce(session);
    const report = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
        await experience.reloadGamePackage(); await flush();
        const committed = copy(native.snapshot); globalThis.fetch.mockClear();
        await expect(emitNativeSessionLifecycle(EVENTS.REVISION_COMMITTED, { stateNamespaces: ['atri_lifecycle'] })).resolves.not.toThrow();
        await flush();
        expect(native.snapshot).toEqual(committed);
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(loadPackage).toHaveBeenCalledTimes(1);
        expect(ready).toHaveBeenCalledTimes(1);
        expect(report).toHaveBeenCalledWith('Native UI revision refresh failed', failure);
    } finally { report.mockRestore(); }
});
