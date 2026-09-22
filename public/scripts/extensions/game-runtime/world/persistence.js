export const GAME_WORLD_STATE_NAMESPACE = 'atri_game_world';

function isNativeGameSession(context) {
    return Array.isArray(context?.chat)
        && context.chat.some(message => String(message?.atri_native?.messageId || '').trim());
}

function unwrapJournal(value) {
    if (value && typeof value === 'object' && !Array.isArray(value) && value.schemaVersion === 1 && value.journal) {
        return value.journal;
    }
    return value;
}

export function createChatStateWorldPersistence(context, options = {}) {
    if (typeof context?.getChatState !== 'function' || typeof context?.updateChatState !== 'function') {
        throw new Error('Chat State API is unavailable for Game World persistence');
    }

    const stateOptions = options.target ? { target: options.target } : {};

    return Object.freeze({
        get nativeAuthority() {
            return isNativeGameSession(context);
        },

        async read() {
            const result = await context.getChatState(GAME_WORLD_STATE_NAMESPACE, stateOptions);
            if (!result?.ok) {
                throw new Error(
                    ('Game World read failed: ' + (result?.reason || 'unknown') + ' ' + (result?.hint || '')).trim(),
                );
            }
            return unwrapJournal(result.state ?? null);
        },

        async update(updater) {
            if (typeof updater !== 'function') {
                throw new Error('Game World persistence update requires a function');
            }

            let nextValue = null;
            const result = await context.updateChatState(GAME_WORLD_STATE_NAMESPACE, async (current) => {
                const currentJournal = unwrapJournal(current == null ? null : structuredClone(current));
                nextValue = await updater(currentJournal);
                return nextValue;
            }, stateOptions);
            if (!result?.ok) {
                throw new Error(
                    ('Game World update failed: ' + (result?.reason || 'unknown') + ' ' + (result?.hint || '')).trim(),
                );
            }
            return result.state ?? nextValue;
        },

        async clear() {
            if (typeof context.deleteChatState !== 'function') {
                throw new Error('Chat State delete API is unavailable for Game World persistence');
            }
            const result = await context.deleteChatState(GAME_WORLD_STATE_NAMESPACE, stateOptions);
            if (!result?.ok) {
                throw new Error(
                    ('Game World clear failed: ' + (result?.reason || 'unknown') + ' ' + (result?.hint || '')).trim(),
                );
            }
        },
    });
}
