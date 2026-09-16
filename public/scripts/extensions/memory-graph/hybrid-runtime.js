// SPDX-License-Identifier: AGPL-3.0-or-later
import { getMemoryRetrievalSnapshot } from './source-lifecycle.js';
import { retrieveMemory, memoryTokenBudget, memoryTokenCounter } from './hybrid-retrieval.js';
import { getVectorConfigFromSettings, getRerankProfileFromSettings, validateVectorConfig } from './vector-index.js';
import { getEffectiveSettings } from './character-overrides.js';
import { existingStatePrompt } from './state-prompt.js';

export async function recallHybridMemory(context, query, options = {}) {
    const settings = options.settings || getEffectiveSettings(context, context.extensionSettings?.memory_graph || {});
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
    const result = await retrieveMemory(snapshot, query, { service: context.embeddingService,
        profile: profile && validateVectorConfig(profile).valid ? profile : null,
        rerankProfile: settings.ragUseRerank ? getRerankProfileFromSettings(settings) : null,
        countTokens: memoryTokenCounter(context), budget: memoryTokenBudget(settings),
        corePacket: [existing, options.corePacket].filter(Boolean).join('\n'), existingStateText: existing, signal: options.signal, at: options.at });
    if (result.coreOverBudget) result.diagnostics.push('existing_state_exceeds_memory_budget');
    return { ...result, tokenCounting: context.getTokenCountAsync ? 'tokenizer' : 'utf8_bytes_estimate' };
}
