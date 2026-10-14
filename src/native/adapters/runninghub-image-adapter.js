import { visualObject, visualError } from '../../../public/shared/native-visual-contract.js';
import { protocolManifest, imageSemanticPrompt } from '../image-registry.js';
import { validateComfyWorkflow } from './comfyui-image-adapter.js';
import { imageEndpoint, imageRoute, imageJson, imageFetch, boundedImageBytes, normalizeImage, readImageInput, canonicalMaskPng, imagePollDelay } from './image-transport.js';

function resultUrl(value, endpoint) {
    let url; try { url = new URL(value); } catch { visualError('output_url_invalid'); }
    const origin = new URL(imageEndpoint(endpoint));
    if (url.username || url.password || url.hash || (url.origin !== origin.origin && (url.protocol !== 'https:' || url.port
        || !['rh-images.xiaoyaoyou.com', 'rh-images.runninghub.ai', 'www.runninghub.ai'].includes(url.hostname)))) visualError('output_url_invalid');
    imageEndpoint(url.origin);
    return url.toString();
}
const inputs = new Set(['base', 'mask', 'identity', 'outfit', 'style', 'structure', 'vibe']);
export function createRunninghubImageAdapter({ fetchImpl = fetch, pollMs = 1000 } = {}) {
    const call = (compiled, path, options, body) => imageJson(fetchImpl, imageRoute(compiled.endpoint, 'task/openapi/' + path), { ...options, body: { ...body, apiKey: options.secret } });
    const observe = async (compiled, remote, options) => {
        const response = await call(compiled, 'outputs', options, { taskId: remote.taskId });
        if ([804, 813].includes(response.code)) return null; // TASK_IS_RUNNING / QUEUED
        if (response.code !== 0 || response.failedReason || response.data?.failedReason) visualError('remote_failed');
        if (!Array.isArray(response.data)) visualError('response_invalid');
        const outputs = response.data.filter(item => compiled.outputNodes.includes(String(item.nodeId)) && ['png', 'jpg', 'jpeg', 'webp'].includes(item.fileType));
        if (outputs.length !== 1) visualError('result_count_invalid');
        // Signed result URLs stay transient. Never forward the API credential to
        // a CDN, follow a redirect, or store netWssUrl/cookies in Native evidence.
        const url = resultUrl(outputs[0].fileUrl, compiled.endpoint);
        return normalizeImage(await boundedImageBytes(await imageFetch(fetchImpl, url, { signal: options.signal }), options.signal));
    };
    return {
        describe({ target, connection, fingerprint }) {
            imageEndpoint(connection.endpoint);
            if (!/^\d{1,32}$/.test(target.workflow?.id)) visualError('workflow_invalid');
            const graph = validateComfyWorkflow(target.workflow, target.workflow.nodeTypes), semantic = new Set(target.workflow.bindings.map(binding => binding.semantic));
            const classes = new Set(Object.values(graph).map(node => node.class_type));
            return protocolManifest(fingerprint, { txt2img: semantic.has('prompt') && !semantic.has('base') ? 'supported' : 'unsupported',
                img2img: semantic.has('base') && semantic.has('prompt') ? 'supported' : 'unsupported', inpaint: semantic.has('base') && semantic.has('mask') ? 'supported' : 'unsupported',
                strict_inpaint_mask: 'unknown', upscale: semantic.has('base') && ['ImageScale', 'ImageScaleBy', 'ImageUpscaleWithModel'].some(name => classes.has(name)) ? 'supported' : 'unknown',
                ...Object.fromEntries(['identity', 'outfit', 'style', 'structure', 'vibe'].map(purpose => [purpose, semantic.has(purpose) ? 'supported' : 'unknown'])),
                lora: classes.has('LoraLoader') ? 'supported' : 'unknown', controlnet: semantic.has('structure') && classes.has('ControlNetLoader') && ['ControlNetApply', 'ControlNetApplyAdvanced'].some(name => classes.has(name)) ? 'supported' : 'unknown', negativePrompt: semantic.has('negativePrompt') ? 'supported' : 'unsupported' });
        },
        compile({ ir, target, connection, seed }) {
            visualObject(target.nativeParameters, ['width', 'height', 'instanceType']);
            if (target.nativeParameters.instanceType && !['default', 'plus', 'ultra'].includes(target.nativeParameters.instanceType)) visualError('parameters_invalid');
            const graph = validateComfyWorkflow(target.workflow, target.workflow.nodeTypes), values = { prompt: imageSemanticPrompt(ir), negativePrompt: ir.negativePrompt, seed,
                    width: target.nativeParameters.width ?? 832, height: target.nativeParameters.height ?? 1216 }, assets = [];
            if (ir.negativePrompt && !target.workflow.bindings.some(binding => binding.semantic === 'negativePrompt')) visualError('negative_prompt_unsupported');
            for (const binding of target.workflow.bindings) {
                if (inputs.has(binding.semantic)) {
                    const reference = ir.references.find(ref => ref.purpose === binding.semantic); if (!reference) visualError('input_missing');
                    assets.push({ ...binding, reference }); graph[binding.nodeId].inputs[binding.input] = 'atria-upload-' + binding.semantic;
                } else graph[binding.nodeId].inputs[binding.input] = values[binding.semantic];
            }
            validateComfyWorkflow({ ...target.workflow, graph }, target.workflow.nodeTypes);
            return { endpoint: connection.endpoint, outputNodes: target.workflow.outputNodes, inputs: assets,
                body: { workflowId: target.workflow.id, workflow: JSON.stringify(graph), nodeInfoList: [], addMetadata: true,
                    ...(target.nativeParameters.instanceType ? { instanceType: target.nativeParameters.instanceType } : {}) },
                transforms: assets.some(input => input.semantic === 'mask') ? [{ kind: 'gray8-to-inverse-alpha-comfy-mask', explicitBoundSlot: true }] : [] };
        },
        async generate(compiled, options) {
            if (!options.secret) visualError('secret_unavailable');
            const body = structuredClone(compiled.body), graph = JSON.parse(body.workflow);
            for (const input of compiled.inputs) {
                const asset = await readImageInput(options, input.reference);
                if (asset.bytes.length > 30 * 1024 * 1024) visualError('input_limit');
                const bytes = input.semantic === 'mask' ? canonicalMaskPng(asset.bytes, compiled.maskGeometry.width, compiled.maskGeometry.height, true) : asset.bytes;
                const form = new FormData(); form.append('apiKey', options.secret); form.append('fileType', 'input');
                form.append('file', new Blob([bytes], { type: 'image/png' }), 'atria-' + options.jobId + '-' + input.semantic + '.png');
                const response = await imageJson(fetchImpl, imageRoute(compiled.endpoint, 'task/openapi/upload'), { ...options, body: form });
                const name = response.data?.fileName;
                if (response.code !== 0 || typeof name !== 'string' || name.length > 512 || /[\\\x00-\x1f]|:\/\//.test(name) || name.startsWith('/') || name.split('/').includes('..')) visualError('upload_invalid');
                graph[input.nodeId].inputs[input.input] = name;
            }
            body.workflow = JSON.stringify(graph);
            const response = await call(compiled, 'create', options, body);
            if (response.code !== 0 || !/^\d{1,32}$/.test(response.data?.taskId)) visualError('remote_receipt_invalid');
            const remote = { taskId: response.data.taskId }; await options.onRemote(remote);
            if (response.data.taskStatus === 'FAILED') visualError('remote_failed');
            let tips; try { tips = response.data.promptTips ? JSON.parse(response.data.promptTips) : null; } catch { visualError('remote_receipt_invalid'); }
            if (tips?.error || Object.keys(tips?.node_errors ?? {}).length) visualError('remote_failed');
            for (;;) { const result = await observe(compiled, remote, options); if (result) return result; await imagePollDelay(options.signal, pollMs); }
        },
        reconcile: observe,
        async cancel(compiled, remote, options) {
            const response = await call(compiled, 'cancel', options, { taskId: remote.taskId });
            return { remoteConfirmed: response.code === 0, refund: 'unknown' };
        },
    };
}
