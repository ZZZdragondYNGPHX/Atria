/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { serialize, deserialize } from 'node:v8';
import { createNativeId } from '../../src/native/identity.js';
import { illustrationContentHash } from '../../src/native/session-illustrations.js';
import { createExtensionRuntime } from '../../public/scripts/native/extension-runtime.js';
import { createExtensionSdk } from '../../public/scripts/native/extension-sdk.js';
import { createNativeExtensionsHost } from '../../public/scripts/native/extensions-host.js';
import { createIllustrationExtensionApi } from '../../public/scripts/native/illustration-client.js';
import { updateIllustrationSurface, releaseIllustrationSurface } from '../../public/scripts/native/illustration-surfaces.js';
import { renderSafeProse } from '../../public/shared/native-safe-prose.js';
import { emptyIllustrations, assertIllustrationState } from '../../public/shared/native-illustration-contract.js';
import { defaultIllustrationSettings, OFFICIAL_ILLUSTRATION_ID, OFFICIAL_PROMPT_TEMPLATE } from '../../public/shared/illustration-plugin-contract.js';
import { activate } from '../../public/scripts/native/official-illustration.js';
import { createHeadlessConversation } from '../../public/scripts/native/frontend/conversation.js';
import { mountIllustrationSettings } from '../../public/scripts/native/illustration-settings-ui.js';

globalThis.structuredClone ??= value => deserialize(serialize(value));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const button = label => [...document.querySelectorAll('button')].find(item => item.textContent === label);
const input = label => document.querySelector('[aria-label="' + label + '"]');
const plugin = { id: OFFICIAL_ILLUSTRATION_ID, kind: 'official', revision: 's2', enabled: true, entrypoint: 'official-illustration.js', targets: { global: true, works: [], presets: [] } };
let cleanup;
afterEach(async () => { await cleanup?.(); cleanup = null; document.getSelection().removeAllRanges(); document.body.replaceChildren(); });
async function fixture() {
    const content = '**Alice** at the window.\n\nBob waits.';
    const entry = { messageId: createNativeId('message'), activeVariantId: createNativeId('variant'), content, role: 'assistant' };
    const context = { sessionId: createNativeId('session'), branchId: createNativeId('branch'), packageId: 'book', ready: true };
    const runtime = { active: true, snapshot: { session: { sessionId: context.sessionId, packageId: 'book' }, revision: { revisionId: createNativeId('revision'), branchId: context.branchId }, timeline: [entry], illustrations: emptyIllustrations() }, assertWritable: jest.fn() };
    const prose = document.createElement('main'); document.body.append(prose); renderSafeProse(prose, content);
    updateIllustrationSurface(prose, { ...context, revisionId: runtime.snapshot.revision.revisionId, entry, state: runtime.snapshot.illustrations });
    const settings = defaultIllustrationSettings(); settings.enabled = true;
    settings.characters = [{ id: 'alice', name: 'Alice', aliases: [], fixedPrompt: 'blue eyes', defaultClothing: 'coat', enabled: true, storyActorId: '' }]; settings.works.book = { characterIds: ['alice'] };
    runtime.request = jest.fn(async (path, data) => {
        const state = structuredClone(runtime.snapshot.illustrations);
        if (path.endsWith('createAnnotation')) state.annotations.push({ annotationId: createNativeId('annotation'), anchor: { messageId: data.messageId, variantId: data.variantId, revisionId: data.revisionId, contentHash: illustrationContentHash(content), start: data.start, end: data.end, quote: data.quote }, draft: data.draft, selectedImageVersionId: null, createdAt: 1 });
        if (path.endsWith('updateAnnotation')) state.annotations.find(item => item.annotationId === data.annotationId).draft = data.draft;
        if (path.endsWith('deleteAnnotation')) Object.assign(state.annotations.find(item => item.annotationId === data.annotationId), { deletedAt: 2, selectedImageVersionId: null });
        if (path.endsWith('selectImageVersion')) state.annotations.find(item => item.annotationId === data.annotationId).selectedImageVersionId = data.imageVersionId;
        return { state: assertIllustrationState(state), head: String(runtime.request.mock.calls.length).padStart(64, '0') };
    });
    const generationRequest = jest.fn(async () => []);
    const api = { ...createIllustrationExtensionApi({ runtime, document, generationRequest }), settings: { read: async () => ({ value: settings, revision: 'settings' }), save: jest.fn() } };
    const host = createExtensionRuntime({ document, illustrationApi: api, importModule: async () => ({ activate }) });
    await host.reconcile([plugin], context);
    cleanup = async () => { await host.dispose(); releaseIllustrationSurface(prose); };
    return { runtime, host, prose, context, settings, entry, generationRequest, api };
}
function selectProse(prose) {
    const range = document.createRange(); range.setStart(prose.querySelector('strong').firstChild, 0); range.setEnd(prose.querySelectorAll('p')[1].firstChild, 3);
    document.getSelection().removeAllRanges(); document.getSelection().addRange(range); document.dispatchEvent(new Event('selectionchange'));
}
test('cross-paragraph selection creates one independent card, preserves prose and edited prompt on mode/card changes', async () => {
    const f = await fixture(), leaf = f.prose.querySelector('strong').firstChild;
    button('正文模式').click(); await flush(); selectProse(f.prose);
    button('为选文建立标注').click(); await flush(); await flush();
    expect(f.runtime.snapshot.illustrations.annotations).toHaveLength(1);
    expect(f.runtime.snapshot.illustrations.annotations[0].anchor.quote).toBe('Alice** at the window.\n\nBob');
    expect(f.runtime.request.mock.calls[0][1].branchId).toBe(f.context.branchId);
    expect(f.prose.querySelector('strong').firstChild).toBe(leaf);
    expect(input('服装 · Alice').value).toBe('coat');
    expect(button('生成提示词').disabled).toBe(false); expect(button('生成图片').disabled).toBe(true);
    input('图片提示词（可直接填写）').value = 'my prompt'; input('图片提示词（可直接填写）').dispatchEvent(new Event('input'));
    button('关闭卡片').click(); await flush(); button('标注与历史').click(); await flush();
    expect(input('图片提示词（可直接填写）').value).toBe('my prompt');
    button('保存卡片').click(); await flush(); await flush();
    expect(f.runtime.snapshot.illustrations.annotations[0].draft.prompt).toBe('my prompt');
    expect(f.runtime.request.mock.calls[1][0]).toBe('illustrations/updateAnnotation');
    button('生图模式').click(); await flush(); expect(f.prose.classList.contains('atri-illustration-selectable')).toBe(false);
    await f.host.reconcile([{ ...plugin, enabled: false }], f.context);
    expect(document.querySelector('[data-atria-official-illustration]')).toBeNull();
    expect(f.runtime.snapshot.illustrations.annotations[0].draft.prompt).toBe('my prompt');
});
test('cross-message selection is rejected; deleted marks keep readable image history', async () => {
    const f = await fixture(); button('正文模式').click(); await flush(); selectProse(f.prose);
    const outside = document.createElement('p'); outside.textContent = 'another message'; document.body.append(outside);
    const range = document.createRange(); range.setStart(f.prose.querySelector('strong').firstChild, 0); range.setEnd(outside.firstChild, 4);
    document.getSelection().removeAllRanges(); document.getSelection().addRange(range); document.dispatchEvent(new Event('selectionchange'));
    expect(button('选择正文后建立标注').disabled).toBe(true);
    selectProse(f.prose); button('为选文建立标注').click(); await flush(); await flush();
    const state = f.runtime.snapshot.illustrations, annotation = state.annotations[0];
    const image = { imageVersionId: createNativeId('imageVersion'), annotationId: annotation.annotationId, assetId: createNativeId('asset'), width: 512, height: 768, alt: 'At the window', prompt: 'actual prompt', negativePrompt: '', parameters: {}, createdAt: 1 };
    state.images.push(image); annotation.selectedImageVersionId = image.imageVersionId;
    button('标注与历史').click(); await flush();
    expect(f.prose.querySelector('strong')).not.toBeNull();
    button('删除标注').click(); await flush(); await flush();
    expect(f.runtime.snapshot.illustrations.images).toHaveLength(1); expect(document.querySelector('.atri-illustration-history img').alt).toBe('At the window');
    expect(button('展示此版本').disabled).toBe(true);
    expect(document.querySelector('.atri-illustration-card fieldset').disabled).toBe(true);
});
test('Package prose surface requires an exact committed message identity', () => {
    const entry = { messageId: 'm', activeVariantId: 'v', content: 'same', role: 'assistant' };
    const host = createHeadlessConversation({ runtime: { snapshot: { session: { sessionId: 's' }, revision: { branchId: 'b', revisionId: 'r' }, timeline: [entry], illustrations: emptyIllustrations() } } });
    expect(host.proseSurface('same', { messageId: 'm' }).entry).toBe(entry);
    expect(host.proseSurface('changed', { messageId: 'm' })).toBeNull(); expect(host.proseSurface('same', {})).toBeNull();
});
test('SDK rejects writes after disposal and clears owned selection mode', async () => {
    let current = true; const selectionMode = jest.fn(), command = jest.fn(async () => ({}));
    const root = document.createElement('div'); document.body.append(root);
    const owner = createExtensionSdk({ plugin, document, root, context: { sessionId: 's', branchId: 'b' }, isCurrent: () => current, nativeApi: () => null, subscribe: () => () => {}, illustrationApi: { snapshot: () => ({}), settings: { read: async () => ({}), save: async () => ({}) }, selection: () => null, selectionMode, subscribe: () => () => {}, command } });
    owner.sdk.illustrations.setSelectionMode(true); current = false;
    await expect(owner.sdk.illustrations.command('updateAnnotation', {})).rejects.toThrow('disposed'); expect(command).not.toHaveBeenCalled();
    await owner.dispose(); expect(selectionMode.mock.calls.at(-1)[1]).toBe(false);
});
test('official registry uses trusted shipped entry and changing preferences does not restart the active instance', async () => {
    let enabled = true, changed;
    const runtime = { active: false, snapshot: null }; const activateModule = jest.fn(() => jest.fn());
    const host = createNativeExtensionsHost({ document, runtime, client: { list: async () => [] }, officialSettings: { read: async () => ({ value: { enabled } }) }, readPreset: async () => ({ preset: null }), nativeApi: () => null,
        importModule: async url => { expect(url).toBe('/scripts/native/official-illustration.js'); return { activate: activateModule }; }, onLifecycle: () => () => {}, onConfiguration: () => () => {}, onChanged: callback => { changed = callback; return () => {}; } });
    cleanup = () => host.dispose(); await host.refresh();
    expect(activateModule).toHaveBeenCalledTimes(1); changed({ path: '/official/illustration', enabled: true }); await flush(); expect(activateModule).toHaveBeenCalledTimes(1);
    enabled = false; changed({ path: '/official/illustration', enabled }); await flush(); await flush(); expect(document.querySelector('[data-atri-extension]')).toBeNull();
});
test('settings conflict keeps edits; work defaults and official template restore remain independent', async () => {
    const value = defaultIllustrationSettings(); value.template = 'custom';
    const client = { read: async () => ({ value, revision: 'r1' }), save: jest.fn(async () => { throw Object.assign(new Error('conflict'), { status: 409 }); }) };
    const editor = mountIllustrationSettings({ document, parent: document.body, client, configuration: async () => ({ connections: [], routes: [] }), works: async () => [], packageId: 'book' }); cleanup = () => editor.dispose(); await editor.ready;
    input('覆盖作品预设').checked = true; input('覆盖作品预设').dispatchEvent(new Event('input'));
    input('风格词').value = 'work style'; input('风格词').dispatchEvent(new Event('input'));
    button('恢复官方模板').click(); await flush(); expect(input('整理模板').value).toBeDefined(); expect(input('整理模板').value).toBe(OFFICIAL_PROMPT_TEMPLATE);
    button('保存配置').click(); await flush();
    expect(input('风格词').value).toBe('work style'); expect(client.save.mock.calls[0][0].preset.style).toBe('');
    expect(client.save.mock.calls[0][0].works.book.preset.style).toBe('work style'); expect(client.save.mock.calls[0][1]).toBe('r1');
    expect(document.querySelector('[role=alert]').textContent).toContain('编辑已保留');
});

test('queued illustration writes retain source scope and disposed queued calls never reach HTTP', async () => {
    let complete;
    const scope = { sessionId: 's', branchId: 'b' };
    const runtime = { active: true, snapshot: { session: { sessionId: 's' }, revision: { branchId: 'b' }, illustrations: emptyIllustrations() }, assertWritable() {}, request: jest.fn(() => new Promise(resolve => complete = resolve)) };
    const api = createIllustrationExtensionApi({ runtime, document }), owner = new AbortController();
    const first = api.command(scope, 'deleteAnnotation', {}), queued = api.command(scope, 'deleteAnnotation', {}, owner.signal);
    await flush(); expect(runtime.request).toHaveBeenCalledTimes(1); owner.abort();
    runtime.snapshot = { session: { sessionId: 'other' }, revision: { branchId: 'new' }, illustrations: emptyIllustrations() };
    complete({ head: 'old', state: { ...emptyIllustrations(), images: [{ old: true }] } });
    await first; await expect(queued).rejects.toThrow('disposed');
    expect(runtime.snapshot.session).not.toHaveProperty('illustrationHead'); expect(runtime.request).toHaveBeenCalledTimes(1);
});
test('conflict refresh refuses presentation from a different server branch', async () => {
    const original = emptyIllustrations(), error = Object.assign(new Error('conflict'), { status: 409 });
    const runtime = { snapshot: { session: { sessionId: 's' }, revision: { branchId: 'b' }, illustrations: original }, assertWritable() {}, request: jest.fn(async path => {
        if (path !== 'load') throw error;
        return { session: { illustrationHead: 'foreign' }, revision: { branchId: 'other' }, illustrations: { ...emptyIllustrations(), images: [{ foreign: true }] } };
    }) };
    const api = createIllustrationExtensionApi({ runtime, document });
    await expect(api.command({ sessionId: 's', branchId: 'b' }, 'deleteAnnotation', {})).rejects.toThrow('conflict');
    expect(runtime.snapshot.illustrations).toBe(original); expect(runtime.snapshot.session).not.toHaveProperty('illustrationHead');
});
test('unavailable official preferences do not prevent independent extensions from activating', async () => {
    const activateModule = jest.fn();
    const host = createNativeExtensionsHost({ document, runtime: { active: false, snapshot: null }, client: { list: async () => [{ ...plugin, id: 'ext_other', kind: 'local', entrypoint: 'index.js' }] }, officialSettings: { read: async () => { throw new Error('official unavailable'); } },
        readPreset: async () => ({ preset: null }), nativeApi: () => null, importModule: async () => ({ activate: activateModule }), onLifecycle: () => () => {}, onConfiguration: () => () => {}, onChanged: () => () => {} });
    cleanup = () => host.dispose(); await host.refresh(); expect(activateModule).toHaveBeenCalledTimes(1); expect(host.getStatus().error).toBe('official unavailable');
});

test('prompt task is separate, preserves in-flight edits, supports explicit composition/config/history and releases only UI subscription', async () => {
    const f = await fixture(); button('正文模式').click(); await flush(); selectProse(f.prose);
    button('为选文建立标注').click(); await flush(); await flush();
    const annotation = f.runtime.snapshot.illustrations.annotations[0];
    const operationId = 'task-fixture'; let complete = false;
    const operation = { operationId, status: 'running', anchor: { sessionId: f.context.sessionId, branchId: f.context.branchId, annotationId: annotation.annotationId } };
    f.generationRequest.mockImplementation(async (path, options = {}) => {
        if (path === '/illustration-prompts') return { operationId };
        if (options.method === 'DELETE') return { cancelled: true };
        return { operation: { ...operation, status: complete ? 'completed' : 'running' }, ...(complete ? { state: f.runtime.snapshot.illustrations, head: 'a'.repeat(64) } : {}) };
    });
    button('生成提示词').click(); await flush(); await flush();
    expect(button('提示词生成中').disabled).toBe(true); expect(button('生成图片').disabled).toBe(true);
    expect(button('取消提示词任务')).toBeTruthy();
    input('图片提示词（可直接填写）').value = 'edit during request'; input('图片提示词（可直接填写）').dispatchEvent(new Event('input'));
    const generated = structuredClone(annotation.draft); generated.scene = 'generated scene'; generated.prompt = 'generated prompt';
    f.runtime.snapshot.illustrations.annotations[0].draft = generated;
    const promptVersionId = createNativeId('promptVersion');
    f.runtime.snapshot.illustrations.annotations[0].promptVersions = [{ promptVersionId, createdAt: 1, draft: generated,
        requestSnapshot: { schemaVersion: 1, requestId: promptVersionId, modelProfileId: createNativeId('modelProfile'), connectionProfileId: createNativeId('connectionProfile'), runtimeRouteId: createNativeId('runtimeRoute'),
            contextPlan: { schemaVersion: 1, requestId: promptVersionId, source: { kind: 'session', sessionId: f.context.sessionId, branchId: f.context.branchId, revisionId: f.runtime.snapshot.revision.revisionId } }, promptIr: { schemaVersion: 1, requestId: promptVersionId } }, template: 'fixture', settingsRevision: 'a'.repeat(64) }];
    complete = true; await new Promise(resolve => setTimeout(resolve, 820)); await flush();
    expect(input('图片提示词（可直接填写）').value).toBe('edit during request');
    button('应用此提示词版本').click(); await flush(); expect(input('图片提示词（可直接填写）').value).toBe('generated prompt');
    f.settings.characters[0].fixedPrompt = 'updated fixed'; f.settings.preset.style = 'updated style';
    button('显式应用最新角色与预设').click(); await flush(); await flush();
    expect(input('图片提示词（可直接填写）').value).toBe('generated prompt');
    button('按当前分块组合提示词').click(); await flush();
    expect(input('图片提示词（可直接填写）').value).toContain('updated fixed');
    expect(input('图片提示词（可直接填写）').value).toContain('updated style');
    button('保存卡片').click(); await flush(); await flush();
    button('生成提示词').click(); await flush(); await flush();
    await f.host.dispose();
    expect(f.generationRequest.mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(0);
    expect(f.generationRequest.mock.calls.some(([, options]) => options?.signal?.aborted)).toBe(true);
});

test('terminal prompt refresh waits for queued edits and rejects another branch task identity', async () => {
    const f = await fixture();
    const scope = f.context;
    const other = { operation: { anchor: { sessionId: scope.sessionId, branchId: 'other', annotationId: 'a' }, status: 'completed' }, state: emptyIllustrations() };
    const api = createIllustrationExtensionApi({ runtime: f.runtime, document, generationRequest: async () => other });
    await expect(api.prompt(scope, 'status', { operationId: 'wrong' })).rejects.toThrow('mismatch');
    expect(f.runtime.request).not.toHaveBeenCalled();
});

test('image click saves confirmed edits without LLM, keeps independent status/cancel/history and reconnects after UI disposal', async () => {
    const f = await fixture(); button('正文模式').click(); await flush(); selectProse(f.prose);
    button('为选文建立标注').click(); await flush(); await flush();
    const annotation = f.runtime.snapshot.illustrations.annotations[0];
    const operation = { operationId: 'image-task', status: 'running', anchor: { sessionId: f.context.sessionId, branchId: f.context.branchId, annotationId: annotation.annotationId, illustrationStep: 'image' } };
    let complete = false;
    f.generationRequest.mockImplementation(async (path, options = {}) => {
        if (path === '/illustration-images') return { operationId: operation.operationId };
        if (path.startsWith('/illustration-prompts?')) return [];
        if (path.startsWith('/illustration-images?')) return [operation];
        if (options.method === 'DELETE') return { cancelled: true };
        return { operation: { ...operation, status: complete ? 'completed' : 'running' }, ...(complete ? { state: f.runtime.snapshot.illustrations, head: 'a'.repeat(64) } : {}) };
    });
    input('图片提示词（可直接填写）').value = 'direct confirmed input'; input('图片提示词（可直接填写）').dispatchEvent(new Event('input', { bubbles: true }));
    expect(button('生成图片').disabled).toBe(false);
    button('生成图片').click(); await flush(); await flush();
    const submitted = f.generationRequest.mock.calls.find(([path]) => path === '/illustration-images');
    expect(submitted[1].body).toMatchObject({ annotationId: annotation.annotationId, expectedHead: expect.any(String) });
    expect(f.runtime.snapshot.illustrations.annotations[0].draft.prompt).toBe('direct confirmed input');
    expect(button('图片生成中').disabled).toBe(true); expect(button('生成提示词').disabled).toBe(false);
    expect(f.generationRequest.mock.calls.some(([path, options]) => path === '/illustration-prompts' && options.method === 'POST')).toBe(false);
    button('取消图片任务').click(); await flush();
    expect(f.generationRequest.mock.calls.find(([, options]) => options?.method === 'DELETE')[0]).toBe('/operations/image-task');
    input('图片提示词（可直接填写）').value = 'unsaved later edit'; input('图片提示词（可直接填写）').dispatchEvent(new Event('input', { bubbles: true }));
    const image = { imageVersionId: createNativeId('imageVersion'), annotationId: annotation.annotationId, assetId: createNativeId('asset'), width: 832, height: 1216,
        alt: annotation.anchor.quote, prompt: 'direct confirmed input', negativePrompt: '', parameters: { seed: 42 }, createdAt: 1 };
    f.runtime.snapshot.illustrations.images.push(image); annotation.selectedImageVersionId = image.imageVersionId;
    complete = true; await new Promise(resolve => setTimeout(resolve, 820)); await flush();
    expect(input('图片提示词（可直接填写）').value).toBe('unsaved later edit');
    expect(document.querySelector('.atri-illustration-history img').alt).toBe(annotation.anchor.quote);
    expect(document.querySelector('.atri-illustration-history pre').textContent).toContain('42');
    expect(button('生成图片').disabled).toBe(false);
    complete = false; button('生成图片').click(); await flush(); await flush();
    const cancelsBefore = f.generationRequest.mock.calls.filter(([, options]) => options?.method === 'DELETE').length;
    await f.host.dispose();
    expect(f.generationRequest.mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(cancelsBefore);
    expect(submitted[1].signal.aborted).toBe(true);
    const reconnected = createExtensionRuntime({ document, illustrationApi: f.api, importModule: async () => ({ activate }) });
    const previousCleanup = cleanup; cleanup = async () => { await reconnected.dispose(); await previousCleanup(); };
    await reconnected.reconcile([plugin], f.context);
    button('标注与历史').click(); await flush(); await flush();
    expect(button('图片生成中').disabled).toBe(true); expect(button('取消图片任务')).toBeTruthy();
});

test('image SDK refuses terminal state from another branch and disposed UI writes', async () => {
    const f = await fixture(), scope = f.context;
    const original = f.runtime.snapshot.illustrations;
    const api = createIllustrationExtensionApi({ runtime: f.runtime, document, generationRequest: async () => ({ operation: { anchor: { ...scope, branchId: 'other' }, status: 'completed' }, state: emptyIllustrations() }) });
    await expect(api.image(scope, 'status', { operationId: 'wrong' })).rejects.toThrow('mismatch');
    expect(f.runtime.snapshot.illustrations).toBe(original);
    const controller = new AbortController(); controller.abort();
    await expect(api.image(scope, 'start', { annotationId: 'a' }, controller.signal)).rejects.toThrow('disposed');
});
