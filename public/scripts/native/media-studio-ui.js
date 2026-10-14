import { runtimeRequest } from './runtime-client.js';
import { nativeAssetUrl } from './session-projection.js';
import { illustrationNode as node, illustrationField as field, illustrationSelect as select, illustrationButton as button } from './illustration-ui.js';
import { visualApproval } from './visual-approval-ui.js';
import { MaskCommandModel, mountMaskCanvas } from './mask-canvas.js';

export async function mountMediaStudio({ document: doc, parent, sdk, imageVersionId, report, onJob }) {
    const root = node(doc, parent, 'section'); root.dataset.atriaDraftDirty = 'false'; node(doc, root, 'h3', 'Media Studio');
    const status = node(doc, root, 'p', '读取图片与草稿…'); status.setAttribute('role', 'status');
    const controller = new AbortController(); let timer = null, saving = false, dirty = false, disposed = false, conflicted = false, record, model, canvas;
    const context = sdk.context;
    const scoped = { sessionId: context.sessionId, branchId: context.branchId };
    const headers = () => globalThis.Atria?.getContext?.()?.getRequestHeaders?.() ?? {};
    const binary = async (path, options = {}) => {
        const response = await fetch('/api/native/generation' + path, { ...options, signal: controller.signal, headers: { ...headers(), ...options.headers } });
        if (!response.ok) { const data = await response.json(); throw Object.assign(new Error(data.error || 'Mask 同步失败'), { status: response.status }); }
        return response;
    };
    const changed = () => { dirty = true; root.dataset.atriaDraftDirty = 'true'; status.textContent = '草稿未同步'; clearTimeout(timer); timer = setTimeout(() => { void save().catch(report); }, 2000); };
    const save = async () => {
        if (!dirty || saving || disposed || conflicted) return;
        saving = true; status.textContent = '正在同步草稿…';
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
                if (model.cursor >= 50 && JSON.stringify(model.commands.slice(0, 50)) === JSON.stringify(commands.slice(0, 50))) { model.checkpoint = compact.checkpoint; model.commands = model.commands.slice(50); model.cursor -= 50; } else { dirty = true; conflicted = true; throw new Error('检查点保存期间发生撤销；当前编辑保留，请分叉草稿后保存。'); }
            } else record = await sdk.illustrations.visual('mask', 'save', { draftId: record.value.draftId, commands, cursor, expectedRevision: record.revision });
            dirty = JSON.stringify({ commands: model.commands, cursor: model.cursor }) !== JSON.stringify({ commands: record.value.commands, cursor: record.value.cursor });
            root.dataset.atriaDraftDirty = String(dirty); status.textContent = dirty ? '新的笔画待同步' : '草稿已同步';
        } catch (error) { conflicted ||= error.status === 409 || error.message.includes('conflict'); dirty = true; root.dataset.atriaDraftDirty = 'true'; status.textContent = error.status === 409 ? '另一端已修改草稿；当前编辑保留，可创建分叉。' : '草稿未同步：' + error.message; throw error; } finally { saving = false; if (dirty && !disposed && !conflicted) { clearTimeout(timer); timer = setTimeout(() => { void save().catch(report); }, 2000); } }
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
        const references = node(doc, root, 'details'); node(doc, references, 'summary', '本次参考图');
        for (const ref of history.referenceBindings ?? []) field(doc, references, ref.purpose + ' · ' + (ref.identity || '画风/结构'), false, enabled => enabled ? selectedReferences.add(ref.referenceId) : selectedReferences.delete(ref.referenceId), { type: 'checkbox' });
        let operation = 'inpaint', prompt = history.image.prompt, imageTargetId = '', imageRenderingId = '', preserveOutsideMask = true;
        const configuration = await runtimeRequest('/visual/configuration');
        select(doc, root, '编辑操作', operation, [['regenerate', '再生成'], ['img2img', 'Img2Img'], ['inpaint', 'Inpaint'], ['upscale', 'Upscale（可能改变细节）']], value => operation = value);
        select(doc, root, '本次图片目标', imageTargetId, [['', '继承当前默认目标'], ...configuration.targets.map(t => [t.imageTargetId, t.displayName + ' · ' + t.model])], value => imageTargetId = value);
        select(doc, root, '本次画风配置', imageRenderingId, [['', '继承当前画风'], ...configuration.renderings.map(item => [item.imageRenderingId, item.displayName])], value => imageRenderingId = value);
        field(doc, root, '编辑提示词', prompt, value => prompt = value, { multiline: true });
        field(doc, root, '另存合成版本，保留 Mask 外原图像素', preserveOutsideMask, value => preserveOutsideMask = value, { type: 'checkbox' });
        node(doc, root, 'p', '原始模型结果与合成版本分别进入历史；合成可能出现接缝。打开编辑器、绘制和预览不发送生图请求。');
        button(doc, root, '保存草稿', async () => { try { await save(); } catch (error) { report(error); } });
        button(doc, root, '创建草稿分叉', async () => {
            try {
                const next = await sdk.illustrations.visual('mask', 'create', { imageVersionId }), form = new FormData();
                const pixels = model.pixels(), commands = structuredClone(model.commands), cursor = model.cursor;
                form.append('checkpoint', new Blob([pixels], { type: 'application/octet-stream' }), 'mask.gray8');
                form.append('metadata', JSON.stringify({ ...scoped, draftId: next.value.draftId, expectedRevision: next.revision, commands: [], cursor: 0 }));
                record = await (await binary('/visual/mask/checkpoint-with-commands', { method: 'POST', body: form })).json();
                if (JSON.stringify({ commands: model.commands, cursor: model.cursor }) !== JSON.stringify({ commands, cursor })) {
                    dirty = true; conflicted = true; root.dataset.atriaDraftDirty = 'true';
                    status.textContent = '分叉保存期间出现新笔画；当前编辑保留，请再次创建分叉。';
                } else { model.checkpoint = pixels; model.commands = []; model.cursor = 0; dirty = false; conflicted = false; root.dataset.atriaDraftDirty = 'false'; status.textContent = '草稿分叉已保存'; }
            } catch (error) { report(error); }
        });
        button(doc, root, '预览编辑任务', async () => {
            try {
                await save(); if (dirty || saving) throw new Error('请先完成草稿同步。');
                const mask = operation === 'inpaint' ? await sdk.illustrations.visual('mask', 'freeze', { draftId: record.value.draftId, expectedRevision: record.revision }) : null;
                const preview = await sdk.illustrations.visual('media', 'prepare', { imageVersionId, operation, prompt, ...(imageTargetId ? { imageTargetId } : {}), ...(imageRenderingId ? { imageRenderingId } : {}),
                    ...(mask ? { maskArtifactId: mask.maskArtifactId } : {}), referenceIds: [...selectedReferences], preserveOutsideMask: operation === 'inpaint' && preserveOutsideMask });
                visualApproval({ document: doc, parent: root, preview, externalAssetIds: preview.externalAssetIds, report,
                    submit: async approval => { const started = await sdk.illustrations.image('start', { prepareId: preview.prepareId, approval }); status.textContent = '编辑任务已提交；可以继续绘制草稿。'; onJob?.(started); } });
            } catch (error) { report(error); }
        });
        const lineage = node(doc, root, 'details'); node(doc, lineage, 'summary', '来源、DAG 与执行证据');
        lineage.addEventListener('toggle', () => { if (lineage.open && !lineage.querySelector('pre')) node(doc, lineage, 'pre', JSON.stringify(history, null, 2)); });
        status.textContent = '0 保留原图；蓝色区域表示希望修改。双指缩放，平移工具移动画布。';
    } catch (error) { status.textContent = '编辑器读取失败'; report(error); }
    const interval = setInterval(() => { if (dirty) void save().catch(report); }, 10000);
    return { root, save, dispose: () => { disposed = true; clearTimeout(timer); clearInterval(interval); controller.abort(); canvas?.dispose(); root.remove(); } };
}
