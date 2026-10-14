import { jest } from '@jest/globals';
import { createImageRegistry } from '../../src/native/image-registry.js';
import { validateComfyWorkflow } from '../../src/native/adapters/comfyui-image-adapter.js';
import { createComfyImageAdapter } from '../../src/native/adapters/comfyui-image-adapter.js';
import { canonicalMaskPng, imageEndpoint } from '../../src/native/adapters/image-transport.js';
import { PNG } from 'pngjs';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { setupVisual, visualPng } from './helpers/visual-fixture.js';

const types = { Text: { input: { required: { text: ['STRING', {}] } }, output: ['CONDITIONING'] },
    Save: { input: { required: { conditioning: ['CONDITIONING', {}] } }, output: [], output_node: true } };
const workflow = { id: 'fixture-workflow-v1', graph: { '1': { class_type: 'Text', inputs: { text: 'initial' } }, '2': { class_type: 'Save', inputs: { conditioning: ['1', 0] } } },
    bindings: [{ nodeId: '1', input: 'text', semantic: 'prompt', type: 'string' }], outputNodes: ['2'], nodeTypes: types };
test('ComfyUI L1 typed slots/links/output nodes reject missing nodes, wrong types and cycles', () => {
    expect(validateComfyWorkflow(workflow, types)).toEqual(workflow.graph);
    expect(() => validateComfyWorkflow(workflow, {})).toThrow('node_missing');
    const invalid = structuredClone(workflow); invalid.graph['2'].inputs.conditioning = ['1', 2]; expect(() => validateComfyWorkflow(invalid, types)).toThrow('link_invalid');
    invalid.graph['1'].inputs.text = 1; expect(() => validateComfyWorkflow(invalid, types)).toThrow('input_invalid');
    const cycleTypes = { Text: { input: { required: { text: ['STRING', {}] } }, output: ['STRING'] } };
    invalid.graph = { '1': { class_type: 'Text', inputs: { text: ['1', 0] } } }; expect(() => validateComfyWorkflow(invalid, cycleTypes)).toThrow('workflow_cycle');
});
test('Canonical mask converts 0 preserve / 255 edit into correct alpha; unsafe endpoints fail before network', () => {
    const decoded = PNG.sync.read(canonicalMaskPng(Buffer.from([0, 128, 255]), 3, 1, true));
    expect([decoded.data[3], decoded.data[7], decoded.data[11]]).toEqual([255, 127, 0]);
    for (const endpoint of ['file:///tmp/private', 'http://user:pass@localhost', 'http://169.254.169.254', 'https://example.com/?token=private']) expect(() => imageEndpoint(endpoint)).toThrow('endpoint_invalid');
});
test('ComfyUI editing L2 validates a reachable upscale graph and uploads only explicitly bound assets', async () => {
    const schema = { LoadImage: { input: { required: { image: ['STRING', {}] } }, output: ['IMAGE', 'MASK'] },
        ImageScale: { input: { required: { image: ['IMAGE', {}], width: ['INT', { min: 1 }] } }, output: ['IMAGE'] },
        SaveImage: { input: { required: { images: ['IMAGE', {}] } }, output: [], output_node: true } };
    const graph = { '1': { class_type: 'LoadImage', inputs: { image: 'base.png' } }, '2': { class_type: 'ImageScale', inputs: { image: ['1', 0], width: 2 } }, '3': { class_type: 'SaveImage', inputs: { images: ['2', 0] } } };
    const wf = { id: 'upscale-fixture', graph, bindings: [{ nodeId: '1', input: 'image', semantic: 'base', type: 'image' }], outputNodes: ['3'], nodeTypes: schema }, calls = [];
    const adapter = createComfyImageAdapter({ fetchImpl: async (url, options) => {
        calls.push({ url, options });
        if (url.endsWith('/object_info')) return Response.json(schema);
        if (url.endsWith('/upload/image')) return Response.json({ name: 'bound.png' });
        if (url.endsWith('/prompt')) return Response.json({ prompt_id: 'bound-task' });
        if (url.endsWith('/history/bound-task')) return Response.json({ 'bound-task': { outputs: { '3': { images: [{ filename: 'output.png', type: 'output' }] } } } });
        return new Response(visualPng);
    } });
    const target = { imageTargetId: 'fixture', revision: 'r1', workflow: wf, nativeParameters: {} }, connection = { endpoint: 'http://127.0.0.1:8188' };
    const manifest = await adapter.describe({ target, connection, fingerprint: 'a'.repeat(64) });
    expect(manifest.features.upscale.state).toBe('supported'); expect(manifest.features.inpaint.state).toBe('unsupported');
    const reference = { assetId: 'fixture-asset', contentHash: 'a'.repeat(64), purpose: 'base' };
    const compiled = adapter.compile({ ir: { authoring: 'raw', prompt: 'enlarge', negativePrompt: '', references: [reference] }, target, connection, seed: 2 });
    await adapter.generate(compiled, { jobId: 'fixture-job', signal: new AbortController().signal, onRemote: async () => {}, readAsset: async () => ({ bytes: visualPng, ref: reference }) });
    expect(JSON.parse(calls.find(c => c.url.endsWith('/prompt')).options.body).prompt['1'].inputs.image).toBe('bound.png');
    expect(calls.find(c => c.url.endsWith('/upload/image')).options.body.get('image').size).toBe(visualPng.length);
});
describe.each(['ComfyUI', 'OpenAI Images'])('%s L1/L2 production Native slice', family => {
    let h;
    beforeEach(async () => h = await makeTempFsEngineHarness());
    afterEach(async () => h.cleanup());
    test('family protocol is compiled and executed independently through durable Job and history', async () => {
        const requests = [];
        const fetchImpl = jest.fn(async (url, options) => {
            requests.push({ url, options });
            if (url.endsWith('/object_info')) return Response.json(types);
            if (url.endsWith('/prompt')) return Response.json({ prompt_id: 'remote-fixture-1' });
            if (url.endsWith('/history/remote-fixture-1')) return Response.json({ 'remote-fixture-1': { outputs: { '2': { images: [{ filename: 'result.png', subfolder: '', type: 'output' }] } }, status: { status_str: 'success' } } });
            if (url.includes('/view?')) return new Response(visualPng);
            if (url.endsWith('/images/generations')) return Response.json({ data: [{ b64_json: visualPng.toString('base64') }] });
            throw Error('Unexpected fixture route');
        });
        const x = await setupVisual(h, { registry: createImageRegistry({ fetchImpl }), adapter: family === 'ComfyUI' ? 'provider.comfyui-image' : 'provider.openai-images',
            model: family === 'ComfyUI' ? 'workflow-fixture' : 'gpt-image-1', endpoint: 'http://127.0.0.1:8188', workflow: family === 'ComfyUI' ? workflow : null });
        const p = await x.prepare(); expect(requests.filter(row => row.options.method === 'POST')).toHaveLength(0);
        const started = await x.images.start(h.handle, { prepareId: p.prepareId, approval: x.approval(p) }); await x.images.wait(h.handle, started.operationId);
        const result = await x.images.status(h.handle, started); expect(result.operation.status).toBe('completed'); expect(result.state.images).toHaveLength(1);
        const post = requests.find(row => row.options.method === 'POST'), body = JSON.parse(post.options.body);
        const observed = family === 'ComfyUI' ? { prompt: body.prompt['1'].inputs.text, remote: result.operation.remote.promptId }
            : { prompt: body.prompt, model: body.model, n: body.n, output_format: body.output_format };
        expect(observed).toEqual(family === 'ComfyUI' ? { prompt: 'confirmed prompt', remote: 'remote-fixture-1' }
            : { prompt: 'confirmed prompt', model: 'gpt-image-1', n: 1, output_format: 'png' });
        expect(post.url).not.toContain('chat/completions');
        expect(post.options.redirect).toBe('error'); expect(JSON.stringify(result)).not.toContain('synthetic-secret');
    });
    test('family errors do not leak provider body or resend an uncertain submission', async () => {
        const fetchImpl = jest.fn(async url => url.endsWith('/object_info') ? Response.json(types) : new Response('private provider error', { status: 429 }));
        const x = await setupVisual(h, { registry: createImageRegistry({ fetchImpl }), adapter: family === 'ComfyUI' ? 'provider.comfyui-image' : 'provider.openai-images',
            model: family === 'ComfyUI' ? 'workflow-fixture' : 'gpt-image-1', endpoint: 'http://127.0.0.1:8188', workflow: family === 'ComfyUI' ? workflow : null });
        const p = await x.prepare(), started = await x.images.start(h.handle, { prepareId: p.prepareId, approval: x.approval(p) });
        await expect(x.images.wait(h.handle, started.operationId)).rejects.toThrow('rate_limited');
        const result = await x.images.status(h.handle, started); expect(result.operation.status).toBe('uncertain_submission'); expect(JSON.stringify(result)).not.toContain('private provider error');
        const count = fetchImpl.mock.calls.length; await x.images.worker.recover(h.handle); expect(fetchImpl).toHaveBeenCalledTimes(count);
    });
});
