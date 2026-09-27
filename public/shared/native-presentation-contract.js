import { fields, json } from '../scripts/native/experience/ui/v2-values.js';
import { compileDataSchema } from '../scripts/native/experience/ui/message-templates.js';
import { taskId } from './native-task-contract.js';

export const PRESENTATION_LIMITS = Object.freeze({ packBytes: 536870912, eagerBytes: 67108864, cueCount: 64, activityCount: 64 });
export const HOST_PRESENTATION_CAPABILITIES = Object.freeze(['fullscreen', 'focus', 'gamepad', 'responsive', 'reduced-motion', 'speech', 'audio', 'video']);
function data(value) {
    function inspect(item, depth = 0, budget = { nodes: 0 }) {
        if (depth > 24 || ++budget.nodes > 32768) throw new TypeError('Presentation complexity limit');
        if (!item || typeof item !== 'object') return;
        const array = Array.isArray(item); const proto = Object.getPrototypeOf(item);
        if (!array && proto !== null && Object.getPrototypeOf(proto) !== null) throw new TypeError('Presentation requires plain JSON');
        const keys = Reflect.ownKeys(item).filter(key => !(array && key === 'length'));
        if (array && keys.length !== item.length) throw new TypeError('Presentation requires dense arrays');
        for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(item, key);
            if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
                || (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= item.length))) throw new TypeError('Presentation requires JSON data fields');
            inspect(descriptor.value, depth + 1, budget);
        }
    }
    inspect(value); return json(value);
}
function list(value, limit, fn) {
    if (!Array.isArray(value) || value.length > limit) throw new TypeError('Presentation list limit');
    const items = value.map(fn);
    if (new Set(items.map(item => item.id ?? item.assetId)).size !== items.length) throw new TypeError('Duplicate presentation identifier');
    return items;
}
function choice(value, options) { if (!options.includes(value)) throw new TypeError('Unknown presentation kind'); return value; }
function number(value, min, max, integral = false) {
    if (!Number.isFinite(value) || value < min || value > max || (integral && !Number.isSafeInteger(value))) throw new TypeError('Presentation value out of bounds'); return value;
}
function text(value, max = 8192) { if (typeof value !== 'string' || value.length > max) throw new TypeError('Presentation text limit'); return value; }
export function assertPresentationAssetRef(value) {
    fields(value, ['assetId', 'contentHash'], 'Presentation AssetRef');
    if (!/^asset_[a-f0-9]{32}$/.test(value.assetId) || !/^[a-f0-9]{64}$/.test(value.contentHash)) throw new TypeError('Exact presentation AssetRef required');
    return { assetId: value.assetId, contentHash: value.contentHash };
}
const exact = (a, b) => a.assetId === b.assetId && a.contentHash === b.contentHash;
export function assertSceneCue(value, definition, { assets = [], attachments = [] } = {}) {
    value = data(value); taskId(value.id);
    const kind = choice(value.kind, ['image', 'audio', 'video', 'caption', 'speech', 'clear']);
    if (['image', 'audio', 'video'].includes(kind)) {
        fields(value, ['id', 'kind', 'asset', 'attachment', 'alt', 'loop', 'volume', 'motion', 'fit'], 'Scene media cue');
        if (Boolean(value.asset) === Boolean(value.attachment)) throw new TypeError('Scene requires one exact AssetRef or Attachment');
        const ref = assertPresentationAssetRef(value.asset ?? value.attachment);
        const allowed = value.asset ? (definition.assetPacks ?? []).flatMap(pack => pack.assets) : attachments;
        if (!allowed.some(item => exact(item, ref))) throw new TypeError('Scene resource outside exact closure');
        const asset = (value.asset ? assets : attachments).find(item => exact(item, ref));
        if (asset?.mediaType && !isPresentationMediaType(asset.mediaType, kind)) throw new TypeError('Scene asset media type mismatch');
        if (value.alt !== undefined) text(value.alt, 1024);
        if (value.loop !== undefined && typeof value.loop !== 'boolean') throw new TypeError('Scene loop must be boolean');
        if (value.volume !== undefined) number(value.volume, 0, 1);
        if (value.motion !== undefined) choice(value.motion, ['none', 'fade']);
        if (value.fit !== undefined) choice(value.fit, ['contain', 'cover']);
        if (kind === 'image' && (value.loop !== undefined || value.volume !== undefined)) throw new TypeError('Image cannot declare playback');
    } else if (kind === 'caption') { fields(value, ['id', 'kind', 'text'], 'Scene caption'); text(value.text); } else if (kind === 'speech') {
        fields(value, ['id', 'kind', 'text', 'voiceId'], 'Scene speech'); text(value.text, 4096);
        if (!definition.voices.some(item => item.id === value.voiceId)) throw new TypeError('Unknown Actor Voice');
    } else fields(value, ['id', 'kind'], 'Scene clear');
    return value;
}
export function assertSceneCueIR(value, definition, options) {
    value = data(value); fields(value, ['schemaVersion', 'cues'], 'Scene Cue IR');
    if (value.schemaVersion !== 1) throw new TypeError('Scene Cue IR version');
    return data({ schemaVersion: 1, cues: list(value.cues, PRESENTATION_LIMITS.cueCount, cue => assertSceneCue(cue, definition, options)) });
}
export function isPresentationMediaType(type, kind = null) {
    const media = /^(image\/(png|jpeg|gif|webp|avif)|audio\/(mpeg|ogg|wav|webm|mp4|flac)|video\/(mp4|webm|ogg))$/.test(type);
    return media && (!kind || type.startsWith(kind + '/'));
}
export function assertPresentationRuntime(value, lifecycle, tasks) {
    value = data(value); fields(value, ['schemaVersion', 'activities', 'scenes', 'assetPacks', 'voices', 'host'], 'Presentation runtime');
    if (value.schemaVersion !== 1) throw new TypeError('Presentation runtime version');
    const assetPacks = list(value.assetPacks, 64, pack => {
        fields(pack, ['id', 'assets', 'delivery', 'required', 'maxBytes'], 'Asset Pack'); taskId(pack.id);
        if (typeof pack.required !== 'boolean') throw new TypeError('Asset Pack required flag');
        return { id: pack.id, assets: list(pack.assets, 256, assertPresentationAssetRef), delivery: choice(pack.delivery, ['eager', 'lazy']),
            required: pack.required, maxBytes: number(pack.maxBytes, 1, PRESENTATION_LIMITS.packBytes, true) };
    });
    const voices = list(value.voices, 64, voice => {
        fields(voice, ['id', 'actorId', 'lang', 'rate', 'pitch'], 'Actor Voice'); taskId(voice.id);
        if (!/^actor_[a-f0-9]{32}$/.test(voice.actorId) || typeof voice.lang !== 'string' || !/^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8})*$/.test(voice.lang)) throw new TypeError('Invalid Actor Voice identity/language');
        return { ...voice, rate: number(voice.rate ?? 1, 0.5, 2), pitch: number(voice.pitch ?? 1, 0, 2) };
    });
    const host = list(value.host, HOST_PRESENTATION_CAPABILITIES.length, item => {
        fields(item, ['id', 'required'], 'Host capability'); choice(item.id, HOST_PRESENTATION_CAPABILITIES);
        if (typeof item.required !== 'boolean') throw new TypeError('Host capability required flag'); return item;
    });
    const definition = { assetPacks, voices };
    const scenes = list(value.scenes, 64, scene => {
        fields(scene, ['id', 'scopeId', 'cues'], 'Scene'); taskId(scene.id);
        if (!lifecycle?.scopes.some(item => item.id === scene.scopeId)) throw new TypeError('Scene requires declared lifecycle scope');
        return { id: scene.id, scopeId: scene.scopeId, cues: assertSceneCueIR({ schemaVersion: 1, cues: scene.cues }, definition).cues };
    });
    const activities = list(value.activities, PRESENTATION_LIMITS.activityCount, item => {
        fields(item, ['id', 'scopeId', 'outcomeSchema', 'settlement', 'narrator', 'sceneId'], 'Activity'); taskId(item.id);
        if (!lifecycle?.scopes.some(scope => scope.id === item.scopeId)) throw new TypeError('Activity requires declared lifecycle scope');
        const outcomeSchema = compileDataSchema(item.outcomeSchema);
        if (outcomeSchema.type !== 'object') throw new TypeError('Activity outcome must be a closed object');
        const settlement = item.settlement;
        if (settlement?.kind === 'app.command') {
            fields(settlement, ['kind', 'domainId', 'commandId', 'recordId'], 'Activity App settlement'); taskId(settlement.recordId);
            const domain = lifecycle.domains.find(domain => domain.id === settlement.domainId);
            if (!domain || domain.scopeId !== item.scopeId || !domain.commands.some(command => command.id === settlement.commandId)) throw new TypeError('Unknown Activity App settlement');
        } else if (settlement?.kind === 'world.command') { fields(settlement, ['kind', 'commandId'], 'Activity World settlement'); taskId(settlement.commandId); } else throw new TypeError('Activity settlement requires typed command');
        if (item.narrator !== undefined) {
            fields(item.narrator, ['taskId', 'variantId'], 'Activity Narrator');
            const task = tasks?.tasks.find(task => task.id === item.narrator.taskId);
            const variant = task?.variants.find(variant => variant.id === item.narrator.variantId);
            if (!variant || task.resultPolicy.resultClass !== 'presentation' || task.resultPolicy.sink !== 'artifact'
                || !task.context.includes('input') || variant.outputSchema.type !== 'string') throw new TypeError('Activity Narrator requires exact presentation Task and prose output');
        }
        if (item.sceneId !== undefined && !scenes.some(scene => scene.id === item.sceneId && scene.scopeId === item.scopeId)) throw new TypeError('Activity Scene scope mismatch');
        return { ...item, outcomeSchema };
    });
    return data({ schemaVersion: 1, activities, scenes, assetPacks, voices, host });
}
export function assertPresentationClosure(definition, assets) {
    if (!definition) return;
    let eagerBytes = 0; const eager = new Set();
    for (const pack of definition.assetPacks) {
        let size = 0;
        for (const ref of pack.assets) {
            const asset = assets.find(item => exact(item, ref));
            if (!asset || !isPresentationMediaType(asset.mediaType)) throw new TypeError('Asset Pack requires exact inert media in PackageVersion');
            size += asset.size;
            if (pack.delivery === 'eager' && !eager.has(ref.assetId)) { eager.add(ref.assetId); eagerBytes += asset.size; }
        }
        if (size > pack.maxBytes) throw new TypeError('Asset Pack delivery budget exceeded');
    }
    if (eagerBytes > PRESENTATION_LIMITS.eagerBytes) throw new TypeError('Eager Asset Pack budget exceeded');
    for (const scene of definition.scenes) assertSceneCueIR({ schemaVersion: 1, cues: scene.cues }, definition, { assets });
}
