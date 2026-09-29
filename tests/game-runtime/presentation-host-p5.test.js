/** @jest-environment jsdom */
import { serialize, deserialize } from 'node:v8';
globalThis.structuredClone ??= value => deserialize(serialize(value));
import { jest } from '@jest/globals';
import { createHash, webcrypto } from 'node:crypto';
import { createNativeLifecycleClient } from '../../public/scripts/native/lifecycle-client.js';
import { createNativePresentationClient } from '../../public/scripts/native/presentation-client.js';
const clients = []; const mounts = [];
const bytes = new Uint8Array([1, 2, 3, 4]);
const asset = { assetId: 'asset_' + 'a'.repeat(32), contentHash: createHash('sha256').update(bytes).digest('hex'), size: 4, mediaType: 'image/png' };
const ref = { assetId: asset.assetId, contentHash: asset.contentHash };
const media = { id: 'image', kind: 'image', asset: ref, alt: 'Harbor view', motion: 'fade' };
const speech = { id: 'line', kind: 'speech', voiceId: 'hero', text: 'The harbor is quiet.' };
function fixture({ delivery = 'lazy', required = true, host = [] } = {}) {
    const runtime = { active: true, history: false, snapshot: { session: { sessionId: 's', packageVersionId: 'v' }, revision: { revisionId: 'r', branchId: 'b' },
        manifest: { assets: [asset] }, variants: [], timeline: [], states: { atri_lifecycle: { ready: true, scopes: { scene: { status: 'active', epoch: 0 } }, activities: [] } } } };
    const definition = { schemaVersion: 1, activities: [], scenes: [{ id: 'stage', scopeId: 'scene', cues: [media, { id: 'caption', kind: 'caption', text: 'Harbor' }, speech] }],
        assetPacks: [{ id: 'art', assets: [ref], delivery, required, maxBytes: 100 }],
        voices: [{ id: 'hero', actorId: 'actor_' + 'b'.repeat(32), lang: 'en-US', rate: 1, pitch: 1 }], host };
    const packageState = { descriptor: { experienceContract: { presentationRuntime: definition } } };
    let tick = 0; const getTick = () => tick;
    const fetchImpl = jest.fn(async () => ({ ok: true, headers: new Map([['ETag', '"' + ref.contentHash + '"'], ['Content-Length', '4']]), arrayBuffer: async () => bytes.buffer }));
    const lifecycle = { command: jest.fn(async action => {
        const records = runtime.snapshot.states.atri_lifecycle.activities;
        let record = records.find(item => item.instanceId === action.instanceId);
        if (action.kind === 'activity.start') { record = { instanceId: action.instanceId, activityId: action.activityId, scopeId: 'scene', status: 'active', activityElapsedMs: 0, runEpoch: 0 }; records.push(record); }
        else if (action.kind === 'activity.resume') { record.status = 'active'; record.runEpoch++; }
        else { record.status = action.kind === 'activity.pause' ? 'paused' : action.kind === 'activity.cancel' ? 'cancelled' : 'settled'; if (action.activityElapsedMs != null) record.activityElapsedMs = action.activityElapsedMs; }
        runtime.snapshot.revision.revisionId += 'x'; return runtime.snapshot;
    }) };
    const saveVoicePreference = jest.fn();
    const client = createNativePresentationClient({ runtime, lifecycle, document, window, fetchImpl, now: getTick, saveVoicePreference });
    clients.push(client); return { runtime, lifecycle, definition, packageState, fetchImpl, client, saveVoicePreference, tick: value => { tick = value; } };
}
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
beforeEach(() => {
    Object.defineProperty(window.crypto, 'subtle', { configurable: true, value: webcrypto.subtle });
    window.URL.createObjectURL = jest.fn(() => 'blob:fixture'); window.URL.revokeObjectURL = jest.fn();
    window.matchMedia = jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
    Object.defineProperty(window.navigator, 'userActivation', { configurable: true, value: { isActive: true } });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [{ voiceURI: 'local', localService: true, lang: 'en-US' }], speak: jest.fn(), cancel: jest.fn() } });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {}); jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => { mounts.splice(0).forEach(item => item.dispose()); clients.splice(0).forEach(item => item.dispose()); jest.restoreAllMocks(); document.body.replaceChildren(); });
function mount(client) {
    const root = document.createElement('section'); document.body.append(root);
    const scene = document.createElement('section'); scene.className = 'test-scene'; root.append(scene);
    const ui = client.mountScene(scene, 'stage'); mounts.push(ui); return root;
}
test('Host SceneCue adapter uses, exact assets and inert captions; speech has a visible activation button', async () => {
    const f = fixture(); await f.client.prepare(f.packageState); const root = mount(f.client); await flush();
    expect(root.querySelector('img').alt).toBe('Harbor view'); expect(root.querySelector('img').src).toContain('contentHash=' + ref.contentHash);
    expect(root.textContent).toContain('Harbor'); expect(root.querySelector('button').textContent).toBe(speech.text);
    root.querySelector('button').click(); expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
    f.client.presentScene('stage', { schemaVersion: 1, cues: [{ id: 'clear', kind: 'clear' }, { id: 'text', kind: 'caption', text: '<script>literal</script>' }] });
    expect(root.querySelector('img')).toBeNull(); expect(root.querySelector('script')).toBeNull(); expect(root.textContent).toBe('<script>literal</script>');
    expect(f.client.getCapabilities().receipts.every(item => item.kind === 'render')).toBe(true);
});
test('required capability and required eager integrity gate readiness; optional failures remain diagnostics', async () => {
    const unsupported = fixture({ host: [{ id: 'fullscreen', required: true }] }); await expect(unsupported.client.prepare(unsupported.packageState)).rejects.toThrow('required_capability');
    const required = fixture({ delivery: 'eager' }); required.fetchImpl.mockResolvedValue({ ok: false }); await expect(required.client.prepare(required.packageState)).rejects.toThrow('integrity');
    const optional = fixture({ delivery: 'eager', required: false }); optional.fetchImpl.mockResolvedValue({ ok: false });
    const result = await optional.client.prepare(optional.packageState); expect(result.receipts).toContainEqual(expect.objectContaining({ packId: 'art', status: 'unavailable' }));
});
test('eager media verifies SHA-256 and releases blob URLs, while stale asynchronous delivery cannot paint', async () => {
    const f = fixture({ delivery: 'eager' }); await f.client.prepare(f.packageState); const root = mount(f.client); await flush();
    expect(root.querySelector('img').src).toBe('blob:fixture'); f.client.dispose(); expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture');
    const late = fixture(); let release; late.fetchImpl.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    await late.client.prepare(late.packageState); const lateRoot = mount(late.client); late.runtime.snapshot.revision.branchId = 'fork'; late.client.refresh();
    release({ ok: true, headers: new Map([['ETag', '"' + ref.contentHash + '"'], ['Content-Length', '4']]) }); await flush(); expect(lateRoot.querySelector('img')).toBeNull();
});
test('scope epoch transition removes media and stops speech without writing facts', async () => {
    const f = fixture(); await f.client.prepare(f.packageState); const root = mount(f.client); f.client.speak(speech);
    f.runtime.snapshot.states.atri_lifecycle.scopes.scene = { status: 'suspended', epoch: 1 }; f.client.refresh();
    expect(root.querySelector('img')).toBeNull(); expect(window.speechSynthesis.cancel).toHaveBeenCalled(); expect(f.lifecycle.command).not.toHaveBeenCalled();
    expect(() => f.client.presentScene('stage', { schemaVersion: 1, cues: [] })).toThrow('scope_stale');
});
test('actor voice stays player-owned/local, gesture denied Speech never dispatches', async () => {
    const f = fixture(); await f.client.prepare(f.packageState); f.client.setActorVoice(f.definition.voices[0].actorId, 'local'); expect(f.saveVoicePreference).toHaveBeenCalled();
    expect(() => f.client.setActorVoice(f.definition.voices[0].actorId, 'remote')).toThrow();
    window.navigator.userActivation.isActive = false; expect(() => f.client.speak(speech)).toThrow('activation'); expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
});
test('Activity elapsed excludes pause/offline time, resumes with new epoch, uncertain retry keeps exact sample', async () => {
    const f = fixture(); await f.client.prepare(f.packageState); await f.client.activity('activity.start', { activityId: 'encounter', instanceId: 'one' });
    f.tick(200); await f.client.activity('activity.pause', { instanceId: 'one' }); expect(f.client.getActivityElapsed()).toBeNull();
    f.tick(5000); await f.client.activity('activity.resume', { instanceId: 'one' }); f.tick(5300); expect(f.client.getActivityElapsed()).toBe(500);
    f.lifecycle.command.mockRejectedValueOnce(new Error('uncertain transport'));
    await expect(f.client.activity('activity.settle', { instanceId: 'one', outcome: { text: 'won' } })).rejects.toThrow('uncertain');
    f.tick(9999); await f.client.activity('activity.settle', { instanceId: 'one', outcome: { text: 'won' } });
    const calls = f.lifecycle.command.mock.calls; expect(calls.at(-1)[0]).toEqual(calls.at(-2)[0]); expect(calls.at(-1)[0].activityElapsedMs).toBe(500); expect(calls.at(-1)[0].runEpoch).toBe(1);
});
test('restart requires explicit resume and no elapsed value derives from mount/World/wall clock', async () => {
    const f = fixture(); await f.client.prepare(f.packageState); expect(f.client.getActivityElapsed()).toBeNull();
    await expect(f.client.activity('activity.settle', { instanceId: 'unknown', outcome: {} })).rejects.toThrow('resume_required');
    await expect(f.client.activity('scope.transition', { scopeId: 'scene' })).rejects.toThrow('action_invalid');
});
test('fullscreen/focus are bounded to mounted scenes and restore prior focus on dispose', async () => {
    const f = fixture(); await f.client.prepare(f.packageState); const before = document.createElement('button'); document.body.append(before); before.focus(); const root = mount(f.client);
    const scene = root.querySelector('.test-scene'); scene.requestFullscreen = jest.fn(async () => {}); f.client.focus('stage'); expect(document.activeElement).toBe(root.querySelector('button'));
    await f.client.fullscreen('stage'); expect(scene.requestFullscreen).toHaveBeenCalledTimes(1);
    window.navigator.userActivation.isActive = false; await expect(f.client.fullscreen('stage')).rejects.toThrow('activation'); f.client.dispose(); expect(document.activeElement).toBe(before);
});
test('responsive/reduced-motion projection and gamepad edge/deadzone samples remain non-authoritative', async () => {
    const f = fixture(); await f.client.prepare(f.packageState); jest.spyOn(document, 'hasFocus').mockReturnValue(true);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    Object.defineProperty(window.navigator, 'getGamepads', { configurable: true, value: () => [{ index: 0, connected: true, axes: [0.1, 0.5, NaN], buttons: [{ pressed: true }] }] });
    expect(f.client.sampleGamepads()[0]).toEqual({ index: 0, axes: [0, 0.5, 0], pressed: [0], released: [] }); expect(f.client.sampleGamepads()[0].pressed).toEqual([]);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 }); window.dispatchEvent(new Event('resize'));
    expect(f.client.getCapabilities().environment.device).toBe('mobile'); expect(f.lifecycle.command).not.toHaveBeenCalled();
});




test('temporal projection receives the real Activity identity and elapsed sample', async () => {
    const f = fixture(); await f.client.prepare(f.packageState);
    const lifecycle = createNativeLifecycleClient({ runtime: f.runtime, getActivityElapsed: () => f.client.getActivityProjection() });
    expect(lifecycle.getTemporalProjection().activity).toBeNull();
    await f.client.activity('activity.start', { activityId: 'encounter', instanceId: 'one' });
    f.tick(250);
    expect(lifecycle.getTemporalProjection().activity).toEqual({ activityId: 'encounter', elapsedMs: 250 });
    await f.client.activity('activity.pause', { instanceId: 'one' });
    expect(lifecycle.getTemporalProjection().activity).toBeNull();
});

test('scope invalidation exits owned fullscreen and restores the pre-scene focus', async () => {
    const f = fixture(); await f.client.prepare(f.packageState);
    const before = document.createElement('button'); document.body.append(before); before.focus();
    const scene = mount(f.client).querySelector('.test-scene'); let fullscreenElement = null;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement });
    document.exitFullscreen = jest.fn(async () => { fullscreenElement = null; });
    scene.requestFullscreen = async () => { fullscreenElement = scene; };
    f.client.focus('stage'); await f.client.fullscreen('stage');
    f.runtime.snapshot.states.atri_lifecycle.scopes.scene = { status: 'suspended', epoch: 1 }; f.client.refresh();
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1); expect(document.activeElement).toBe(before);
});
test('a fullscreen request resolving after dispose is exited rather than orphaned', async () => {
    const f = fixture(); await f.client.prepare(f.packageState);
    const scene = mount(f.client).querySelector('.test-scene'); let resolve; let fullscreenElement = null;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement });
    document.exitFullscreen = jest.fn(async () => { fullscreenElement = null; });
    scene.requestFullscreen = () => new Promise(done => { resolve = () => { fullscreenElement = scene; done(); }; });
    const pending = f.client.fullscreen('stage'); f.client.dispose(); resolve();
    await expect(pending).rejects.toThrow('stale');
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1); expect(fullscreenElement).toBeNull();
});
