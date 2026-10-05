import { confirmAtriaDraftLeave } from '../atria-shell/workspace-leave-guard.js';
import { el, action, feedback, field } from './library-ui.js';
import { nativeStudioClient } from './studio-client.js';
import { createAuthoringOperation, createStudioWorkspace, sourceWriteOperation } from './studio-authoring.js';
import { mountStudioPreviewUi } from './studio-preview-ui.js';
import { sourceFileInfo, sourceTextDiff } from './source-editor.js';
import { translateShellText as t } from '../atria-shell/localization.js';

// Studio edits source. Compilation and Preview always go through StudioService.
export async function mountFrontendEditor({ document: doc, root, projectId, ownerId = 'package', baseRevision, stageOperations, client = nativeStudioClient }) {
    const shell = el(doc, 'section', 'atri-source-editor', undefined, root);
    shell.dataset.atriaFrontendEditor = 'true';
    const status = el(doc, 'p', '', t('Reading project sources…'), shell); status.setAttribute('role', 'status');
    const controls = el(doc, 'div', 'atria-studio-actions', undefined, shell);
    const ownerLabel = el(doc, 'label', 'atri-library-field', t('Experience'), shell);
    const ownerChooser = el(doc, 'select', 'text_pole', undefined, ownerLabel); ownerChooser.setAttribute('aria-label', t('Frontend Experience'));
    const label = el(doc, 'label', 'atri-library-field', t('Source Graph'), shell);
    const chooser = el(doc, 'select', 'text_pole', undefined, label); chooser.setAttribute('aria-label', t('Source Graph'));
    const capabilities = el(doc, 'details', 'atri-library-details', undefined, shell);
    el(doc, 'summary', '', t('Features and permissions'), capabilities);
    const capabilityText = el(doc, 'pre', '', undefined, capabilities);
    const identity = el(doc, 'p', '', '', shell);
    const structured = el(doc, 'section', '', undefined, shell);
    const sourceLabel = el(doc, 'label', 'atri-library-field', t('Native source'), shell);
    const editor = el(doc, 'textarea', 'text_pole atria-studio-editor__textarea', undefined, sourceLabel);
    editor.setAttribute('aria-label', t('Native source')); editor.spellcheck = false;
    const diff = el(doc, 'pre', 'atri-source-diff', '', shell);
    const diagnosticList = el(doc, 'section', '', undefined, shell); diagnosticList.setAttribute('aria-label', t('Frontend diagnostics'));
    const previewRoot = el(doc, 'div', 'atria-studio-preview-canvas', undefined, shell);
    previewRoot.hidden = true;
    let graph, selected, loaded, disposed = false, sequence = 0;
    let previewMount, previewId;
    const drafts = new Map(), originals = new Map(), semanticDrafts = new Map();
    label.dataset.atriaDraftDirty = ownerLabel.dataset.atriaDraftDirty = 'false';
    const alive = token => !disposed && token === sequence;
    async function evaluate(operations, render = false) {
        if (!graph.previewEntryPointId) throw new Error(t('No EntryPoint uses this frontend. Select an EntryPoint frontend to preview.'));
        const token = sequence;
        const result = await client.evaluateFrontend(projectId, createStudioWorkspace({ projectId, baseRevision, operations }), graph.previewEntryPointId);
        if (!alive(token)) { if (result.preview) await client.closePreview(result.preview.previewId); throw new Error(t('Source selection changed. Run Preview again.')); }
        showDiagnostics(result.validation.diagnostics);
        if (result.validation.status === 'failed') throw new Error(t('Resolve frontend errors before review. Your drafts are still here.'));
        if (!result.preview) return;
        const id = result.preview.previewId;
        if (!render || disposed) { await client.closePreview(id); return; }
        try {
            const exact = await client.getPreviewUi(id);
            if (!alive(token)) { await client.closePreview(id); throw new Error(t('Source selection changed. Run Preview again.')); }
            previewMount?.dispose(); if (previewId) await client.closePreview(previewId);
            previewId = id;
            previewRoot.hidden = false;
            previewMount = await mountStudioPreviewUi(doc, previewRoot, exact.model, exact.experience.mode,
                item => feedback(doc, shell, item.reasonCode || item.message || String(item)),
                { entry: exact.experience.frontend.entry, files: exact.compiledFiles, bridgeProjections: exact.bridgeProjections });
            if (!alive(token)) { previewMount.dispose(); await client.closePreview(id); throw new Error(t('Source selection changed. Run Preview again.')); }
        } catch (error) { await client.closePreview(id); throw error; }
    }
    const sourceText = () => loaded?.text?.includes('\r\n') ? editor.value.replace(/\r?\n/g, '\r\n') : editor.value;
    function markDirty() { sourceLabel.dataset.atriaDraftDirty = String([...drafts].some(([path, text]) => text !== originals.get(path)) || [...semanticDrafts.values()].some(item => item.dirty)); }
    function remember() { if (loaded && !loaded.readOnly) drafts.set(loaded.path, sourceText()); markDirty(); }
    function showDiff() { markDirty(); diff.textContent = sourceTextDiff(loaded?.text || '', sourceText()).text; }
    function showDiagnostics(items) {
        diagnosticList.replaceChildren();
        el(doc, 'h4', '', t('Frontend diagnostics'), diagnosticList);
        if (!items.length) el(doc, 'p', '', t('No diagnostics.'), diagnosticList);
        for (const item of items) {
            const row = el(doc, 'div', '', undefined, diagnosticList);
            const source = item.source;
            action(doc, row, `${item.severity} · ${item.code} · ${source?.file || item.path || ''}:${source?.line || 1} — ${item.message}`, async () => {
                const index = graph.entries.findIndex(entry => entry.file === (source?.file || item.path));
                if (index < 0) return;
                chooser.value = String(index); await loadEntry();
                const start = source?.start ?? 0, end = source?.end ?? start;
                const text = sourceText();
                editor.focus(); editor.setSelectionRange(text.slice(0, start).replaceAll('\r\n', '\n').length, text.slice(0, end).replaceAll('\r\n', '\n').length);
            });
        }
    }
    function semanticForm(entry) {
        structured.replaceChildren();
        if (!['component', 'node', 'binding', 'view', 'style', 'state', 'interaction', 'message'].includes(entry.kind)) return;
        const draftKey = JSON.stringify([ownerId, entry.kind, entry.id, entry.componentId, entry.locale]);
        el(doc, 'h4', '', t('Structured edit'), structured);
        const key = field(doc, structured, entry.kind === 'node' ? 'Attribute or text' : 'JSON field path', entry.kind === 'node' ? 'text' : '');
        if (entry.kind === 'style') key.hidden = true;
        if (entry.kind === 'component') el(doc, 'p', '', t('Edit contract fields: props, emits, slots, state, interactions, lifecycle, nodeRefs, dynamicStyles, uses or controller. Separate nested JSON keys with /. An empty path edits the whole contract.'), structured);
        const valueLabel = el(doc, 'label', 'atri-library-field', t('Value'), structured);
        const value = el(doc, 'textarea', 'text_pole', undefined, valueLabel); value.setAttribute('aria-label', t('Structured value'));
        value.value = entry.kind === 'node' ? entry.value?.text || '' : entry.kind === 'style' ? entry.value || '' : JSON.stringify(entry.value ?? {}, null, 2);
        const initial = { key: key.value, value: value.value }; const pending = semanticDrafts.get(draftKey);
        if (pending) { key.value = pending.key; value.value = pending.value; }
        const rememberSemantic = () => { semanticDrafts.set(draftKey, { file: entry.file, key: key.value, value: value.value, dirty: key.value !== initial.key || value.value !== initial.value }); markDirty(); };
        key.addEventListener('input', () => {
            sequence++;
            if (entry.kind === 'node') value.value = key.value === 'text' ? entry.value?.text || '' : entry.value?.attributes?.[key.value] || '';
            else if (entry.kind !== 'style') {
                const selectedValue = key.value ? key.value.split('/').reduce((item, part) => item?.[part], entry.value) : entry.value;
                value.value = JSON.stringify(selectedValue ?? null, null, 2);
            }
            rememberSemantic();
        });
        value.addEventListener('input', () => { sequence++; rememberSemantic(); });
        el(doc, 'p', '', t('Node text and attributes use plain text. Other structured values use JSON; styles use CSS. Review validates the complete source graph.'), structured);
        action(doc, structured, 'Review structured edit', async () => {
            remember();
            if ([...drafts].some(([path, text]) => text !== originals.get(path))) throw new Error(t('Review your source draft first, or reload it before making a structured edit.'));
            const input = { ownerId, kind: entry.kind, id: entry.id, contentHash: entry.contentHash,
                ...(entry.componentId ? { componentId: entry.componentId } : {}), ...(entry.locale ? { locale: entry.locale } : {}),
                ...(entry.kind === 'node' ? { field: key.value } : { path: key.value ? key.value.split('/') : [] }),
                value: ['node', 'style'].includes(entry.kind) ? value.value : JSON.parse(value.value) };
            const operations = [createAuthoringOperation({ operationType: 'frontend.patch', target: { resourceType: 'core.project', resourceId: projectId }, input })];
            const token = sequence; await evaluate(operations, true);
            if (!alive(token)) return;
            if (await stageOperations(operations, t('Review structured edit')) !== false) { semanticDrafts.delete(draftKey); markDirty(); }
        });
    }
    async function loadEntry() {
        remember(); const token = ++sequence;
        selected = graph.entries[Number(chooser.value)]; loaded = null; editor.disabled = true;
        structured.replaceChildren();
        try {
            const file = await client.readSource(projectId, selected.file);
            if (!alive(token)) return;
            const info = sourceFileInfo(selected.file, file.content); loaded = { ...info, path: selected.file };
            originals.set(selected.file, info.text);
            editor.value = info.readOnly ? '' : drafts.get(selected.file) ?? info.text;
            editor.disabled = info.readOnly; editor.readOnly = info.readOnly;
            identity.textContent = `${selected.kind} · ${selected.componentId ? selected.componentId + ':' : ''}${selected.id} · ${selected.file}`;
            status.textContent = info.readOnly ? t(info.reason) : t('Source edits are reviewed before they are applied.');
            semanticForm(selected); showDiff();
        } catch (error) { if (alive(token)) feedback(doc, shell, error.message, true); }
    }
    async function analyze() {
        remember();
        const token = sequence;
        const result = await client.inspectFrontend(projectId, { ownerId, baseRevision, drafts: [...drafts].map(([path, content]) => ({ path, content })) });
        if (alive(token)) { showDiagnostics(result.diagnostics); editor.setAttribute('aria-invalid', String(result.status === 'failed')); }
        return { ...result, stale: !alive(token) };
    }
    action(doc, controls, 'Check source', analyze);
    action(doc, controls, 'Review source changes', async () => {
        const result = await analyze();
        if (result.stale) return;
        if (result.status === 'failed') throw new Error(t('Resolve frontend errors before review. Your drafts are still here.'));
        const operations = [...drafts].map(([path, content]) => sourceWriteOperation(path, content));
        if (operations.length) await stageOperations(operations, t('Review source changes'));
    });
    action(doc, controls, 'Preview draft', async () => {
        if (!loaded || loaded.readOnly) return;
        const result = await analyze();
        if (result.stale || result.status === 'failed') return;
        await evaluate([...drafts].map(([path, content]) => sourceWriteOperation(path, content)), true);
    });
    action(doc, controls, 'Reload file', async () => { if (!confirmAtriaDraftLeave(doc, shell)) return; if (loaded) { drafts.delete(loaded.path); for (const [key, value] of semanticDrafts) if (value.file === loaded.path) semanticDrafts.delete(key); } loaded = null; await loadEntry(); });
    editor.addEventListener('input', () => { sequence++; remember(); showDiff(); });
    chooser.addEventListener('change', () => void loadEntry());
    async function loadGraph() {
        try {
            const token = ++sequence;
            const result = await client.inspectFrontend(projectId, { ownerId, baseRevision });
            if (!alive(token)) return;
            graph = result;
            ownerChooser.replaceChildren(); chooser.replaceChildren();
            for (const owner of graph.owners) { const option = el(doc, 'option', '', `${owner.id} · ${owner.mode}`, ownerChooser); option.value = owner.id; option.selected = owner.id === ownerId; }
            capabilityText.textContent = JSON.stringify({ features: graph.features, permissions: graph.permissions, remoteOrigins: graph.remoteOrigins }, null, 2);
            for (const [index, entry] of graph.entries.entries()) {
                const option = el(doc, 'option', '', `${entry.kind} · ${entry.componentId ? entry.componentId + ':' : ''}${entry.id}${entry.locale ? ' · ' + entry.locale : ''} — ${entry.file}`, chooser); option.value = String(index);
            }
            showDiagnostics(graph.diagnostics); await loadEntry();
        } catch (error) { status.textContent = t('Could not load sources'); feedback(doc, shell, error.message, true); }
    }
    ownerChooser.addEventListener('change', () => { remember(); ownerId = ownerChooser.value; void loadGraph(); });
    await loadGraph();
    return { dispose() { disposed = true; sequence++; previewMount?.dispose(); if (previewId) void client.closePreview(previewId).catch(() => {}); shell.remove(); } };
}
