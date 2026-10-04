import { createIllustrationDraft, assertIllustrationDraft, matchDrawingCharacters } from '../../shared/illustration-plugin-contract.js';
import { illustrationNode as node, illustrationField as field, illustrationSelect as select, illustrationButton as button, ILLUSTRATION_CSS } from './illustration-ui.js';
import { renderIllustrationPreset, mountIllustrationSettings } from './illustration-settings-ui.js';
import { nativeAssetUrl } from './session-projection.js';

export async function activate(sdk) {
    const doc = globalThis.document;
    const root = node(doc, null, 'section', undefined, 'atri-illustration-ui'); root.dataset.atriaOfficialIllustration = 'true';
    sdk.ui.mount(root); sdk.ui.style(ILLUSTRATION_CSS);
    const toolbar = node(doc, root, 'div', undefined, 'atri-illustration-toolbar atri-illustration-actions');
    toolbar.setAttribute('aria-label', '插图工具');
    if (doc.defaultView.ResizeObserver) {
        const observer = new doc.defaultView.ResizeObserver(() => root.style.setProperty('--atri-illustration-toolbar-height', toolbar.getBoundingClientRect().height + 'px'));
        observer.observe(toolbar); sdk.onDispose(() => observer.disconnect());
    }
    const panel = node(doc, root, 'aside', undefined, 'atri-illustration-panel'); panel.hidden = true; panel.setAttribute('aria-label', '标注卡片');
    const status = node(doc, toolbar, 'span'); status.setAttribute('role', 'status');
    let mode = false, pending = null, selectedId = null, settings = (await sdk.illustrations.settings.read()).value, configEditor;
    const drafts = new Map();
    let readDraft = () => {}, busy = false, disposed = false;
    const writable = Boolean(sdk.context.sessionId && !sdk.context.historical);
    toolbar.hidden = !sdk.context.sessionId;
    const notify = (text, error = false) => { if (!disposed) { status.textContent = text; status.setAttribute('role', error ? 'alert' : 'status'); } };
    const run = callback => async () => {
        if (busy || disposed) return;
        busy = true;
        try { await callback(); } catch (error) { notify(error.status === 409 ? '标注已变化，编辑已保留。请重新打开卡片后合并。' : error.message, true); } finally { busy = false; }
    };
    function capture() {
        root.style.setProperty('--atri-illustration-controls-inset', sdk.illustrations.toolbarInset() + 'px');
        if (!mode || disposed) return;
        const selection = sdk.illustrations.selection();
        if (selection) pending = selection;
        else if (!doc.getSelection()?.isCollapsed || !root.contains(doc.activeElement)) pending = null;
        create.disabled = !pending || !writable; create.textContent = pending ? '为选文建立标注' : '选择正文后建立标注';
    }
    const toggle = button(doc, toolbar, '正文模式', run(() => {
        readDraft(); mode = !mode; toggle.textContent = mode ? '生图模式' : '正文模式'; toggle.setAttribute('aria-pressed', String(mode));
        sdk.illustrations.setSelectionMode(mode); create.hidden = !mode;
        if (!mode) { panel.hidden = true; pending = null; }
        notify(mode ? '电脑框选；手机长按并调整原生选文范围。' : '正文模式'); capture();
    })); toggle.setAttribute('aria-pressed', 'false'); toggle.disabled = !writable;
    const create = button(doc, toolbar, '选择正文后建立标注', run(async () => {
        if (!pending) return;
        const selection = { ...pending }, previous = sdk.illustrations.snapshot();
        const nextSettings = await sdk.illustrations.settings.read(); settings = nextSettings.value;
        const { draft } = createIllustrationDraft(selection.quote, settings, sdk.context.packageId);
        const result = await sdk.illustrations.command('createAnnotation', { ...selection, draft, expectedHead: previous.head });
        selectedId = result.state.annotations.at(-1).annotationId; pending = null;
        notify('标注已保存。'); capture(); renderCard();
    })); create.disabled = true; create.hidden = true;
    // Keep desktop selection on the explicit action. Touch uses its captured
    // canonical range and leaves native selection handles under browser control.
    sdk.events.listen(create, 'mousedown', event => event.preventDefault());
    button(doc, toolbar, '标注与历史', run(() => { readDraft(); if (!mode && writable) { mode = true; toggle.textContent = '生图模式'; toggle.setAttribute('aria-pressed', 'true'); sdk.illustrations.setSelectionMode(true); create.hidden = false; } renderCard(); }));
    button(doc, toolbar, '插图配置', run(() => {
        readDraft(); readDraft = () => {}; configEditor?.dispose(); panel.replaceChildren(); panel.hidden = false;
        button(doc, panel, '关闭配置', run(async () => { configEditor?.dispose(); configEditor = null; settings = (await sdk.illustrations.settings.read()).value; panel.hidden = true; }));
        configEditor = mountIllustrationSettings({ document: doc, parent: panel, client: sdk.illustrations.settings, packageId: sdk.context.packageId, showEnabled: false });
    }));
    sdk.events.listen(doc, 'selectionchange', capture);
    sdk.events.listen(doc, 'pointerup', capture);
    sdk.events.listen(doc, 'keyup', capture);
    sdk.events.listen(doc, 'input', capture);
    sdk.events.listen(doc.defaultView, 'resize', capture);
    if (doc.defaultView.visualViewport) sdk.events.listen(doc.defaultView.visualViewport, 'resize', capture);
    capture();
    sdk.events.listen(panel, 'keydown', event => { if (event.key === 'Escape') { readDraft(); panel.hidden = true; toggle.focus(); } });
    sdk.illustrations.onSurfacesChanged(capture);
    function renderCard() {
        const sameCard = panel.querySelector('.atri-illustration-card')?.dataset.annotationId === selectedId;
        const openDetails = new Set(sameCard ? [...panel.querySelectorAll('details[open][data-section]')].map(item => item.dataset.section) : []);
        configEditor?.dispose(); configEditor = null;
        panel.replaceChildren(); panel.hidden = false;
        const snapshot = sdk.illustrations.snapshot(), state = snapshot.state;
        const annotations = state.annotations;
        if (!annotations.some(item => item.annotationId === selectedId)) selectedId = annotations.find(item => item.deletedAt === undefined)?.annotationId ?? annotations[0]?.annotationId;
        const heading = node(doc, panel, 'div', undefined, 'atri-illustration-actions'); node(doc, heading, 'h3', '单标注卡片');
        button(doc, heading, '关闭卡片', run(() => { readDraft(); panel.hidden = true; toggle.focus(); }));
        if (!annotations.length) { node(doc, panel, 'p', '开启生图模式，选择一段正文来创建标注。'); readDraft = () => {}; return; }
        select(doc, panel, '当前标注', selectedId, annotations.map(item => [item.annotationId, (item.deletedAt === undefined ? '' : '已删除 · ') + item.anchor.quote.slice(0, 48)]), id => {
            try { readDraft(); selectedId = id; renderCard(); } catch (error) { notify(error.message, true); }
        });
        const annotation = annotations.find(item => item.annotationId === selectedId);
        const card = node(doc, panel, 'article', undefined, 'atri-illustration-card'); card.dataset.annotationId = annotation.annotationId;
        node(doc, card, 'blockquote', annotation.anchor.quote);
        const deleted = annotation.deletedAt !== undefined;
        const draft = drafts.get(selectedId) ?? structuredClone(annotation.draft ?? createIllustrationDraft(annotation.anchor.quote, settings, sdk.context.packageId).draft);
        drafts.set(selectedId, draft);
        const editor = node(doc, card, 'fieldset'); editor.disabled = !writable || deleted; node(doc, editor, 'legend', '提示词与角色');
        const allowed = settings.characters.filter(item => item.enabled && settings.works[sdk.context.packageId]?.characterIds.includes(item.id));
        const matches = matchDrawingCharacters(annotation.anchor.quote, settings.characters, allowed.map(item => item.id));
        for (const ambiguity of matches.ambiguous) node(doc, editor, 'p', '同名角色「' + ambiguity.name + '」有多个候选，请在添加角色中手动选择。');
        const manual = select(doc, editor, '添加角色（也可补充代词指代）', '', [['', '选择绘图角色'], ...allowed.filter(item => !draft.characters.some(current => current.character.id === item.id)).map(item => [item.id, item.name + ' · ' + item.id])], () => {});
        button(doc, editor, '添加所选角色', run(() => {
            readDraft(); const character = allowed.find(item => item.id === manual.value);
            if (!character || draft.characters.some(item => item.character.id === character.id)) return;
            draft.characters.push({ character: structuredClone(character), dynamicPrompt: '', clothing: character.defaultClothing }); renderCard();
        }));
        for (const item of draft.characters) {
            const group = node(doc, editor, 'fieldset'); node(doc, group, 'legend', item.character.name);
            node(doc, group, 'p', '固定外观：' + (item.character.fixedPrompt || '未填写'));
            field(doc, group, '服装 · ' + item.character.name, item.clothing, text => item.clothing = text);
            field(doc, group, '动态描述 · ' + item.character.name, item.dynamicPrompt, text => item.dynamicPrompt = text, { multiline: true });
            button(doc, group, '移除角色 · ' + item.character.name, run(() => { readDraft(); draft.characters = draft.characters.filter(current => current !== item); renderCard(); }));
        }
        field(doc, editor, '场景与构图', draft.scene, text => draft.scene = text, { multiline: true });
        field(doc, editor, '图片提示词（可直接填写）', draft.prompt, text => draft.prompt = text, { multiline: true });
        const preset = node(doc, editor, 'details'); preset.dataset.section = 'preset'; preset.open = openDetails.has('preset'); node(doc, preset, 'summary', '单标注预设与参数');
        const parsePreset = renderIllustrationPreset(doc, preset, draft.preset);
        readDraft = () => { parsePreset(); assertIllustrationDraft(draft); };
        const actions = node(doc, editor, 'div', undefined, 'atri-illustration-actions');
        button(doc, actions, '保存卡片', run(async () => {
            readDraft(); await sdk.illustrations.command('updateAnnotation', { annotationId: annotation.annotationId, draft, expectedHead: snapshot.head });
            drafts.delete(annotation.annotationId); notify('卡片已保存。'); renderCard();
        }));
        const promptButton = button(doc, actions, '生成提示词', () => {}); promptButton.disabled = true; promptButton.title = '提示词生成功能尚未可用';
        const imageButton = button(doc, actions, '生成图片', () => {}); imageButton.disabled = true; imageButton.title = '图片生成功能尚未可用';
        node(doc, editor, 'p', '提示词生成与图片生成分开操作；当前可以直接编辑并保存提示词。');
        button(doc, editor, '删除标注', run(async () => {
            await sdk.illustrations.command('deleteAnnotation', { annotationId: annotation.annotationId, expectedHead: snapshot.head });
            drafts.delete(annotation.annotationId); notify('标注已删除，图片历史仍保留。'); renderCard();
        }));
        const history = node(doc, card, 'details', undefined, 'atri-illustration-history'); history.dataset.section = 'history'; history.open = openDetails.has('history'); node(doc, history, 'summary', '图片历史');
        const images = state.images.filter(item => item.annotationId === annotation.annotationId);
        if (!images.length) node(doc, history, 'p', '暂无图片版本。');
        const hide = button(doc, history, '暂不展示图片', run(async () => {
            readDraft(); await sdk.illustrations.command('selectImageVersion', { annotationId: annotation.annotationId, imageVersionId: null, expectedHead: snapshot.head }); renderCard();
        })); hide.disabled = !writable || deleted || !annotation.selectedImageVersionId;
        for (const image of images) {
            const version = node(doc, history, 'article'); const img = node(doc, version, 'img');
            img.src = nativeAssetUrl(image.assetId); img.alt = image.alt || annotation.anchor.quote; img.width = image.width; img.height = image.height; img.loading = 'lazy'; img.decoding = 'async';
            node(doc, version, 'p', image.imageVersionId === annotation.selectedImageVersionId ? '当前展示版本' : '历史版本');
            const details = node(doc, version, 'details'); node(doc, details, 'summary', '实际提示词与参数');
            node(doc, details, 'pre', JSON.stringify({ prompt: image.prompt, negativePrompt: image.negativePrompt, parameters: image.parameters }, null, 2));
            const choose = button(doc, version, '展示此版本', run(async () => {
                readDraft(); await sdk.illustrations.command('selectImageVersion', { annotationId: annotation.annotationId, imageVersionId: image.imageVersionId, expectedHead: snapshot.head }); renderCard();
            })); choose.disabled = !writable || deleted || image.imageVersionId === annotation.selectedImageVersionId;
        }
        if (deleted) node(doc, card, 'p', '此标注已删除，仅保留图片历史。');
    }
    return () => { disposed = true; configEditor?.dispose(); drafts.clear(); };
}
