import { jest } from '@jest/globals';
import { PNG } from 'pngjs';
import { createImageRegistry, ImageAdapterRegistry } from '../../src/native/image-registry.js';
import { MediaStudio } from '../../src/native/media-studio.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { setupVisual, visualPng } from './helpers/visual-fixture.js';

const nodeTypes = { Text: { input: { required: { text: ['STRING', {}] } }, output: ['CONDITIONING'] },
    Save: { input: { required: { conditioning: ['CONDITIONING', {}] } }, output: [], output_node: true } };
const workflow = { id: '123456', graph: { '1': { class_type: 'Text', inputs: { text: 'initial' } }, '2': { class_type: 'Save', inputs: { conditioning: ['1', 0] } } },
    bindings: [{ nodeId: '1', input: 'text', semantic: 'prompt', type: 'string' }], outputNodes: ['2'], nodeTypes };
const familyConfig = {
    Gemini: { adapter: 'provider.gemini-image', model: 'gemini-2.5-flash-image' },
    WebUI: { adapter: 'provider.sd-webui-image', model: 'fixture-checkpoint' },
    Forge: { adapter: 'provider.forge-image', model: 'fixture-checkpoint' },
    RunningHub: { adapter: 'provider.runninghub-image', model: 'fixture-workflow', workflow },
};
function fixtureFetch(family, { fail = false, running = false } = {}) {
    const calls = [], fetchImpl = jest.fn(async (url, options) => {
        calls.push({ url, options });
        if (url.endsWith('/sd-models')) return Response.json([{ title: 'fixture-checkpoint' }]);
        if (url.endsWith('/samplers')) return Response.json([{ name: 'Euler' }]);
        if (url.endsWith('/upscalers')) return Response.json([{ name: 'Lanczos' }]);
        if (url.endsWith('/scripts')) return Response.json({ txt2img: [], img2img: [] });
        if (url.endsWith('/openapi.json')) return Response.json({ paths: Object.fromEntries(['txt2img','img2img','extra-single-image'].map(p => ['/sdapi/v1/' + p, { post: {} }])) });
        if (fail) return new Response('PRIVATE error including fixture-key', { status: 429 });
        if (family === 'Gemini') return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { mimeType: 'image/png', data: visualPng.toString('base64') } }] } }] });
        if (family === 'WebUI' || family === 'Forge') return Response.json({ images: [visualPng.toString('base64')] });
        if (url.endsWith('/create')) return Response.json({ code: 0, data: { taskId: '123456789', taskStatus: 'RUNNING', netWssUrl: 'SECRET-URL-NOT-PERSISTED', promptTips: '{"node_errors":{}}' } });
        if (url.endsWith('/outputs')) return Response.json(running ? { code: 804 } : { code: 0, data: [{ nodeId: '2', fileType: 'png', fileUrl: 'http://127.0.0.1:8188/output.png' }] });
        if (url.endsWith('/cancel')) return Response.json({ code: 0, data: null });
        if (url.endsWith('/upload')) return Response.json({ code: 0, data: { fileName: 'api/bound.png' } });
        if (url.endsWith('/output.png')) return new Response(visualPng);
        throw Error('Unexpected fixture route');
    });
    return { fetchImpl, calls };
}
describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('P1 Native %s', (_, harness) => {
    let h; beforeEach(async () => h = await harness()); afterEach(async () => h.cleanup());
    test.each(Object.keys(familyConfig))('%s independent L1/L2 generation preserves raw prompt, frozen target and Native history', async family => {
        const transport = fixtureFetch(family), x = await setupVisual(h, { registry: createImageRegistry({ fetchImpl: transport.fetchImpl }), endpoint: 'http://127.0.0.1:8188', ...familyConfig[family] });
        const preview = await x.prepare(); expect(transport.calls.filter(c => c.options.method === 'POST')).toHaveLength(0);
        const started = await x.images.start(h.handle, { prepareId: preview.prepareId, approval: x.approval(preview) }); await x.images.wait(h.handle, started.operationId);
        const result = await x.images.status(h.handle, started); expect(result.operation.status).toBe('completed');
        expect(result.state.images).toHaveLength(1); expect(result.state.images[0].prompt).toBe('confirmed prompt'); expect(result.state.annotations[0].selectedImageVersionId).toBeNull();
        expect(JSON.stringify(result)).not.toMatch(/synthetic-secret|SECRET-URL|PRIVATE/);
        expect(transport.calls.every(c => c.options.redirect === 'error')).toBe(true);
        const generation = transport.calls.find(c => c.options.method === 'POST'), body = JSON.parse(generation.options.body);
        const prompts = { Gemini: body.contents?.[0].parts[0].text, WebUI: body.prompt, Forge: body.prompt, RunningHub: body.workflow ? JSON.parse(body.workflow)['1'].inputs.text : null };
        expect(prompts[family]).toBe('confirmed prompt');
        const headers = generation.options.headers;
        expect(family === 'Gemini' ? headers['x-goog-api-key'] : family === 'RunningHub' ? body.apiKey : headers.Authorization).toBe(family === 'Gemini' || family === 'RunningHub' ? 'synthetic-secret' : 'Basic ' + Buffer.from('synthetic-secret').toString('base64'));
        const resultRequest = transport.calls.find(c => c.url.endsWith('/output.png'));
        expect(resultRequest?.options.headers.Authorization).toBeUndefined();
    });
    test.each(Object.keys(familyConfig))('%s failures are sanitized and uncertain sends never retry', async family => {
        const transport = fixtureFetch(family, { fail: true }), x = await setupVisual(h, { registry: createImageRegistry({ fetchImpl: transport.fetchImpl }), endpoint: 'http://127.0.0.1:8188', ...familyConfig[family] });
        const p = await x.prepare(), started = await x.images.start(h.handle, { prepareId: p.prepareId, approval: x.approval(p) });
        await expect(x.images.wait(h.handle, started.operationId)).rejects.toThrow('rate_limited');
        const result = await x.images.status(h.handle, started); expect(result.operation.status).toBe('uncertain_submission'); expect(JSON.stringify(result)).not.toMatch(/PRIVATE|fixture-key/);
        const before = transport.calls.length; await x.images.worker.recover(h.handle); expect(transport.calls).toHaveLength(before);
    });
    test('Gemini native semantic editing sends approved image bytes; required Canonical Mask fails before spending', async () => {
        const transport = fixtureFetch('Gemini'), x = await setupVisual(h, { registry: createImageRegistry({ fetchImpl: transport.fetchImpl }), endpoint: 'http://127.0.0.1:8188', ...familyConfig.Gemini });
        const p = await x.prepare(), started = await x.images.start(h.handle, { prepareId: p.prepareId, approval: x.approval(p) }); await x.images.wait(h.handle, started.operationId);
        const base = (await x.images.status(h.handle, started)).state.images[0], media = new MediaStudio({ host: x.host, images: x.images }), scope = { sessionId: x.view.session.sessionId, branchId: x.view.revision.branchId, imageVersionId: base.imageVersionId };
        const edit = await media.prepare(h.handle, { ...scope, operation: 'img2img', prompt: 'semantic edit', referenceIds: [] });
        await expect(x.images.start(h.handle, { prepareId: edit.prepareId, approval: x.approval(edit) })).rejects.toThrow('external_transfer_unauthorized');
        const task = await x.images.start(h.handle, { prepareId: edit.prepareId, approval: { ...x.approval(edit), externalAssetIds: edit.externalAssetIds } }); await x.images.wait(h.handle, task.operationId);
        expect(JSON.parse(transport.calls.at(-1).options.body).contents[0].parts[1].inlineData.data).toBe(visualPng.toString('base64'));
        const draft = await media.createDraft(h.handle, scope), mask = await media.freezeMask(h.handle, { draftId: draft.value.draftId, expectedRevision: draft.revision }), count = transport.calls.length;
        await expect(media.prepare(h.handle, { ...scope, operation: 'inpaint', maskArtifactId: mask.maskArtifactId, referenceIds: [] })).rejects.toThrow('capability_unsupported');
        expect(transport.calls).toHaveLength(count);
    });
});
test('WebUI/Forge editing L1/L2 discovers native extensions, validates LoRA/ControlNet combination and translates mask polarity', async () => {
    const wire = [], registry = createImageRegistry({ fetchImpl: async (url, options) => {
        if (url.endsWith('/sd-models')) return Response.json([{ title: 'fixture-checkpoint' }]);
        if (url.endsWith('/samplers')) return Response.json([{ name: 'Euler' }]);
        if (url.endsWith('/upscalers')) return Response.json([{ name: 'Lanczos' }]);
        if (url.endsWith('/scripts')) return Response.json({ txt2img: ['ControlNet'], img2img: ['ControlNet'] });
        if (url.endsWith('/openapi.json')) return Response.json({ paths: { '/sdapi/v1/txt2img': { post: {} }, '/sdapi/v1/img2img': { post: {} }, '/sdapi/v1/extra-single-image': { post: {} }, '/sdapi/v1/loras': { get: {} } } });
        if (url.endsWith('/loras')) return Response.json([{ alias: 'fixture-lora' }]);
        if (url.endsWith('/model_list')) return Response.json({ model_list: ['fixture-control'] });
        if (url.endsWith('/module_list')) return Response.json({ module_list: ['none'] });
        wire.push(JSON.parse(options.body)); return Response.json(url.endsWith('/extra-single-image') ? { image: visualPng.toString('base64') } : { images: [visualPng.toString('base64')] });
    } });
    const base = { assetId: 'fixture-base', contentHash: 'a'.repeat(64), purpose: 'base' }, mask = { assetId: 'fixture-mask', contentHash: 'b'.repeat(64), purpose: 'mask' }, structure = { ...base, purpose: 'structure' };
    for (const name of ['provider.sd-webui-image','provider.forge-image']) {
        const adapter = registry.get(name), target = { imageTargetId: name, revision: 'r1', model: 'fixture-checkpoint', nativeParameters: { loras: [{ name: 'fixture-lora', weight: .7 }], controlnet: { model: 'fixture-control', module: 'none', weight: .8 } } }, connection = { endpoint: 'http://127.0.0.1:8188' };
        const capabilities = await adapter.describe({ target, connection, fingerprint: 'f'.repeat(64) }); expect(capabilities.combinations[0].state).toBe('supported');
        const compiled = adapter.compile({ ir: { operation: 'inpaint', authoring: 'raw', prompt: 'local edit', negativePrompt: '', references: [base, mask, structure] }, target, connection, seed: 17 });
        await adapter.generate({ ...compiled, maskGeometry: { width: 1, height: 1 } }, { signal: new AbortController().signal, readAsset: async id => ({ bytes: id === mask.assetId ? Buffer.from([255]) : visualPng, ref: id === mask.assetId ? mask : base }) });
        expect(wire.at(-1).prompt).toBe('local edit <lora:fixture-lora:0.7>'); expect(wire.at(-1).alwayson_scripts.ControlNet.args[0].image).toBe(visualPng.toString('base64'));
        expect(PNG.sync.read(Buffer.from(wire.at(-1).mask, 'base64')).data).toEqual(Buffer.from([255,255,255,255]));
        target.nativeParameters = { upscaler: 'Lanczos', scale: 2 };
        const upscale = adapter.compile({ ir: { operation: 'upscale', references: [base] }, target, connection });
        await adapter.generate(upscale, { signal: new AbortController().signal, readAsset: async () => ({ bytes: visualPng, ref: base }) }); expect(wire.at(-1).upscaler_1).toBe('Lanczos');
        target.nativeParameters = { loras: [{ name: 'missing', weight: 1 }] };
        expect(() => adapter.compile({ ir: { operation: 'txt2img', authoring: 'raw', prompt: 'test', negativePrompt: '', references: [] }, target, connection, seed: 1 })).toThrow('lora_unavailable');
    }
});
test('RunningHub restart reconciliation never resubmits and remote cancellation never claims a refund', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const transport = fixtureFetch('RunningHub', { running: true }), x = await setupVisual(h, { registry: createImageRegistry({ fetchImpl: transport.fetchImpl }), endpoint: 'http://127.0.0.1:8188', ...familyConfig.RunningHub });
        const p = await x.prepare(), started = await x.images.start(h.handle, { prepareId: p.prepareId, approval: x.approval(p) });
        for (let i = 0; i < 40 && !(await x.images.store.read(h.handle, 'job', started.operationId)).value.remote; i++) await new Promise(r => setTimeout(r, 5));
        const cancelled = await x.images.cancel(h.handle, started); expect(cancelled.cancelReceipt).toEqual({ local: true, remoteConfirmed: true, refund: 'unknown' });
        expect(transport.calls.filter(c => c.url.endsWith('/create'))).toHaveLength(1); expect(transport.calls.filter(c => c.url.endsWith('/cancel'))).toHaveLength(1);
        await x.images.wait(h.handle, started.operationId).catch(() => {});
        // Persist a known, expired receipt from the cancelled fixture to model a
        // separate restart recovery without issuing another paid task.
        await x.images.store.updateJob(h.handle, started.operationId, job => ({ ...job, status: 'submitted', lease: null }));
        const resumed = fixtureFetch('RunningHub'); x.images.registry.adapters.set('provider.runninghub-image', createImageRegistry({ fetchImpl: resumed.fetchImpl }).get('provider.runninghub-image'));
        await x.images.worker.recover(h.handle, started.operationId);
        expect((await x.images.status(h.handle, started)).operation.status).toBe('completed'); expect(resumed.calls.some(c => c.url.endsWith('/create'))).toBe(false);
        const download = resumed.calls.find(c => c.url.endsWith('/output.png')); expect(download.options.headers.Authorization).toBeUndefined();
    } finally { await h.cleanup(); }
});
test('RunningHub output URLs, typed workflow mismatch, Gemini strict mask and unknown extension ports fail closed', async () => {
    const registry = createImageRegistry({ fetchImpl: async () => Response.json({ code: 0, data: [{ nodeId: '2', fileType: 'png', fileUrl: 'http://169.254.169.254/private' }] }) });
    await expect(registry.get('provider.runninghub-image').reconcile({ endpoint: 'https://www.runninghub.ai', outputNodes: ['2'] }, { taskId: '123' }, { secret: 'fixture', signal: new AbortController().signal })).rejects.toThrow('output_url_invalid');
    const bad = structuredClone(workflow); bad.bindings[0].input = 'missing';
    expect(() => registry.get('provider.runninghub-image').describe({ target: { workflow: bad }, connection: { endpoint: 'https://www.runninghub.ai' }, fingerprint: 'a'.repeat(64) })).toThrow('binding_invalid');
    const extensions = new ImageAdapterRegistry(); expect(() => extensions.register(['custom.image'], {})).toThrow('adapter_invalid');
    expect(() => extensions.get('custom.image')).toThrow('adapter_unsupported');
});
test('RunningHub editing L2 freezes the entire typed workflow, uploads base/mask after approval and retrieves one bound output', async () => {
    const schema = { Load: { input: { required: { image: ['STRING', {}] } }, output: ['IMAGE'] },
        Edit: { input: { required: { base: ['IMAGE', {}], mask: ['IMAGE', {}], text: ['STRING', {}] } }, output: ['IMAGE'] },
        Save: { input: { required: { image: ['IMAGE', {}] } }, output: [], output_node: true } };
    const wf = { id: '123456', graph: { '1': { class_type: 'Load', inputs: { image: 'base' } }, '2': { class_type: 'Load', inputs: { image: 'mask' } },
        '3': { class_type: 'Edit', inputs: { base: ['1', 0], mask: ['2', 0], text: 'edit' } }, '4': { class_type: 'Save', inputs: { image: ['3', 0] } } },
        bindings: [{ nodeId: '1', input: 'image', semantic: 'base', type: 'image' }, { nodeId: '2', input: 'image', semantic: 'mask', type: 'image' }, { nodeId: '3', input: 'text', semantic: 'prompt', type: 'string' }], outputNodes: ['4'], nodeTypes: schema };
    const calls = [], adapter = createImageRegistry({ fetchImpl: async (url, options) => {
        calls.push({ url, options });
        if (url.endsWith('/upload')) return Response.json({ code: 0, data: { fileName: 'api/' + calls.length + '.png' } });
        if (url.endsWith('/create')) return Response.json({ code: 0, data: { taskId: '123', promptTips: '{"node_errors":{}}' } });
        if (url.endsWith('/outputs')) return Response.json({ code: 0, data: [{ fileUrl: 'http://127.0.0.1:8188/result.png', fileType: 'png', nodeId: '4' }] });
        return new Response(visualPng);
    } }).get('provider.runninghub-image');
    const target = { workflow: wf, nativeParameters: {} }, connection = { endpoint: 'http://127.0.0.1:8188' };
    expect(adapter.describe({ target, connection, fingerprint: 'a'.repeat(64) }).features.inpaint.state).toBe('supported');
    const base = { assetId: 'base', contentHash: 'a'.repeat(64), purpose: 'base' }, mask = { assetId: 'mask', contentHash: 'b'.repeat(64), purpose: 'mask' };
    const compiled = adapter.compile({ ir: { authoring: 'raw', operation: 'inpaint', prompt: 'local change', negativePrompt: '', references: [base, mask] }, target, connection, seed: 1 });
    expect(compiled.body).not.toHaveProperty('apiKey'); expect(calls).toHaveLength(0);
    await adapter.generate({ ...compiled, maskGeometry: { width: 1, height: 1 } }, { secret: 'fixture', jobId: 'fixture-job', signal: new AbortController().signal, onRemote: async () => {}, readAsset: async id => ({ bytes: id === 'mask' ? Buffer.from([255]) : visualPng, ref: id === 'mask' ? mask : base }) });
    const uploadedMask = calls[1].options.body.get('file'), png = PNG.sync.read(Buffer.from(await uploadedMask.arrayBuffer())); expect(png.data[3]).toBe(0);
    const sent = JSON.parse(calls[2].options.body), sentGraph = JSON.parse(sent.workflow); expect(sentGraph['3'].inputs.text).toBe('local change'); expect(sentGraph['2'].inputs.image).toBe('api/2.png');
    expect(sent.apiKey).toBe('fixture'); expect(calls.at(-1).options.headers.Authorization).toBeUndefined();
});
