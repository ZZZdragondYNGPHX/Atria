import { visualObject, visualError } from '../../../public/shared/native-visual-contract.js';
import { protocolManifest, imageSemanticPrompt } from '../image-registry.js';
import { OPENAI_IMAGE_MODELS, imageSizeRule, imageSizeProblem, openaiChatImageApi } from '../../../public/shared/image-service-catalog.js';
import { imageEndpoint, imageRoute, imageJson, imageFetch, boundedImageBytes, imageBase64, normalizeImage, canonicalMaskPng, readImageInput } from './image-transport.js';

const models = new Set(OPENAI_IMAGE_MODELS);
const imageUri = /data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)/;
// Chat-completions image relays answer with an SSE stream (or one JSON completion) whose
// assistant content carries the picture as a data: URI.
function chatImage(text) {
    let content = '';
    const take = value => {
        if (value?.error) visualError('remote_failed');
        for (const choice of value?.choices ?? []) content += choice.delta?.content ?? choice.message?.content ?? '';
    };
    const events = text.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).filter(data => data && data !== '[DONE]');
    try { if (events.length) events.forEach(data => take(JSON.parse(data))); else take(JSON.parse(text)); } catch (error) { if (error.code) throw error; visualError('response_invalid'); }
    const match = content.match(imageUri);
    if (!match) visualError('response_invalid');
    return imageBase64(match[1]);
}
export function createOpenaiImageAdapter({ fetchImpl = fetch } = {}) {
    return {
        describe: ({ target, connection, fingerprint }) => {
            imageEndpoint(connection.endpoint);
            visualObject(connection.options ?? {}, ['imageApi', 'allowInsecureHttp']);
            if (![undefined, 'chat-completions'].includes(connection.options?.imageApi)) visualError('connection_invalid');
            if (openaiChatImageApi(connection)) {
                // Relays name their own models; edits are not part of the chat image protocol.
                if (typeof target.model !== 'string' || !target.model.trim() || target.model.length > 256) visualError('model_unknown');
                return protocolManifest(fingerprint, { txt2img: 'supported', img2img: 'unsupported', inpaint: 'unsupported', strict_inpaint_mask: 'unsupported', outpaint: 'unsupported',
                    upscale: 'unsupported', identity: 'unsupported', outfit: 'unsupported', style: 'unsupported', multi_image: 'unsupported', lora: 'unsupported', controlnet: 'unsupported', negativePrompt: 'unsupported' });
            }
            if (!models.has(target.model)) visualError('model_unknown');
            return protocolManifest(fingerprint, { txt2img: 'supported', img2img: 'supported', inpaint: 'supported',
                strict_inpaint_mask: 'unsupported', outpaint: 'unknown', upscale: 'unsupported', identity: 'supported', outfit: 'supported', style: 'supported', multi_image: 'supported', lora: 'unsupported', controlnet: 'unsupported', negativePrompt: 'unsupported' });
        },
        compile({ ir, target, connection }) {
            const chat = openaiChatImageApi(connection), insecure = connection.options?.allowInsecureHttp === true ? { allowInsecureHttp: true } : {};
            visualObject(target.nativeParameters, chat ? ['size'] : ['size', 'quality', 'background', 'input_fidelity', 'moderation']);
            if (ir.negativePrompt) visualError('negative_prompt_unsupported');
            if (!['txt2img', 'regenerate', 'img2img', 'inpaint'].includes(ir.operation)) visualError('operation_unsupported');
            const p = target.nativeParameters;
            if (p.quality && !['auto', 'low', 'medium', 'high', ...(target.model.includes('2.5') ? ['xhigh', 'max'] : [])].includes(p.quality)
                || p.background && !['auto', 'opaque', 'transparent'].includes(p.background)
                || p.moderation && !['auto', 'low'].includes(p.moderation)) visualError('parameters_invalid');
            if (p.input_fidelity && (target.model.startsWith('gpt-image-2') || !['low', 'high'].includes(p.input_fidelity)
                || target.model === 'gpt-image-1-mini' && p.input_fidelity !== 'low')) visualError('parameters_unsupported');
            const size = p.size ?? '1024x1024';
            if (size !== 'auto') {
                const [width, height] = size.split('x').map(Number);
                if (imageSizeProblem(imageSizeRule(connection, target.model), width, height)) visualError('geometry_unsupported');
            }
            const images = ir.references.filter(ref => ref.purpose !== 'mask'), mask = ir.references.find(ref => ref.purpose === 'mask');
            if (chat) {
                if (images.length || mask || !['txt2img', 'regenerate'].includes(ir.operation)) visualError('operation_unsupported');
                return { endpoint: imageRoute(connection.endpoint, 'chat/completions'), protocol: 'chat-completions', ...insecure,
                    body: { model: target.model, messages: [{ role: 'user', content: imageSemanticPrompt(ir) }], size, stream: true }, transforms: [] };
            }
            if (images.length > 16 || ['img2img', 'inpaint'].includes(ir.operation) && !images.length || ir.operation === 'inpaint' && !mask) visualError('input_missing');
            const edit = images.length > 0;
            if (p.input_fidelity && !edit) visualError('parameters_unsupported');
            return { endpoint: imageRoute(connection.endpoint, edit ? 'images/edits' : 'images/generations'), ...insecure,
                body: { model: target.model, prompt: imageSemanticPrompt(ir), n: 1, size, output_format: 'png', ...p,
                    ...(edit ? { images: images.map(ref => ({ assetId: ref.assetId, contentHash: ref.contentHash })) } : {}),
                    ...(mask ? { mask: { assetId: mask.assetId, contentHash: mask.contentHash } } : {}) },
                transforms: mask ? [{ kind: 'gray8-to-inverse-alpha', semantics: 'mask guides edit; no provider pixel-preservation guarantee' }] : [] };
        },
        async generate(compiled, options) {
            const transport = { ...options, allowInsecureHttp: compiled.allowInsecureHttp === true };
            if (compiled.protocol === 'chat-completions') {
                const response = await imageFetch(fetchImpl, compiled.endpoint, { ...transport, body: compiled.body });
                return normalizeImage(chatImage((await boundedImageBytes(response, options.signal, 48 * 1024 * 1024)).toString('utf8')));
            }
            const body = structuredClone(compiled.body);
            if (body.images) body.images = await Promise.all(body.images.map(async ref => {
                const input = await readImageInput(options, ref);
                return { image_url: 'data:' + input.ref.mediaType + ';base64,' + input.bytes.toString('base64') };
            }));
            if (body.mask) {
                const input = await readImageInput(options, body.mask), png = await canonicalMaskPng(input.bytes, compiled.maskGeometry.width, compiled.maskGeometry.height, true);
                body.mask = { image_url: 'data:image/png;base64,' + png.toString('base64') };
            }
            const response = await imageJson(fetchImpl, compiled.endpoint, { ...transport, body, jsonLimit: 48 * 1024 * 1024 });
            if (!Array.isArray(response.data) || response.data.length !== 1 || !response.data[0].b64_json) visualError('response_invalid');
            return normalizeImage(imageBase64(response.data[0].b64_json));
        },
    };
}
