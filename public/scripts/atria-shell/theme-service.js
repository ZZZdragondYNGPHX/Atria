import { BUILTIN_THEMES, DEFAULT_DAY, DEFAULT_NIGHT, parseThemeImport, planThemeMigration, resolveThemeSelection, uniqueThemeName, validateNativeTheme } from './theme-model.js';

const copy = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fallback = () => ({ version: 1, mode: 'light', day: DEFAULT_DAY, night: DEFAULT_NIGHT });

/** Coordinates the existing settings authority and NamedDocRepo theme API.
 * Only preview and request status are transient; no second persistent store.
 */
export function createAtriaThemeService({ prefs, documents = [], originals = [], settings = {}, saveSettings, writeAsset, deleteAsset, readState, notify = () => {}, createId = () => globalThis.crypto.randomUUID() }) {
    let docs = copy(documents), saved = copy(prefs.atria_theme || fallback());
    let preview = null, busy = false, error = '', migration = null, notice = '';
    const listeners = new Set();
    const themes = () => [...BUILTIN_THEMES, ...docs.flatMap(doc => {
        try { const theme = validateNativeTheme(doc); return theme.id.startsWith('builtin:') ? [] : [theme]; } catch { return []; }
    })];
    function emit() { notify(); for (const listener of listeners) listener(); }
    function selection(value) {
        if (!value || value.version !== 1 || !['light', 'dark', 'system'].includes(value.mode) || typeof value.day !== 'string' || typeof value.night !== 'string') throw new TypeError('Invalid appearance selection');
        return copy(value);
    }
    async function verifyWrite(theme) {
        try { await writeAsset(theme); } catch (failure) {
            // A lost response may still have committed. Read before retrying.
            const state = await readState().catch(() => null);
            if (!state?.themes?.some(item => same(item, theme))) throw failure;
        }
        const index = docs.findIndex(item => item.name === theme.name);
        if (index < 0) docs.push(copy(theme)); else docs[index] = copy(theme);
    }
    async function persistSelection(next) {
        const previous = prefs.atria_theme;
        prefs.atria_theme = selection(next);
        let ok = false;
        try { ok = await saveSettings(); } catch { /* Reconcile below. */ }
        if (!ok) {
            const state = await readState().catch(() => null);
            ok = same(state?.selection, next);
        }
        if (!ok) { prefs.atria_theme = previous; throw new Error('Appearance selection was not saved. Retry or cancel the preview.'); }
        saved = copy(next);
    }
    async function run(operation) {
        if (busy) throw new Error('A theme save is already in progress.');
        busy = true; error = ''; emit();
        try { return await operation(); } catch (failure) { error = failure.message; throw failure; } finally { busy = false; emit(); }
    }
    const api = {
        getState: () => ({ selection: copy(saved), preview: preview && copy(preview), themes: themes(), busy, error, notice, migrationPending: Boolean(migration), documents: copy(docs) }),
        effective(systemDark = false) {
            const chosen = preview?.selection || migration?.selection || saved;
            const available = themes();
            for (const asset of migration?.assets || []) if (!available.some(item => item.id === asset.id)) available.push(asset);
            if (preview?.theme) {
                const index = available.findIndex(item => item.id === preview.theme.id);
                if (index < 0) available.push(preview.theme); else available[index] = preview.theme;
            }
            return resolveThemeSelection(preview?.slot ? { ...chosen, mode: preview.slot } : chosen, available, systemDark);
        },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        async initialize() {
            migration = planThemeMigration(settings, docs, originals);
            if (!migration) { saved = selection(prefs.atria_theme); emit(); return; }
            // Reuse assets from a previous partial upgrade by their stable IDs.
            for (const asset of migration.assets) {
                const existing = docs.find(doc => doc.id === asset.id);
                if (existing) { asset.name = existing.name; }
            }
            await api.retryMigration();
        },
        retryMigration() {
            return run(async () => {
                if (!migration) return;
                for (const asset of migration.assets) {
                    const existing = docs.find(doc => doc.id === asset.id);
                    if (!existing) await verifyWrite(asset);
                }
                // Settings marker is last. No legacy fields or originals are deleted.
                await persistSelection(migration.selection);
                notice = migration.selection.migration.notice ? 'Your current appearance has been preserved. Night themes are ready when you choose them.' : '';
                migration = null;
            });
        },
        previewTheme(id) {
            if (busy || migration) throw new Error('Finish the pending save or migration first.');
            const theme = themes().find(item => item.id === id);
            if (!theme) throw new Error('This theme is unavailable.');
            preview ||= { selection: copy(saved), slot: null, theme: null, dirty: false, assetSaved: false };
            preview.theme = copy(theme); preview.slot = theme.appearance;
            preview.selection[theme.appearance === 'light' ? 'day' : 'night'] = theme.id;
            preview.dirty = false; preview.assetSaved = false; error = ''; emit();
        },
        previewMode(mode) {
            if (busy || migration) throw new Error('Finish the pending save or migration first.');
            if (!['light', 'dark', 'system'].includes(mode)) throw new TypeError('Invalid appearance mode');
            preview ||= { selection: copy(saved), slot: null, theme: null, dirty: false, assetSaved: false };
            preview.selection.mode = mode; preview.slot = null; error = ''; emit();
        },
        viewSlot(slot) {
            if (busy) return;
            preview ||= { selection: copy(saved), slot: null, theme: null, dirty: false, assetSaved: false };
            preview.slot = slot; emit();
        },
        editTheme(patch) {
            if (busy || migration) throw new Error('Finish the pending save or migration first.');
            if (!preview?.theme) api.previewTheme(api.effective().theme.id);
            const theme = preview.theme;
            if (theme.id.startsWith('builtin:') || (patch.name !== undefined && patch.name !== theme.name && docs.some(doc => doc.id === theme.id))) {
                theme.id = `custom:${createId()}`;
                theme.name = uniqueThemeName(`${theme.name} copy`, docs);
            }
            // Keep one stable asset identity across selection-save retries.
            Object.assign(theme, copy(patch));
            preview.dirty = true; preview.assetSaved = false; error = ''; emit();
        },
        async confirm() {
            return run(async () => {
                if (!preview) return;
                if (preview.dirty && !preview.assetSaved) {
                    const theme = validateNativeTheme(preview.theme);
                    const collision = [...BUILTIN_THEMES, ...docs].find(doc => doc.name === theme.name && doc.id !== theme.id);
                    if (collision) theme.name = uniqueThemeName(theme.name, docs);
                    await verifyWrite(theme);
                    preview.theme = theme; preview.assetSaved = true;
                }
                const next = copy(preview.selection);
                if (preview.theme) next[preview.theme.appearance === 'light' ? 'day' : 'night'] = preview.theme.id;
                try { await persistSelection(next); } catch (failure) {
                    if (preview.assetSaved) throw new Error('Theme asset saved; appearance selection was not saved. Retry only the selection, or cancel the preview.');
                    throw failure;
                }
                preview = null; notice = 'Appearance saved.';
            });
        },
        cancel() { if (busy) return false; preview = null; error = ''; emit(); return true; },
        importTheme(value) {
            return run(async () => {
                const theme = parseThemeImport(value, { id: `custom:${createId()}` });
                theme.id = `custom:${createId()}`;
                theme.name = uniqueThemeName(theme.name, docs);
                await verifyWrite(theme); notice = 'Theme imported. Select it to preview; your appearance has not changed.';
                return theme;
            });
        },
        deleteTheme(id) {
            return run(async () => {
                const theme = themes().find(item => item.id === id);
                if (!theme || id.startsWith('builtin:')) throw new Error('Built-in themes are read-only.');
                // Persist valid references first; a failed delete only leaves an unused asset.
                if (saved.day === id || saved.night === id) await persistSelection({ ...saved, day: saved.day === id ? DEFAULT_DAY : saved.day, night: saved.night === id ? DEFAULT_NIGHT : saved.night });
                await deleteAsset(theme.name);
                docs = docs.filter(item => item.id !== id); preview = null; notice = 'Theme deleted.';
            });
        },
        exportOriginal(id) { return copy(themes().find(theme => theme.id === id)?.compatibility?.raw ?? saved.migration?.legacy ?? {}); },
        dispose() { listeners.clear(); preview = null; },
    };
    return api;
}
