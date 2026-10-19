const idFields = { 'core.prompt-program': 'promptProgramId', 'core.prompt-module': 'promptModuleId', 'core.generation-profile': 'generationProfileId' };
export const presetEntryRef = entry => ({ scope: 'library', resourceType: entry.resourceType, resourceId: entry.resource[idFields[entry.resourceType]], revision: entry.resource.revision });
export const presetRefKey = ref => JSON.stringify([ref.resourceType, ref.resourceId, ref.revision]);
export function presetProgramRef(preset) {
    const refs = preset.refs ?? preset.entries.map(presetEntryRef);
    const candidates = refs.filter(ref => ref.resourceType === 'core.prompt-program' && ref.resourceId === preset.programId);
    const revision = preset.programRevision ?? preset.revision;
    const selected = candidates.find(ref => ref.revision === revision) ?? (candidates.length === 1 ? candidates[0] : null);
    if (!selected) throw new TypeError('Choose the exact main Program revision');
    return selected;
}
