import { visualObject, visualError } from '../../../public/shared/native-visual-contract.js';
import { protocolManifest, imageSemanticPrompt } from '../image-registry.js';
import { imageEndpoint, imageRoute, imageJson, imageBase64, normalizeImage, readImageInput } from './image-transport.js';

const models = new Set(['gemini-2.5-flash-image', 'gemini-3-pro-image', 'gemini-3-pro-image-preview', 'gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-3.1-flash-lite-image', 'gemini-nano-banana-2.1']);
const ratios = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);
// The documented GenerateContent image protocol is distinct from text Routes.
// Semantic editing is never advertised as a Canonical Mask operation.
export function createGeminiImageAdapter({ fetchImpl = fetch } = {}) {
    return {
        describe({ target, connection, fingerprint }) {
            imageEndpoint(connection.endpoint);
            if (!models.has(target.model)) visualError('model_unknown');
            return protocolManifest(fingerprint, { txt2img: 'supported', img2img: 'supported', semantic_image_edit: 'supported', inpaint: 'unsupported', strict_inpaint_mask: 'unsupported',
                upscale: 'unsupported', identity: 'supported', outfit: 'supported', style: 'supported', structure: 'supported', lora: 'unsupported', controlnet: 'unsupported', negativePrompt: 'unsupported' });
        },
        compile({ ir, target, connection }) {
            visualObject(target.nativeParameters, ['aspectRatio', 'imageSize']);
            if (!models.has(target.model)) visualError('model_unknown');
            if (ir.negativePrompt || !['txt2img', 'regenerate', 'img2img'].includes(ir.operation) || ir.references.some(ref => ref.purpose === 'mask')) visualError('operation_unsupported');
            const parameters = target.nativeParameters;
            if (parameters.aspectRatio && !ratios.has(parameters.aspectRatio) || parameters.imageSize && (!['1K', '2K', '4K'].includes(parameters.imageSize) || target.model === 'gemini-2.5-flash-image')) visualError('parameters_unsupported');
            const maxImages = target.model === 'gemini-2.5-flash-image' || target.model === 'gemini-3.1-flash-lite-image' ? 3 : 14;
            if (ir.references.length > maxImages || ir.operation === 'img2img' && !ir.references.some(ref => ref.purpose === 'base')) visualError('input_invalid');
            return { endpoint: imageRoute(connection.endpoint, 'models/' + encodeURIComponent(target.model) + ':generateContent'),
                body: { contents: [{ role: 'user', parts: [{ text: imageSemanticPrompt(ir) }, ...ir.references.map(ref => ({ assetId: ref.assetId, contentHash: ref.contentHash }))] }],
                    generationConfig: { candidateCount: 1, responseModalities: ['TEXT', 'IMAGE'], ...(Object.keys(parameters).length ? { imageConfig: parameters } : {}) } },
                transforms: ir.references.length ? [{ kind: 'gemini-semantic-image-edit', pixelPreservation: false }] : [] };
        },
        async generate(compiled, options) {
            const body = structuredClone(compiled.body);
            body.contents[0].parts = await Promise.all(body.contents[0].parts.map(async part => {
                if (part.text !== undefined) return part;
                const input = await readImageInput(options, part);
                return { inlineData: { mimeType: input.ref.mediaType, data: input.bytes.toString('base64') } };
            }));
            const response = await imageJson(fetchImpl, compiled.endpoint, { ...options, secret: null, headers: options.secret ? { 'x-goog-api-key': options.secret } : {}, body, jsonLimit: 48 * 1024 * 1024 });
            if (!Array.isArray(response.candidates) || response.candidates.length !== 1 || response.promptFeedback?.blockReason) visualError('response_invalid');
            const candidate = response.candidates[0];
            if (candidate.finishReason && candidate.finishReason !== 'STOP') visualError('response_invalid');
            const images = (candidate.content?.parts ?? []).filter(part => part.inlineData?.mimeType?.startsWith('image/'));
            if (images.length !== 1) visualError('result_count_invalid');
            return normalizeImage(imageBase64(images[0].inlineData.data));
        },
    };
}
