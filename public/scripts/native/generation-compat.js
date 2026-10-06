import { executeNativeGeneration, nativeGenerationActive } from './generation-client.js';

// Explicit compatibility island for non-Native chats. Native callers never enter
// the old generation facade, preset resolver or world-info/macro assembly path.
export async function executeFirstPartyGeneration(context, role, options = {}) {
    const observe = options.runtimeContext?.observeRequest;
    observe?.('request.attempt.started');
    try {
        if (!nativePromptUiActive() && !options.nativeSource) {
            const result = await context.generateTask(options);
            observeGenerationResult(observe, result);
            return result;
        }
        const result = await executeNativeGeneration({
            role, source: options.nativeSource, messages: options.taskMessages || [], tools: options.tools || [],
            outputContract: options.jsonSchema || null, abortSignal: options.abortSignal,
            routeRef: options.nativeRouteRef, prompt: options.nativePrompt,
            fallbackMode: options.nativeFallbackMode || 'disabled',
            onChunk: options.onChunk,
        });
        observeGenerationResult(observe, result);
        return result;
    } catch (error) { observe?.('request.attempt.failed'); throw error; }
}

function observeGenerationResult(observe, result) {
    const usage = result?.usage;
    observe?.('request.attempt.completed', { usageStatus: usage ? 'observed' : 'missing',
        hostRequestId: result?.snapshot?.requestId ?? result?.requestInfo?.requestId,
        inputTokens: usage?.inputTokens ?? usage?.prompt_tokens, outputTokens: usage?.outputTokens ?? usage?.completion_tokens,
        totalTokens: usage?.totalTokens ?? usage?.total_tokens });
}

export function firstPartyGenerationAvailable(context) {
    return nativePromptUiActive() || typeof context?.generateTask === 'function';
}

// Route retries have already been exhausted by the Native host. Legacy caller
// loops may repair tool content, but must not replay configuration/route failures.
export function isNativeGenerationFailure(error) {
    return /^(?:native_generation_|generation_)/.test(error?.code || '');
}

export function firstPartyStreamingEnabled(context, presetName) {
    return nativePromptUiActive() || (typeof context?.isStreamingPresetEnabled === 'function' && context.isStreamingPresetEnabled(presetName));
}

export function streamFirstPartyGeneration(context, role, options = {}) {
    if (!nativePromptUiActive() && !options.nativeSource) {
        const observe = options.runtimeContext?.observeRequest;
        observe?.('request.attempt.started');
        try {
            const delivery = context.generateTaskStream(options);
            const result = Promise.resolve(delivery.result).then(value => { observeGenerationResult(observe, value); return value; }, error => {
                observe?.('request.attempt.failed'); throw error;
            });
            void result.catch(() => {});
            return { ...delivery, result };
        } catch (error) { observe?.('request.attempt.failed'); throw error; }
    }
    const queue = []; let wake; let done = false;
    const result = executeFirstPartyGeneration(context, role, { ...options, onChunk: chunk => {
        queue.push(chunk); wake?.();
        options.onChunk?.(chunk);
    } }).finally(() => { done = true; wake?.(); });
    // Consumers can drain the stream before awaiting the terminal result.
    void result.catch(() => {});
    const stream = (async function* () {
        while (!done || queue.length) {
            if (queue.length) yield queue.shift();
            else await new Promise(resolve => { wake = resolve; });
        }
    })();
    return { stream, result };
}

// Non-Native authoring affordances only. Native product identity never resolves a name.
export function nativePromptUiActive() {
    return nativeGenerationActive() || globalThis.document?.body?.dataset?.atriaShellMounted === 'true';
}

export function legacyPromptManager(context) {
    return nativePromptUiActive() ? null : context?.getPresetManager?.('openai');
}

export function legacyPromptNames(context) {
    const names = legacyPromptManager(context)?.getAllPresets?.();
    return Array.isArray(names) ? [...new Set(names.map(name => String(name || '').trim()).filter(Boolean))] : [];
}

export function nativeRouteOptions() {
    return '<option value="" disabled selected>Native Runtime route — configure in Runtime</option>';
}
