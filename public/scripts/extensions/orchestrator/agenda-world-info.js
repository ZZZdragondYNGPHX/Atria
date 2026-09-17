import { normalizeRuntimeWorldInfo, normalizeWorldInfoResolverMessages, rewriteDepthWorldInfoToAfter } from './world-info.js';
import { throwIfAborted } from './abort-utils.js';

/** Resolve from binding identities before scanning, never from merged main-chat text. */
export async function resolveAgendaWorldInfo(context, settings, messages, type = 'quiet', abortSignal = null) {
    throwIfAborted(abortSignal);
    if (settings?.includeWorldInfoWithPreset === false) return {};
    const character = context.characters?.[context.characterId];
    const main = new Set([character?.data?.extensions?.world].filter(Boolean));
    const additional = new Set(context.getCharaAuxWorlds?.(context.getCharaFilename?.(context.characterId)) || []);
    const allowed = new Set([...main, ...additional]);
    const summary = {
        character_main: main.size,
        character_additional: [...additional].filter(name => !main.has(name)).length,
        chat_skipped: (context.chatWorldInfo?.getNames?.() || []).filter(name => !allowed.has(name)).length,
        global_skipped: (context.chatWorldInfo?.globalSelection || []).filter(name => !allowed.has(name)).length,
    };
    console.debug('[orchestrator-agenda] World book bindings', summary);
    if (!allowed.size || typeof context.resolveWorldInfoForMessages !== 'function') return {};
    const resolved = await context.resolveWorldInfoForMessages(normalizeWorldInfoResolverMessages(messages), {
        type, fallbackToCurrentChat: false,
        // Entry.world is the loader's source-book identity, not a naming heuristic.
        entryFilter: entry => allowed.has(entry.world),
        postActivationHook: rewriteDepthWorldInfoToAfter,
    });
    throwIfAborted(abortSignal);
    return normalizeRuntimeWorldInfo(resolved);
}
