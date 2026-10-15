import { flattenPromptProgram } from '../model-prompt-runtime/prompt-compiler.js';
import { compileNativeContextPlan } from '../../../public/scripts/native/context-compiler.js';
import { createNativeSessionContextProvider } from '../model-prompt-runtime/context-providers.js';
import { immutable, effectiveOutputReserve } from '../model-prompt-runtime/execution-utils.js';
import { createPackageContextDerivation } from '../context-computation.js';
import { processPackageText } from '../processing-runtime.js';

export function nativeSessionContextOptions({ handle, snapshot, resolver, contextPackage = null, role, taskPlan = null, lanePlan = null, authorityContext = null }) {
    return {
        tokenScope: JSON.stringify([handle, snapshot.session.sessionId, snapshot.revision.branchId]),
        tokenizerFor: resolved => resolver.provider(resolved.connection.providerAdapter).contextTokenizer?.(resolved),
        deriveContext: contextPackage ? createPackageContextDerivation(snapshot, contextPackage) : undefined,
        processContext: contextPackage ? (text, sourceId) => processPackageText(contextPackage, snapshot.manifest.runtime.experienceContract.processingRuntime, 'context', text, sourceId) : undefined,
        personaBlockedReason: snapshot.manifest.runtime?.experienceContract?.sharedRuntime ? 'shared_scope_unsupported' : undefined,
        personaAllowed: !snapshot.manifest.runtime?.experienceContract?.sharedRuntime && (taskPlan
            ? taskPlan.task.context.includes('player_persona') && !['background', 'maintenance'].includes(taskPlan.task.executionClass)
            : role === 'role.narrator'),
        informationTaskId: authorityContext ? undefined : taskPlan?.task.id, memoryEvidence: lanePlan?.memoryEvidence ?? [], authorityTurn: Boolean(authorityContext),
    };
}

export function nativeContextCompilationOptions(request, resolved, options = {}) {
    const { countTokens, tokenizerFor, deriveContext, processContext, providers = [], ...settings } = options;
    const config = immutable(settings);
    const stages = flattenPromptProgram(resolved).stages;
    const consumer = stages.some(stage => stage.contextConsumers?.includes('player_persona') && (!request.prompt?.stageIds || request.prompt.stageIds.includes(stage.stageId)));
    return { ...config, countTokens: tokenizerFor?.(resolved) ?? countTokens, deriveContext, processContext, providers: [...providers],
        playerPersona: { enabled: config.personaAllowed === true && consumer, blockedReason: config.personaBlockedReason },
        memoryEvidence: config.memoryEvidence ?? [], modelContextLimit: resolved.model.limits.contextTokens, responseReserve: effectiveOutputReserve(resolved) };
}

// Host bridge to the existing Native selection authority. No Timeline/Knowledge scan here.
export function createNativeSessionContextAdapter({ readSnapshot, options = {} }) {
    const { countTokens, tokenizerFor, deriveContext, processContext, providers = [], ...settings } = options;
    const fixedOptions = { ...immutable(settings), countTokens, tokenizerFor, deriveContext, processContext, providers: [...providers] };
    return createNativeSessionContextProvider(async (request, resolved) => {
        const { source, snapshot } = await readSnapshot(request, resolved);
        const plan = await compileNativeContextPlan(immutable(snapshot), nativeContextCompilationOptions(request, resolved, fixedOptions));
        return { source, plan };
    });
}
