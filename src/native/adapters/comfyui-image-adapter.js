import { visualObject, visualError, nonSecretVisualJson } from '../../../public/shared/native-visual-contract.js';
import { protocolManifest, imageSemanticPrompt } from '../image-registry.js';
import { imageRoute, imageJson, imageFetch, boundedImageBytes, normalizeImage, imagePollDelay, readImageInput, canonicalMaskPng } from './image-transport.js';

export function validateComfyWorkflow(workflow, nodeTypes) {
    if (!workflow || !nodeTypes) visualError('workflow_unknown');
    const graph = nonSecretVisualJson(workflow.graph), nodes = Object.keys(graph);
    if (!nodes.length || nodes.length > 512 || !workflow.outputNodes.length) visualError('workflow_invalid');
    const visiting = new Set(), visited = new Set();
    const visit = id => {
        if (visiting.has(id)) visualError('workflow_cycle'); if (visited.has(id)) return;
        visiting.add(id); const node = graph[id];
        visualObject(node, ['class_type', 'inputs', '_meta']);
        const schema = nodeTypes[node.class_type]; if (!schema) visualError('workflow_node_missing');
        visualObject(node.inputs, Object.keys(node.inputs ?? {}));
        const inputs = { ...schema.input?.required, ...schema.input?.optional };
        for (const required of Object.keys(schema.input?.required ?? {})) if (!(required in node.inputs)) visualError('workflow_input_missing');
        for (const [name, value] of Object.entries(node.inputs)) {
            const definition = inputs[name]; if (!definition) visualError('workflow_input_invalid');
            if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && Number.isInteger(value[1])) {
                const upstream = graph[value[0]], output = nodeTypes[upstream?.class_type]?.output?.[value[1]];
                if (!upstream || !output || output !== definition[0]) visualError('workflow_link_invalid'); visit(value[0]);
            } else if (Array.isArray(definition[0]) ? !definition[0].includes(value)
                : ['INT', 'FLOAT'].includes(definition[0]) ? !Number.isFinite(value) || definition[0] === 'INT' && !Number.isInteger(value)
                    || definition[1]?.min !== undefined && value < definition[1].min || definition[1]?.max !== undefined && value > definition[1].max
                    : definition[0] === 'STRING' ? typeof value !== 'string' : definition[0] === 'BOOLEAN' ? typeof value !== 'boolean' : true) visualError('workflow_input_invalid');
        }
        visiting.delete(id); visited.add(id);
    };
    nodes.forEach(visit);
    for (const id of workflow.outputNodes) if (!graph[id] || !nodeTypes[graph[id].class_type]?.output_node) visualError('workflow_output_invalid');
    const reachable = new Set();
    const reach = id => { if (reachable.has(id)) return; reachable.add(id); for (const value of Object.values(graph[id].inputs)) if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string') reach(value[0]); };
    workflow.outputNodes.forEach(reach);
    const slots = new Set();
    for (const binding of workflow.bindings) {
        const node = graph[binding.nodeId], schema = nodeTypes[node?.class_type], definition = { ...schema?.input?.required, ...schema?.input?.optional }[binding.input];
        if (!node || !reachable.has(binding.nodeId) || !Object.hasOwn(node.inputs, binding.input) || !definition || slots.has(binding.nodeId + ':' + binding.input)
            || (binding.type === 'number' ? !['INT', 'FLOAT'].includes(definition[0]) : definition[0] !== 'STRING' && !Array.isArray(definition[0]))) visualError('workflow_binding_invalid');
        slots.add(binding.nodeId + ':' + binding.input);
    }
    if (!workflow.bindings.some(b => ['prompt', 'base'].includes(b.semantic))) visualError('workflow_binding_invalid');
    return Object.fromEntries(Object.entries(graph).filter(([id]) => reachable.has(id)));
}
export function createComfyImageAdapter({ fetchImpl = fetch, pollMs = 1000 } = {}) {
    const schemas = new Map();
    const observe = async (compiled, remote, options) => {
        const record = (await imageJson(fetchImpl, imageRoute(compiled.endpoint, 'history/' + encodeURIComponent(remote.promptId)), options))[remote.promptId];
        if (!record) return null;
        if (record.status?.status_str === 'error') visualError('remote_failed');
        const outputs = compiled.outputNodes.flatMap(id => record.outputs?.[id]?.images ?? []);
        if (!outputs.length) return null;
        if (outputs.length !== 1) visualError('result_count_invalid');
        const file = outputs[0];
        if (typeof file.filename !== 'string' || /[\\/]|\.\./.test(file.filename) || typeof (file.subfolder ?? '') !== 'string'
            || (file.subfolder ?? '').split(/[\\/]/).includes('..') || file.type !== 'output') visualError('output_path_invalid');
        const url = imageRoute(compiled.endpoint, 'view') + '?' + new URLSearchParams({ filename: file.filename, subfolder: file.subfolder ?? '', type: 'output' });
        return normalizeImage(await boundedImageBytes(await imageFetch(fetchImpl, url, options), options.signal));
    };
    return {
        async describe({ target, connection, fingerprint, secret }) {
            const info = await imageJson(fetchImpl, imageRoute(connection.endpoint, 'object_info'), { secret, signal: AbortSignal.timeout(15000) });
            const graph = validateComfyWorkflow(target.workflow, info);
            schemas.set(target.imageTargetId + '@' + target.revision, info);
            const semantic = new Set(target.workflow.bindings.map(b => b.semantic));
            const classes = new Set(Object.values(graph).map(node => node.class_type));
            const upscale = semantic.has('base') && ['ImageScale', 'ImageScaleBy', 'ImageUpscaleWithModel'].some(name => classes.has(name));
            const lora = classes.has('LoraLoader') || classes.has('LoraLoaderModelOnly');
            const controlnet = semantic.has('structure') && classes.has('ControlNetLoader') && ['ControlNetApply', 'ControlNetApplyAdvanced'].some(name => classes.has(name));
            const builtin = new Set(['CheckpointLoaderSimple', 'CLIPTextEncode', 'EmptyLatentImage', 'KSampler', 'KSamplerAdvanced', 'VAEDecode', 'VAEEncode', 'VAEEncodeForInpaint', 'SaveImage', 'LoadImage', 'ImageScale', 'ImageScaleBy', 'ImageUpscaleWithModel', 'UpscaleModelLoader', 'LoraLoader', 'ControlNetLoader', 'ControlNetApply', 'ControlNetApplyAdvanced']);
            const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection.endpoint).hostname) && Object.values(graph).every(node => builtin.has(node.class_type));
            return protocolManifest(fingerprint, { txt2img: semantic.has('prompt') && !semantic.has('base') ? 'supported' : 'unsupported', img2img: semantic.has('base') && semantic.has('prompt') ? 'supported' : 'unsupported',
                inpaint: semantic.has('base') && semantic.has('mask') ? 'supported' : 'unsupported', upscale: upscale ? 'supported' : 'unsupported', identity: semantic.has('identity') ? 'supported' : 'unknown', outfit: semantic.has('outfit') ? 'supported' : 'unknown', style: semantic.has('style') ? 'supported' : 'unknown', structure: controlnet ? 'supported' : 'unknown', lora: lora ? 'supported' : 'unknown', controlnet: controlnet ? 'supported' : 'unknown' }, { combinations: lora && controlnet ? [{ features: ['lora', 'controlnet'], state: 'supported', evidence: 'typed nodes and links validated against object_info; image quality not live verified' }] : [], cost: local ? { kind: 'free', currency: '', upperBound: 0 } : { kind: 'unknown', currency: '', upperBound: null } });
        },
        compile({ ir, target, connection, seed }) {
            const graph = validateComfyWorkflow(target.workflow, schemas.get(target.imageTargetId + '@' + target.revision) ?? target.workflow.nodeTypes);
            const values = { prompt: imageSemanticPrompt(ir), negativePrompt: ir.negativePrompt, seed, width: target.nativeParameters.width ?? 832, height: target.nativeParameters.height ?? 1216 };
            const inputs = [];
            for (const binding of target.workflow.bindings) {
                if (['base', 'mask', 'identity', 'outfit', 'style', 'structure', 'vibe'].includes(binding.semantic)) {
                    const reference = ir.references.find(r => r.purpose === binding.semantic); if (!reference) visualError('input_missing');
                    inputs.push({ ...binding, reference }); graph[binding.nodeId].inputs[binding.input] = 'atria-upload-' + binding.semantic;
                } else graph[binding.nodeId].inputs[binding.input] = values[binding.semantic];
            }
            validateComfyWorkflow({ ...target.workflow, graph }, schemas.get(target.imageTargetId + '@' + target.revision) ?? target.workflow.nodeTypes);
            return { endpoint: connection.endpoint, body: { prompt: graph }, outputNodes: target.workflow.outputNodes, inputs };
        },
        async generate(compiled, options) {
            const body = structuredClone(compiled.body);
            for (const input of compiled.inputs) {
                const asset = await readImageInput(options, input.reference);
                const bytes = input.reference.purpose === 'mask' ? canonicalMaskPng(asset.bytes, compiled.maskGeometry.width, compiled.maskGeometry.height, true) : asset.bytes;
                const form = new FormData(); form.append('image', new Blob([bytes], { type: 'image/png' }), 'atria-' + options.jobId + '-' + input.semantic + '.png');
                form.append('type', 'input'); form.append('overwrite', 'false');
                const result = await imageJson(fetchImpl, imageRoute(compiled.endpoint, 'upload/image'), { ...options, body: form });
                if (typeof result.name !== 'string' || /[\\/]|\.\./.test(result.name)) visualError('upload_invalid');
                body.prompt[input.nodeId].inputs[input.input] = result.name;
            }
            const receipt = await imageJson(fetchImpl, imageRoute(compiled.endpoint, 'prompt'), { ...options, body: { ...body, client_id: options.jobId } });
            if (!/^[A-Za-z0-9_-]{1,128}$/.test(receipt.prompt_id) || receipt.error) visualError('remote_receipt_invalid');
            const remote = { promptId: receipt.prompt_id }; await options.onRemote(remote);
            for (;;) { const result = await observe(compiled, remote, options); if (result) return result; await imagePollDelay(options.signal, pollMs); }
        },
        reconcile: observe,
        // A shared /interrupt is intentionally never sent: local cancellation
        // does not authorize stopping another user's currently running task.
    };
}
