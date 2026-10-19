import { runtimeRequest } from './runtime-client.js';
import { mountVisualConfiguration } from './visual-configuration-ui.js';
import { visualApproval } from './visual-approval-ui.js';
import { illustrationNode as node, illustrationField as field, illustrationSelect as select, illustrationButton as button, ILLUSTRATION_CSS } from './illustration-ui.js';
import { translateShellText as tl, formatShellText as fmt } from '../atria-shell/localization.js';
import { formatAtriaDate } from '../atria-shell/components.js';

const terminal = new Set(['completed', 'failed', 'cancelled', 'stale']);
const statusLabels = { queued: 'Queued', running: 'Running', submitted: 'Submitted', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled', stale: 'Stale', result_received: 'Result received', uncertain_submission: 'Submission unknown' };

export function mountVisualAuthoring({ document: doc, body, host, browseStates = new Map(), request = runtimeRequest }) {
    const controller = new AbortController();
    const state = browseStates.get('visual-authoring') ?? { title: '', prompt: '', negativePrompt: '', overrideNegative: false, target: '', rendering: '', archived: false };
    browseStates.set('visual-authoring', state);
    const root = node(doc, null, 'section', undefined, 'atri-illustration-ui atri-visual-authoring'); body.replaceChildren(root);
    node(doc, root, 'style', ILLUSTRATION_CSS + `
.atri-visual-authoring { max-width:1200px; margin-inline:auto; padding-bottom:calc(100px + env(safe-area-inset-bottom)); }
.atri-visual-authoring-work { display:grid; grid-template-columns:minmax(0, 1.3fr) minmax(280px, .8fr); gap:28px; align-items:start; }
.atri-visual-authoring-preview { min-width:0; background:var(--atri-fill); border-radius:var(--atri-radius-lg); padding:20px; }
.atri-visual-authoring textarea:disabled { background:var(--atri-fill); opacity:.55; }
.atri-visual-authoring-work > section { min-width:0; }
@media(max-width:900px) { .atri-visual-authoring-work { grid-template-columns:minmax(0,1fr); gap:16px; } }
`);
    node(doc, root, 'h2', tl('Image studio'));
    node(doc, root, 'p', tl('Create images from your own prompt and saved styles. Preview first, then choose whether to generate.'));
    const status = node(doc, root, 'p'); status.setAttribute('role', 'status');
    const report = error => { if (!controller.signal.aborted) { status.setAttribute('role', 'alert'); status.textContent = error.message; } };
    const run = callback => async () => { try { await callback(); } catch (error) { report(error); } };
    const read = (path, options = {}) => request(path, { ...options, signal: controller.signal });
    const work = node(doc, root, 'div', undefined, 'atri-visual-authoring-work');
    const form = node(doc, work, 'section');
    const previewBox = node(doc, work, 'section', undefined, 'atri-visual-authoring-preview');
    node(doc, previewBox, 'p', tl('Preview your request to review style and cost.'));
    const signature = () => JSON.stringify([state.title, state.prompt, state.negativePrompt, state.overrideNegative, state.target, state.rendering]);
    let previewSequence = 0, listSequence = 0, timer, resources = [], disposed = false, galleryIdentity = '';
    function changed() {
        previewSequence++; previewBox.replaceChildren(); node(doc, previewBox, 'p', tl('Preview your request to review style and cost.'));
        root.dataset.atriaDraftDirty = String(Boolean(state.prompt.trim()));
    }
    const editor = node(doc, form, 'div');
    field(doc, editor, tl('Image title'), state.title, value => { state.title = value; changed(); });
    const prompt = field(doc, editor, tl('Image prompt'), state.prompt, value => { state.prompt = value; changed(); }, { multiline: true });
    const selections = node(doc, form, 'div', undefined, 'atri-prompt-sample-fields');
    const drawSelections = () => {
        selections.replaceChildren();
        const choices = type => resources.filter(item => item.ref.scope === 'library' && item.ref.resourceType === type && !item.archived)
            .map(item => [JSON.stringify(item.ref), item.resource.displayName + ' · ' + item.ref.revision]);
        select(doc, selections, tl('Exact image target'), state.target, [['', tl('Choose a saved target')], ...choices('core.image-target')], value => { state.target = value; changed(); });
        select(doc, selections, tl('Exact image style'), state.rendering, [['', tl('No style')], ...choices('core.image-rendering')], value => { state.rendering = value; changed(); });
    };
    field(doc, form, tl('Override style negative prompt'), state.overrideNegative, value => { state.overrideNegative = value; negative.disabled = !value; changed(); }, { type: 'checkbox' });
    const negative = field(doc, form, tl('Negative prompt'), state.negativePrompt, value => { state.negativePrompt = value; changed(); }, { multiline: true }); negative.disabled = !state.overrideNegative;
    const actions = node(doc, form, 'div', undefined, 'atri-illustration-actions');
    button(doc, actions, tl('Preview image request'), run(async () => {
        if (!state.target || !state.prompt.trim()) { status.textContent = tl('Choose a saved target and enter an image prompt.'); prompt.focus(); return; }
        const sequence = ++previewSequence, identity = signature();
        status.setAttribute('role', 'status'); status.textContent = tl('Preparing image preview…');
        const preview = await read('/authoring/images/prepare', { method: 'POST', body: { title: state.title, prompt: state.prompt,
            imageTargetRef: JSON.parse(state.target), ...(state.rendering ? { imageRenderingRef: JSON.parse(state.rendering) } : {}),
            ...(state.overrideNegative ? { negativePrompt: state.negativePrompt } : {}) } });
        if (disposed || sequence !== previewSequence || identity !== signature()) return;
        previewBox.replaceChildren(); status.textContent = tl('Preview ready. No image request has been sent.');
        node(doc, previewBox, 'h3', tl('Image request preview')); node(doc, previewBox, 'p', preview.prompt);
        const details = node(doc, previewBox, 'details'); node(doc, details, 'summary', tl('Compilation details'));
        node(doc, details, 'pre', JSON.stringify({ sent: preview.sent, negativePrompt: preview.negativePrompt, evidence: preview.evidence }, null, 2));
        visualApproval({ document: doc, parent: previewBox, preview, report, submit: async approval => {
            if (identity !== signature() || sequence !== previewSequence) throw new Error(tl('The image draft changed. Preview again before generating.'));
            const result = await read('/illustration-images', { method: 'POST', body: { prepareId: preview.prepareId, approval } });
            state.operationId = result.operationId; root.dataset.atriaDraftDirty = 'false';
            status.textContent = tl('Image task submitted. Its progress and result are available in your gallery.');
            await refreshGallery();
        } });
    }));
    button(doc, actions, tl('Connections'), () => host.openRuntimeSection('connections'));
    const configuration = node(doc, root, 'section');
    async function loadResources() {
        const [visual, runtime, catalog] = await Promise.all([read('/visual/configuration'), read('/configuration'), read('/resources')]);
        if (disposed) return;
        resources = catalog; drawSelections(); configuration.replaceChildren();
        mountVisualConfiguration({ document: doc, parent: configuration, data: visual, connections: runtime.connections, request: read, report, refresh: loadResources });
    }
    button(doc, actions, tl('Refresh resources'), run(loadResources));
    const gallery = node(doc, root, 'section'); node(doc, gallery, 'h3', tl('My images'));
    const galleryActions = node(doc, gallery, 'div', undefined, 'atri-illustration-actions');
    select(doc, galleryActions, tl('Image collection'), state.archived ? 'archived' : 'active', [['active', tl('Active images')], ['archived', tl('Archived images')]], value => { state.archived = value === 'archived'; void run(refreshGallery)(); });
    button(doc, galleryActions, tl('Refresh'), run(refreshGallery));
    node(doc, gallery, 'p', tl('Archiving keeps the image and its task history.'));
    const galleryStatus = node(doc, gallery, 'p'); galleryStatus.setAttribute('role', 'status');
    const list = node(doc, gallery, 'div', undefined, 'atri-visual-gallery');
    async function observe(operationId, reconcile = false) {
        const result = await read(reconcile ? '/illustration-images/reconcile' : '/illustration-images/' + encodeURIComponent(operationId) + '/observation', reconcile ? { method: 'POST', body: { operationId } } : {});
        state.operationId = result.operation?.operationId ?? operationId;
        await refreshGallery();
    }
    async function refreshGallery() {
        const sequence = ++listSequence;
        clearTimeout(timer);
        let rows;
        try { rows = await read('/authoring/images?archived=' + (state.archived ? '1' : '0')); } catch (error) { if (!disposed && sequence === listSequence) { galleryStatus.setAttribute('role', 'alert'); galleryStatus.textContent = error.message; } return; }
        if (disposed || sequence !== listSequence) return;
        galleryStatus.setAttribute('role', 'status');
        galleryStatus.textContent = rows.length ? fmt('${0} image tasks', [rows.length]) : tl('No images in this collection yet.');
        const identity = JSON.stringify(rows);
        if (rows.some(row => !terminal.has(row.operation.status) && row.operation.status !== 'uncertain_submission')) timer = setTimeout(() => { void run(refreshGallery)(); }, 3000);
        if (identity === galleryIdentity) return;
        galleryIdentity = identity;
        const focused = doc.activeElement?.closest('[data-operation-id]');
        const focusId = focused?.dataset.operationId, focusLabel = doc.activeElement?.textContent;
        const expanded = new Set([...list.querySelectorAll('details[open]')].map(details => details.closest('[data-operation-id]')?.dataset.operationId + ':' + details.querySelector('summary')?.textContent));
        list.replaceChildren();
        for (const { operation, image } of rows) {
            const card = node(doc, list, 'article'); card.dataset.operationId = operation.operationId;
            node(doc, card, 'h4', image?.title || operation.anchor?.title || tl('Untitled image'));
            node(doc, card, 'p', tl(statusLabels[operation.status] ?? operation.status) + ' · ' + formatAtriaDate(operation.createdAt));
            if (image) {
                const url = '/api/native/session/asset/' + encodeURIComponent(image.ref.assetId) + '?contentHash=' + encodeURIComponent(image.ref.contentHash);
                const picture = node(doc, card, 'img'); picture.src = url; picture.alt = image.title || image.prompt; picture.loading = 'lazy'; picture.decoding = 'async'; picture.width = image.width; picture.height = image.height;
                const download = node(doc, card, 'a', tl('Download image')); download.href = url; download.download = (image.title || image.imageVersionId) + '.png';
                button(doc, card, tl(state.archived ? 'Restore image' : 'Archive image'), run(async () => {
                    await read('/authoring/images/archive', { method: 'POST', body: { operationId: operation.operationId, archived: !state.archived } });
                    status.textContent = tl(state.archived ? 'Image restored.' : 'Image archived.'); await refreshGallery();
                }));
                const details = node(doc, card, 'details'); node(doc, details, 'summary', tl('Image prompt')); node(doc, details, 'p', image.prompt);
            } else {
                button(doc, card, tl('Observe task'), run(() => observe(operation.operationId)));
                if (!terminal.has(operation.status)) {
                    button(doc, card, tl('Reconnect task'), run(() => observe(operation.operationId, true)));
                    button(doc, card, tl('Cancel image task'), run(async () => { await read('/illustration-images/' + encodeURIComponent(operation.operationId), { method: 'DELETE' }); await refreshGallery(); }));
                }
            }
            const evidence = node(doc, card, 'details'); node(doc, evidence, 'summary', tl('Task details'));
            node(doc, evidence, 'pre', JSON.stringify({ operationId: operation.operationId, cost: operation.cost, errorCode: operation.errorCode, cancelReceipt: operation.cancelReceipt }, null, 2));
        }
        for (const card of list.children) {
            for (const details of card.querySelectorAll('details')) details.open = expanded.has(card.dataset.operationId + ':' + details.querySelector('summary')?.textContent);
            if (card.dataset.operationId === focusId) [...card.querySelectorAll('button, a, summary')].find(control => control.textContent === focusLabel)?.focus({ preventScroll: true });
        }
    }
    void run(async () => { await Promise.all([loadResources(), refreshGallery()]); })();
    return { root, dispose() { disposed = true; controller.abort(); clearTimeout(timer); root.remove(); } };
}
