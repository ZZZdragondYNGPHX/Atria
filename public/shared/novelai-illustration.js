import { assertIllustrationDraft, composeIllustrationPrompt } from './illustration-plugin-contract.js';

export const NOVELAI_IMAGE_ENDPOINT = 'https://image.novelai.net/ai/generate-image';
export const NOVELAI_IMAGE_ADAPTERS = ['provider.novelai-image', 'provider.novelai-image-compatible'];
const fail = code => { throw Object.assign(new Error(code), { code }); };
const base = { maxPixels: 4194304, maxSteps: 50, samplers: ['k_euler', 'k_euler_ancestral', 'k_dpmpp_2s_ancestral', 'k_dpmpp_2m', 'k_dpmpp_sde', 'ddim_v3'], noiseSchedules: ['native', 'karras', 'exponential', 'polyexponential'] };
// Deliberately scoped to the verified V3/V4/V4.5 text-to-image protocol.
export const officialNovelaiCapabilities = () => ({ responseFormat: 'zip', models: [
    { ...base, id: 'nai-diffusion-3', characterPrompts: false, sm: true },
    ...['nai-diffusion-4-curated-preview', 'nai-diffusion-4-full', 'nai-diffusion-4-5-curated', 'nai-diffusion-4-5-full'].map(id => ({ ...base, id, characterPrompts: true, sm: false })),
] });
export function assertNovelaiCapabilities(value) {
    if (!value || Object.keys(value).some(key => !['responseFormat', 'models'].includes(key)) || !['zip', 'json', 'png'].includes(value.responseFormat)
        || !Array.isArray(value.models) || !value.models.length || value.models.length > 64) fail('native_illustration_capabilities_invalid');
    const ids = new Set();
    for (const model of value.models) {
        if (!model || Object.keys(model).some(key => !['id', 'characterPrompts', 'sm', 'maxPixels', 'maxSteps', 'samplers', 'noiseSchedules'].includes(key))
            || typeof model.id !== 'string' || !/^[a-zA-Z0-9_.-]{1,128}$/.test(model.id) || ids.has(model.id)
            || typeof model.characterPrompts !== 'boolean' || typeof model.sm !== 'boolean'
            || !Number.isSafeInteger(model.maxPixels) || model.maxPixels < 4096 || model.maxPixels > 16777216
            || !Number.isSafeInteger(model.maxSteps) || model.maxSteps < 1 || model.maxSteps > 100) fail('native_illustration_capabilities_invalid');
        ids.add(model.id);
        for (const key of ['samplers', 'noiseSchedules']) if (!Array.isArray(model[key]) || !model[key].length || model[key].length > 32
            || model[key].some(item => typeof item !== 'string' || !/^[a-zA-Z0-9_.-]{1,128}$/.test(item))) fail('native_illustration_capabilities_invalid');
    }
    return structuredClone(value);
}
export function novelaiConnectionCapabilities(connection) {
    if (!connection || !NOVELAI_IMAGE_ADAPTERS.includes(connection.providerAdapter) || connection.transport !== 'transport.http'
        || Object.keys(connection.networkPolicy ?? {}).length) fail('native_illustration_connection_invalid');
    const address = new URL(connection.endpoint);
    if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password || address.search || address.hash) fail('native_illustration_connection_invalid');
    if (connection.providerAdapter === 'provider.novelai-image') {
        if (address.toString() !== NOVELAI_IMAGE_ENDPOINT || Object.keys(connection.options ?? {}).length) fail('native_illustration_connection_invalid');
        return officialNovelaiCapabilities();
    }
    if (Object.keys(connection.options ?? {}).some(key => key !== 'imageCapabilities')) fail('native_illustration_connection_invalid');
    return assertNovelaiCapabilities(connection.options?.imageCapabilities);
}

export function renderNovelaiIllustration(draft, capabilities, seed) {
    draft = assertIllustrationDraft(draft);
    capabilities = assertNovelaiCapabilities(capabilities);
    if (!draft.prompt.trim()) fail('native_illustration_prompt_empty');
    const authored = draft.preset.parameters;
    const model = authored.model || capabilities.models[0].id;
    const capability = capabilities.models.find(item => item.id === model);
    if (!capability) fail('native_illustration_model_unsupported');
    const width = authored.width ?? 832, height = authored.height ?? 1216, steps = authored.steps ?? 28;
    const sampler = authored.sampler || capability.samplers[0], noiseSchedule = authored.noiseSchedule || capability.noiseSchedules[0];
    if (width % 64 || height % 64 || width * height > capability.maxPixels || steps > capability.maxSteps
        || !capability.samplers.includes(sampler) || !capability.noiseSchedules.includes(noiseSchedule)
        || (!capability.sm && (authored.sm || authored.smDyn)) || (authored.smDyn && !authored.sm)) fail('native_illustration_parameters_unsupported');
    const actualSeed = authored.seed === undefined || authored.seed === -1 ? seed : authored.seed;
    if (!Number.isSafeInteger(actualSeed) || actualSeed < 0 || actualSeed > 4294967295) fail('native_illustration_parameters_unsupported');
    const structured = capability.characterPrompts && draft.characters.length > 0 && draft.prompt === composeIllustrationPrompt(draft);
    if (structured && draft.characters.length > 6) fail('native_illustration_characters_unsupported');
    const input = structured ? [draft.preset.style, draft.preset.quality, draft.scene].filter(Boolean).join(', ') : draft.prompt;
    const negative = draft.preset.negativePrompt;
    const parameters = { params_version: 3, width, height, steps, scale: authored.scale ?? 5, seed: actualSeed,
        sampler, noise_schedule: noiseSchedule, n_samples: 1, negative_prompt: negative, qualityToggle: false, ucPreset: 0,
        deliberate_euler_ancestral_bug: false, prefer_brownian: true, legacy: false, legacy_v3_extend: false };
    if (capability.sm) Object.assign(parameters, { sm: authored.sm ?? false, sm_dyn: authored.smDyn ?? false });
    if (capability.characterPrompts) {
        parameters.v4_prompt = { caption: { base_caption: input, char_captions: structured ? draft.characters.map(item => ({
            char_caption: [item.character.fixedPrompt, item.clothing, item.dynamicPrompt].filter(Boolean).join(', '), centers: [{ x: 0.5, y: 0.5 }],
        })) : [] }, use_coords: false, use_order: true };
        parameters.v4_negative_prompt = { caption: { base_caption: negative, char_captions: [] }, legacy_uc: false };
    }
    return { body: { action: 'generate', input, model, parameters }, promptMode: structured ? 'characters' : 'direct', responseFormat: capabilities.responseFormat };
}
