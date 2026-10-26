import { visualObject, visualError } from '../../../public/shared/native-visual-contract.js';
import { protocolManifest, imageSemanticPrompt } from '../image-registry.js';
import { imageEndpoint, imageRoute, imageJson, imageBase64, normalizeImage, canonicalMaskPng, readImageInput } from './image-transport.js';

const models = new Set(['gpt-image-1', 'gpt-image-1-mini', 'gpt-image-1.5', 'gpt-image-2', 'gpt-image-2-2026-04-21',
    'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst-2026-09-08', 'gpt-image-2.5-flare-2026-09-08']);
export function createOpenaiImageAdapter({ fetchImpl = fetch } = {}) {
    return {
        describe: ({ target, connection, fingerprint }) => {
            imageEndpoint(connection.endpoint);
            if (!models.has(target.model)) visualError('model_unknown');
            return protocolManifest(fingerprint, { txt2img: 'supported', img2img: 'supported', inpaint: 'supported',
                strict_inpaint_mask: 'unsupported', outpaint: 'unknown', upscale: 'unsupported', identity: 'supported', outfit: 'supported', style: 'supported', multi_image: 'supported', lora: 'unsupported', controlnet: 'unsupported', negativePrompt: 'unsupported' });
        },
        compile({ ir, target, connection }) {
            visualObject(target.nativeParameters, ['size', 'quality', 'background', 'input_fidelity', 'moderation']);
            if (ir.negativePrompt) visualError('negative_prompt_unsupported');
            if (!['txt2img', 'regenerate', 'img2img', 'inpaint'].includes(ir.operation)) visualError('operation_unsupported');
            const p = target.nativeParameters;
            if (p.quality && !['auto', 'low', 'medium', 'high', ...(target.model.includes('2.5') ? ['xhigh', 'max'] : [])].includes(p.quality)
                || p.background && !['auto', 'opaque', 'transparent'].includes(p.background)
                || p.moderation && !['auto', 'low'].includes(p.moderation)) visualError('parameters_invalid');
            if (p.input_fidelity && (target.model.startsWith('gpt-image-2') || !['low', 'high'].includes(p.input_fidelity)
                || target.model === 'gpt-image-1-mini' && p.input_fidelity !== 'low')) visualError('parameters_unsupported');
            const size = p.size ?? '1024x1024';
            if (!['auto', '1024x1024', '1536x1024', '1024x1536'].includes(size)) {
                const match = /^(\d{2,4})x(\d{2,4})$/.exec(size), width = Number(match?.[1]), height = Number(match?.[2]);
                if (!target.model.startsWith('gpt-image-2') || !match || width % 16 || height % 16 || width > 3840 || height > 2160 || width * height > 8294400 || width / height < 1 / 3 || width / height > 3) visualError('geometry_unsupported');
            }
            const images = ir.references.filter(ref => ref.purpose !== 'mask'), mask = ir.references.find(ref => ref.purpose === 'mask');
            if (images.length > 16 || ['img2img', 'inpaint'].includes(ir.operation) && !images.length || ir.operation === 'inpaint' && !mask) visualError('input_missing');
            const edit = images.length > 0;
            if (p.input_fidelity && !edit) visualError('parameters_unsupported');
            return { endpoint: imageRoute(connection.endpoint, edit ? 'images/edits' : 'images/generations'),
                body: { model: target.model, prompt: imageSemanticPrompt(ir), n: 1, size, output_format: 'png', ...p,
                    ...(edit ? { images: images.map(ref => ({ assetId: ref.assetId, contentHash: ref.contentHash })) } : {}),
                    ...(mask ? { mask: { assetId: mask.assetId, contentHash: mask.contentHash } } : {}) },
                transforms: mask ? [{ kind: 'gray8-to-inverse-alpha', semantics: 'mask guides edit; no provider pixel-preservation guarantee' }] : [] };
        },
        async generate(compiled, options) {
            const body = structuredClone(compiled.body);
            if (body.images) body.images = await Promise.all(body.images.map(async ref => {
                const input = await readImageInput(options, ref);
                return { image_url: 'data:' + input.ref.mediaType + ';base64,' + input.bytes.toString('base64') };
            }));
            if (body.mask) {
                const input = await readImageInput(options, body.mask), png = await canonicalMaskPng(input.bytes, compiled.maskGeometry.width, compiled.maskGeometry.height, true);
                body.mask = { image_url: 'data:image/png;base64,' + png.toString('base64') };
            }
            const response = await imageJson(fetchImpl, compiled.endpoint, { ...options, body, jsonLimit: 48 * 1024 * 1024 });
            if (!Array.isArray(response.data) || response.data.length !== 1 || !response.data[0].b64_json) visualError('response_invalid');
            return normalizeImage(imageBase64(response.data[0].b64_json));
        },
    };
}
