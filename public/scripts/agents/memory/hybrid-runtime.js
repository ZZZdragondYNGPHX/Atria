// SPDX-License-Identifier: AGPL-3.0-or-later
import { getMemoryRetrievalSnapshot } from './source-lifecycle.js';
import { retrieveMemory, memoryTokenBudget, memoryTokenCounter } from './hybrid-retrieval.js';
import { getVectorConfigFromSettings, getRerankProfileFromSettings, validateVectorConfig } from './vector-index.js';
import { getEffectiveSettings } from './character-overrides.js';
import { existingStatePrompt } from './state-prompt.js';
import { nativeSessionRuntime } from '../../native/session-runtime.js';
import { resolveMemoryEligibility, eligibleMemorySnapshot } from './eligibility.js';
import { normalizeHybridMemorySettings } from './settings.js';

export async function recallHybridMemory(context, query, options = {}) {
    const settings = normalizeHybridMemorySettings(options.settings || getEffectiveSettings(context, context.capabilitySettings?.memory_graph || {}));
    if (settings.enabled === false || settings.recallEnabled === false) throw new Error('Memory recall disabled');
    const eligibility = resolveMemoryEligibility(context, options);
    eligibility.assertCurrent();
    const snapshot = eligibleMemorySnapshot(await getMemoryRetrievalSnapshot(context, { readOnly: options.readOnly === true }), eligibility);
    const existing = options.accountExistingState ? existingStatePrompt(context, settings) : '';
    const sourceGuard = snapshot.assertCurrent;
    snapshot.assertCurrent = () => {
        sourceGuard();
        if (options.accountExistingState && existing !== existingStatePrompt(context, settings)) {
            throw Object.assign(new Error('State prompt changed'), { name: 'AbortError' });
        }
    };
    const profile = getVectorConfigFromSettings(settings);
    const contextBudget = nativeSessionRuntime.active
        ? nativeSessionRuntime.contextLaneBudget('memory')
        : null;
    const laneCap = contextBudget ? Math.max(0, Number(contextBudget.tokens) || 0) : Number.POSITIVE_INFINITY;
    const result = await retrieveMemory(snapshot, query, { service: context.retrievalService,
        profile: profile && validateVectorConfig(profile).valid ? profile : null,
        rerankProfile: settings.rerankEnabled ? getRerankProfileFromSettings(settings) : null,
        countTokens: memoryTokenCounter(context), budget: Math.min(memoryTokenBudget(settings), laneCap),
        corePacket: [existing, options.corePacket].filter(Boolean).join('\n'), existingStateText: existing, signal: options.signal, at: options.at,
        rebuildVectors: options.rebuildVectors === true });
    if (result.coreOverBudget) result.diagnostics.push('existing_state_exceeds_memory_budget');
    return { ...result, tokenCounting: context.getTokenCountAsync ? 'tokenizer' : 'utf8_bytes_estimate' };
}
