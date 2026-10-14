import { translateShellText } from '../atria-shell/localization.js';
import { runtimeRequest } from './runtime-client.js';
import { nativeAssetUrl } from './session-projection.js';
import { illustrationNode as node, illustrationField as field, illustrationSelect as select, illustrationButton as button } from './illustration-ui.js';
import { visualApproval } from './visual-approval-ui.js';
import { MaskCommandModel, mountMaskCanvas } from './mask-canvas.js';

export async function mountMediaStudio({ document: doc, parent, sdk, imageVersionId, report, onJob }) {
    const root = node(doc, parent, 'section', undefined, 'atri-media-studio'); root.dataset.atriaDraftDirty = 'false'; node(doc, root, 'h3', translateShellText('Media Studio'));
    const status = node(doc, root, 'p', translateShellText('Loading image and draft…')); status.setAttribute('role', 'status');
    const controller = new AbortController(); let timer = null, saving = false, dirty = false, disposed = false, conflicted = false, record, model, canvas;
    const context = sdk.context;
    const scoped = { sessionId: context.sessionId, branchId: context.branchId };
    const headers = () => globalThis.Atria?.getContext?.()?.getRequestHeaders?.() ?? {};
    const binary = async (path, options = {}) => {
        const response = await fetch('/api/native/generation' + path, { ...options, signal: controller.signal, headers: { ...headers(), ...options.headers } });
        if (!response.ok) { const data = await response.json(); throw Object.assign(new Error(data.error || translateShellText('Mask sync failed.')), { status: response.status }); }
        return response;
    };
    const changed = () => { dirty = true; root.dataset.atriaDraftDirty = 'true'; status.textContent = translateShellText('Draft not synced'); clearTimeout(timer); timer = setTimeout(() => { void save().catch(report); }, 2000); };
    const save = async () => {
        if (!dirty || saving || disposed || conflicted) return;
        saving = true; status.textContent = translateShellText('Syncing draft…');
        const commands = structuredClone(model.commands), cursor = model.cursor;
        try {
            if (commands.length >= 100 && cursor >= 50) {
                const compact = model.compact(50), form = new FormData();
                form.append('checkpoint', new Blob([compact.checkpoint], { type: 'application/octet-stream' }), 'mask.gray8');
                form.append('metadata', JSON.stringify({ ...scoped, draftId: record.value.draftId, expectedRevision: record.revision, commands: compact.commands, cursor: compact.cursor }));
                const next = await (await binary('/visual/mask/checkpoint-with-commands', { method: 'POST', body: form })).json();
                // Save completion never drops newer strokes/Undo. The first 50
                // commands remain equivalent to the newly stored checkpoint.
                record = next;
                if (model.cursor >= 50 && JSON.stringify(model.commands.slice(0, 50)) === JSON.stringify(commands.slice(0, 50))) { model.checkpoint = compact.checkpoint; model.commands = model.commands.slice(50); model.cursor -= 50; } else { dirty = true; conflicted = true; throw new Error(translateShellText('Undo occurred while saving the checkpoint. Your edits are preserved. Save a separate draft.')); }
            } else record = await sdk.illustrations.visual('mask', 'save', { draftId: record.value.draftId, commands, cursor, expectedRevision: record.revision });
            dirty = JSON.stringify({ commands: model.commands, cursor: model.cursor }) !== JSON.stringify({ commands: record.value.commands, cursor: record.value.cursor });
            root.dataset.atriaDraftDirty = String(dirty); status.textContent = dirty ? translateShellText('New strokes waiting to sync') : translateShellText('Draft synced');
        } catch (error) { conflicted ||= error.status === 409 || error.message.includes('conflict'); dirty = true; root.dataset.atriaDraftDirty = 'true'; status.textContent = error.status === 409 ? translateShellText('The draft changed elsewhere. Your edits are preserved. You can save a separate draft.') : translateShellText('Draft not synced: ') + error.message; throw error; } finally { saving = false; if (dirty && !disposed && !conflicted) { clearTimeout(timer); timer = setTimeout(() => { void save().catch(report); }, 2000); } }
    };
    try {
        const history = await sdk.illustrations.visual('gallery', 'history', { imageVersionId });
        const drafts = await sdk.illustrations.visual('mask', 'find', { imageVersionId });
        record = drafts.items.length ? await sdk.illustrations.visual('mask', 'read', { draftId: drafts.items.sort((a, b) => b.updatedAt - a.updatedAt)[0].draftId })
            : await sdk.illustrations.visual('mask', 'create', { imageVersionId });
        const checkpoint = new Uint8Array(await (await binary('/visual/mask/raster/' + record.value.draftId + '?' + new URLSearchParams(scoped))).arrayBuffer());
        model = new MaskCommandModel({ ...record.value, checkpoint });
        canvas = mountMaskCanvas({ document: doc, parent: root, baseUrl: nativeAssetUrl(history.image.assetId), model, changed });
        const selectedReferences = new Set();
        const references = node(doc, root, 'details'); node(doc, references, 'summary', translateShellText('Reference images for this task'));
        for (const ref of history.referenceBindings ?? []) field(doc, references, ref.purpose + ' · ' + (ref.identity || translateShellText('Style or structure')), false, enabled => enabled ? selectedReferences.add(ref.referenceId) : selectedReferences.delete(ref.referenceId), { type: 'checkbox' });
        let operation = 'inpaint', prompt = history.image.prompt, imageTargetId = '', imageRenderingId = '', preserveOutsideMask = true;
        const configuration = await runtimeRequest('/visual/configuration');
        select(doc, root, translateShellText('Edit operation'), operation, [['regenerate', translateShellText('Regenerate image')], ['img2img', translateShellText('Image to image')], ['inpaint', translateShellText('Inpaint')], ['upscale', translateShellText('Upscale, may change details')]], value => operation = value);
        select(doc, root, translateShellText('Image target for this task'), imageTargetId, [['', translateShellText('Use the current default target')], ...configuration.targets.map(t => [t.imageTargetId, t.displayName + ' · ' + t.model])], value => imageTargetId = value);
        select(doc, root, translateShellText('Image style for this task'), imageRenderingId, [['', translateShellText('Use the current style')], ...configuration.renderings.map(item => [item.imageRenderingId, item.displayName])], value => imageRenderingId = value);
        field(doc, root, translateShellText('Edit prompt'), prompt, value => prompt = value, { multiline: true });
        field(doc, root, translateShellText('Save a composite version, preserving pixels outside the mask'), preserveOutsideMask, value => preserveOutsideMask = value, { type: 'checkbox' });
        node(doc, root, 'p', translateShellText('Model results and composite versions are saved separately. Compositing may leave seams. Opening, drawing and previewing do not submit image requests.'));
        button(doc, root, translateShellText('Save draft'), async () => { try { await save(); } catch (error) { report(error); } });
        button(doc, root, translateShellText('Save a separate draft'), async () => {
            try {
                const next = await sdk.illustrations.visual('mask', 'create', { imageVersionId }), form = new FormData();
                const pixels = model.pixels(), commands = structuredClone(model.commands), cursor = model.cursor;
                form.append('checkpoint', new Blob([pixels], { type: 'application/octet-stream' }), 'mask.gray8');
                form.append('metadata', JSON.stringify({ ...scoped, draftId: next.value.draftId, expectedRevision: next.revision, commands: [], cursor: 0 }));
                record = await (await binary('/visual/mask/checkpoint-with-commands', { method: 'POST', body: form })).json();
                if (JSON.stringify({ commands: model.commands, cursor: model.cursor }) !== JSON.stringify({ commands, cursor })) {
                    dirty = true; conflicted = true; root.dataset.atriaDraftDirty = 'true';
                    status.textContent = translateShellText('New strokes arrived while saving the separate draft. Your edits are preserved. Save another draft.');
                } else { model.checkpoint = pixels; model.commands = []; model.cursor = 0; dirty = false; conflicted = false; root.dataset.atriaDraftDirty = 'false'; status.textContent = translateShellText('Separate draft saved'); }
            } catch (error) { report(error); }
        });
        button(doc, root, translateShellText('Preview edit task'), async () => {
            try {
                await save(); if (dirty || saving) throw new Error(translateShellText('Finish syncing the draft first.'));
                const mask = operation === 'inpaint' ? await sdk.illustrations.visual('mask', 'freeze', { draftId: record.value.draftId, expectedRevision: record.revision }) : null;
                const preview = await sdk.illustrations.visual('media', 'prepare', { imageVersionId, operation, prompt, ...(imageTargetId ? { imageTargetId } : {}), ...(imageRenderingId ? { imageRenderingId } : {}),
                    ...(mask ? { maskArtifactId: mask.maskArtifactId } : {}), referenceIds: [...selectedReferences], preserveOutsideMask: operation === 'inpaint' && preserveOutsideMask });
                visualApproval({ document: doc, parent: root, preview, externalAssetIds: preview.externalAssetIds, report,
                    submit: async approval => { const started = await sdk.illustrations.image('start', { prepareId: preview.prepareId, approval }); status.textContent = translateShellText('Edit task submitted. You can continue drawing.'); onJob?.(started); } });
            } catch (error) { report(error); }
        });
        const lineage = node(doc, root, 'details'); node(doc, lineage, 'summary', translateShellText('Source, lineage and execution details'));
        lineage.addEventListener('toggle', () => { if (lineage.open && !lineage.querySelector('pre')) node(doc, lineage, 'pre', JSON.stringify(history, null, 2)); });
        status.textContent = translateShellText('Unmasked pixels preserve the original. Blue marks the edit area. Pinch to zoom and use Pan to move the canvas.');
    } catch (error) { status.textContent = translateShellText('Could not load the editor.'); report(error); }
    const interval = setInterval(() => { if (dirty) void save().catch(report); }, 10000);
    return { root, save, dispose: () => { disposed = true; clearTimeout(timer); clearInterval(interval); controller.abort(); canvas?.dispose(); root.remove(); } };
}
