import { flattenPromptProgram } from '../model-prompt-runtime/prompt-compiler.js';
import { compileNativeContextPlan } from '../../../public/scripts/native/context-compiler.js';
import { createNativeSessionContextProvider } from '../model-prompt-runtime/context-providers.js';
import { immutable, effectiveOutputReserve } from '../model-prompt-runtime/execution-utils.js';
import { createPackageContextDerivation } from '../context-computation.js';
import { processPackageText } from '../processing-runtime.js';
import { subjectTaskContext } from '../subject-authority.js';
import { processNativeRegex } from '../regex-runtime.js';
import { presetDeclaresPersona } from '../model-prompt-runtime/prompt-compiler.js';

export function nativeSessionContextOptions({ handle, snapshot, resolver, contextPackage = null, role, taskPlan = null, lanePlan = null, authorityContext = null, actorId, signal }) {
    const personalTask = subjectTaskContext(taskPlan);
    return {
        tokenScope: JSON.stringify([handle, snapshot.session.sessionId, snapshot.revision.branchId]),
        tokenizerFor: resolved => resolver.provider(resolved.connection.providerAdapter).contextTokenizer?.(resolved),
        deriveContext: contextPackage ? createPackageContextDerivation(snapshot, contextPackage, { signal }) : undefined,
        processContext: contextPackage ? (text, sourceId) => processPackageText(contextPackage, snapshot.manifest.runtime.experienceContract.processingRuntime, 'context', text, sourceId, { signal }) : undefined,
        personaBlockedReason: snapshot.manifest.runtime?.experienceContract?.sharedRuntime ? 'shared_scope_unsupported' : undefined,
        personaAllowed: !snapshot.manifest.runtime?.experienceContract?.sharedRuntime && (taskPlan
            ? taskPlan.task.context.includes('player_persona') && !['background', 'maintenance'].includes(taskPlan.task.executionClass)
            : role === 'role.narrator'),
        informationTaskId: authorityContext || personalTask ? undefined : taskPlan?.task.id,
        ...(personalTask ? { target: personalTask.audience } : actorId ? { target: { kind: 'actor', id: actorId } } : {}),
        signal,
        memoryEvidence: lanePlan?.memoryEvidence ?? [], authorityTurn: Boolean(authorityContext),
    };
}

export function nativeContextCompilationOptions(request, resolved, options = {}) {
    const { countTokens, tokenizerFor, deriveContext, processContext, providers = [], signal: _signal, ...settings } = options;
    const config = immutable(settings);
    const stages = flattenPromptProgram(resolved).stages;
    // A preset that never mentions the Persona keeps the default: the chosen Persona is sent.
    const consumer = !presetDeclaresPersona(stages) || stages.some(stage => (stage.contextConsumers?.includes('player_persona') || stage.entries.some(entry => entry.kind === 'anchor' && !entry.disabled && entry.accepts.includes('context.player-persona'))) && (!request.prompt?.stageIds || request.prompt.stageIds.includes(stage.stageId)));
    return { ...config, countTokens: tokenizerFor?.(resolved) ?? countTokens, deriveContext, processContext, providers: [...providers],
        promptAnchors: stages.filter(stage => !request.prompt?.stageIds || request.prompt.stageIds.includes(stage.stageId))
            .flatMap(stage => stage.entries.filter(entry => entry.kind === 'anchor').map(entry => ({ ...entry }))),
        playerPersona: { enabled: config.personaAllowed === true && consumer, blockedReason: config.personaBlockedReason },
        memoryEvidence: config.memoryEvidence ?? [], modelContextLimit: resolved.model.limits.contextTokens, responseReserve: effectiveOutputReserve(resolved) };
}

// Host bridge to the existing Native selection authority. No Timeline/Knowledge scan here.
export function createNativeSessionContextAdapter({ readSnapshot, readRegex, options = {} }) {
    const { countTokens, tokenizerFor, deriveContext, processContext, providers = [], signal, ...settings } = options;
    const fixedOptions = { ...immutable(settings), countTokens, tokenizerFor, deriveContext, processContext, providers: [...providers] };
    let frozenRules;
    const processedRegions = new Map();
    return createNativeSessionContextProvider(async (request, resolved) => {
        const { source, snapshot } = await readSnapshot(request, resolved);
        frozenRules ??= readRegex ? await readRegex(resolved) : [];
        if (!frozenRules.length) return { source, plan: await compileNativeContextPlan(immutable(snapshot), nativeContextCompilationOptions(request, resolved, fixedOptions)) };
        const promptContentByMessageId = {}, supplementalContent = {}, regexDiagnostics = [];
        const variants = new Map(snapshot.variants.map(variant => [variant.variantId, variant]));
        const process = async (key, value, regionOptions) => {
            const identity = JSON.stringify([key, regionOptions]);
            if (!processedRegions.has(identity)) processedRegions.set(identity, await processNativeRegex(value, frozenRules, regionOptions, { signal }));
            return processedRegions.get(identity);
        };
        for (const [index, message] of snapshot.timeline.entries()) {
            const processed = await process(message.activeVariantId, message.content, { scope: 'prompt', region: 'prose',
                placement: message.role === 'user' ? 1 : message.role === 'assistant' ? 2 : -1, depth: snapshot.timeline.length - index - 1 });
            if (processed.text !== message.content) promptContentByMessageId[message.messageId] = processed.text;
            regexDiagnostics.push(...processed.diagnostics.map(item => ({ ...item, messageId: message.messageId })));
            const variant = variants.get(message.activeVariantId);
            const policies = variant?.metadata?.runtime?.extra?.preset_content?.contextPolicies;
            for (const block of variant?.projection?.flow ?? []) {
                if (block.type !== 'preset.content' || !['candidate', 'latest'].includes(policies?.[block.data.type])
                    || policies[block.data.type] === 'latest' && index !== snapshot.timeline.length - 1) continue;
                const key = variant.variantId + ':' + block.id;
                const result = await process(key, block.data.value, { scope: 'prompt', region: 'supplement', blockType: block.data.type,
                    placement: 2, depth: snapshot.timeline.length - index - 1 });
                supplementalContent[key] = result.text;
                regexDiagnostics.push(...result.diagnostics.map(item => ({ ...item, messageId: message.messageId, blockId: block.id })));
            }
        }
        const plan = await compileNativeContextPlan(immutable(snapshot), { ...nativeContextCompilationOptions(request, resolved, fixedOptions), promptContentByMessageId, supplementalContent });
        return { source, plan: { ...plan, regexDiagnostics } };
    });
}
