import { renderNovelaiIllustration, novelaiConnectionCapabilities } from '../../../public/shared/novelai-illustration.js';
import { composeIllustrationPrompt } from '../../../public/shared/illustration-plugin-contract.js';
import { visualObject, visualError } from '../../../public/shared/native-visual-contract.js';
import { protocolManifest } from '../image-registry.js';
import { createNovelaiImageProvider } from './novelai-image-provider.js';
import { canonicalMaskPng, readImageInput } from './image-transport.js';
import { PNG } from 'pngjs';

function preciseReference(bytes) {
    const input = PNG.sync.read(bytes, { checkCRC: true });
    if (input.width * input.height > 16777216) visualError('input_limit');
    const width = input.width > input.height ? 1536 : input.width < input.height ? 1024 : 1472;
    const height = input.width > input.height ? 1024 : input.width < input.height ? 1536 : 1472;
    const scale = Math.min(width / input.width, height / input.height), w = Math.round(input.width * scale), h = Math.round(input.height * scale);
    const data = Buffer.alloc(width * height * 4), x0 = Math.floor((width - w) / 2), y0 = Math.floor((height - h) / 2);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const source = (Math.min(input.height - 1, Math.floor(y / scale)) * input.width + Math.min(input.width - 1, Math.floor(x / scale))) * 4;
        input.data.copy(data, ((y + y0) * width + x + x0) * 4, source, source + 4);
    }
    return PNG.sync.write({ width, height, data });
}
export function createNovelaiVisualAdapter({ fetchImpl = fetch } = {}) {
    const provider = createNovelaiImageProvider({ fetchImpl });
    return {
        describe: ({ connection, target, fingerprint }) => {
            const capabilities = novelaiConnectionCapabilities(connection);
            const model = target.model.replace(/-inpainting$/, '');
            if (!capabilities.models.some(m => m.id === model)) visualError('model_unsupported');
            const precise = model.startsWith('nai-diffusion-4-5-');
            return protocolManifest(fingerprint, { txt2img: 'supported', img2img: 'supported', inpaint: 'supported', upscale: 'supported',
                identity: precise ? 'supported' : 'unknown', style: precise ? 'supported' : 'unknown', outfit: 'unknown', vibe: 'unknown',
                lora: 'unsupported', controlnet: 'unknown', negativePrompt: 'supported', strict_inpaint_mask: 'unsupported' },
            { combinations: [{ features: ['identity', 'vibe'], state: 'unsupported', evidence: 'NovelAI Precise Reference cannot be combined with Vibe' }] });
        },
        compile({ ir, target, connection, seed }) {
            visualObject(target.nativeParameters, ['width', 'height', 'steps', 'scale', 'seed', 'sampler', 'noiseSchedule', 'sm', 'smDyn', 'strength', 'noise', 'inpaintStrength', 'referenceStrength', 'referenceInformation', 'referenceFidelity', 'upscaleBlurSigma']);
            const model = target.model.replace(/-inpainting$/, '');
            const { strength = .7, noise = 0, inpaintStrength = 1, referenceStrength = 1, referenceInformation = 1, referenceFidelity = 1, upscaleBlurSigma = 0, ...sampling } = target.nativeParameters;
            for (const value of [strength, noise, inpaintStrength, referenceStrength, referenceInformation, referenceFidelity]) if (!Number.isFinite(value) || value < 0 || value > 1) visualError('parameters_invalid');
            if (![0, .30, .35, .40, .45, .50].includes(upscaleBlurSigma)) visualError('parameters_invalid');
            const draft = { characters: ir.authoring === 'structured' ? ir.participants.map((p, index) => ({ character: { id: 'visual_' + index, name: p.actorId ?? p.provisionalId, aliases: [], fixedPrompt: p.identity, defaultClothing: '', enabled: true, storyActorId: p.actorId ?? '' }, dynamicPrompt: p.state, clothing: '' })) : [],
                scene: ir.scene, prompt: ir.prompt, preset: { style: ir.style, quality: '', negativePrompt: ir.negativePrompt, parameters: { ...sampling, model } } };
            if (ir.authoring === 'structured') draft.prompt = composeIllustrationPrompt(draft);
            const rendered = renderNovelaiIllustration(draft, novelaiConnectionCapabilities(connection), seed), body = rendered.body;
            const base = ir.references.find(ref => ref.purpose === 'base'), mask = ir.references.find(ref => ref.purpose === 'mask');
            if (['img2img', 'inpaint', 'upscale'].includes(ir.operation) && !base) visualError('input_missing');
            const transforms = [];
            if (ir.operation === 'upscale') return { endpoint: new URL('upscale', connection.endpoint).toString(), responseFormat: rendered.responseFormat,
                body: { model, image: { assetId: base.assetId, contentHash: base.contentHash }, declared_blur_sigma: upscaleBlurSigma }, transforms: [{ kind: 'generative-upscale', contentMayChange: true }] };
            if (ir.operation === 'img2img') { body.action = 'img2img'; Object.assign(body.parameters, { image: base, strength, noise, extra_noise_seed: seed }); } else if (ir.operation === 'inpaint') {
                if (!mask) visualError('mask_missing');
                body.action = 'infill'; body.model = model + '-inpainting';
                Object.assign(body.parameters, { image: base, mask, img2img: { strength: inpaintStrength, noise, extra_noise_seed: seed }, add_original_image: false });
                transforms.push({ kind: 'gray8-to-opaque-white-edit-png', modelMode: body.model });
            } else if (!['txt2img', 'regenerate'].includes(ir.operation)) visualError('operation_unsupported');
            const precise = ir.references.filter(ref => ['identity', 'style'].includes(ref.purpose));
            if (precise.length) {
                if (!model.startsWith('nai-diffusion-4-5-') || precise.length > 4 || ir.references.some(ref => ref.purpose === 'vibe')) visualError('reference_combination_unsupported');
                body.parameters.director_reference_images = precise.map(ref => ({ assetId: ref.assetId, contentHash: ref.contentHash }));
                body.parameters.director_reference_descriptions = precise.map(ref => ({ caption: { base_caption: ref.purpose === 'identity' ? 'character' : 'character&style', char_captions: [] }, use_coords: false, use_order: true }));
                body.parameters.director_reference_information_extracted = precise.map(() => referenceInformation);
                body.parameters.director_reference_strength_values = precise.map(() => referenceStrength);
                body.parameters.director_reference_secondary_strength_values = precise.map(() => referenceFidelity);
                transforms.push({ kind: 'precise-reference-black-padding', dimensions: ['1024x1536', '1536x1024', '1472x1472'] });
            }
            return { endpoint: connection.endpoint, ...rendered, transforms };
        },
        async generate(compiled, options) {
            const body = structuredClone(compiled.body), parameters = body.parameters;
            if (body.image) body.image = (await readImageInput(options, body.image)).bytes.toString('base64');
            if (parameters?.image) parameters.image = (await readImageInput(options, parameters.image)).bytes.toString('base64');
            if (parameters?.mask) {
                const mask = await readImageInput(options, parameters.mask);
                parameters.mask = canonicalMaskPng(mask.bytes, compiled.maskGeometry.width, compiled.maskGeometry.height).toString('base64');
            }
            if (parameters?.director_reference_images) parameters.director_reference_images = await Promise.all(parameters.director_reference_images.map(async ref => preciseReference((await readImageInput(options, ref)).bytes).toString('base64')));
            return provider.generate({ ...compiled, body }, options);
        },
    };
}
