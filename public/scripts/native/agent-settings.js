import { formatShellText as formatProductText } from '../atria-shell/localization.js';
import { configuredNativeRoute } from './runtime-route-ref.js';

const legacyNames = new Set([
    'apiPresetName', 'promptPresetName', 'llmPresetName',
    'llmNodeApiPresetName', 'llmNodePresetName', 'llmNodePromptPresetName',
    'requestApiPresetName', 'requestLlmPresetName', 'aiSuggestApiPresetName', 'aiSuggestPresetName', 'aiSuggestPromptPresetName',
    'recallApiPresetName', 'recallPresetName', 'extractApiPresetName', 'extractPresetName',
    'schemaIterationApiPresetName', 'schemaIterationPresetName', 'ragRewriteApiPresetName', 'ragRewriteLlmPresetName',
]);

/** Remove obsolete names, without resolving or converting any legacy resource. */
export function clearNativePresetNames(settings) {
    if (!settings || typeof settings !== 'object') return settings;
    for (const key of legacyNames) delete settings[key];
    return settings;
}

/** Native authored Agent definitions only store routing, never provider presets. */
export function normalizeNativeAgentModel(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid Native Agent routing');
    for (const key of Object.keys(value)) if (key !== 'nativeRouteRef' && !legacyNames.has(key)) throw new TypeError(formatProductText('Unsupported Native Agent model field: ${0}', [key]));
    return configuredNativeRoute(value);
}

export function normalizeNativeAgentPlan(plan) {
    for (const agent of plan.agents || []) {
        agent.modelProfile = normalizeNativeAgentModel(agent.modelProfile);
        clearNativePresetNames(agent.metadata?.hostAdapters?.atria);
        clearNativePresetNames(agent.metadata?.config);
    }
    for (const node of plan.nodes || []) clearNativePresetNames(node.metadata?.nodeSpec);
    clearNativePresetNames(plan.metadata?.hostAdapters?.atria);
    return plan;
}
