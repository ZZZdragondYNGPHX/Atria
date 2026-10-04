// Non-secret plugin preferences. Formal annotations remain Session presentation data.
export const OFFICIAL_ILLUSTRATION_ID = 'atri_official_illustration';
export const OFFICIAL_PROMPT_TEMPLATE = '根据选文与历史上下文整理绘图提示词。固定外观由程序保留；只补充场景、构图及每个出场角色的动作、表情和剧情服装。不要加入未出场角色。';
export const defaultIllustrationPreset = () => ({ style: '', quality: '', negativePrompt: '', parameters: { width: 832, height: 1216, steps: 28, scale: 5 } });
export const defaultIllustrationSettings = () => ({ schemaVersion: 1, enabled: false, characters: [], works: {}, preset: defaultIllustrationPreset(), imageConnectionId: '', promptRouteId: '', template: OFFICIAL_PROMPT_TEMPLATE });
function object(value, keys) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]' || Reflect.ownKeys(value).some(key => !keys.includes(key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) throw new TypeError('Invalid illustration preferences');
}
function text(value, max = 65536) { if (typeof value !== 'string' || value.length > max) throw new TypeError('Invalid illustration preference text'); return value; }
function identity(value) { if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{0,127}$/.test(value)) throw new TypeError('Invalid illustration preference identity'); return value; }
export function assertIllustrationPreset(value) {
    object(value, ['style', 'quality', 'negativePrompt', 'parameters']);
    object(value.parameters, ['width', 'height', 'steps', 'scale', 'seed', 'sampler', 'model', 'noiseSchedule', 'sm', 'smDyn']);
    for (const [key, item] of Object.entries(value.parameters)) {
        if (['width', 'height', 'steps'].includes(key) && (!Number.isSafeInteger(item) || item < 1 || item > (key === 'steps' ? 100 : 32768))) throw new TypeError('Invalid illustration parameter');
        if (key === 'seed' && (!Number.isSafeInteger(item) || item < -1 || item > 4294967295)) throw new TypeError('Invalid illustration seed');
        if (key === 'scale' && (typeof item !== 'number' || !Number.isFinite(item) || item < 0 || item > 100)) throw new TypeError('Invalid illustration scale');
        if (['model', 'sampler', 'noiseSchedule'].includes(key)) text(item, 128);
        if (['sm', 'smDyn'].includes(key) && typeof item !== 'boolean') throw new TypeError('Invalid illustration parameter');
    }
    return { style: text(value.style), quality: text(value.quality), negativePrompt: text(value.negativePrompt), parameters: structuredClone(value.parameters) };
}
export function assertDrawingCharacter(value) {
    object(value, ['id', 'name', 'aliases', 'fixedPrompt', 'defaultClothing', 'enabled', 'storyActorId']);
    if (!text(value.name, 100).trim() || !Array.isArray(value.aliases) || value.aliases.length > 32 || value.aliases.some(alias => !text(alias, 100).trim()) || typeof value.enabled !== 'boolean') throw new TypeError('Invalid drawing character');
    return { id: identity(value.id), name: value.name, aliases: [...new Set(value.aliases)], fixedPrompt: text(value.fixedPrompt), defaultClothing: text(value.defaultClothing), enabled: value.enabled, storyActorId: text(value.storyActorId, 128) };
}
export function assertIllustrationSettings(value) {
    object(value, ['schemaVersion', 'enabled', 'characters', 'works', 'preset', 'imageConnectionId', 'promptRouteId', 'template']);
    if (value.schemaVersion !== 1 || typeof value.enabled !== 'boolean' || !Array.isArray(value.characters) || value.characters.length > 1024) throw new TypeError('Invalid illustration settings');
    const characters = value.characters.map(assertDrawingCharacter), ids = new Set(characters.map(item => item.id));
    if (ids.size !== characters.length) throw new TypeError('Duplicate drawing character');
    object(value.works, Object.keys(value.works ?? {}));
    if (Object.keys(value.works).length > 1024) throw new TypeError('Too many illustration works');
    const works = {};
    for (const [key, work] of Object.entries(value.works)) {
        identity(key); object(work, ['characterIds', 'preset', 'imageConnectionId', 'promptRouteId']);
        if (!Array.isArray(work.characterIds) || work.characterIds.length > 1024 || new Set(work.characterIds).size !== work.characterIds.length || work.characterIds.some(id => !ids.has(id))) throw new TypeError('Unknown drawing character');
        works[key] = { characterIds: [...work.characterIds], ...(work.preset ? { preset: assertIllustrationPreset(work.preset) } : {}),
            ...(work.imageConnectionId === undefined ? {} : { imageConnectionId: text(work.imageConnectionId, 128) }), ...(work.promptRouteId === undefined ? {} : { promptRouteId: text(work.promptRouteId, 128) }) };
    }
    const settings = { schemaVersion: 1, enabled: value.enabled, characters, works, preset: assertIllustrationPreset(value.preset), imageConnectionId: text(value.imageConnectionId, 128), promptRouteId: text(value.promptRouteId, 128), template: text(value.template) };
    if (JSON.stringify(settings).length > 4 * 1024 * 1024) throw new TypeError('Illustration settings exceed budget');
    return settings;
}
export function matchDrawingCharacters(quote, characters, enabledIds) {
    const allowed = new Set(enabledIds), names = new Map();
    for (const character of characters.filter(item => item.enabled && allowed.has(item.id))) {
        for (const name of new Set([character.name, ...character.aliases])) {
            // Latin names need word boundaries; CJK names can occur in continuous prose.
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = /^[\p{Script=Latin}\d _-]+$/u.test(name) ? new RegExp('(?<![\\p{Script=Latin}\\p{N}_])' + escaped + '(?![\\p{Script=Latin}\\p{N}_])', 'iu') : new RegExp(escaped, 'u');
            if (pattern.test(quote)) { const key = name.toLowerCase(), matches = names.get(key) ?? []; if (!matches.some(item => item.id === character.id)) matches.push(character); names.set(key, matches); }
        }
    }
    const ambiguousIds = new Set([...names.values()].filter(items => items.length > 1).flatMap(items => items.map(item => item.id)));
    return { matched: [...new Map([...names.values()].flat().filter(item => !ambiguousIds.has(item.id)).map(item => [item.id, item])).values()],
        ambiguous: [...names].filter(([, items]) => items.length > 1).map(([name, candidates]) => ({ name, candidates })) };
}
export function assertIllustrationDraft(value) {
    object(value, ['characters', 'scene', 'prompt', 'preset']);
    if (!Array.isArray(value.characters) || value.characters.length > 64) throw new TypeError('Invalid illustration draft');
    const characters = value.characters.map(item => {
        object(item, ['character', 'dynamicPrompt', 'clothing']);
        return { character: assertDrawingCharacter(item.character), dynamicPrompt: text(item.dynamicPrompt), clothing: text(item.clothing) };
    });
    if (new Set(characters.map(item => item.character.id)).size !== characters.length) throw new TypeError('Duplicate draft character');
    const draft = { characters, scene: text(value.scene), prompt: text(value.prompt), preset: assertIllustrationPreset(value.preset) };
    if (JSON.stringify(draft).length > 256 * 1024) throw new TypeError('Illustration draft exceeds budget');
    return draft;
}
export function createIllustrationDraft(quote, settings, packageId) {
    const work = settings.works[packageId];
    const matches = matchDrawingCharacters(quote, settings.characters, work?.characterIds ?? []);
    return { draft: { characters: matches.matched.map(character => ({ character: structuredClone(character), dynamicPrompt: '', clothing: character.defaultClothing })), scene: '', prompt: '', preset: structuredClone(work?.preset ?? settings.preset) }, ambiguous: matches.ambiguous };
}
