import { runtimeRemediation } from './runtime-client.js';

// Presentation only: Native CredentialTargetAuthority owns inspection and permits.
function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
}
async function fingerprint(value) {
    const bytes = new TextEncoder().encode(canonical(value));
    return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const message = error => error.code ? runtimeRemediation(error.code)[0] : error.message;

export function mountCredentialTargetReview({ root, form, saved, readDraft, request, signal, isCurrent, node, button, notice }) {
    const output = node('div', undefined, root); output.setAttribute('aria-live', 'polite');
    const controls = node('div', undefined, root); controls.className = 'atri-runtime-actions';
    let reviewed = null, version = 0, busy = false;
    const current = () => !signal?.aborted && isCurrent() && root.isConnected;
    const sameDraft = () => saved && canonical(readDraft()) === canonical(saved);
    function reset(message) {
        version++; reviewed = null; output.replaceChildren(); localLabel.hidden = true; local.checked = false;
        allow.disabled = cancel.disabled = true;
        if (message) notice(message, output);
    }
    function refreshButtons() { inspect.disabled = busy; allow.disabled = busy || !reviewed || reviewed.authorized || reviewed.target.local && !local.checked; cancel.disabled = busy || !reviewed; }
    const inspect = button('Review credential destination', async () => {
        if (busy || !current()) return;
        reset(); const attempt = version;
        try {
            if (!sameDraft()) throw new Error('Save this connection and reopen it before reviewing its credential destination.');
            busy = true; refreshButtons(); inspect.setAttribute('aria-busy', 'true'); notice('Reading saved credential destination…', output);
            const result = await request('/connections/credential-target/inspect', { method: 'POST', body: { connectionProfileId: saved.connectionProfileId }, signal });
            const savedHash = await fingerprint(saved);
            if (!current() || attempt !== version) return;
            if (!sameDraft() || result.connectionProfileId !== saved.connectionProfileId || result.connectionFingerprint !== savedHash
                || ![result.connectionFingerprint, result.targetFingerprint, result.permitFingerprint].every(digest)
                || await fingerprint(result.target) !== result.targetFingerprint || typeof result.authorized !== 'boolean'
                || typeof result.target.local !== 'boolean') throw new Error('The saved connection changed. Reload it before reviewing again.');
            reviewed = result; output.replaceChildren();
            notice(result.authorized ? 'This exact saved credential destination is already authorized.' : 'Review this saved destination. Reading this review sends no credential and creates no authorization.', output);
            node('pre', JSON.stringify({ endpoint: result.target.endpoint, origin: result.target.origin, path: result.target.path,
                secretRef: result.target.secretRef, providerAdapter: result.target.providerAdapter, transport: result.target.transport,
                networkPolicy: result.target.networkPolicy, options: result.target.options, connectionFingerprint: result.connectionFingerprint,
                targetFingerprint: result.targetFingerprint, permitFingerprint: result.permitFingerprint }, null, 2), output);
            notice('Allowing permits future Native requests to use this Secret reference at this exact destination. Saving or testing never grants authorization.', output);
            localLabel.hidden = !result.target.local;
        } catch (error) { if (current() && attempt === version) { reset(); notice(message(error), output, true); } } finally { busy = false; inspect.removeAttribute('aria-busy'); if (current()) refreshButtons(); }
    }, controls);
    const localLabel = node('label', 'Allow credentials to be sent to this local service', root); localLabel.hidden = true;
    const local = node('input', undefined, localLabel); local.type = 'checkbox'; local.autocomplete = 'off';
    local.addEventListener('change', refreshButtons);
    const allow = button('Allow this credential destination', async () => {
        if (allow.disabled || busy || !reviewed || !current()) return;
        const approved = reviewed, attempt = version;
        try {
            if (!sameDraft()) throw new Error('Connection edits invalidate the review. Save and review the destination again.');
            busy = true; refreshButtons(); allow.setAttribute('aria-busy', 'true');
            const result = await request('/connections/credential-target/authorize', { method: 'POST', body: { connectionProfileId: saved.connectionProfileId,
                expectedFingerprint: approved.connectionFingerprint, expectedTargetFingerprint: approved.targetFingerprint,
                expectedPermitFingerprint: approved.permitFingerprint, ...(approved.target.local ? { allowLocal: local.checked } : {}) }, signal });
            if (!current() || attempt !== version) return;
            if (!sameDraft() || !result.authorized || result.connectionFingerprint !== approved.connectionFingerprint || result.targetFingerprint !== approved.targetFingerprint)
                throw new Error('The credential destination changed. Inspect it again before sending.');
            reviewed = result; output.replaceChildren(); notice('Exact saved credential destination authorized. No provider request was sent.', output); localLabel.hidden = true;
        } catch (error) {
            if (current() && attempt === version) {
                reset(); notice(error.code === 'native_credential_target_conflict'
                    ? 'The saved connection or authorization changed. Review it again; nothing was automatically retried.' : message(error), output, true);
            }
        } finally { busy = false; allow.removeAttribute('aria-busy'); if (current()) refreshButtons(); }
    }, controls);
    const cancel = button('Cancel authorization', () => { if (!busy) { reset('Review closed without changing credential authorization.'); inspect.focus(); } }, controls);
    allow.disabled = cancel.disabled = true;
    const invalidate = event => { if (!root.contains(event.target) && reviewed) reset('Connection edits invalidate this review. Save and review the destination again.'); };
    form.addEventListener('input', invalidate); form.addEventListener('change', invalidate);
    notice(saved ? 'Credential destination authorization is separate from saving. Review the saved connection before testing or generating.' : 'Save this new connection first, then reopen it to review its credential destination.', output);
    return { dispose() { version++; form.removeEventListener('input', invalidate); form.removeEventListener('change', invalidate); } };
}
