// SPDX-License-Identifier: AGPL-3.0-or-later
import { getMemoryRetrievalSnapshot } from './source-lifecycle.js';
import { retrieveMemory, memoryTokenBudget, memoryTokenCounter } from './hybrid-retrieval.js';
import { getVectorConfigFromSettings, getRerankProfileFromSettings, validateVectorConfig } from './vector-index.js';
import { getEffectiveSettings } from './character-overrides.js';
import { existingStatePrompt } from './state-prompt.js';
import { nativeSessionRuntime } from '../../native/session-runtime.js';

export async function recallHybridMemory(context, query, options = {}) {
    const settings = options.settings || getEffectiveSettings(context, context.capabilitySettings?.memory_graph || {});
    const snapshot = await getMemoryRetrievalSnapshot(context);
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
        rerankProfile: settings.ragUseRerank ? getRerankProfileFromSettings(settings) : null,
        countTokens: memoryTokenCounter(context), budget: Math.min(memoryTokenBudget(settings), laneCap),
        corePacket: [existing, options.corePacket].filter(Boolean).join('\n'), existingStateText: existing, signal: options.signal, at: options.at });
    if (result.coreOverBudget) result.diagnostics.push('existing_state_exceeds_memory_budget');
    return { ...result, tokenCounting: context.getTokenCountAsync ? 'tokenizer' : 'utf8_bytes_estimate' };
}
