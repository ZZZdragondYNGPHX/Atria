// Host-owned exact audio, bounded voices and presentation-only preferences.
// Package code never receives an element, URL, timer or playback callback.
export function createAudioHost({ window, document = window.document, media, storage, createAudio = () => new window.Audio() }) {
    const saved = storage?.read('prefs', 'mediaAudio', 'player');
    let prefs = { muted: false, ambience: 0.45, effects: 0.55 };
    if (saved && typeof saved.muted === 'boolean' && ['ambience', 'effects'].every(k => Number.isFinite(saved[k]) && saved[k] >= 0 && saved[k] <= 1)) prefs = { muted: saved.muted, ambience: saved.ambience, effects: saved.effects };
    let enabled = false, gesture = false, disposed = false, epoch = 0, state = 'locked', reason = '', desired = [], fade = 0;
    const ambient = new Map(), effects = new Set(), armed = new Set(), committed = new Set(), consumed = new Set();
    let sceneChain = Promise.resolve();
    const active = () => !disposed && enabled && gesture && !prefs.muted && !document.hidden;
    const status = () => ({ state: disposed ? 'locked' : !enabled || !gesture ? 'locked' : document.hidden ? 'hidden' : prefs.muted ? 'muted' : state,
        enabled, ...prefs, playing: [...ambient.values(), ...effects].filter(v => !v.element.paused).length, reason });
    const clearVoice = v => { v.element.pause(); v.element.removeAttribute?.('src'); v.element.load?.(); v.release?.(); };
    function stop() { ++epoch; window.cancelAnimationFrame(fade); fade = 0; ambient.forEach(clearVoice); ambient.clear(); effects.forEach(clearVoice); effects.clear(); }
    async function play(v) { if (!active()) return; try { await v.element.play(); state = 'ready'; reason = ''; } catch { state = 'blocked'; reason = 'audio_playback_blocked'; } }
    async function voice(ref, gain, loop, token) {
        if (ref.kind !== 'exact') throw new TypeError('audio_exact_required');
        const resolved = await media.resolve(ref, 'audio');
        if (disposed || token !== epoch) { resolved.release?.(); return null; }
        const element = createAudio(); element.src = resolved.url; element.preload = 'auto'; element.loop = loop;
        const v = { element, gain, level: loop ? 0 : 1, release: resolved.release };
        element.volume = gain * prefs[loop ? 'ambience' : 'effects'];
        element.addEventListener?.('error', () => { state = 'failed'; reason = 'audio_decode_failed'; });
        return v;
    }
    function volume() { for (const v of ambient.values()) v.element.volume = active() ? v.gain * v.level * prefs.ambience : 0; for (const v of effects) v.element.volume = active() ? v.gain * prefs.effects : 0; }
    function transition(ms, retiring) {
        window.cancelAnimationFrame(fade); const start = window.performance.now(), starts = new Map([...ambient].map(([id, v]) => [id, v.level]));
        const tick = () => {
            if (disposed) return;
            const t = ms ? Math.min(1, (window.performance.now() - start) / ms) : 1;
            for (const [id, v] of ambient) v.level = (starts.get(id) ?? 0) + ((retiring.has(id) ? 0 : 1) - (starts.get(id) ?? 0)) * t;
            volume();
            if (t < 1) fade = window.requestAnimationFrame(tick);
            else { for (const id of retiring) { const v = ambient.get(id); if (v) clearVoice(v); ambient.delete(id); } fade = 0; }
        }; tick();
    }
    async function scene(input, revision) {
        const token = epoch, next = new Set(input.ambience.map(v => v.ref.id));
        // A short sound can consume only a revision just committed by this
        // live bridge. Refresh, history, task results and restore never arm it.
        const playEvents = armed.delete(revision) && active();
        desired = input.ambience.map(v => ({ ref: { ...v.ref }, gain: v.gain }));
        try {
            for (const item of desired) {
                if (ambient.has(item.ref.id)) { ambient.get(item.ref.id).gain = item.gain; continue; }
                if (ambient.size >= 6) break;
                const v = await voice(item.ref, item.gain, true, token); if (!v) return status();
                ambient.set(item.ref.id, v); await play(v);
            }
            if (token !== epoch || disposed) return status();
            transition(input.transitionMs, new Set([...ambient.keys()].filter(id => !next.has(id))));
            if (playEvents) for (const event of input.events) {
                if (consumed.has(event.id)) continue;
                if (effects.size >= 2) break;
                const v = await voice(event.ref, event.gain, false, token); if (!v) break;
                consumed.add(event.id); while (consumed.size > 256) consumed.delete(consumed.values().next().value);
                effects.add(v); v.element.addEventListener?.('ended', () => { effects.delete(v); clearVoice(v); }, { once: true }); await play(v);
            }
        } catch { state = 'failed'; reason = 'audio_asset_unavailable'; }
        return status();
    }
    const trusted = event => { if (event.isTrusted && (event.type === 'pointerdown' || !event.repeat)) gesture = true; };
    const visibility = () => { if (document.hidden) { [...ambient.values(), ...effects].forEach(v => v.element.pause()); effects.forEach(clearVoice); effects.clear(); armed.clear(); } else if (active()) ambient.forEach(v => void play(v)); };
    document.addEventListener('pointerdown', trusted, true); document.addEventListener('keydown', trusted, true); document.addEventListener('visibilitychange', visibility);
    return {
        status, commit(revision) { if (disposed || committed.has(revision)) return; committed.add(revision); while (committed.size > 256) committed.delete(committed.values().next().value); armed.add(revision); while (armed.size > 8) armed.delete(armed.values().next().value); },
        async invoke(method, input, revision) {
            if (disposed) throw new Error('audio_disposed');
            if (method === 'audioStatus') return status();
            if (method === 'enableAudio') { enabled = true; state = 'ready'; reason = gesture ? '' : 'audio_user_gesture_required'; if (active()) { ambient.forEach(v => void play(v)); await scene({ ambience: desired, events: [], transitionMs: 150 }, null); } return status(); }
            if (method === 'setAudioPreferences') { prefs = { ...input }; storage?.write('prefs', 'mediaAudio', 'player', prefs); volume(); if (!active()) [...ambient.values(), ...effects].forEach(v => v.element.pause()); else ambient.forEach(v => void play(v)); return status(); }
            if (method === 'setAudioScene') { const token = epoch; const result = sceneChain.catch(() => {}).then(() => token === epoch && !disposed ? scene(input, revision) : status()); sceneChain = result; return result; }
            if (method === 'stopAudio') { stop(); desired = []; return status(); }
            throw new Error('audio_method_denied');
        },
        reset() { stop(); desired = []; armed.clear(); consumed.clear(); },
        dispose() { if (disposed) return; stop(); disposed = true; armed.clear(); document.removeEventListener('pointerdown', trusted, true); document.removeEventListener('keydown', trusted, true); document.removeEventListener('visibilitychange', visibility); },
    };
}
