import { executeNativeGeneration, nativeGenerationActive } from './generation-client.js';

// Explicit compatibility island for non-Native chats. Native callers never enter
// the old generation facade, preset resolver or world-info/macro assembly path.
export async function executeFirstPartyGeneration(context, role, options = {}) {
    if (!nativeGenerationActive() && !options.nativeSource) return context.generateTask(options);
    const result = await executeNativeGeneration({
        role, source: options.nativeSource, messages: options.taskMessages || [], tools: options.tools || [],
        outputContract: options.jsonSchema || null, abortSignal: options.abortSignal,
        routeRef: options.nativeRouteRef, prompt: options.nativePrompt,
        fallbackMode: options.nativeFallbackMode || 'disabled',
        onChunk: options.onChunk,
    });
    return result;
}

export function firstPartyGenerationAvailable(context) {
    return nativeGenerationActive() || typeof context?.generateTask === 'function';
}

// Route retries have already been exhausted by the Native host. Legacy caller
// loops may repair tool content, but must not replay configuration/route failures.
export function isNativeGenerationFailure(error) {
    return /^(?:native_generation_|generation_)/.test(error?.code || '');
}

export function firstPartyStreamingEnabled(context, presetName) {
    return nativeGenerationActive() || (typeof context?.isStreamingPresetEnabled === 'function' && context.isStreamingPresetEnabled(presetName));
}

export function streamFirstPartyGeneration(context, role, options = {}) {
    if (!nativeGenerationActive() && !options.nativeSource) return context.generateTaskStream(options);
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
