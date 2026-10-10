// SPDX-License-Identifier: AGPL-3.0-or-later
const obsolete = Object.freeze(['recallMethod', 'recallApiPresetName', 'recallPresetName', 'recallMaxIterations',
    'recallRouteSystemPrompt', 'recallFinalizeSystemPrompt', 'ragUseQueryRewrite', 'ragRewriteSystemPrompt',
    'ragRewriteApiPresetName', 'ragRewriteLlmPresetName', 'ragDefaultPerTypeK', 'diffusionSteps', 'diffusionDecay',
    'diffusionTopK', 'diffusionTeleportAlpha', 'enableRerank']);

/** One-way setting cleanup; source writes keep their prior consent. No old algorithm aliases. */
export function normalizeHybridMemorySettings(settings) {
    if (!settings || typeof settings !== 'object') return settings;
    if (settings.sourceWritesEnabled === undefined) settings.sourceWritesEnabled = settings.memoryOsEnabled === true;
    if (settings.rerankEnabled === undefined) settings.rerankEnabled = settings.ragUseRerank === true;
    delete settings.memoryOsEnabled; delete settings.ragUseRerank;
    for (const key of obsolete) delete settings[key];
    if (settings.nativeRoutes && typeof settings.nativeRoutes === 'object') {
        delete settings.nativeRoutes.recall; delete settings.nativeRoutes.rewrite;
    }
    return settings;
}
