import { buildWorldInfoPromptEntries } from '../../public/scripts/atri-world-info-prompt.js';

export const positions = { before: 0, after: 1, ANTop: 2, ANBottom: 3, atDepth: 4, EMTop: 5, EMBottom: 6, outlet: 7 };
export const promptOptions = {
    world_info_position: positions, wi_anchor_position: { before: 0, after: 1 },
    DEFAULT_DEPTH: 4, extension_prompt_roles: { SYSTEM: 0 },
    render: entry => entry.content,
};
export function makeEntry(world, uid, options = {}) {
    return { world, uid, hash: 123 + uid, comment: world, content: 'shared body', position: positions.before, ...options };
}
export function makePayload(entries, render = promptOptions.render) {
    const result = buildWorldInfoPromptEntries(entries, { ...promptOptions, render });
    const payload = {
        worldInfoBeforeEntries: result.worldInfoBeforeEntries.map(s => s.trim()).filter(Boolean),
        worldInfoAfterEntries: result.worldInfoAfterEntries.map(s => s.trim()).filter(Boolean),
        anBefore: result.ANBeforeEntries, anAfter: result.ANAfterEntries,
        worldInfoExamples: result.EMEntries, worldInfoDepth: result.WIDepthEntries,
        outletEntries: result.outletEntries,
    };
    payload.worldInfoResolution = { ...payload, activatedEntries: entries, worldInfoProvenance: result.worldInfoProvenance };
    payload.worldInfoString = [...payload.worldInfoBeforeEntries, ...payload.worldInfoAfterEntries].join('\n');
    return payload;
}
