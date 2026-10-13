import { runtimeRequest } from './runtime-client.js';
import { nativeAssetUrl } from './session-projection.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

const actorVoices = new Map();
const identity = snapshot => JSON.stringify([snapshot?.session?.sessionId, snapshot?.revision?.revisionId]);

// Player controls consume only server-described public message references.
// WAV playback requires a separate user gesture on the native audio control.
export function mountSpeechControls({ document: doc, container, runtime, messageId, actorId, request = runtimeRequest }) {
    const root = doc.createElement('div'); root.className = 'atria-play-speech';
    const button = doc.createElement('button'), stop = doc.createElement('button'), select = doc.createElement('select');
    const status = doc.createElement('output'), audio = doc.createElement('audio');
    button.type = stop.type = 'button'; button.textContent = tl('Read aloud'); stop.textContent = tl('Stop'); stop.hidden = true;
    select.setAttribute('aria-label', tl('Voice')); select.hidden = true;
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    audio.controls = true; audio.preload = 'none'; audio.hidden = true;
    root.append(button, select, stop, status, audio); container.append(root);
    let disposed = false, controller = null, operationId = null, captured = identity(runtime().snapshot), prepared = false;
    const post = (path, body, signal) => request('/speech/' + path, { method: 'POST', body, signal });
    const snapshot = () => { const value = runtime().snapshot; if (disposed || identity(value) !== captured || runtime().history) throw new Error('native_speech_source_stale'); return value; };
    const reset = () => {
        controller?.abort(); controller = null;
        if (operationId) void post('cancel', { operationId }).catch(() => {});
        operationId = null; audio.pause(); audio.removeAttribute('src'); audio.load(); audio.hidden = true;
        button.disabled = false; stop.hidden = true;
    };
    stop.onclick = () => { reset(); status.textContent = tl('Stopped'); };
    select.onchange = () => { if (select.value) actorVoices.set(actorId, select.value); };
    button.onclick = async () => {
        if (controller) return;
        controller = new AbortController(); const signal = controller.signal; button.disabled = true; stop.hidden = false;
        try {
            const base = snapshot(), input = { sessionId: base.session.sessionId, revisionId: base.revision.revisionId };
            const current = () => { signal.throwIfAborted(); return snapshot(); };
            status.textContent = tl('Preparing audio…');
            const description = await post('describe', input, signal); current();
            const item = description.items.find(item => item.messageId === messageId && item.actorId === actorId);
            if (!item) throw new Error('native_speech_public_text_unavailable');
            if (!prepared) {
                const voices = await post('voices', {}, signal); current();
                const placeholder = doc.createElement('option'); placeholder.value = ''; placeholder.textContent = tl('Choose a voice'); select.replaceChildren(placeholder);
                for (const voice of voices) { const option = doc.createElement('option'); option.value = voice.voiceId; option.textContent = voice.name + ' · ' + voice.language; select.append(option); }
                select.value = voices.some(voice => voice.voiceId === actorVoices.get(actorId)) ? actorVoices.get(actorId) : '';
                prepared = true; select.hidden = false;
            }
            if (!select.value) { status.textContent = tl('Choose a voice'); select.focus(); return; }
            const started = await post('start', { ...input, itemId: item.itemId, voiceId: select.value }, signal); current();
            if (!started.operationId) throw new Error(started.reason ?? 'native_speech_unavailable');
            operationId = started.operationId;
            while (true) {
                signal.throwIfAborted(); const value = await post('status', { operationId }, signal); current();
                if (value.status === 'completed' && value.current && value.artifact) {
                    if (value.artifact.voice.voiceId !== select.value || value.artifact.actorId !== actorId || value.artifact.itemId !== item.itemId) throw new Error('native_speech_source_stale');
                    audio.src = nativeAssetUrl(value.artifact.asset.assetId) + '?contentHash=' + encodeURIComponent(value.artifact.asset.contentHash);
                    audio.hidden = false; status.textContent = tl('Audio ready'); return;
                }
                if (['failed', 'cancelled', 'stale'].includes(value.status)) throw new Error('native_speech_unavailable');
                await new Promise((resolve, reject) => {
                    const abort = () => { clearTimeout(timer); reject(signal.reason); };
                    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 200);
                    signal.addEventListener('abort', abort, { once: true });
                });
            }
        } catch {
            if (!disposed && !signal.aborted) status.textContent = tl('Audio unavailable. Continue reading the text.');
        } finally {
            if (!disposed && !signal.aborted) { controller = null; button.disabled = false; stop.hidden = audio.hidden; }
        }
    };
    return { actorId, refresh() { const next = identity(runtime().snapshot); if (next !== captured) { reset(); captured = next; status.textContent = ''; } },
        dispose() { if (disposed) return; disposed = true; reset(); root.remove(); } };
}
