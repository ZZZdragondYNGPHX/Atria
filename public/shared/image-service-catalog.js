import { NOVELAI_IMAGE_ADAPTERS, novelaiConnectionCapabilities, novelaiModelPlan } from './novelai-illustration.js';

// Product-level facts about image services shared by adapters and the
// illustration setup. Adapters remain the protocol authority.
export const OPENAI_IMAGE_MODELS = Object.freeze(['gpt-image-1', 'gpt-image-1-mini', 'gpt-image-1.5', 'gpt-image-2', 'gpt-image-2-2026-04-21',
    'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst-2026-09-08', 'gpt-image-2.5-flare-2026-09-08']);
export const GEMINI_IMAGE_MODELS = Object.freeze(['gemini-2.5-flash-image', 'gemini-3-pro-image', 'gemini-3-pro-image-preview', 'gemini-3.1-flash-image',
    'gemini-3.1-flash-image-preview', 'gemini-3.1-flash-lite-image', 'gemini-nano-banana-2.1']);
export const IMAGE_ADAPTERS = Object.freeze(['provider.novelai-image', 'provider.novelai-image-compatible', 'provider.openai-images', 'provider.gemini-image',
    'provider.comfyui-image', 'provider.sd-webui-image', 'provider.forge-image', 'provider.runninghub-image']);
const WORKFLOW_ADAPTERS = new Set(['provider.comfyui-image', 'provider.runninghub-image']);
const NO_NEGATIVE = new Set(['provider.openai-images', 'provider.gemini-image']);

export const isImageAdapter = adapter => IMAGE_ADAPTERS.includes(adapter);
export const needsWorkflow = adapter => WORKFLOW_ADAPTERS.has(adapter);
export const supportsNegativePrompt = adapter => !NO_NEGATIVE.has(adapter);

/** Models the user can pick from; an empty list means the model name is typed. */
export function imageModelChoices(connection) {
    const adapter = connection?.providerAdapter;
    if (NOVELAI_IMAGE_ADAPTERS.includes(adapter)) {
        try { return novelaiConnectionCapabilities(connection).models.map(model => model.id); } catch { return []; }
    }
    if (adapter === 'provider.openai-images') return [...OPENAI_IMAGE_MODELS];
    if (adapter === 'provider.gemini-image') return [...GEMINI_IMAGE_MODELS];
    return [];
}
export function defaultImageModel(connection) {
    const choices = imageModelChoices(connection);
    const preferred = { 'provider.novelai-image': 'nai-diffusion-4-5-full', 'provider.openai-images': 'gpt-image-1', 'provider.gemini-image': 'gemini-2.5-flash-image' }[connection?.providerAdapter];
    return choices.includes(preferred) ? preferred : choices[0] ?? '';
}

export const IMAGE_ASPECTS = Object.freeze(['portrait', 'landscape', 'square']);
export const OPENAI_FIXED_SIZES = Object.freeze(['1024x1024', '1536x1024', '1024x1536']);
export const GEMINI_ASPECT_RATIOS = Object.freeze(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);
const SIZES = { portrait: [832, 1216], landscape: [1216, 832], square: [1024, 1024] };
const OPENAI_PRESETS = { portrait: '1024x1536', landscape: '1536x1024', square: '1024x1024' };
const GEMINI_PRESETS = { portrait: '2:3', landscape: '3:2', square: '1:1' };

/** The model a request is actually sent with, which request quotas are counted against (V5 Full Medium differs from High). */
export function imageQuotaModelFor(connection, target) {
    if (!target) return '';
    if (NOVELAI_IMAGE_ADAPTERS.includes(connection?.providerAdapter)) {
        try { return novelaiModelPlan(novelaiConnectionCapabilities(connection), { model: target.model, tier: target.nativeParameters?.tier }).model; } catch { return target.model; }
    }
    return target.model;
}
/** NovelAI quality tiers of a model (V5 Full: High / Medium), or none. */
export function imageModelTiers(connection, model) {
    if (!NOVELAI_IMAGE_ADAPTERS.includes(connection?.providerAdapter)) return [];
    try { return novelaiConnectionCapabilities(connection).models.find(item => item.id === model)?.tiers?.map(tier => tier.id) ?? []; } catch { return []; }
}
/**
 * How a model sizes its images. 'pixels': free width × height on a grid within limits;
 * 'fixed': a list of sizes; 'ratio': named aspect ratios (and optional output sizes).
 * Adapters enforce the same rules; this is what the setup offers.
 */
export function imageSizeRule(connection, model = '') {
    const adapter = connection?.providerAdapter;
    if (NOVELAI_IMAGE_ADAPTERS.includes(adapter)) {
        let maxPixels = 4194304;
        try { maxPixels = novelaiConnectionCapabilities(connection).models.find(item => item.id === model)?.maxPixels ?? maxPixels; } catch { /* unconfigured relay */ }
        return { kind: 'pixels', step: 64, min: 64, maxWidth: 8192, maxHeight: 8192, maxPixels };
    }
    if (adapter === 'provider.openai-images') return model.startsWith('gpt-image-2')
        ? { kind: 'pixels', step: 16, min: 16, maxWidth: 3840, maxHeight: 2160, maxPixels: 8294400, minRatio: 1 / 3, maxRatio: 3, sizes: OPENAI_FIXED_SIZES }
        : { kind: 'fixed', sizes: OPENAI_FIXED_SIZES };
    if (adapter === 'provider.gemini-image') return { kind: 'ratio', ratios: GEMINI_ASPECT_RATIOS, imageSizes: model === 'gemini-2.5-flash-image' ? [] : ['1K', '2K', '4K'] };
    return { kind: 'pixels', step: 8, min: 64, maxWidth: 8192, maxHeight: 8192, maxPixels: 16777216 };
}
/** First rule a width × height breaks: 'invalid', 'step', 'small', 'large', 'pixels' or 'ratio'; null when allowed. */
export function imageSizeProblem(rule, width, height) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) return 'invalid';
    if (rule.kind === 'fixed') return rule.sizes.includes(width + 'x' + height) ? null : 'invalid';
    if (rule.kind !== 'pixels') return 'invalid';
    if (rule.sizes?.includes(width + 'x' + height)) return null;
    if (width % rule.step || height % rule.step) return 'step';
    if (width < rule.min || height < rule.min) return 'small';
    if (width > rule.maxWidth || height > rule.maxHeight) return 'large';
    if (width * height > rule.maxPixels) return 'pixels';
    if (rule.minRatio && (width / height < rule.minRatio || width / height > rule.maxRatio)) return 'ratio';
    return null;
}
/** Current size of a target: { width, height } or { ratio, imageSize }. */
export function imageSizeOf(adapter, parameters = {}) {
    if (adapter === 'provider.gemini-image') return { ratio: parameters.aspectRatio ?? '1:1', imageSize: parameters.imageSize ?? '' };
    if (adapter === 'provider.openai-images') { const [width, height] = String(parameters.size ?? '1024x1024').split('x').map(Number); return { width, height }; }
    return { width: parameters.width ?? 832, height: parameters.height ?? 1216 };
}
/** Target parameters for an exact size, without touching unrelated parameters. */
export function imageSizeParameters(adapter, size, current = {}) {
    const next = { ...current };
    if (adapter === 'provider.gemini-image') { next.aspectRatio = size.ratio; if (size.imageSize) next.imageSize = size.imageSize; else delete next.imageSize; } else if (adapter === 'provider.openai-images') next.size = size.width + 'x' + size.height;
    else { next.width = size.width; next.height = size.height; }
    return next;
}
/** Returns target parameters for a preset shape without touching unrelated parameters. */
export function imageAspectParameters(adapter, aspect, current = {}) {
    if (adapter === 'provider.openai-images') return { ...current, size: OPENAI_PRESETS[aspect] };
    if (adapter === 'provider.gemini-image') { const next = { ...current, aspectRatio: GEMINI_PRESETS[aspect] }; return next; }
    const [width, height] = SIZES[aspect];
    return { ...current, width, height };
}
/** The preset a target matches, or 'custom'. */
export function imageAspectOf(adapter, parameters = {}) {
    if (adapter === 'provider.openai-images') return Object.keys(OPENAI_PRESETS).find(key => OPENAI_PRESETS[key] === (parameters.size ?? '1024x1024')) ?? 'custom';
    if (adapter === 'provider.gemini-image') return Object.keys(GEMINI_PRESETS).find(key => GEMINI_PRESETS[key] === (parameters.aspectRatio ?? '1:1')) ?? 'custom';
    const width = parameters.width ?? 832, height = parameters.height ?? 1216;
    return Object.keys(SIZES).find(key => SIZES[key][0] === width && SIZES[key][1] === height) ?? 'custom';
}
/** Closest preset shape for a size, used when a model change invalidates a custom size. */
export const imageOrientation = ({ width, height }) => width === height ? 'square' : width > height ? 'landscape' : 'portrait';
