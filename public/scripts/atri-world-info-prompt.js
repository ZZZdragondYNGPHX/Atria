import { createWorldInfoProvenance, worldInfoSource } from './atri-world-info-provenance.js';

/** Build existing WI channels in their original order, recording each source at emission. */
export function buildWorldInfoPromptEntries(sortedEntries, { world_info_position, wi_anchor_position, DEFAULT_DEPTH, extension_prompt_roles, render }) {
    const worldInfoProvenance = createWorldInfoProvenance();
    // Forward-sorted list of entries for joining
    const WIBeforeEntries = [];
    const WIAfterEntries = [];
    const EMEntries = [];
    const ANTopEntries = [];
    const ANBottomEntries = [];
    const WIDepthEntries = [];
    /** @type {{[key: string]: string[]}} */
    const WIOutletEntries = {};

    // Appends from insertion order 999 to 1. Use unshift for this purpose
    // TODO (kingbri): Change to use WI Anchor positioning instead of separate top/bottom arrays
    sortedEntries.forEach((entry) => {
        const regexDepth = entry.position === world_info_position.atDepth ? (entry.depth ?? DEFAULT_DEPTH) : null;
        const content = render(entry, regexDepth);

        if (!content) {
            console.debug(`[WI] Entry ${entry.uid}`, 'skipped adding to prompt due to empty content', entry);
            return;
        }

        switch (entry.position) {
            case world_info_position.before:
                WIBeforeEntries.unshift(content);
                worldInfoProvenance.worldInfoBeforeEntries.unshift(worldInfoSource(entry, content));
                break;
            case world_info_position.after:
                WIAfterEntries.unshift(content);
                worldInfoProvenance.worldInfoAfterEntries.unshift(worldInfoSource(entry, content));
                break;
            case world_info_position.EMTop:
                worldInfoProvenance.worldInfoExamples.unshift(worldInfoSource(entry, content));
                EMEntries.unshift(
                    { position: wi_anchor_position.before, content: content },
                );
                break;
            case world_info_position.EMBottom:
                worldInfoProvenance.worldInfoExamples.unshift(worldInfoSource(entry, content));
                EMEntries.unshift(
                    { position: wi_anchor_position.after, content: content },
                );
                break;
            case world_info_position.ANTop:
                ANTopEntries.unshift(content);
                worldInfoProvenance.anBefore.unshift(worldInfoSource(entry, content));
                break;
            case world_info_position.ANBottom:
                ANBottomEntries.unshift(content);
                worldInfoProvenance.anAfter.unshift(worldInfoSource(entry, content));
                break;
            case world_info_position.atDepth: {
                const existingDepthIndex = WIDepthEntries.findIndex((e) => e.depth === (entry.depth ?? DEFAULT_DEPTH) && e.role === (entry.role ?? extension_prompt_roles.SYSTEM));
                if (existingDepthIndex !== -1) {
                    WIDepthEntries[existingDepthIndex].entries.unshift(content);
                    worldInfoProvenance.worldInfoDepth[existingDepthIndex].entries.unshift(worldInfoSource(entry, content));
                } else {
                    worldInfoProvenance.worldInfoDepth.push({
                        depth: entry.depth, role: entry.role ?? extension_prompt_roles.SYSTEM,
                        entries: [worldInfoSource(entry, content)],
                    });
                    WIDepthEntries.push({
                        depth: entry.depth,
                        entries: [content],
                        role: entry.role ?? extension_prompt_roles.SYSTEM,
                    });
                }
                break;
            }
            case world_info_position.outlet: {
                if (!entry.outletName) {
                    console.warn(`[WI] Entry ${entry.uid} has position 'outlet' but no outlet name. Skipping.`);
                    break;
                }
                if (Array.isArray(WIOutletEntries[entry.outletName])) {
                    WIOutletEntries[entry.outletName].push(content);
                    worldInfoProvenance.outletEntries[entry.outletName].push(worldInfoSource(entry, content));
                } else {
                    Object.defineProperty(WIOutletEntries, entry.outletName, { value: [content], enumerable: true, configurable: true, writable: true });
                    Object.defineProperty(worldInfoProvenance.outletEntries, entry.outletName, {
                        value: [worldInfoSource(entry, content)], enumerable: true, configurable: true, writable: true,
                    });
                }
                break;
            }
            default:
                break;
        }
    });

    return {
        worldInfoBeforeEntries: WIBeforeEntries, worldInfoAfterEntries: WIAfterEntries,
        EMEntries, WIDepthEntries, ANBeforeEntries: ANTopEntries, ANAfterEntries: ANBottomEntries,
        outletEntries: WIOutletEntries, worldInfoProvenance,
    };
}
