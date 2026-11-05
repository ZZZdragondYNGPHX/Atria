import { translateShellText as t } from '../atria-shell/localization.js';
import { nativeAssetUrl } from './session-projection.js';
import { MaskCommandModel, mountMaskCanvas } from './mask-canvas.js';
import { el, action, field, input, segmented, check } from './illustration-kit.js';

// Retouching over the existing mask draft and media-operation authorities.
// Drafts sync quietly; nothing is sent to the image service until "Retouch".
export async function mountIllustrationRetouch({ document: doc, sdk, annotation, image, report, flow, onDone, onSubmitted }) {
    const context = sdk.context, scoped = { sessionId: context.sessionId, branchId: context.branchId };
    const controller = new AbortController();
    const root = el(doc, 'div', { className: 'atri-ill-stack atri-ill-retouch', attrs: { 'data-atria-draft-dirty': 'false' } });
    const status = el(doc, 'p', { className: 'atri-ill-muted', attrs: { role: 'status' } });
    let record, model, canvas, timer = null, dirty = false, saving = false, disposed = false;
    const headers = () => globalThis.Atria?.getContext?.()?.getRequestHeaders?.() ?? {};
    const binary = async (path, options = {}) => {
        const response = await fetch('/api/native/generation' + path, { ...options, signal: controller.signal, headers: { ...headers(), ...options.headers } });
        if (!response.ok) { const data = await response.json().catch(() => ({})); throw Object.assign(new Error(data.error || 'mask_sync_failed'), { code: data.error, status: response.status }); }
        return response;
    };
    const mark = value => { dirty = value; root.dataset.atriaDraftDirty = String(value); };
    async function save() {
        if (!dirty || saving || disposed) return;
        saving = true;
        const commands = structuredClone(model.commands), cursor = model.cursor;
        try {
            if (commands.length >= 100 && cursor >= 50) {
                const compact = model.compact(50), form = new FormData();
                form.append('checkpoint', new Blob([compact.checkpoint], { type: 'application/octet-stream' }), 'mask.gray8');
                form.append('metadata', JSON.stringify({ ...scoped, draftId: record.value.draftId, expectedRevision: record.revision, commands: compact.commands, cursor: compact.cursor }));
                record = await (await binary('/visual/mask/checkpoint-with-commands', { method: 'POST', body: form })).json();
                model.checkpoint = compact.checkpoint; model.commands = model.commands.slice(50); model.cursor -= 50;
            } else record = await sdk.illustrations.visual('mask', 'save', { draftId: record.value.draftId, commands, cursor, expectedRevision: record.revision });
            mark(JSON.stringify([model.commands, model.cursor]) !== JSON.stringify([record.value.commands, record.value.cursor]));
        } finally { saving = false; }
    }
    const changed = () => { mark(true); clearTimeout(timer); timer = setTimeout(() => void save().catch(() => {}), 1500); };

    const history = await sdk.illustrations.visual('gallery', 'history', { imageVersionId: image.imageVersionId });
    const drafts = await sdk.illustrations.visual('mask', 'find', { imageVersionId: image.imageVersionId });
    record = drafts.items.length ? await sdk.illustrations.visual('mask', 'read', { draftId: drafts.items.sort((a, b) => b.updatedAt - a.updatedAt)[0].draftId })
        : await sdk.illustrations.visual('mask', 'create', { imageVersionId: image.imageVersionId });
    const checkpoint = new Uint8Array(await (await binary('/visual/mask/raster/' + record.value.draftId + '?' + new URLSearchParams(scoped))).arrayBuffer());
    model = new MaskCommandModel({ ...record.value, checkpoint });

    let operation = 'inpaint', prompt = history.image.prompt ?? image.prompt ?? '', keep = true;
    const hint = el(doc, 'p', { className: 'atri-ill-muted' });
    const describeHint = () => { hint.textContent = { inpaint: t('Paint over the part to change. Everything else stays as it is.'), img2img: t('Redraws the whole picture using this one as a starting point.'), upscale: t('Makes the image larger and sharper. Small details may change.') }[operation]; };
    const canvasHost = el(doc, 'div');
    const promptField = field(doc, t('What should it become?'), input(doc, prompt, value => { prompt = value; }, { multiline: true }));
    const keepBox = check(doc, t('Keep everything outside the painted area exactly as it was'), keep, value => { keep = value; });
    const syncMode = () => { describeHint(); canvasHost.hidden = operation !== 'inpaint'; keepBox.hidden = operation !== 'inpaint'; promptField.hidden = operation === 'upscale'; };
    root.append(
        el(doc, 'div', { className: 'atri-ill-row' }, [action(doc, t('Back'), () => onDone(), { variant: 'plain', icon: 'chevron-left', size: 'sm' }), el(doc, 'h3', { text: t('Retouch'), attrs: { style: 'margin:0' } })]),
        segmented(doc, t('Retouch type'), operation, [['inpaint', t('Change an area')], ['img2img', t('Redraw all')], ['upscale', t('Enlarge')]], value => { operation = value; syncMode(); }),
        hint, canvasHost, promptField, keepBox, status,
        el(doc, 'div', { className: 'atri-ill-row' }, [action(doc, t('Retouch'), async () => {
            try {
                if (operation === 'inpaint' && !model.pixels().some(Boolean)) { status.textContent = t('Paint the area to change first.'); return; }
                status.textContent = t('Preparing…');
                await save();
                const mask = operation === 'inpaint' ? await sdk.illustrations.visual('mask', 'freeze', { draftId: record.value.draftId, expectedRevision: record.revision }) : null;
                const preview = await sdk.illustrations.visual('media', 'prepare', { imageVersionId: image.imageVersionId, operation, prompt, ...(mask ? { maskArtifactId: mask.maskArtifactId } : {}),
                    referenceIds: [], preserveOutsideMask: operation === 'inpaint' && keep });
                mark(false);
                void flow.submitPrepared(annotation.annotationId, preview);
                onSubmitted();
            } catch (error) { status.textContent = ''; report(error); }
        }, { variant: 'primary', icon: 'brush' }), action(doc, t('Cancel'), () => onDone(), { variant: 'plain' })]),
    );
    canvas = mountMaskCanvas({ document: doc, parent: canvasHost, baseUrl: nativeAssetUrl(history.image.assetId), model, changed });
    syncMode();
    return { root, dispose() { disposed = true; clearTimeout(timer); if (dirty) void save().catch(() => {}); controller.abort(); canvas?.dispose(); root.remove(); } };
}
