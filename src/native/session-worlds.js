import { assertPackagedWorldSnapshot } from './world-knowledge.js';
import { cloneNativeDocument } from './repositories/common.js';

export function selectedWorlds(states, manifest, entryPoint) {
    const selection = states.atri_world_selection;
    if (!selection) return manifest.worlds.filter(item => entryPoint.worldIds.includes(item.world.worldId));
    if (selection.schemaVersion !== 1 || !Array.isArray(selection.worlds)) throw new TypeError('Invalid Session World selection');
    const worlds = selection.worlds.map(assertPackagedWorldSnapshot);
    if (new Set(worlds.map(item => item.world.worldId)).size !== worlds.length || (selection.primaryWorldId !== null && !worlds.some(item => item.world.worldId === selection.primaryWorldId))) throw new TypeError('Invalid primary World');
    return worlds;
}

// The original startup calculation is shared by Session creation and the
// read-only Studio preview. Reading a preview never applies it to a live Session.
export function initialWorldState(manifest, entryPoint, selection) {
    const worlds = selectedWorlds({ atri_world_selection: selection }, manifest, entryPoint);
    const originalPrimary = entryPoint.primaryWorldId ?? (entryPoint.worldIds.length === 1 ? entryPoint.worldIds[0] : null);
    const overlay = cloneNativeDocument(selection && selection.primaryWorldId !== originalPrimary ? {} : entryPoint.initialStateOverlay ?? {});
    const primaryWorldId = selection ? selection.primaryWorldId : entryPoint.primaryWorldId ?? (worlds.length === 1 ? worlds[0].world.worldId : null);
    if (Object.prototype.toString.call(overlay) !== '[object Object]') throw new TypeError('EntryPoint initialStateOverlay must be an object');
    if (worlds.length > 1 && !primaryWorldId && Object.keys(overlay).length) throw new TypeError('A multi-World EntryPoint overlay requires primaryWorldId');
    return { primaryWorldId, worlds: Object.fromEntries(worlds.map(item => {
        const worldId = item.world.worldId, baseline = cloneNativeDocument(item.revision.baseline ?? {});
        return [worldId, { worldRevisionId: item.revision.worldRevisionId, state: worldId === primaryWorldId ? { ...baseline, ...overlay } : baseline }];
    })), ...(worlds.length ? {} : { initialState: overlay }) };
}
