import { compileNativeContextPlan } from '../../../public/scripts/native/context-compiler.js';
import { createNativeSessionContextProvider } from '../model-prompt-runtime/context-providers.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';

// Host bridge to the existing Native selection authority. No Timeline/Knowledge scan here.
export function createNativeSessionContextAdapter({ readSnapshot, options = {} }) {
    const { countTokens, providers = [], ...settings } = options;
    const config = immutable(settings);
    const contextPorts = [...providers];
    return createNativeSessionContextProvider(async (request, resolved) => {
        const { source, snapshot } = await readSnapshot(request, resolved);
        const plan = await compileNativeContextPlan(immutable(snapshot), {
            ...config, countTokens, providers: contextPorts,
            modelContextLimit: resolved.model.limits.contextTokens,
            responseReserve: resolved.generation.output.maxTokens ?? resolved.model.limits.outputTokens,
        });
        return { source, plan };
    });
}
