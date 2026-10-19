import { newPromptResource, resourceRef } from './prompt-authoring.js';

export const PROMPT_TEMPLATES = Object.freeze([
    ['blank', 'Blank'], ['skeleton', 'General skeleton'], ['roleplay', 'Roleplay / narrative'],
    ['writing', 'Creative writing'], ['agent', 'Agent task'],
]);

const intentions = {
    skeleton: ['General skeleton', 'Follow the author’s intent and the current input. Use the supplied context as source material. Keep the response focused on the requested task.'],
    roleplay: ['Roleplay / narrative', 'Continue the scene as its narrator. Let each character speak and act in their own voice, shaped by their established identity, viewpoint and relationships. Preserve continuity and leave the player’s decisions to the player. Use concrete details and purposeful dialogue; match the author’s chosen genre and intensity.'],
    writing: ['Creative writing', 'Write the passage requested by the author. Maintain its viewpoint, tense, character voices and continuity. Develop the scene through specific action, imagery and dialogue. Follow the author’s intent for pacing, genre, tone and fictional themes; return the prose itself unless the author requests commentary.'],
    agent: ['Agent task', 'Complete the current task using the supplied materials and the tools actually available to this request. Distinguish observations from assumptions. Make useful progress, identify concrete missing information, and report the result clearly. Do not claim that an action ran or a change was saved without its actual result.'],
};

// Templates create ordinary editable exact resources. They perform no requests.
export function newPromptPreset(template = 'blank') {
    if (!PROMPT_TEMPLATES.some(([id]) => id === template)) throw new TypeError('Unknown Prompt template');
    const program = newPromptResource('core.prompt-program');
    const generation = newPromptResource('core.generation-profile');
    const entries = [{ resourceType: 'core.prompt-program', resource: program }, { resourceType: 'core.generation-profile', resource: generation }];
    if (template !== 'blank') {
        const [name, body] = intentions[template];
        program.displayName = name; generation.displayName = name + ' generation';
        const provenance = [{ source: 'atria.template', ref: 'native.prompt.v1:' + template }];
        program.provenance = provenance; generation.provenance = provenance;
        const intention = { ...newPromptResource('core.prompt-module'), displayName: name + ' intent', textMode: 'literal', body,
            target: template === 'agent' ? 'agent.task' : 'system.foundation', provenance };
        entries.push({ resourceType: 'core.prompt-module', resource: intention });
        program.stages = [{ stageId: 'stage.main', entries: [
            { entryId: 'module.intent', kind: 'module', moduleRef: resourceRef('core.prompt-module', intention, { scope: 'library' }) },
            { entryId: 'anchor.material', kind: 'anchor', target: 'context.before_history', accepts: ['context.fact'], required: false },
            { entryId: 'anchor.persona', kind: 'anchor', target: 'context.before_history', accepts: ['context.player-persona'], required: false },
            { entryId: 'anchor.history', kind: 'anchor', target: 'context.after_history', accepts: ['context.history'], required: false },
            { entryId: 'anchor.input', kind: 'anchor', target: 'context.before_input', accepts: ['context.input'], required: false },
        ] }];
    }
    return { format: 'atria.prompt-preset', schemaVersion: 1, programId: program.promptProgramId,
        categories: [], moduleCategories: {}, entries };
}
