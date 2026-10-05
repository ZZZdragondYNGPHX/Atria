import { confirmAtriaDraftLeave } from '../atria-shell/workspace-leave-guard.js';
import { createIllustrationDraft, assertIllustrationDraft, matchDrawingCharacters, composeIllustrationPrompt } from '../../shared/illustration-plugin-contract.js';
import { illustrationNode as node, illustrationField as field, illustrationSelect as select, illustrationButton as button, ILLUSTRATION_CSS } from './illustration-ui.js';
import { renderIllustrationPreset, mountIllustrationSettings } from './illustration-settings-ui.js';
import { nativeAssetUrl } from './session-projection.js';
import { novelaiConnectionCapabilities, renderNovelaiIllustration } from '../../shared/novelai-illustration.js';

export async function activate(sdk) {
    const doc = globalThis.document;
    const root = node(doc, null, 'section', undefined, 'atri-illustration-ui'); root.dataset.atriaOfficialIllustration = 'true';
    sdk.ui.mount(root); sdk.ui.style(ILLUSTRATION_CSS);
    const shellRoot = globalThis.Atria?.shell?.getRoot?.();
    if (shellRoot) {
        shellRoot.append(root);
        Object.assign(root.style, { position: 'absolute', inset: '0', zIndex: '5', pointerEvents: 'none' });
    }
    const toolbar = node(doc, root, 'div', undefined, 'atri-illustration-toolbar atri-illustration-actions');
    toolbar.setAttribute('aria-label', '插图工具');
    if (doc.defaultView.ResizeObserver) {
        const observer = new doc.defaultView.ResizeObserver(() => root.style.setProperty('--atri-illustration-toolbar-height', toolbar.getBoundingClientRect().height + 'px'));
        observer.observe(toolbar); sdk.onDispose(() => observer.disconnect());
    }
    const panel = node(doc, root, 'aside', undefined, 'atri-illustration-panel'); panel.hidden = true; panel.setAttribute('aria-label', '标注卡片');
    toolbar.style.pointerEvents = panel.style.pointerEvents = 'auto';
    const status = node(doc, toolbar, 'span'); status.setAttribute('role', 'status');
    let mode = false, pending = null, selectedId = null, settings = (await sdk.illustrations.settings.read()).value, configEditor;
    const drafts = new Map(), operations = new Map(), imageOperations = new Map(), watchers = new Map();
    const terminal = new Set(['completed', 'failed', 'cancelled', 'stale']);
    const promptErrors = { native_generation_route_missing: '请先创建“绘图提示词”用途的模型路线，并在插图配置中选择。', native_generation_route_ambiguous: '有多条提示词模型路线，请在插图配置中明确选择。', generation_secret_unavailable: '提示词模型连接的密钥不可用，请检查该连接。', native_illustration_source_unavailable: '此旧存档缺少原始历史上下文；可以直接填写提示词。', generation_context_budget_exceeded: '选文与角色描述超过模型容量，请选择容量更大的提示词模型。', native_illustration_prompt_invalid: '模型输出格式不正确，请重试提示词步骤。' };
    const taskLabels = { queued: '等待提示词模型', running: '正在生成提示词', streaming: '正在生成提示词', retrying: '正在重试提示词', finalizing: '正在保存提示词版本', completed: '提示词版本已保存', failed: '提示词生成失败，可重试本步骤', cancelled: '提示词任务已取消', stale: '标注已删除或不可用，结果未写入' };
    const imageLabels = { queued: '图片任务排队中', running: '正在生成图片', finalizing: '正在保存图片版本', completed: '图片版本已保存', failed: '图片生成失败，可重试本步骤', cancelled: '图片任务已取消', stale: '图片归属已不可用，结果未写入' };
    const imageErrors = { native_illustration_connection_missing: '请先在插图配置选择图片连接。', native_illustration_connection_invalid: '请检查 NovelAI 图片连接类型和完整接口地址。', native_illustration_capabilities_invalid: '第三方连接需要按服务文档填写图片能力。', native_illustration_prompt_empty: '请先确认或填写图片提示词。', native_illustration_model_unsupported: '图片连接未声明支持此模型，请检查参数与连接能力。', native_illustration_parameters_unsupported: '图片尺寸、采样器或参数超出连接声明的能力。', native_illustration_characters_unsupported: '此模型最多支持六个独立角色提示词。', native_illustration_image_authentication_failed: '图片服务拒绝了所选密钥，请检查图片连接。', native_illustration_image_rate_limited: '图片服务限流，请稍后重试图片步骤。', native_illustration_image_response_invalid: '图片响应不符合所选协议或不是有效 PNG，请检查连接能力。', native_illustration_image_unreachable: '图片服务暂时无法连接，可重试图片步骤。', generation_secret_unavailable: '所选连接的密钥不可用，请检查连接。' };
    function watch(operation, submitted, step = 'prompt') {
        const id = operation.operationId;
        const labels = step === 'image' ? imageLabels : taskLabels, tasks = step === 'image' ? imageOperations : operations;
        if (watchers.has(id) || disposed) return;
        watchers.set(id, null);
        const poll = async () => {
            if (disposed) return;
            try {
                const result = await sdk.illustrations[step]('status', { operationId: id });
                if (disposed) return;
                const annotationId = result.operation.anchor.annotationId;
                tasks.set(annotationId, result.operation);
                if (terminal.has(result.operation.status)) {
                    watchers.delete(id);
                    if (selectedId === annotationId) readDraft();
                    const local = drafts.get(annotationId);
                    if (step === 'prompt' && submitted && JSON.stringify(local) === submitted) drafts.delete(annotationId);
                    if (selectedId === annotationId && !panel.hidden && !configEditor) renderCard();
                    const failureDetail = result.operation.errorCode === 'generation_context_budget_exceeded' ? '；选文与角色描述超过模型容量，请选择容量更大的提示词模型' : result.operation.errorCode === 'native_illustration_prompt_invalid' ? '；模型输出格式不正确，请重试提示词步骤' : '';
                    notify(labels[result.operation.status] + (step === 'image' && result.operation.errorCode ? '；' + (imageErrors[result.operation.errorCode] ?? '请检查图片连接后重试。') : failureDetail) + (step === 'prompt' && result.operation.status === 'completed' && drafts.has(annotationId) ? '；当前编辑已保留，可从历史应用新版本。' : '。'), result.operation.status === 'failed');
                    return;
                }
                const indicator = panel.querySelector('[data-' + step + '-status="' + annotationId + '"]');
                if (indicator) indicator.textContent = labels[result.operation.status];
                watchers.set(id, setTimeout(poll, 750));
            } catch (error) {
                watchers.delete(id); if (!disposed) notify('任务状态读取失败；重新打开卡片可恢复查看。', true);
            }
        };
        void poll();
    }
    let readDraft = () => {}, busy = false, disposed = false;
    const navigation = globalThis.Atria?.shell?.getNavigation?.();
    const syncVisibility = () => {
        const route = navigation?.getRoute();
        root.hidden = !sdk.context.sessionId || Boolean(route && (route.domain !== 'play' || route.child?.id?.startsWith('utility.') || route.child?.id?.startsWith('skills')));
        if (root.hidden && configEditor) { configEditor.dispose(); configEditor = null; panel.hidden = true; }
    };
    const unsubscribeNavigation = navigation?.subscribe(syncVisibility);
    sdk.onDispose(() => unsubscribeNavigation?.()); syncVisibility();
    const writable = Boolean(sdk.context.sessionId && !sdk.context.historical);
    toolbar.hidden = !sdk.context.sessionId;
    const notify = (text, error = false) => { if (!disposed) { status.textContent = text; status.setAttribute('role', error ? 'alert' : 'status'); } };
    const run = callback => async () => {
        if (busy || disposed) return;
        busy = true;
        try { await callback(); } catch (error) { notify(error.status === 409 ? '标注已变化，编辑已保留。请重新打开卡片后合并。' : imageErrors[error.code] ?? promptErrors[error.code] ?? error.message, true); } finally { busy = false; }
    };
    // Reconnect to server-owned tasks. UI disposal only releases polling.
    async function refreshTasks() {
        if (!writable) return;
        try {
            for (const step of ['prompt', 'image']) {
                const latest = new Map((await sdk.illustrations[step]('list')).map(operation => [operation.anchor.annotationId, operation]));
                for (const [annotationId, operation] of latest) {
                    (step === 'image' ? imageOperations : operations).set(annotationId, operation);
                    if (!terminal.has(operation.status)) watch(operation, undefined, step);
                    else if (operation.status === 'completed') await sdk.illustrations[step]('status', { operationId: operation.operationId });
                }
            }
        } catch { /* The card remains editable if task inventory is unavailable. */ }
    }
    await refreshTasks();
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
    button(doc, toolbar, '标注与历史', run(async () => { if (configEditor && !confirmAtriaDraftLeave(doc, configEditor.root)) return; readDraft(); await refreshTasks(); if (!mode && writable) { mode = true; toggle.textContent = '生图模式'; toggle.setAttribute('aria-pressed', 'true'); sdk.illustrations.setSelectionMode(true); create.hidden = false; } renderCard(); }));
    button(doc, toolbar, '插图配置', run(() => {
        if (configEditor && !confirmAtriaDraftLeave(doc, configEditor.root)) return;
        readDraft(); readDraft = () => {}; configEditor?.dispose(); panel.replaceChildren(); panel.hidden = false;
        button(doc, panel, '关闭配置', run(async () => { if (configEditor && !confirmAtriaDraftLeave(doc, configEditor.root)) return; configEditor?.dispose(); configEditor = null; settings = (await sdk.illustrations.settings.read()).value; panel.hidden = true; }));
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
        const operation = operations.get(annotation.annotationId);
        const active = operation && !terminal.has(operation.status);
        const promptButton = button(doc, actions, active ? '提示词生成中' : '生成提示词', run(async () => {
            readDraft(); const submitted = structuredClone(draft);
            await sdk.illustrations.command('updateAnnotation', { annotationId: annotation.annotationId, draft: submitted, expectedHead: sdk.illustrations.snapshot().head });
            const started = await sdk.illustrations.prompt('start', { annotationId: annotation.annotationId });
            const operation = { operationId: started.operationId, status: 'queued', anchor: { annotationId: annotation.annotationId } };
            operations.set(annotation.annotationId, operation); watch(operation, JSON.stringify(submitted));
            notify('提示词任务已提交；可以继续阅读或编辑卡片。'); renderCard();
        })); promptButton.disabled = Boolean(active); promptButton.setAttribute('aria-busy', String(Boolean(active)));
        const taskStatus = node(doc, actions, 'span', operation ? taskLabels[operation.status] : '');
        taskStatus.dataset.promptStatus = annotation.annotationId; taskStatus.setAttribute('role', 'status');
        if (active) button(doc, actions, '取消提示词任务', run(async () => {
            await sdk.illustrations.prompt('cancel', { operationId: operation.operationId }); notify('已请求取消提示词任务。');
        }));
        const imageOperation = imageOperations.get(annotation.annotationId), imageActive = imageOperation && !terminal.has(imageOperation.status);
        const imageButton = button(doc, actions, imageActive ? '图片生成中' : '生成图片', run(async () => {
            readDraft(); const submitted = structuredClone(draft);
            const saved = await sdk.illustrations.command('updateAnnotation', { annotationId: annotation.annotationId, draft: submitted, expectedHead: sdk.illustrations.snapshot().head });
            const started = await sdk.illustrations.image('start', { annotationId: annotation.annotationId, expectedHead: saved.head });
            const operation = { operationId: started.operationId, status: 'queued', anchor: { annotationId: annotation.annotationId } };
            imageOperations.set(annotation.annotationId, operation); watch(operation, undefined, 'image');
            notify('图片任务已提交；只使用此次确认的输入，可以继续阅读或编辑。'); renderCard();
        }));
        const syncImageButton = () => { imageButton.disabled = Boolean(imageActive) || !draft.prompt.trim(); imageButton.setAttribute('aria-busy', String(Boolean(imageActive))); };
        syncImageButton(); editor.addEventListener('input', syncImageButton);
        const imageStatus = node(doc, actions, 'span', imageOperation ? imageLabels[imageOperation.status] : '');
        imageStatus.dataset.imageStatus = annotation.annotationId; imageStatus.setAttribute('role', 'status');
        if (imageActive) button(doc, actions, '取消图片任务', run(async () => {
            await sdk.illustrations.image('cancel', { operationId: imageOperation.operationId }); notify('已请求取消图片任务。');
        }));
        node(doc, editor, 'p', '生成提示词会保存新版本；图片生成单独操作。也可直接填写提示词。');
        button(doc, editor, '按当前分块组合提示词', run(() => { readDraft(); draft.prompt = composeIllustrationPrompt(draft); renderCard(); }));
        button(doc, editor, '显式应用最新角色与预设', run(async () => {
            readDraft(); settings = (await sdk.illustrations.settings.read()).value;
            draft.characters = draft.characters.map(item => {
                const character = settings.characters.find(current => current.id === item.character.id);
                return character ? { ...item, character: structuredClone(character) } : item;
            });
            draft.preset = structuredClone(settings.works[sdk.context.packageId]?.preset ?? settings.preset);
            notify('已更新角色与预设快照；完整提示词保留，可按分块重新组合。'); renderCard();
        }));
        const preview = node(doc, editor, 'details'); node(doc, preview, 'summary', '预览最终图片输入');
        const previewText = node(doc, preview, 'pre');
        let previewConnection;
        const previewInput = () => {
            try {
                previewText.textContent = JSON.stringify(previewConnection ? { ...renderNovelaiIllustration(draft, novelaiConnectionCapabilities(previewConnection), 0), seedNote: '未指定或 -1 的 seed 在提交时随机生成，实际值保存在图片历史。' }
                    : { prompt: draft.prompt, negativePrompt: draft.preset.negativePrompt, parameters: draft.preset.parameters }, null, 2);
            } catch (error) { previewText.textContent = imageErrors[error.code] ?? error.message; }
        };
        editor.addEventListener('input', () => { if (preview.open) previewInput(); });
        previewInput(); preview.addEventListener('toggle', () => { if (preview.open) { try { readDraft(); previewInput(); } catch (error) { notify(error.message, true); } } });
        preview.addEventListener('toggle', async () => {
            if (!preview.open) return;
            try {
                const latestSettings = (await sdk.illustrations.settings.read()).value;
                const connections = await sdk.illustrations.configuration();
                if (disposed || !preview.isConnected) return;
                const connectionId = latestSettings.works[sdk.context.packageId]?.imageConnectionId || latestSettings.imageConnectionId;
                previewConnection = connections.connections.find(item => item.connectionProfileId === connectionId); previewInput();
            } catch { if (!disposed && preview.isConnected) previewText.textContent = '图片连接暂不可读取；请检查插图配置。'; }
        });
        const promptHistory = node(doc, card, 'details'); promptHistory.dataset.section = 'prompts'; promptHistory.open = openDetails.has('prompts'); node(doc, promptHistory, 'summary', '提示词历史');
        for (const version of [...(annotation.promptVersions ?? [])].reverse()) {
            const row = node(doc, promptHistory, 'article');
            node(doc, row, 'p', new Date(version.createdAt).toLocaleString()); node(doc, row, 'pre', version.draft.prompt);
            const evidence = node(doc, row, 'details'); node(doc, evidence, 'summary', '生成时的上下文、角色与模型路线');
            node(doc, evidence, 'pre', JSON.stringify({ characters: version.draft.characters, preset: version.draft.preset, template: version.template, request: version.requestSnapshot }, null, 2));
            const apply = button(doc, row, '应用此提示词版本', run(() => { readDraft(); drafts.set(annotation.annotationId, structuredClone(version.draft)); renderCard(); notify('版本已载入编辑区，保存卡片后生效。'); })); apply.disabled = !writable || deleted;
        }
        if (!annotation.promptVersions?.length) node(doc, promptHistory, 'p', '暂无提示词生成版本。');
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
            node(doc, details, 'pre', JSON.stringify({ prompt: image.prompt, negativePrompt: image.negativePrompt, parameters: image.parameters, ...(image.requestSnapshot ? { requestSnapshot: image.requestSnapshot } : {}) }, null, 2));
            const choose = button(doc, version, '展示此版本', run(async () => {
                readDraft(); await sdk.illustrations.command('selectImageVersion', { annotationId: annotation.annotationId, imageVersionId: image.imageVersionId, expectedHead: snapshot.head }); renderCard();
            })); choose.disabled = !writable || deleted || image.imageVersionId === annotation.selectedImageVersionId;
        }
        if (deleted) node(doc, card, 'p', '此标注已删除，仅保留图片历史。');
    }
    return () => { disposed = true; for (const timer of watchers.values()) clearTimeout(timer); watchers.clear(); configEditor?.dispose(); drafts.clear(); };
}
