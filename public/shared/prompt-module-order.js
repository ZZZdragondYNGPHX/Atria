// Shared by the compiler and authoring UI. IDs use code-point ordering,
// independent of browser locale, to keep exact prompt output deterministic.
export const PROMPT_TARGETS = Object.freeze([
    'system.foundation', 'system.character', 'system.world', 'system.style', 'system.response',
    'agent.task', 'agent.evidence', 'agent.constraints',
    'context.before_history', 'context.after_history', 'context.before_input', 'context.after_input',
    'response.post_history', 'response.prefill',
]);

export function comparePromptModules(a, b) {
    return PROMPT_TARGETS.indexOf(a.module.target) - PROMPT_TARGETS.indexOf(b.module.target)
        || (b.module.priority ?? 0) - (a.module.priority ?? 0)
        || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
