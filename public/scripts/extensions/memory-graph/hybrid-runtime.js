// SPDX-License-Identifier: AGPL-3.0-or-later
import { getMemoryRetrievalSnapshot } from './source-lifecycle.js';
import { retrieveMemory, memoryTokenBudget, memoryTokenCounter } from './hybrid-retrieval.js';
import { getVectorConfigFromSettings, getRerankProfileFromSettings, validateVectorConfig } from './vector-index.js';

export async function recallHybridMemory(context, query, options = {}) {
    const settings = options.settings || context.extensionSettings?.memory_graph || {};
    const snapshot = await getMemoryRetrievalSnapshot(context);
    const profile = getVectorConfigFromSettings(settings);
    const result = await retrieveMemory(snapshot, query, { service: context.embeddingService,
        profile: profile && validateVectorConfig(profile).valid ? profile : null,
        rerankProfile: settings.ragUseRerank ? getRerankProfileFromSettings(settings) : null,
        countTokens: memoryTokenCounter(context), budget: memoryTokenBudget(settings),
        corePacket: options.corePacket || '', signal: options.signal, at: options.at });
    return { ...result, tokenCounting: context.getTokenCountAsync ? 'tokenizer' : 'utf8_bytes_estimate' };
}
