import { assertIllustrationDraft, composeIllustrationPrompt } from './illustration-plugin-contract.js';

export const NOVELAI_IMAGE_ENDPOINT = 'https://image.novelai.net/ai/generate-image';
export const NOVELAI_IMAGE_ADAPTERS = ['provider.novelai-image', 'provider.novelai-image-compatible'];
const fail = code => { throw Object.assign(new Error(code), { code }); };
const SCHEDULES = ['native', 'karras', 'exponential', 'polyexponential'];
// Supported: NovelAI Diffusion 4.5 and 5. Every model takes V4-style prompts with per-character captions.
const v45 = { maxPixels: 4194304, maxSteps: 50, samplers: ['k_euler', 'k_euler_ancestral', 'k_dpmpp_2s_ancestral', 'k_dpmpp_2m', 'k_dpmpp_sde', 'ddim_v3'], noiseSchedules: SCHEDULES };
// V5 has no DDIM and sends no noise schedule unless the reader picks one.
const v5 = { ...v45, protocolVersion: 5, defaultSteps: 23, samplers: ['k_euler_ancestral', 'k_euler', 'k_dpmpp_2s_ancestral', 'k_dpmpp_2m', 'k_dpmpp_sde'] };
// Per-model protocol declarations; live availability is independently verified.
// V5 Full has two quality tiers that are separate model ids, not a request field:
// Medium is the distilled model (14 steps, Euler Ancestral, locked).
export const officialNovelaiCapabilities = () => ({ responseFormat: 'zip', models: [
    { ...v45, id: 'nai-diffusion-4-5-curated' },
    { ...v45, id: 'nai-diffusion-4-5-full' },
    { ...v5, id: 'nai-diffusion-5-curated' },
    { ...v5, id: 'nai-diffusion-5-full', tiers: [{ id: 'high', model: 'nai-diffusion-5-full', steps: 23 },
        { id: 'medium', model: 'nai-diffusion-5-full-medium', steps: 14, sampler: 'k_euler_ancestral', locked: true }] },
] });
const TOKEN = /^[a-zA-Z0-9_.-]{1,128}$/;
function assertTiers(tiers) {
    if (tiers === undefined) return;
    if (!Array.isArray(tiers) || !tiers.length || tiers.length > 8) fail('native_illustration_capabilities_invalid');
    const ids = new Set();
    for (const tier of tiers) {
        if (!tier || Object.keys(tier).some(key => !['id', 'model', 'steps', 'sampler', 'locked'].includes(key)) || !TOKEN.test(tier.id ?? '') || !TOKEN.test(tier.model ?? '')
            || ids.has(tier.id) || !Number.isSafeInteger(tier.steps) || tier.steps < 1 || tier.steps > 100
            || (tier.sampler !== undefined && !TOKEN.test(tier.sampler)) || (tier.locked !== undefined && typeof tier.locked !== 'boolean')) fail('native_illustration_capabilities_invalid');
        ids.add(tier.id);
    }
}
/** The model entry, tier and effective provider model for authored parameters. */
export function novelaiModelPlan(capabilities, authored = {}) {
    const capability = capabilities.models.find(item => item.id === (authored.model || capabilities.models[0].id));
    if (!capability) fail('native_illustration_model_unsupported');
    const tier = capability.tiers ? capability.tiers.find(item => item.id === (authored.tier || capability.tiers[0].id)) : null;
    if (capability.tiers && !tier || !capability.tiers && authored.tier) fail('native_illustration_parameters_unsupported');
    return { capability, tier, model: tier?.model ?? capability.id };
}
export function assertNovelaiCapabilities(value) {
    if (!value || Object.keys(value).some(key => !['responseFormat', 'models'].includes(key)) || !['zip', 'json', 'png'].includes(value.responseFormat)
        || !Array.isArray(value.models) || !value.models.length || value.models.length > 64) fail('native_illustration_capabilities_invalid');
    const ids = new Set();
    for (const model of value.models) {
        if (!model || Object.keys(model).some(key => !['id', 'maxPixels', 'maxSteps', 'samplers', 'noiseSchedules', 'protocolVersion', 'defaultSteps', 'tiers'].includes(key))
            || typeof model.id !== 'string' || !/^[a-zA-Z0-9_.-]{1,128}$/.test(model.id) || ids.has(model.id)
            || !Number.isSafeInteger(model.maxPixels) || model.maxPixels < 4096 || model.maxPixels > 16777216
            || !Number.isSafeInteger(model.maxSteps) || model.maxSteps < 1 || model.maxSteps > 100
            || (model.defaultSteps !== undefined && (!Number.isSafeInteger(model.defaultSteps) || model.defaultSteps < 1 || model.defaultSteps > model.maxSteps))) fail('native_illustration_capabilities_invalid');
        assertTiers(model.tiers);
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
    const { userAgent, allowInsecureHttp } = connection.options ?? {};
    if (Object.keys(connection.options ?? {}).some(key => !['imageCapabilities', 'userAgent', 'allowInsecureHttp'].includes(key))
        || allowInsecureHttp !== undefined && typeof allowInsecureHttp !== 'boolean'
        || userAgent !== undefined && (typeof userAgent !== 'string' || !/^[ -~]{1,256}$/.test(userAgent))) fail('native_illustration_connection_invalid');
    return assertNovelaiCapabilities(connection.options?.imageCapabilities);
}

export function renderNovelaiIllustration(draft, capabilities, seed) {
    draft = assertIllustrationDraft(draft);
    capabilities = assertNovelaiCapabilities(capabilities);
    if (!draft.prompt.trim()) fail('native_illustration_prompt_empty');
    const authored = draft.preset.parameters;
    const { capability, tier, model } = novelaiModelPlan(capabilities, authored);
    const width = authored.width ?? 832, height = authored.height ?? 1216;
    const steps = tier?.locked ? tier.steps : authored.steps ?? tier?.steps ?? capability.defaultSteps ?? (capability.protocolVersion === 5 ? 23 : 28);
    const sampler = tier?.locked && tier.sampler ? tier.sampler : authored.sampler || tier?.sampler || capability.samplers[0];
    const noiseSchedule = authored.noiseSchedule || (capability.protocolVersion === 5 ? null : capability.noiseSchedules[0]);
    if (width % 64 || height % 64 || width < 64 || height < 64 || width * height > capability.maxPixels || steps > capability.maxSteps
        || !capability.samplers.includes(sampler) || noiseSchedule !== null && !capability.noiseSchedules.includes(noiseSchedule)) fail('native_illustration_parameters_unsupported');
    const actualSeed = authored.seed === undefined || authored.seed === -1 ? seed : authored.seed;
    if (!Number.isSafeInteger(actualSeed) || actualSeed < 0 || actualSeed > 4294967295) fail('native_illustration_parameters_unsupported');
    const structured = draft.characters.length > 0 && draft.prompt === composeIllustrationPrompt(draft);
    if (structured && draft.characters.length > 6) fail('native_illustration_characters_unsupported');
    const input = structured ? [draft.preset.style, draft.preset.quality, draft.scene].filter(Boolean).join(', ') : draft.prompt;
    const negative = draft.preset.negativePrompt;
    const parameters = { params_version: capability.protocolVersion === 5 ? 4 : 3, width, height, steps, scale: authored.scale ?? 5, seed: actualSeed,
        sampler, ...(noiseSchedule ? { noise_schedule: noiseSchedule } : {}), n_samples: 1, negative_prompt: negative, qualityToggle: false, ucPreset: 0,
        deliberate_euler_ancestral_bug: false, prefer_brownian: true, legacy: false, legacy_v3_extend: false };
    if (capability.protocolVersion === 5) Object.assign(parameters, { tag_hint_qt: 0, tag_hint_uc_preset: 0, tag_hint_transparent_background: false });
    parameters.v4_prompt = { caption: { base_caption: input, char_captions: structured ? draft.characters.map(item => ({
        char_caption: [item.character.fixedPrompt, item.clothing, item.dynamicPrompt].filter(Boolean).join(', '), centers: [{ x: 0.5, y: 0.5 }],
    })) : [] }, use_coords: false, use_order: true };
    parameters.v4_negative_prompt = { caption: { base_caption: negative, char_captions: [] }, legacy_uc: false };
    return { body: { action: 'generate', input, model, parameters }, promptMode: structured ? 'characters' : 'direct', responseFormat: capabilities.responseFormat };
}
