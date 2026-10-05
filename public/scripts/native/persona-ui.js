import { nativeAssetUrl } from './session-projection.js';
import { nativeProductClient } from './product-client.js';
import { el, action, heading, field, feedback, disclosure, libraryError } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';
import { confirmAtriaDraftLeave } from '../atria-shell/workspace-leave-guard.js';

// SHA-256(JSON null), the existing repository's empty CAS precondition.
export const PERSONA_EMPTY = '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b';
const blank = () => ({ name: '', avatar: null, description: '', managementNotes: '' });
function multiline(doc, root, label, value) {
    const wrap = el(doc, 'label', 'atri-library-field', tl(label), root);
    const input = el(doc, 'textarea', '', undefined, wrap); input.value = value; input.setAttribute('aria-label', tl(label)); input.rows = 5; return input;
}
function exported(doc, parent, label, value) {
    action(doc, parent, label, () => {
        const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
        const link = el(doc, 'a'); link.href = url; link.download = 'persona-source.json'; link.click(); URL.revokeObjectURL(url);
    });
}

export function mountPersonaWorkspace({ document: doc, body, route, host, browseState = {}, client = nativeProductClient }) {
    const root = el(doc, 'section', 'atri-library-section'); root.dataset.atriaPersonas = 'true'; body.replaceChildren(root);
    let disposed = false, token = 0, lastReceipt = null;
    const fresh = value => !disposed && value === token;
    async function show(next = route) {
        const current = ++token;
        const id = next?.child?.id ?? 'personas';
        const parts = id.startsWith('persona:') ? id.slice(8).split(':') : [];
        const detail = parts[0];
        const revision = parts.length === 3 ? { personaId: parts[0], revisionId: parts[1], contentIdentity: parts[2] } : null;
        root.replaceChildren(); heading(doc, root, 'Personas', 'Personal identities for future player input. Notes stay in your library.');
        if (lastReceipt) disclosure(doc, root, 'Saved revision', lastReceipt);
        try {
            if (detail === 'new') await editor(null, current);
            else if (detail) {
                const item = await client.getPersona(revision ? { ref: revision } : { personaId: detail });
                if (fresh(current)) await editor(item, current);
            } else await list(current);
        } catch (error) { if (fresh(current)) { feedback(doc, root, libraryError(error), true); action(doc, root, 'Try again', () => show(next)); } }
    }
    async function editor(item, current, copy = false) {
        const content = item?.revision ?? blank();
        const form = el(doc, 'form', 'atri-persona-editor', undefined, root); form.addEventListener('submit', event => event.preventDefault()); form.dataset.atriaDraftDirty = 'false';
        const fields = el(doc, 'fieldset', '', undefined, form);
        const name = field(doc, fields, 'Persona name', copy ? content.name + ' (copy)' : content.name);
        const description = multiline(doc, fields, 'Description', content.description);
        const notes = multiline(doc, fields, 'Management notes', content.managementNotes);
        let avatar = content.avatar;
        const preview = el(doc, 'img', 'atri-persona-avatar', undefined, fields); preview.alt = ''; preview.hidden = !avatar; if (avatar) preview.src = nativeAssetUrl(avatar.assetId);
        preview.addEventListener('error', () => { preview.hidden = true; });
        const upload = field(doc, fields, 'Avatar image', '', 'file'); upload.accept = 'image/png,image/jpeg,image/webp,image/avif';
        action(doc, fields, 'Upload avatar', () => upload.click());
        const avatarStatus = el(doc, 'p', '', avatar ? tl('Avatar attached') : tl('No avatar'), fields);
        let uploadPending = false;
        upload.addEventListener('change', async () => {
            const file = upload.files[0]; if (!file) return;
            uploadPending = true; save.disabled = true;
            try {
                if (file.size > 8 * 1024 * 1024) throw new Error(tl('Avatar is too large.'));
                const bytes = new Uint8Array(await file.arrayBuffer());
                const encoded = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
                const result = await client.uploadPersonaAvatar({ bytes: encoded, mediaType: file.type });
                if (!fresh(current) || !form.isConnected) return;
                avatar = result; preview.hidden = false; preview.src = nativeAssetUrl(avatar.assetId); avatarStatus.textContent = tl('Avatar attached'); form.dataset.atriaDraftDirty = 'true';
            } catch (error) { if (fresh(current)) feedback(doc, form, libraryError(error), true); } finally { uploadPending = false; save.disabled = false; }
        });
        form.addEventListener('input', () => { form.dataset.atriaDraftDirty = 'true'; });
        action(doc, fields, 'Remove avatar', () => { avatar = null; preview.hidden = true; avatarStatus.textContent = tl('No avatar'); form.dataset.atriaDraftDirty = 'true'; });
        const controls = el(doc, 'div', 'atri-library-actions', undefined, form);
        const save = action(doc, controls, 'Save new revision', async () => {
            if (uploadPending) return;
            fields.disabled = true;
            let committed = false;
            try {
                const input = { content: { name: name.value, description: description.value, managementNotes: notes.value, avatar }, expectedFingerprint: item && !copy ? item.expectedFingerprint : PERSONA_EMPTY };
                const result = item && !copy ? await client.revisePersona({ ...input, personaId: item.ref.personaId }) : await client.createPersona(input);
                committed = true; lastReceipt = result.ref;
                if (!fresh(current)) return;
                form.dataset.atriaDraftDirty = 'false'; form.dispatchEvent(new doc.defaultView.CustomEvent('atria-draft-committed', { bubbles: true }));
                disclosure(doc, form, 'Saved revision', result.ref); feedback(doc, form, 'Saved successfully.');
                // The receipt is final even if navigating/reading the saved item fails.
                save.dataset.atriaActionComplete = 'true'; save.disabled = true;
                action(doc, form, 'Reload Latest', () => host.openLibraryPersona ? host.openLibraryPersona(result.ref, result.revision.name) : show({ child: { id: 'persona:' + result.ref.personaId } }));
            } catch (error) { if (fresh(current)) feedback(doc, form, libraryError(error), true); } finally { if (!committed) fields.disabled = false; }
        }, { primary: true });
        action(doc, controls, 'Cancel', () => { if (confirmAtriaDraftLeave(doc, form)) { if (host.openLibrarySection) host.openLibrarySection('personas'); else show({ child: { id: 'personas' } }); } });
        if (item && !copy) {
            disclosure(doc, root, 'Exact revision', item.ref);
            const manage = el(doc, 'div', 'atri-library-actions', undefined, root);
            action(doc, manage, 'Copy', async () => { if (!confirmAtriaDraftLeave(doc, form)) return; root.replaceChildren(); await editor(item, ++token, true); });
            action(doc, manage, item.root.archived ? 'Restore' : 'Archive', async () => {
                if (!confirmAtriaDraftLeave(doc, form)) return;
                const receipt = await client.archivePersona({ personaId: item.ref.personaId, archived: !item.root.archived, expectedFingerprint: item.expectedFingerprint });
                disclosure(doc, root, 'Saved revision', receipt.ref); await show({ child: { id: 'personas' } });
            });
            action(doc, manage, 'Use as default', async () => {
                const baseline = await client.readPersonaDefault();
                if (!fresh(current) || !await doc.defaultView.confirm(tl('Set this exact revision as the account default? Existing sessions keep their identity.'))) return;
                if (!fresh(current)) return;
                await client.setPersonaDefault({ selection: item.ref, expectedFingerprint: baseline.expectedFingerprint }); feedback(doc, root, 'Saved successfully.');
            }, { disabled: item.root.archived });
            action(doc, manage, 'Used By', async () => { const result = await client.getPersonaUsedBy(item.ref.personaId); if (fresh(current)) disclosure(doc, root, 'Used By', result.references); });
            action(doc, manage, 'Delete permanently', async () => {
                if (!confirmAtriaDraftLeave(doc, form)) return;
                const result = await client.getPersonaUsedBy(item.ref.personaId); if (!fresh(current)) return;
                disclosure(doc, root, 'Used By', result.references);
                if (result.references.length || !doc.defaultView.confirm(tl('Delete this unreferenced Persona permanently?'))) return;
                if (!fresh(current)) return;
                await client.deletePersona({ personaId: item.ref.personaId, expectedFingerprint: item.expectedFingerprint }); await show({ child: { id: 'personas' } });
            }, { danger: true });
            const revisions = await client.getPersonaRevisions(item.ref.personaId);
            if (fresh(current)) for (const revision of revisions) action(doc, root, revision.revisionId, async () => {
                if (!confirmAtriaDraftLeave(doc, form)) return;
                const exact = await client.getPersona({ personaId: item.ref.personaId });
                // Obtain exact content identity from the original revision; current root CAS remains authoritative.
                const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJson(revision)));
                const contentIdentity = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
                const old = await client.getPersona({ ref: { personaId: exact.ref.personaId, revisionId: revision.revisionId, contentIdentity } });
                if (fresh(current)) { root.replaceChildren(); await editor(old, ++token); }
            });
        }
        name.focus();
    }
    async function list(current) {
        action(doc, root, 'New Persona', () => { if (host.openLibraryPersona) return host.openLibraryPersona(null); root.replaceChildren(); return editor(null, ++token); });
        action(doc, root, 'Clear account default', async () => { const d = await client.readPersonaDefault(); if (fresh(current)) { await client.setPersonaDefault({ selection: null, expectedFingerprint: d.expectedFingerprint }); feedback(doc, root, 'Saved successfully.'); } });
        const query = field(doc, root, 'Search Personas', browseState.query ?? '', 'search');
        const archived = field(doc, root, 'Include archived', '', 'checkbox'); archived.checked = browseState.includeArchived ?? false;
        const sortLabel = el(doc, 'label', 'atri-library-field', tl('Sort Personas'), root);
        const sort = el(doc, 'select', '', undefined, sortLabel); sort.setAttribute('aria-label', tl('Sort Personas'));
        for (const [value, label] of [['name', 'Name'], ['id', 'ID']]) { const option = el(doc, 'option', '', tl(label), sort); option.value = value; }
        sort.value = browseState.sort ?? 'name';
        const rows = el(doc, 'div', 'atri-library-grouped-list', undefined, root);
        let cursor = null, listToken = 0;
        async function load(reset = true) {
            const own = ++listToken;
            const result = await client.listPersonas({ query: query.value, includeArchived: archived.checked, sort: sort.value, cursor: reset ? null : cursor, limit: 25 });
            if (!fresh(current) || own !== listToken) return;
            if (reset) rows.replaceChildren(); cursor = result.nextCursor;
            if (!result.items.length && reset) feedback(doc, rows, 'No matching Personas');
            for (const item of result.items) {
                const row = el(doc, 'article', 'atri-library-row', undefined, rows);
                if (item.revision.avatar) { const image = el(doc, 'img', 'atri-persona-avatar', undefined, row); image.alt = ''; image.src = nativeAssetUrl(item.revision.avatar.assetId); image.addEventListener('error', () => image.remove(), { once: true }); }
                action(doc, row, item.revision.name, () => host.openLibraryPersona ? host.openLibraryPersona(item.ref, item.revision.name) : show({ child: { id: 'persona:' + item.ref.personaId } }));
                if (item.root.archived) el(doc, 'span', '', tl('Archived'), row);
            }
            rows.querySelector('[data-persona-more]')?.remove();
            if (cursor) { const more = action(doc, rows, 'Load more', () => load(false)); more.dataset.personaMore = 'true'; }
        }
        const reload = () => { browseState.query = query.value; browseState.includeArchived = archived.checked; browseState.sort = sort.value; load().catch(error => feedback(doc, rows, libraryError(error), true)); };
        query.addEventListener('input', reload); archived.addEventListener('change', reload); sort.addEventListener('change', reload); await load();
        mountPersonaMigration({ doc, root, client, active: () => fresh(current) });
    }
    void show();
    return { updateRoute(next) { void show(next); }, dispose() { disposed = true; ++token; root.remove(); } };
}
function stableJson(value) {
    if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
    return JSON.stringify(value);
}

export function mountPersonaMigration({ doc, root, client, active = () => true }) {
    const section = el(doc, 'details', 'atri-library-details', undefined, root); el(doc, 'summary', '', tl('Import legacy Personas'), section);
    const file = field(doc, section, 'Legacy JSON file', '', 'file'); file.accept = '.json,application/json';
    action(doc, section, 'Choose legacy JSON', () => file.click());
    const filename = el(doc, 'p', 'atri-library-meta', '', section);
    file.addEventListener('change', () => { filename.textContent = file.files[0]?.name ?? ''; });
    const convert = field(doc, section, 'Convert {{user}} to the captured name', '', 'checkbox');
    const review = el(doc, 'div', '', undefined, section);
    let generation = 0;
    const invalidate = () => { generation++; review.replaceChildren(); }; file.addEventListener('change', invalidate); convert.addEventListener('change', invalidate);
    const local = field(doc, section, 'Use legacy Personas from this account', '', 'checkbox'); local.addEventListener('change', invalidate);
    action(doc, section, 'Preflight', async () => {
        const selected = file.files[0]; if (!selected && !local.checked) return;
        if (selected && selected.size > 16 * 1024 * 1024) throw new Error(tl('Legacy JSON is too large.'));
        const version = ++generation;
        const localSource = local.checked;
        const source = localSource ? { convertUser: convert.checked } : { rawSource: await selected.text(), convertUser: convert.checked };
        const plan = await (localSource ? client.preflightLocalPersonas(source) : client.preflightPersonaMigration(source));
        if (!active() || generation !== version) return;
        review.replaceChildren(); disclosure(doc, review, 'Migration review', plan); exported(doc, review, 'Export original source', source.rawSource ?? new TextDecoder().decode(Uint8Array.from(atob(plan.rawSource), char => char.charCodeAt(0))));
        const apply = action(doc, review, 'Create reviewed copies', async () => {
            const applyInput = { ...source, planDigest: plan.planDigest, expectedFingerprint: plan.expectedFingerprint };
            const result = await (localSource ? client.applyLocalPersonas(applyInput) : client.applyPersonaMigration(applyInput));
            if (!active() || generation !== version) return;
            apply.dataset.atriaActionComplete = 'true'; apply.disabled = true; disclosure(doc, review, 'Migration receipt', result); feedback(doc, review, result.published ? 'Saved successfully.' : 'Some copies could not publish. Review the receipt and preflight again to retry.', !result.published);
            action(doc, review, 'Reload receipt', async () => { const receipt = await client.readPersonaMigration({ sourceDigest: plan.sourceDigest }); if (active() && generation === version) disclosure(doc, review, 'Migration receipt', receipt); });
            action(doc, review, 'Adopt migrated default', async () => {
                const d = await client.readPersonaDefault();
                if (!active() || generation !== version || !doc.defaultView.confirm(tl('Set the migrated default? Existing sessions keep their identity.'))) return;
                await client.adoptPersonaMigrationDefault({ sourceDigest: plan.sourceDigest, expectedFingerprint: result.expectedFingerprint, expectedDefaultFingerprint: d.expectedFingerprint }); feedback(doc, review, 'Saved successfully.');
            }, { disabled: !plan.defaultLegacyKey || result.receipt.items[plan.defaultLegacyKey]?.status !== 'published' });
        }, { disabled: !plan.supported, primary: true });
    });
}

export function openPersonaSelector({ document: doc, runtime, client = nativeProductClient, expectedRevisionId, sessionId, select, statusText }) {
    const revision = expectedRevisionId ?? runtime.snapshot.revision.revisionId;
    const id = sessionId ?? runtime.snapshot.session.sessionId;
    const guard = () => {
        runtime.assertWritable();
        if (runtime.snapshot.session.sessionId !== id || runtime.snapshot.revision.revisionId !== revision || runtime.generation || runtime.host?.isGenerating?.()) throw new Error(tl('The session changed. Reopen the Persona selector.'));
    };
    guard();
    if (!select && (runtime.snapshot.states?.atri_shared || runtime.snapshot.manifest?.runtime?.experienceContract?.sharedRuntime)) throw new Error(tl('Choose your own seat identity from Shared session controls.'));
    const focus = doc.activeElement, dialog = el(doc, 'dialog', 'atri-persona-picker', undefined, doc.body);
    dialog.setAttribute('aria-label', tl('Choose Persona'));
    heading(doc, dialog, 'Choose Persona', statusText ?? 'Descriptions apply only when this work explicitly consumes player context.');
    let closed = false, receipt = false;
    const captured = runtime.snapshot.states?.atri_player_persona?.solo;
    if (captured) {
        disclosure(doc, dialog, 'Current Persona snapshot', { ref: captured.ref, name: captured.snapshot.name });
        void client.getPersona({ ref: captured.ref }).then(item => { if (!closed && item.root.archived) feedback(doc, dialog, 'The source is archived. This session retains its captured identity.'); }, () => { if (!closed) feedback(doc, dialog, 'The source is unavailable. This session retains its captured identity.'); });
    }
    const close = () => { closed = true; dialog.close(); dialog.remove(); if (focus?.isConnected) focus.focus(); };
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    action(doc, dialog, 'Cancel', close);
    const results = el(doc, 'div', 'atri-library-grouped-list', undefined, dialog);
    const selectExact = async selection => {
        guard();
        for (const button of dialog.querySelectorAll('button')) button.disabled = true;
        try {
            const snapshot = select ? await select(selection, revision) : await runtime.request('persona/select', { sessionId: id, expectedRevisionId: revision, selection });
            receipt = true;
            for (const button of dialog.querySelectorAll('button')) button.dataset.atriaActionComplete = 'true';
            if (closed) return;
            disclosure(doc, dialog, 'Selected revision', snapshot.revision?.revisionId ?? snapshot);
            if (!select) await runtime.acceptOperationSnapshot(snapshot, { acceptGuard: () => runtime.snapshot.session.sessionId === id && !runtime.history });
            close();
        } catch (error) {
            if (closed) return;
            feedback(doc, dialog, receipt ? tl('Identity saved. Reload the session to refresh its display.') : libraryError(error), true);
            if (receipt) action(doc, dialog, 'Reload session', async () => { if (runtime.snapshot.session.sessionId !== id) return; await runtime.reload(); close(); });
            else for (const button of dialog.querySelectorAll('button')) button.disabled = false;
            action(doc, dialog, 'Close', close);
        }
    };
    action(doc, results, 'No Persona', () => selectExact(null));
    let queryToken = 0;
    const query = field(doc, dialog, 'Search Personas', '', 'search');
    const matches = el(doc, 'div', 'atri-library-grouped-list', undefined, dialog);
    let cursor = null;
    const load = async (more = false) => {
        const token = ++queryToken;
        const list = await client.listPersonas({ query: query.value, cursor: more ? cursor : null, limit: 25, sort: 'name' });
        if (closed || queryToken !== token || receipt) return;
        if (!more) matches.replaceChildren(); cursor = list.nextCursor;
        for (const item of list.items) {
            const row = el(doc, 'article', 'atri-library-row', undefined, matches);
            action(doc, row, item.revision.name, () => selectExact(item.ref));
            disclosure(doc, row, 'Exact revision', { ref: item.ref, description: item.revision.description });
        }
        matches.querySelector('[data-persona-more]')?.remove();
        if (cursor) { const button = action(doc, matches, 'Load more', () => load(true)); button.dataset.personaMore = 'true'; }
        if (!list.items.length && !more) feedback(doc, matches, 'No matching Personas');
    };
    query.addEventListener('input', () => load().catch(error => { if (!closed) feedback(doc, matches, libraryError(error), true); }));
    void load().catch(error => { if (!closed) { feedback(doc, matches, libraryError(error), true); action(doc, matches, 'Try again', () => load()); } });
    dialog.showModal(); query.focus();
    return { close, dialog };
}
