import { assertSceneCue, assertSceneCueIR } from '../../shared/native-presentation-contract.js';
import { compileUiDocument } from './experience/ui/v2-document.js';
import { mountUiDocument } from './experience/ui/v2-runtime.js';
import { createSurfaceHost } from './experience/ui/surfaces.js';
import { createResponsiveEnvironment } from './experience/ui/environment.js';

import { cloneGameUiValue as copy } from './experience/ui/clone.js';
const key = ref => ref.assetId + ':' + ref.contentHash;
const identity = snapshot => [snapshot?.session?.sessionId, snapshot?.revision?.branchId, snapshot?.session?.packageVersionId].join(':');
const fail = code => { throw Object.assign(new Error(code), { code }); };

// A mount-scoped Host adapter. All scene nodes use mountUiDocument, all facts use
// lifecycle.command, and all narrative jobs use its existing outbox/scheduler.
export function createNativePresentationClient({ runtime, lifecycle, document: doc = globalThis.document,
    window: win = globalThis.window, fetchImpl = (...args) => fetch(...args), headers = () => ({}),
    now = () => performance.now(), voicePreferences = () => ({}), saveVoicePreference = () => {} } = {}) {
    let session = null; let serial = 0;
    const snapshot = () => runtime.snapshot;
    function current(token = session) {
        if (!token || token !== session || token.disposed || identity(snapshot()) !== token.identity || runtime.history) fail('native_presentation_stale');
        return token;
    }
    function scope(id, epoch, token = session) {
        current(token); const value = snapshot().states?.atri_lifecycle?.scopes[id];
        if (!value || value.status !== 'active' || (epoch !== undefined && value.epoch !== epoch)) fail('native_presentation_scope_stale');
        return value;
    }
    function capabilities() {
        const nav = win?.navigator;
        return { fullscreen: Boolean(doc?.fullscreenEnabled && doc.documentElement?.requestFullscreen), focus: Boolean(doc?.documentElement?.focus),
            gamepad: typeof nav?.getGamepads === 'function', responsive: Boolean(win), 'reduced-motion': typeof win?.matchMedia === 'function',
            speech: Boolean(win?.speechSynthesis && win?.SpeechSynthesisUtterance), audio: Boolean(doc?.createElement('audio').canPlayType), video: Boolean(doc?.createElement('video').canPlayType) };
    }
    function gesture() { if (!win?.navigator?.userActivation?.isActive) fail('native_presentation_user_activation_required'); }
    function receipt(token, value) { token.receipts.push({ kind: 'render', ...value }); if (token.receipts.length > 128) token.receipts.shift(); }
    function assetRef(ref, token) {
        const value = token.assets.find(item => key(item) === key(ref));
        if (!value) fail('native_presentation_asset_missing'); return value;
    }
    async function ensureAsset(ref, token, eager = false) {
        current(token); const asset = assetRef(ref, token); const cached = token.loaded.get(key(ref)); if (cached) return cached;
        const url = '/api/native/session/asset/' + ref.assetId + '?contentHash=' + ref.contentHash;
        const response = await fetchImpl(url, { method: eager ? 'GET' : 'HEAD', headers: headers(), signal: token.abort.signal });
        current(token);
        if (!response.ok || response.headers.get('ETag') !== '"' + ref.contentHash + '"'
            || Number(response.headers.get('Content-Length')) !== asset.size) fail('native_presentation_asset_integrity');
        let resolved = url;
        if (eager) {
            const bytes = await response.arrayBuffer(); current(token);
            if (bytes.byteLength !== asset.size) fail('native_presentation_asset_integrity');
            const hash = [...new Uint8Array(await win.crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
            current(token); if (hash !== ref.contentHash) fail('native_presentation_asset_integrity');
            resolved = win.URL.createObjectURL(new win.Blob([bytes], { type: asset.mediaType })); token.urls.add(resolved);
        }
        token.loaded.set(key(ref), resolved); return resolved;
    }
    function stopScene(handle) { handle.runtime?.dispose(); handle.runtime = null; }
    function releaseSceneInteraction(handle, token) {
        if (session !== token) return;
        if (token.fullscreenRoot === handle.container) {
            token.fullscreenRoot = null;
            if (doc.fullscreenElement === handle.container) void doc.exitFullscreen?.().catch(() => {});
        }
        if (token.focusRoot === handle.container) {
            token.focusRoot = null;
            if (token.focusBefore?.isConnected) token.focusBefore.focus();
            token.focusBefore = null;
        }
    }
    function dispose() {
        const token = session; if (!token) return; token.disposed = true; token.abort.abort();
        for (const handle of token.scenes) { stopScene(handle); releaseSceneInteraction(handle, token); }
        if (token.speaking) win.speechSynthesis?.cancel();
        for (const url of token.urls) win.URL.revokeObjectURL(url);
        token.environment.dispose(); token.root.remove(); token.activities.clear();
        if (token.fullscreenRoot && doc.fullscreenElement === token.fullscreenRoot) void doc.exitFullscreen?.().catch(() => {});
        if (token.focusBefore?.isConnected) token.focusBefore.focus();
        session = null;
    }
    async function prepare(packageState) {
        dispose(); const definition = packageState.descriptor?.experienceContract?.presentationRuntime;
        if (!definition) return null;
        const root = doc.createElement('div');
        const token = { definition, identity: identity(snapshot()), abort: new AbortController(), disposed: false, ready: false,
            assets: snapshot().manifest.assets, loaded: new Map(), urls: new Set(), scenes: new Set(), receipts: [],
            root, environment: createResponsiveEnvironment(root, { window: win }), activities: new Map(), pending: new Map(), gamepads: new Map(),
            negotiation: definition.host.map(item => ({ ...item, supported: capabilities()[item.id] })) };
        session = token;
        try {
            if (token.negotiation.some(item => item.required && !item.supported)) fail('native_presentation_required_capability');
            for (const pack of definition.assetPacks.filter(item => item.delivery === 'eager')) {
                try { for (const ref of pack.assets) await ensureAsset(ref, token, true); } catch (error) { current(token); receipt(token, { packId: pack.id, status: 'unavailable' }); if (pack.required) throw error; }
            }
            current(token); token.ready = true; return getCapabilities();
        } catch (error) { if (session === token) dispose(); throw error; }
    }
    function getCapabilities() {
        const token = current(); return copy({ requirements: token.negotiation, environment: token.environment.get(), receipts: token.receipts });
    }
    function approvedAttachments() {
        const selected = new Set(snapshot().timeline.map(item => item.activeVariantId));
        return (snapshot().variants ?? []).filter(item => selected.has(item.variantId)).flatMap(item => item.metadata?.attachments ?? []);
    }
    function cue(value, token) { return assertSceneCue(value, token.definition, { assets: token.assets, attachments: approvedAttachments() }); }
    function bindMedia(element, raw, onDiagnostic) {
        const token = current(); const value = cue(raw, token); let active = true; let animation;
        const ref = value.asset ?? value.attachment;
        if (value.attachment && !token.assets.some(item => key(item) === key(ref))) token.assets = [...token.assets, ...approvedAttachments().filter(item => key(item) === key(ref))];
        element.style.maxWidth = '100%'; element.style.objectFit = value.fit ?? 'contain';
        if (value.kind === 'image') { element.alt = value.alt ?? ''; element.loading = 'lazy'; } else { element.controls = true; element.preload = 'metadata'; element.loop = value.loop ?? false; element.volume = value.volume ?? 1; if (value.kind === 'video') element.playsInline = true; }
        const failure = () => { if (active) { element.dataset.mediaStatus = 'error'; onDiagnostic?.({ code: 'native_media_unavailable' }); receipt(token, { cueId: value.id, status: 'error' }); } };
        element.addEventListener('error', failure);
        element.dataset.mediaStatus = 'loading';
        void ensureAsset(ref, token).then(url => {
            if (!active) return; current(token); element.src = url; element.dataset.mediaStatus = 'ready';
            if (value.motion === 'fade' && !token.environment.get().reducedMotion) animation = element.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
            receipt(token, { cueId: value.id, status: 'mounted' });
        }).catch(failure);
        return () => {
            active = false; animation?.cancel(); element.removeEventListener('error', failure);
            if (value.kind !== 'image') { element.pause(); element.removeAttribute('src'); element.load(); } else element.removeAttribute('src');
        };
    }
    function speak(raw) {
        const token = current(); gesture(); const value = cue(raw, token); if (value.kind !== 'speech') fail('native_speech_cue_required');
        const definition = token.definition.voices.find(item => item.id === value.voiceId);
        const preferences = voicePreferences();
        const voices = win.speechSynthesis.getVoices().filter(voice => voice.localService);
        const voice = voices.find(item => item.voiceURI === preferences[definition.actorId]) ?? voices.find(item => item.lang.toLowerCase() === definition.lang.toLowerCase());
        if (!voice) fail('native_actor_voice_unavailable');
        const utterance = new win.SpeechSynthesisUtterance(value.text);
        Object.assign(utterance, { voice, lang: definition.lang, rate: definition.rate, pitch: definition.pitch });
        win.speechSynthesis.cancel(); token.speaking = true;
        utterance.onend = utterance.onerror = () => { token.speaking = false; };
        win.speechSynthesis.speak(utterance); receipt(token, { cueId: value.id, status: 'speaking' });
    }
    function renderScene(handle, ir, token) {
        scope(handle.scene.scopeId, handle.epoch, token);
        const normalized = assertSceneCueIR(ir, token.definition, { assets: token.assets, attachments: approvedAttachments() });
        const lastClear = normalized.cues.findLastIndex(item => item.kind === 'clear');
        const children = normalized.cues.slice(lastClear + 1).map((value, index) => ({ id: 'cue_' + index,
            type: value.kind === 'caption' ? 'text' : value.kind === 'speech' ? 'speech-cue' : 'media-cue',
            props: value.kind === 'caption' ? { text: value.text } : { cue: value } }));
        const definition = compileUiDocument({ schemaVersion: 2, stateVersion: 1, localState: {}, preferences: {}, actions: {},
            views: [{ id: 'scene', surface: 'chat.footer', mount: 'always', root: { id: 'scene_root', type: 'stack', children } }] }, { mode: 'component', hostScene: true });
        stopScene(handle);
        handle.runtime = mountUiDocument(definition, { document: doc, window: win, presentation: api,
            instanceId: 'scene-' + (++serial), environmentRoot: handle.container,
            surfaceHost: createSurfaceHost({ resolveSurface: () => handle.container }), onDiagnostic: diagnostic => receipt(token, diagnostic) });
    }
    function mountScene(container, sceneId) {
        const token = current(); const scene = token.definition.scenes.find(item => item.id === sceneId);
        if (!token.ready || !scene) fail('native_scene_unavailable');
        const handle = { container, scene, epoch: scope(scene.scopeId).epoch, runtime: null };
        renderScene(handle, { schemaVersion: 1, cues: scene.cues }, token); token.scenes.add(handle);
        return { dispose() { stopScene(handle); releaseSceneInteraction(handle, token); token.scenes.delete(handle); if (session === token && token.speaking) win.speechSynthesis?.cancel(); } };
    }
    function presentScene(sceneId, ir) {
        const token = current(); const handles = [...token.scenes].filter(item => item.scene.id === sceneId);
        if (!handles.length) fail('native_scene_not_mounted'); for (const handle of handles) renderScene(handle, ir ?? { schemaVersion: 1, cues: handle.scene.cues }, token);
    }
    function refresh() {
        if (!session) return;
        try {
            const token = current();
            for (const handle of token.scenes) { try { scope(handle.scene.scopeId, handle.epoch, token); } catch { stopScene(handle); releaseSceneInteraction(handle, token); if (token.speaking) win.speechSynthesis?.cancel(); } }
            for (const [id, clock] of token.activities) {
                const record = snapshot().states.atri_lifecycle?.activities?.find(item => item.instanceId === id);
                if (!record || record.status !== 'active' || record.runEpoch !== clock.runEpoch || snapshot().states.atri_lifecycle.scopes[record.scopeId]?.status !== 'active') token.activities.delete(id);
            }
        } catch { dispose(); }
    }
    function getActivityElapsed(instanceId) {
        if (!session) return null; refresh(); if (!session) return null;
        const clock = instanceId ? session.activities.get(instanceId) : session.activities.values().next().value;
        return clock ? Math.min(604800000, clock.elapsed + Math.max(0, Math.floor(now() - clock.started))) : null;
    }
    function getActivityProjection() {
        const elapsedMs = getActivityElapsed();
        if (elapsedMs === null) return null;
        const instanceId = session.activities.keys().next().value;
        const record = snapshot().states.atri_lifecycle.activities.find(item => item.instanceId === instanceId);
        return { activityId: record.activityId, elapsedMs };
    }
    async function activityCommand(kind, input) {
        if (!['activity.start', 'activity.pause', 'activity.resume', 'activity.settle', 'activity.cancel'].includes(kind) || Object.hasOwn(input ?? {}, 'kind')) fail('native_activity_action_invalid');
        const token = current(); if (!token.ready || !snapshot().states.atri_lifecycle?.ready) fail('native_activity_not_ready');
        const id = input.instanceId; const pendingKey = kind + ':' + id;
        let pending = token.pending.get(pendingKey);
        if (!pending) {
            const action = { kind, ...copy(input) };
            if (['activity.pause', 'activity.settle'].includes(kind)) {
                const clock = token.activities.get(id); if (!clock) fail('native_activity_resume_required');
                action.runEpoch = clock.runEpoch; action.activityElapsedMs = getActivityElapsed(id);
            }
            pending = action; token.pending.set(pendingKey, pending);
        }
        try {
            const result = await lifecycle.command(pending); current(token); token.pending.delete(pendingKey);
            const record = result.states.atri_lifecycle.activities.find(item => item.instanceId === id);
            if (['activity.start', 'activity.resume'].includes(kind)) token.activities.set(id, { elapsed: record.activityElapsedMs, runEpoch: record.runEpoch, started: now() });
            else token.activities.delete(id);
            return result;
        } catch (error) { if (error.status >= 400 && error.status < 500) token.pending.delete(pendingKey); throw error; }
    }
    async function fullscreen(sceneId) {
        const token = current(); gesture(); const handle = [...token.scenes].find(item => item.scene.id === sceneId);
        if (!handle) fail('native_scene_not_mounted'); scope(handle.scene.scopeId, handle.epoch);
        token.fullscreenRoot = handle.container;
        try {
            await handle.container.requestFullscreen(); current(token);
            if (!token.scenes.has(handle) || !handle.runtime) fail('native_scene_not_mounted');
            scope(handle.scene.scopeId, handle.epoch, token);
        } catch (error) {
            if (doc.fullscreenElement === handle.container) await doc.exitFullscreen?.().catch(() => {});
            if (token.fullscreenRoot === handle.container) token.fullscreenRoot = null;
            throw error;
        }
    }
    function focus(sceneId) {
        const token = current(); const handle = [...token.scenes].find(item => item.scene.id === sceneId);
        if (!handle) fail('native_scene_not_mounted'); scope(handle.scene.scopeId, handle.epoch);
        token.focusBefore ??= doc.activeElement; token.focusRoot = handle.container;
        const target = handle.container.querySelector('button, input, video, audio, [tabindex]') ?? handle.container;
        if (target === handle.container) target.tabIndex = -1; target.focus();
    }
    function sampleGamepads() {
        const token = current();
        if (doc.hidden || !doc.hasFocus() || !capabilities().gamepad) { token.gamepads.clear(); return []; }
        return [...(win.navigator.getGamepads() ?? [])].filter(pad => pad?.connected).slice(0, 4).map(pad => {
            const previous = token.gamepads.get(pad.index) ?? []; const buttons = pad.buttons.slice(0, 32).map(button => Boolean(button.pressed));
            token.gamepads.set(pad.index, buttons);
            return { index: pad.index, axes: pad.axes.slice(0, 16).map(value => !Number.isFinite(value) || Math.abs(value) < 0.15 ? 0 : Math.max(-1, Math.min(1, value))),
                pressed: buttons.flatMap((value, index) => value && !previous[index] ? [index] : []), released: buttons.flatMap((value, index) => !value && previous[index] ? [index] : []) };
        });
    }
    const api = { prepare, dispose, refresh, getCapabilities, getActivityElapsed, getActivityProjection, mountScene, presentScene, bindMedia, speak, focus, fullscreen, sampleGamepads,
        activity: activityCommand, stopSpeech() { if (session?.speaking) { win.speechSynthesis.cancel(); session.speaking = false; } },
        setActorVoice(actorId, voiceURI) {
            const token = current(); if (!token.definition.voices.some(item => item.actorId === actorId)
            || !win.speechSynthesis?.getVoices().some(item => item.localService && item.voiceURI === voiceURI)) fail('native_actor_voice_unavailable'); saveVoicePreference(actorId, voiceURI);
        } };
    return Object.freeze(api);
}
