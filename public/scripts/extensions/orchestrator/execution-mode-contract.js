import { canonicalStringify } from './canonical-stringify.js';

// UI grouping is a projection of executionMode, never a second stored selector.
export const EXECUTION_MODE_INFO = Object.freeze({
    loop: { label: 'Research · Loop', description: 'One agent follows evidence through tools, then hands guidance to the reply model.' },
    spec: { label: 'Fixed workflow · Spec', description: 'Run author-defined stages and reviews, then hand guidance to the reply model.' },
    agenda: { label: 'Dynamic delegation · Agenda', description: 'A planner assigns tasks to specialists and summarizes their work for the reply model.' },
    director: { label: 'Direct writing · Director', description: 'Write, review and revise the actual reply draft, then commit it to chat.' },
    single: { label: 'Quick guidance (legacy)', description: 'A single Spec node using your existing global prompts. Copy it to a new workflow when ready.' },
});

export function getExecutionModeInfo(mode) {
    return EXECUTION_MODE_INFO[mode] || EXECUTION_MODE_INFO.spec;
}

export function modeForOutput(output, currentMode) {
    if (output === 'reply') return 'director';
    return currentMode in EXECUTION_MODE_INFO && currentMode !== 'director' ? currentMode : 'loop';
}

const RUNTIME_SETTING_KEYS = [
    'llmNodeApiPresetName', 'llmNodePresetName', 'includeWorldInfoWithPreset',
    'nodeIterationMaxRounds', 'reviewRerunMaxRounds', 'toolCallRetryMax',
    'maxRecentMessages', 'capsuleInjectPosition', 'capsuleInjectDepth',
    'capsuleInjectRole', 'capsuleCustomInstruction', 'rpmLimit',
    'agendaPlannerMaxRounds', 'agendaMaxConcurrentAgents', 'agendaMaxTotalRuns',
];

export function executionConfigText(profile, settings, presetId = '') {
    const runtimeSettings = Object.fromEntries(RUNTIME_SETTING_KEYS.map(key => [key, settings?.[key]]));
    return canonicalStringify({ version: 1, profile, runtimeSettings, presetId });
}

// Only a digest enters floor-state. In insecure WebViews without Web Crypto,
// disable reuse rather than using a weak fingerprint or persisting prompt text.
export async function digestExecutionConfig(text) {
    if (!globalThis.crypto?.subtle) return '';
    const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return 'v1:' + Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function getOrchestrationOutcome(run) {
    const status = run?.status || run?.runtimeTrace?.status || 'completed';
    return ['budget_exhausted', 'failed', 'cancelled'].includes(status) ? status : 'completed';
}
