// Orchestrator-specific tool-calling facade.
//
// The shared iteration runner stays provider-agnostic because CPA / CEA /
// Memory Graph also consume it. Orchestrator layers its Workspace Default API
// fallback policy here instead.
import {
    requestToolCallWithRetry as requestToolCallWithRetryBase,
    requestToolCallsWithRetry as requestToolCallsWithRetryBase,
} from '../../lib/iter-tool-calling.js';
import { runWithOrchestrationApiFallback } from './api-fallback.js';

export * from '../../lib/iter-tool-calling.js';

function normalizeOptions(options) {
    return options && typeof options === 'object' ? options : {};
}

export async function requestToolCallWithRetry(context, settings, options = {}) {
    const source = normalizeOptions(options);
    return await runWithOrchestrationApiFallback({
        primaryApiPresetName: source.apiPresetName,
        fallbackApiPresetName: source.fallbackApiPresetName,
        abortSignal: source.abortSignal,
        onEvent: source.onApiFallback,
        execute: apiPresetName => requestToolCallWithRetryBase(context, settings, {
            ...source,
            apiPresetName,
        }),
    });
}

export async function requestToolCallsWithRetry(context, settings, options = {}) {
    const source = normalizeOptions(options);
    return await runWithOrchestrationApiFallback({
        primaryApiPresetName: source.apiPresetName,
        fallbackApiPresetName: source.fallbackApiPresetName,
        abortSignal: source.abortSignal,
        onEvent: source.onApiFallback,
        execute: apiPresetName => requestToolCallsWithRetryBase(context, settings, {
            ...source,
            apiPresetName,
        }),
    });
}
