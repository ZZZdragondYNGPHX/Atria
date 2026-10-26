import { visualObject, visualError, nonSecretVisualJson } from '../../../public/shared/native-visual-contract.js';
import { protocolManifest, imageSemanticPrompt } from '../image-registry.js';
import { imageEndpoint, imageRoute, imageJson, imageBase64, normalizeImage, readImageInput, canonicalMaskPng } from './image-transport.js';

const basic = secret => secret ? { Authorization: 'Basic ' + Buffer.from(secret).toString('base64') } : {};
const key = target => target.imageTargetId + '@' + target.revision;
export function createWebuiImageAdapter({ fetchImpl = fetch } = {}) {
    const observations = new Map();
    const request = (endpoint, path, secret, extra = {}) => imageJson(fetchImpl, imageRoute(endpoint, path), { secret: null, signal: AbortSignal.timeout(15000), headers: basic(secret), ...extra });
    return {
        async describe({ target, connection, fingerprint, secret }) {
            imageEndpoint(connection.endpoint);
            const [models, samplers, upscalers, scripts, openapi] = await Promise.all(['sd-models', 'samplers', 'upscalers', 'scripts', 'openapi'].map(path => request(connection.endpoint, path === 'openapi' ? 'openapi.json' : 'sdapi/v1/' + path, secret)));
            if (![models, samplers, upscalers].every(Array.isArray) || !models.some(model => [model.title, model.model_name, model.hash, model.sha256].includes(target.model))) visualError('model_unavailable');
            const paths = openapi.paths ?? {}, txt2img = !!paths['/sdapi/v1/txt2img']?.post, img2img = !!paths['/sdapi/v1/img2img']?.post;
            const controlnetInstalled = [...(scripts.txt2img ?? []), ...(scripts.img2img ?? [])].some(name => name.toLowerCase() === 'controlnet');
            let controlnet = null, loras = [];
            if (controlnetInstalled) {
                const [modelList, moduleList] = await Promise.all([request(connection.endpoint, 'controlnet/model_list', secret), request(connection.endpoint, 'controlnet/module_list', secret)]);
                if (Array.isArray(modelList.model_list) && Array.isArray(moduleList.module_list)) controlnet = { models: modelList.model_list, modules: moduleList.module_list };
            }
            if (paths['/sdapi/v1/loras']?.get) loras = await request(connection.endpoint, 'sdapi/v1/loras', secret);
            if (!Array.isArray(loras)) visualError('discovery_invalid');
            observations.set(key(target), { samplers: samplers.map(s => s.name), upscalers: upscalers.map(s => s.name), loras: loras.map(l => l.alias || l.name), controlnet });
            const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection.endpoint).hostname);
            return protocolManifest(fingerprint, { txt2img: txt2img ? 'supported' : 'unsupported', img2img: img2img ? 'supported' : 'unsupported', inpaint: img2img ? 'supported' : 'unsupported',
                strict_inpaint_mask: 'unknown', upscale: paths['/sdapi/v1/extra-single-image']?.post && upscalers.length ? 'supported' : 'unsupported',
                lora: loras.length ? 'supported' : 'unknown', controlnet: controlnet ? 'supported' : 'unsupported', structure: controlnet ? 'supported' : 'unknown',
                identity: 'unknown', outfit: 'unknown', style: 'unknown', negativePrompt: 'supported' },
            { cost: local ? { kind: 'free', currency: '', upperBound: 0 } : { kind: 'unknown', currency: '', upperBound: null },
                combinations: [{ features: ['lora', 'controlnet'], state: loras.length && controlnet ? 'supported' : 'unknown', evidence: 'installed model/module catalogs; visual combination quality not live verified' }] });
        },
        compile({ ir, target, connection, seed }) {
            const observed = observations.get(key(target)); if (!observed) visualError('capability_unknown');
            const p = nonSecretVisualJson(target.nativeParameters);
            if (p.loras !== undefined && (!Array.isArray(p.loras) || p.loras.length > 8)) visualError('parameters_invalid');
            visualObject(p, ['width', 'height', 'steps', 'cfg_scale', 'sampler_name', 'denoising_strength', 'mask_blur', 'inpainting_fill', 'inpaint_full_res', 'inpaint_full_res_padding', 'loras', 'controlnet', 'upscaler', 'scale']);
            for (const [name, min, max] of [['width', 64, 4096], ['height', 64, 4096], ['steps', 1, 100], ['mask_blur', 0, 64], ['inpaint_full_res_padding', 0, 512]]) if (p[name] !== undefined && (!Number.isInteger(p[name]) || p[name] < min || p[name] > max)) visualError('parameters_invalid');
            if ((p.width ?? 832) * (p.height ?? 1216) > 16777216 || p.cfg_scale !== undefined && (!Number.isFinite(p.cfg_scale) || p.cfg_scale < 0 || p.cfg_scale > 30)
                || p.denoising_strength !== undefined && (!Number.isFinite(p.denoising_strength) || p.denoising_strength < 0 || p.denoising_strength > 1)
                || p.sampler_name && !observed.samplers.includes(p.sampler_name) || p.inpainting_fill !== undefined && ![0, 1, 2, 3].includes(p.inpainting_fill)
                || p.inpaint_full_res !== undefined && typeof p.inpaint_full_res !== 'boolean') visualError('parameters_invalid');
            const base = ir.references.find(ref => ref.purpose === 'base'), mask = ir.references.find(ref => ref.purpose === 'mask'), structure = ir.references.find(ref => ref.purpose === 'structure');
            if (['img2img', 'inpaint', 'upscale'].includes(ir.operation) && !base || ir.operation === 'inpaint' && !mask) visualError('input_missing');
            if (ir.references.some(ref => !['base', 'mask', 'structure'].includes(ref.purpose))) visualError('reference_unsupported');
            const transforms = [];
            if (ir.operation === 'upscale') {
                if (!observed.upscalers.includes(p.upscaler) || !Number.isFinite(p.scale ?? 2) || (p.scale ?? 2) <= 1 || (p.scale ?? 2) > 4) visualError('upscaler_unavailable');
                return { endpoint: imageRoute(connection.endpoint, 'sdapi/v1/extra-single-image'), body: { image: base, resize_mode: 0, upscaling_resize: p.scale ?? 2, upscaler_1: p.upscaler, show_extras_results: true }, transforms: [{ kind: 'upscale', contentMayChange: true }] };
            }
            if (!['txt2img', 'regenerate', 'img2img', 'inpaint'].includes(ir.operation)) visualError('operation_unsupported');
            let prompt = imageSemanticPrompt(ir);
            for (const lora of p.loras ?? []) {
                visualObject(lora, ['name', 'weight']);
                if (!observed.loras.includes(lora.name) || !/^[A-Za-z0-9_. -]{1,256}$/.test(lora.name) || !Number.isFinite(lora.weight) || Math.abs(lora.weight) > 2) visualError('lora_unavailable');
                prompt += ' <lora:' + lora.name + ':' + lora.weight + '>'; transforms.push({ kind: 'native-lora', name: lora.name, weight: lora.weight });
            }
            const body = { prompt, negative_prompt: ir.negativePrompt, seed, width: p.width ?? 832, height: p.height ?? 1216, steps: p.steps ?? 28, cfg_scale: p.cfg_scale ?? 7,
                sampler_name: p.sampler_name ?? observed.samplers[0], batch_size: 1, n_iter: 1, save_images: false, send_images: true,
                override_settings: { sd_model_checkpoint: target.model }, override_settings_restore_afterwards: true };
            if (base) Object.assign(body, { init_images: [base], denoising_strength: p.denoising_strength ?? .7 });
            if (mask) { Object.assign(body, { mask, mask_blur: p.mask_blur ?? 0, inpainting_mask_invert: 0, inpainting_fill: p.inpainting_fill ?? 1, inpaint_full_res: p.inpaint_full_res ?? false, inpaint_full_res_padding: p.inpaint_full_res_padding ?? 32 }); transforms.push({ kind: 'gray8-to-opaque-white-edit-png' }); }
            if (structure) {
                visualObject(p.controlnet, ['model', 'module', 'weight']);
                if (!observed.controlnet?.models.includes(p.controlnet.model) || !observed.controlnet.modules.includes(p.controlnet.module) || !Number.isFinite(p.controlnet.weight ?? 1) || (p.controlnet.weight ?? 1) < 0 || (p.controlnet.weight ?? 1) > 2) visualError('controlnet_unavailable');
                body.alwayson_scripts = { ControlNet: { args: [{ enabled: true, model: p.controlnet.model, module: p.controlnet.module, weight: p.controlnet.weight ?? 1, image: structure, resize_mode: 'Crop and Resize' }] } };
            } else if (p.controlnet) visualError('controlnet_input_missing');
            return { endpoint: imageRoute(connection.endpoint, base ? 'sdapi/v1/img2img' : 'sdapi/v1/txt2img'), body, transforms };
        },
        async generate(compiled, options) {
            const body = structuredClone(compiled.body), read = async ref => (await readImageInput(options, ref)).bytes.toString('base64');
            if (body.image) body.image = await read(body.image);
            if (body.init_images) body.init_images = await Promise.all(body.init_images.map(read));
            if (body.mask) body.mask = (await canonicalMaskPng((await readImageInput(options, body.mask)).bytes, compiled.maskGeometry.width, compiled.maskGeometry.height)).toString('base64');
            if (body.alwayson_scripts) body.alwayson_scripts.ControlNet.args[0].image = await read(body.alwayson_scripts.ControlNet.args[0].image);
            const response = await imageJson(fetchImpl, compiled.endpoint, { ...options, secret: null, headers: basic(options.secret), body, jsonLimit: 48 * 1024 * 1024 });
            const images = response.image ? [response.image] : response.images;
            if (!Array.isArray(images) || images.length !== 1) visualError('result_count_invalid');
            return normalizeImage(imageBase64(images[0]));
        },
        // WebUI's global interrupt is not an owner-scoped cancellation API.
    };
}
