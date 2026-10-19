// Targets describe placement; order inside a target belongs to the author.
export const PROMPT_TARGETS = Object.freeze([
    'system.foundation', 'system.character', 'system.world', 'system.style', 'system.response',
    'agent.task', 'agent.evidence', 'agent.constraints',
    'context.before_history', 'context.after_history', 'context.before_input', 'context.after_input',
    'response.post_history', 'response.prefill',
]);

// moduleRefs is the compact module-only form. A stage stores exactly one form.
export function promptStageEntries(stage) {
    if (stage.entries) return stage.entries;
    const occurrences = new Map();
    return stage.moduleRefs.map(moduleRef => {
        const occurrence = (occurrences.get(moduleRef.resourceId) ?? 0) + 1; occurrences.set(moduleRef.resourceId, occurrence);
        return { entryId: moduleRef.resourceId + (occurrence === 1 ? '' : '.' + occurrence), kind: 'module', moduleRef };
    });
}

export function promptStageModuleRefs(stage) {
    return promptStageEntries(stage).filter(entry => entry.kind === 'module').map(entry => entry.moduleRef);
}

export function mapPromptStageRefs(stage, mapper) {
    if (stage.entries) return { ...stage, entries: stage.entries.map(entry => entry.kind === 'module'
        ? { ...entry, moduleRef: mapper(entry.moduleRef) } : entry) };
    const mapped = stage.moduleRefs.map(mapper);
    if (mapped.some((ref, index) => ref.resourceId !== stage.moduleRefs[index].resourceId)) {
        const { moduleRefs, ...rest } = stage;
        return { ...rest, entries: promptStageEntries(stage).map((entry, index) => ({ ...entry, moduleRef: mapped[index] })) };
    }
    return { ...stage, moduleRefs: mapped };
}

export const promptProgramResourceRefs = resource => [resource.parentRef, ...resource.stages.flatMap(promptStageModuleRefs),
    ...(resource.derive ?? []).flatMap(operation => [operation.replacementRef, operation.entry?.moduleRef])].filter(Boolean);
