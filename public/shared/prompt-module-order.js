// Targets describe placement; order inside a target belongs to the author.
export const PROMPT_TARGETS = Object.freeze([
    'system.foundation', 'system.character', 'system.world', 'system.style', 'system.response',
    'agent.task', 'agent.evidence', 'agent.constraints',
    'context.before_history', 'context.after_history', 'context.before_input', 'context.after_input',
    'response.post_history', 'response.prefill',
]);

// moduleRefs is the compact module-only form. A stage stores exactly one form.
export function promptStageEntries(stage) {
    return stage.entries ?? stage.moduleRefs.map(moduleRef => ({
        entryId: moduleRef.resourceId, kind: 'module', moduleRef,
    }));
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
        return { ...rest, entries: moduleRefs.map((ref, index) => ({ entryId: ref.resourceId, kind: 'module', moduleRef: mapped[index] })) };
    }
    return { ...stage, moduleRefs: mapped };
}
