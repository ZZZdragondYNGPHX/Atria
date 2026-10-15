import { el, action, disclosure, field, confirmLibraryAction } from '../native/library-ui.js';
import { translateShellText as tl } from './localization.js';
import { BUILTIN_THEMES, contrastRatio, createPalette, parseThemeImport, resolveThemeColors } from './theme-model.js';
import { parseAtriaColor } from './appearance.js';
import { confirmAtriaDraftLeave } from './workspace-leave-guard.js';

const clone = value => JSON.parse(JSON.stringify(value));
const toHex = value => { const color = parseAtriaColor(value); return '#' + ['r', 'g', 'b'].map(key => Math.round(color[key]).toString(16).padStart(2, '0')).join(''); };
function download(doc, name, value) {
    const url = doc.defaultView.URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const anchor = el(doc, 'a'); anchor.href = url; anchor.download = `${name}.json`; anchor.click();
    setTimeout(() => doc.defaultView.URL.revokeObjectURL(url), 1000);
}

export function mountThemeControls({ document: doc, root, service }) {
    root.dataset.settingId = 'themes';
    if (!service?.getState || !Array.isArray(service.getState().themes)) {
        el(doc, 'p', '', tl('Themes are still loading. Reopen Settings after startup.'), root);
        return { dispose() {} };
    }
    let disposed = false, candidate = null, cardIds = '';
    const editorInputs = new Map(), cardNodes = new Map();
    const system = doc.defaultView.matchMedia?.('(prefers-color-scheme: dark)');
    const currentTheme = () => service.getState().preview?.theme || service.effective(Boolean(system?.matches)).theme;
    const editCurrent = patch => service.editTheme(patch, currentTheme().id);
    const bar = el(doc, 'div', 'atria-theme-preview-bar', undefined, root); bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', tl('Appearance preview'));
    const previewTitle = el(doc, 'strong', '', '', bar);
    const use = action(doc, bar, 'Use theme', () => service.confirm(), { primary: true });
    const cancel = action(doc, bar, 'Cancel preview', () => service.cancel());
    const status = el(doc, 'p', 'atria-theme-status', '', root); status.setAttribute('role', 'status');
    const retryMigration = action(doc, root, 'Retry appearance upgrade', () => service.retryMigration());
    const modeRow = el(doc, 'label', 'atria-theme-mode', undefined, root); modeRow.dataset.settingId = 'theme-mode';
    el(doc, 'span', '', tl('Appearance mode'), modeRow);
    const mode = el(doc, 'select', '', undefined, modeRow); mode.setAttribute('aria-label', tl('Appearance mode'));
    for (const [value, label] of [['light', 'Light'], ['dark', 'Dark'], ['system', 'Follow system']]) { const option = el(doc, 'option', '', tl(label), mode); option.value = value; }
    mode.addEventListener('change', () => service.previewMode(mode.value));
    const savedSummary = el(doc, 'p', 'atria-setting-description', '', root);
    const slots = el(doc, 'div', 'atria-theme-slots', undefined, root);
    function protectBrowse(callback) {
        const state = service.getState();
        if (state.busy || state.preview?.dirty && !confirmAtriaDraftLeave(doc, root)) return;
        callback();
    }
    const day = action(doc, slots, 'View day themes', () => protectBrowse(() => { service.cancel(); service.viewSlot('light'); }));
    const night = action(doc, slots, 'View night themes', () => protectBrowse(() => { service.cancel(); service.viewSlot('dark'); }));
    el(doc, 'h4', '', tl('Theme gallery'), root);
    const gallery = el(doc, 'div', 'atria-theme-gallery', undefined, root);
    gallery.setAttribute('aria-label', tl('Theme gallery'));
    const accentRow = el(doc, 'div', 'atria-theme-color-fields atria-theme-accent', undefined, root);
    accentRow.dataset.settingId = 'theme-accent';
    const preview = el(doc, 'section', 'atria-theme-sample', undefined, root);
    el(doc, 'h4', '', tl('Current preview'), preview);
    el(doc, 'p', 'atria-theme-reading', tl('Morning light falls across the stone steps. Somewhere beyond the doorway, a page turns.'), preview);
    const sampleActions = el(doc, 'div', 'atria-theme-sample-actions', undefined, preview);
    action(doc, sampleActions, 'Primary action', () => {}, { primary: true });
    const sample = field(doc, sampleActions, 'Sample input', tl('A new chapter')); sample.readOnly = true;
    action(doc, sampleActions, 'Unavailable action', () => {}, { disabled: true });
    for (const [kind, text] of [['success', 'Saved state'], ['warning', 'Check this setting'], ['danger', 'Something needs attention']]) el(doc, 'p', `atria-theme-example atria-theme-example--${kind}`, tl(text), preview);

    const editor = disclosure(doc, root, 'Edit colors and theme details'); editor.dataset.settingId = 'theme-colors';
    const identity = el(doc, 'p', 'atria-setting-description', '', editor);
    const themeName = field(doc, editor, 'Theme name');
    themeName.addEventListener('input', () => editCurrent({ name: themeName.value }));
    el(doc, 'p', 'atria-setting-description', tl('Editing a built-in theme creates a custom copy. Custom theme names can change while their selected slots stay the same.'), editor);
    const colors = el(doc, 'div', 'atria-theme-color-fields', undefined, editor);
    for (const [role, label] of [['canvas', 'Canvas'], ['surface-1', 'Surface'], ['text-primary', 'Primary text'], ['text-secondary', 'Secondary text'], ['accent', 'Accent color']]) {
        const input = field(doc, role === 'accent' ? accentRow : colors, label, '', 'color'); input.dataset.themeRole = role; editorInputs.set(role, input);
        input.addEventListener('input', () => {
            const current = service.getState().preview?.theme || service.effective(Boolean(system?.matches)).theme;
            const values = { ...resolveThemeColors(current), [role]: input.value };
            editCurrent({ colors: createPalette({ appearance: current.appearance, canvas: values.canvas, surface: values['surface-1'], text: values['text-primary'], secondary: values['text-secondary'], accent: values.accent }) });
        });
    }
    const contrast = el(doc, 'p', 'atria-theme-contrast', '', editor); contrast.setAttribute('role', 'status');
    action(doc, editor, 'Restore suggested colors', () => {
        const current = service.getState().preview?.theme || service.effective(Boolean(system?.matches)).theme;
        const base = BUILTIN_THEMES.find(item => item.name === current.name && item.appearance === current.appearance) || BUILTIN_THEMES.find(item => item.appearance === current.appearance);
        editCurrent({ colors: clone(base.colors) });
    });

    const css = disclosure(doc, root, 'Advanced theme CSS'); css.dataset.settingId = 'theme-css';
    el(doc, 'p', '', tl('CSS belongs to this theme. Use Atria tokens; legacy selectors may no longer apply. Turning CSS off keeps its text.'), css);
    const cssLabel = el(doc, 'label', 'atria-theme-css-toggle', undefined, css);
    const cssEnabled = el(doc, 'input', '', undefined, cssLabel); cssEnabled.type = 'checkbox'; cssEnabled.setAttribute('role', 'switch');
    el(doc, 'span', '', tl('Enable theme CSS'), cssLabel);
    const cssText = el(doc, 'textarea', 'atria-theme-css-editor', undefined, css); cssText.spellcheck = false; cssText.setAttribute('aria-label', tl('Custom CSS'));
    // The example is code, shared with the compatibility documentation rather than UI prose.
    cssText.placeholder = [':root:root {', '  --atri-accent: #ff5a36;', '}'].join('\n');
    const editCss = () => editCurrent({ css: { enabled: cssEnabled.checked, text: cssText.value } });
    cssText.addEventListener('input', editCss); cssEnabled.addEventListener('change', editCss);
    el(doc, 'p', 'atria-setting-description', tl('If CSS hides the interface, press Ctrl+Alt+Shift+R or reload with atriaNoThemeCss=1 in the URL. This temporarily disables CSS without deleting it.'), css);
    const assets = el(doc, 'div', 'atria-theme-asset-actions', undefined, root);
    const exportTheme = action(doc, assets, 'Export theme', () => {
        const theme = service.getState().preview?.theme || service.effective(Boolean(system?.matches)).theme;
        download(doc, theme.name, theme);
    });
    const deleteTheme = action(doc, assets, 'Delete custom theme', async () => {
        if (!await confirmLibraryAction('Delete this custom theme? Referencing day and night slots will use their defaults.')) return;
        const theme = service.getState().preview?.theme || service.effective(Boolean(system?.matches)).theme;
        await service.deleteTheme(theme.id);
    }, { danger: true });
    const file = el(doc, 'input', '', undefined, assets); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
    action(doc, assets, 'Import theme', () => file.click());
    const imported = el(doc, 'section', 'atria-theme-import', undefined, root); imported.hidden = true;
    const importStatus = el(doc, 'p', '', '', imported); importStatus.setAttribute('role', 'status');
    const saveImport = action(doc, imported, 'Save imported theme', async () => { await service.importTheme(candidate); candidate = null; imported.hidden = true; file.value = ''; });
    action(doc, imported, 'Cancel import', () => { candidate = null; imported.hidden = true; file.value = ''; });
    file.addEventListener('change', async () => {
        if (!file.files?.[0]) return;
        imported.hidden = false; saveImport.disabled = true;
        try {
            candidate = JSON.parse(await file.files[0].text());
            const parsed = parseThemeImport(candidate);
            if (disposed) return;
            importStatus.textContent = `${parsed.name} · ${tl(parsed.appearance === 'dark' ? 'Night theme' : 'Day theme')} · ${tl(parsed.compatibility?.source === 'legacy' ? 'Legacy colors adapted; original fields retained. Imported CSS starts disabled.' : 'Native theme validated. Import does not apply it.')}`;
            saveImport.disabled = false;
        } catch (error) { candidate = null; importStatus.textContent = `${tl('Could not import theme:')} ${error.message}`; }
    });
    const originals = disclosure(doc, root, 'Original files and upgrade data'); originals.dataset.settingId = 'theme-originals';
    el(doc, 'p', '', tl('Original themes and compatibility fields are retained. Export them without applying old layout or behavior settings.'), originals);
    const originalFile = el(doc, 'select', '', undefined, originals); originalFile.setAttribute('aria-label', tl('Original theme file'));
    action(doc, originals, 'Export original file', () => {
        const state = service.getState(), source = state.documents.find(item => item.name === originalFile.value);
        if (source) download(doc, `${source.name} original`, source.compatibility?.raw || source);
    });
    action(doc, originals, 'Export upgrade snapshot', () => download(doc, 'Atria appearance upgrade', service.getState().selection.migration?.legacy || {}));
    function sync() {
        if (disposed) return;
        const state = service.getState(), effective = service.effective(Boolean(system?.matches));
        const current = state.preview?.theme || effective.theme;
        const values = resolveThemeColors(current), target = state.preview?.slot || effective.appearance;
        root.dataset.atriaDraftDirty = String(Boolean(state.preview?.dirty));
        root.dataset.atriaSavePending = String(state.busy);
        root.dataset.saveState = state.busy ? 'saving' : state.error ? 'error' : 'synced';
        bar.hidden = !state.preview;
        previewTitle.textContent = `${tl(state.preview?.dirty ? 'Unsaved theme' : 'Preview')} · ${tl(target === 'dark' ? 'Night theme' : 'Day theme')} · ${current.name}`;
        use.disabled = cancel.disabled = state.busy;
        mode.value = (state.preview?.selection || state.selection).mode; mode.disabled = state.busy || state.migrationPending;
        day.disabled = night.disabled = state.busy || state.migrationPending;
        day.setAttribute('aria-pressed', String(target === 'light')); night.setAttribute('aria-pressed', String(target === 'dark'));
        const byId = id => state.themes.find(theme => theme.id === id)?.name || tl('Unavailable theme; using default');
        savedSummary.textContent = `${tl('Saved:')} ${tl({ light: 'Light', dark: 'Dark', system: 'Follow system' }[state.selection.mode])} · ${tl('Day:')} ${byId(state.selection.day)} · ${tl('Night:')} ${byId(state.selection.night)} · ${tl('Now using:')} ${effective.theme.name}`;
        status.textContent = state.busy ? tl('Saving…') : state.error ? tl(state.error) : effective.missing ? tl('The selected theme is unavailable. A default is shown; choose a replacement to repair the saved slot.') : tl(state.notice);
        status.setAttribute('role', state.error ? 'alert' : 'status');
        if (doc.documentElement.dataset.atriaThemeCssSuppressed === 'true') status.textContent += ` ${tl('Theme CSS is temporarily disabled for recovery. Its text and saved state are retained.')}`;
        retryMigration.hidden = !state.migrationPending; retryMigration.disabled = state.busy;
        const visibleThemes = state.themes.filter(theme => theme.appearance === target);
        const nextIds = visibleThemes.map(theme => theme.id).join('|');
        if (nextIds !== cardIds) {
            cardIds = nextIds; gallery.replaceChildren(); cardNodes.clear();
            for (const theme of visibleThemes) {
                const button = action(doc, gallery, theme.name, () => protectBrowse(() => service.previewTheme(theme.id)));
                button.className = 'atria-theme-card'; button.dataset.themeId = theme.id;
                const palette = resolveThemeColors(theme), swatches = el(doc, 'span', 'atria-theme-swatches', undefined, button); swatches.setAttribute('aria-hidden', 'true');
                for (const role of ['canvas', 'surface-1', 'text-primary', 'accent']) { const swatch = el(doc, 'span', '', '', swatches); swatch.style.backgroundColor = palette[role]; }
                el(doc, 'small', '', tl(theme.id.startsWith('builtin:') ? 'Built-in' : theme.id.startsWith('migration:') ? 'Migrated copy' : 'Custom'), button);
                cardNodes.set(theme.id, button);
            }
        }
        for (const [id, button] of cardNodes) { button.disabled = state.busy || state.migrationPending; button.setAttribute('aria-pressed', String((state.preview?.theme?.id || effective.theme.id) === id)); }
        identity.textContent = `${current.name} · ${tl(current.id.startsWith('builtin:') ? 'Built-in · edits create a copy' : 'Custom theme')}`;
        if (doc.activeElement !== themeName) themeName.value = current.name;
        themeName.disabled = state.busy || state.migrationPending;
        for (const [role, input] of editorInputs) { if (doc.activeElement !== input) input.value = toHex(values[role]); input.disabled = state.busy || state.migrationPending; }
        const low = [['text-primary', 'surface-1', 4.5], ['text-secondary', 'surface-1', 4.5], ['text-on-accent', 'accent', 4.5], ['separator-strong', 'surface-1', 3]].filter(([a, b, threshold]) => contrastRatio(values[a], values[b]) < threshold);
        contrast.textContent = low.length ? tl('Some colors have low contrast. Restore suggested colors or keep your custom choice.') : tl('Text and control contrast checked.');
        cssEnabled.checked = current.css.enabled; if (doc.activeElement !== cssText) cssText.value = current.css.text;
        cssEnabled.disabled = cssText.disabled = state.busy || state.migrationPending;
        deleteTheme.disabled = state.busy || current.id.startsWith('builtin:') || !state.themes.some(theme => theme.id === current.id); exportTheme.disabled = state.busy;
        const options = state.documents.map(item => item.name).join('|');
        if (originalFile.dataset.options !== options) { originalFile.dataset.options = options; originalFile.replaceChildren(); for (const item of state.documents) { const option = el(doc, 'option', '', item.name, originalFile); option.value = item.name; } }
    }
    const unsubscribe = service.subscribe(sync);
    doc.addEventListener('atria-theme-css-recovered', sync);
    system?.addEventListener?.('change', sync); sync();
    return { sync, dispose() { disposed = true; unsubscribe(); doc.removeEventListener('atria-theme-css-recovered', sync); system?.removeEventListener?.('change', sync); service.cancel(); } };
}
