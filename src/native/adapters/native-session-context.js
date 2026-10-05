import { flattenPromptProgram } from '../model-prompt-runtime/prompt-compiler.js';
import { compileNativeContextPlan } from '../../../public/scripts/native/context-compiler.js';
import { createNativeSessionContextProvider } from '../model-prompt-runtime/context-providers.js';
import { immutable, effectiveOutputReserve } from '../model-prompt-runtime/execution-utils.js';

// Host bridge to the existing Native selection authority. No Timeline/Knowledge scan here.
export function createNativeSessionContextAdapter({ readSnapshot, options = {} }) {
    const { countTokens, providers = [], ...settings } = options;
    const config = immutable(settings);
    const contextPorts = [...providers];
    return createNativeSessionContextProvider(async (request, resolved) => {
        const { source, snapshot } = await readSnapshot(request, resolved);
        const stages = flattenPromptProgram(resolved).stages;
        const consumer = stages.some(stage => stage.contextConsumers?.includes('player_persona') && (!request.prompt?.stageIds || request.prompt.stageIds.includes(stage.stageId)));
        const plan = await compileNativeContextPlan(immutable(snapshot), {
            ...config, countTokens, providers: contextPorts,
            playerPersona: { enabled: config.personaAllowed === true && consumer, blockedReason: config.personaBlockedReason },
            memoryEvidence: config.memoryEvidence ?? [],
            modelContextLimit: resolved.model.limits.contextTokens,
            responseReserve: effectiveOutputReserve(resolved),
        });
        return { source, plan };
    });
}
