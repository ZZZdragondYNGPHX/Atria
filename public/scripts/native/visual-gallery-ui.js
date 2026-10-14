import { illustrationNode as node, illustrationButton as button, illustrationSelect as select, illustrationField as field } from './illustration-ui.js';
import { mountMediaStudio } from './media-studio-ui.js';
import { nativeAssetUrl } from './session-projection.js';

export async function mountVisualGallery({ document: doc, parent, sdk, report, onJob }) {
    const root = node(doc, parent, 'section'); node(doc, root, 'h3', '当前分支 Gallery');
    const status = node(doc, root, 'p', '读取图片…'); status.setAttribute('role', 'status');
    const controls = node(doc, root, 'div', undefined, 'atri-illustration-actions'), list = node(doc, root, 'div'); list.className = 'atri-visual-gallery';
    let offset = 0, nextOffset = null, editor = null, disposed = false;
    const render = async () => {
        const page = await sdk.illustrations.visual('gallery', 'query', { offset, limit: 12 }); if (disposed) return;
        nextOffset = page.nextOffset; list.replaceChildren(); status.textContent = page.total ? '共 ' + page.total + ' 个版本。生成完成后先入历史；“使用此版本”才改变显示。' : '当前分支还没有图片。';
        for (const item of page.items) {
            const card = node(doc, list, 'article'), image = node(doc, card, 'img'); image.alt = item.alt; image.loading = 'lazy'; image.decoding = 'async'; image.width = 320; image.height = Math.max(1, Math.round(320 * item.height / item.width));
            image.src = '/api/native/generation/visual/gallery/thumbnail?' + new URLSearchParams({ sessionId: sdk.context.sessionId, branchId: sdk.context.branchId, imageVersionId: item.imageVersionId });
            node(doc, card, 'p', item.operation + (item.selected ? ' · 当前显示' : '') + ' · ' + new Date(item.createdAt).toLocaleString());
            button(doc, card, '使用此版本', async () => { try { await sdk.illustrations.visual('gallery', 'select', { imageVersionId: item.imageVersionId, expectedHead: page.head }); await render(); } catch (error) { report(error); } });
            button(doc, card, '打开 Media Studio', async () => {
                try { if (editor && editor.root.dataset.atriaDraftDirty === 'true') { await editor.save(); if (editor.root.dataset.atriaDraftDirty === 'true') return; } editor?.dispose(); editor = await mountMediaStudio({ document: doc, parent: root, sdk, imageVersionId: item.imageVersionId, report, onJob }); } catch (error) { report(error); }
            });
            button(doc, card, '比较原图', () => { const full = node(doc, card, 'img'); full.src = nativeAssetUrl(item.assetId); full.alt = item.alt; full.loading = 'lazy'; full.style.maxWidth = '100%'; });
            button(doc, card, '从 Gallery 隐藏', async () => { try { await sdk.illustrations.visual('gallery', 'mark', { imageVersionId: item.imageVersionId, action: 'hide', expectedRevision: item.metadataRevision }); await render(); } catch (error) { report(error); } });
            const reference = node(doc, card, 'details'); node(doc, reference, 'summary', '晋升为参考图');
            let purpose = 'style', identity = '', standard = false;
            select(doc, reference, '参考用途', purpose, [['identity', '身份'], ['outfit', '服装'], ['style', '画风'], ['structure', '构图/结构'], ['vibe', 'Vibe（按目标能力）']], value => purpose = value);
            select(doc, reference, '参考角色', identity, [['', '画风/结构不关联角色'], ...(item.identities ?? []).map(i => [i.id, i.name])], value => identity = value); field(doc, reference, '明确作为稳定身份标准图', standard, value => standard = value, { type: 'checkbox' });
            button(doc, reference, '确认晋升', async () => { try { await sdk.illustrations.visual('reference', 'promote', { imageVersionId: item.imageVersionId, purpose, identity, standard, allowedBranches: [sdk.context.branchId], externalConnectionIds: [] }); status.textContent = '参考图已绑定当前分支；不会变成剧情事实。'; } catch (error) { report(error); } });
        }
        previous.disabled = offset === 0; more.disabled = nextOffset === null;
    };
    const previous = button(doc, controls, '上一页', async () => { offset = Math.max(0, offset - 12); try { await render(); } catch (error) { report(error); } });
    const more = button(doc, controls, '下一页', async () => { if (nextOffset !== null) offset = nextOffset; try { await render(); } catch (error) { report(error); } });
    try { await render(); } catch (error) { status.textContent = 'Gallery 读取失败'; report(error); }
    return { root, refresh: render, dispose: () => { disposed = true; editor?.dispose(); root.remove(); } };
}
