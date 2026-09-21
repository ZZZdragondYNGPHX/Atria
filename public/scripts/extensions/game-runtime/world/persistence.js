export const GAME_WORLD_STATE_NAMESPACE = 'atri_game_world';

export function createChatStateWorldPersistence(context, options = {}) {
    if (typeof context?.getChatState !== 'function' || typeof context?.updateChatState !== 'function') {
        throw new Error('Chat State API is unavailable for Game World persistence');
    }

    const stateOptions = options.target ? { target: options.target } : {};

    return Object.freeze({
        async read() {
            const result = await context.getChatState(GAME_WORLD_STATE_NAMESPACE, stateOptions);
            if (!result?.ok) {
                throw new Error(
                    ('Game World read failed: ' + (result?.reason || 'unknown') + ' ' + (result?.hint || '')).trim(),
                );
            }
            return result.state ?? null;
        },

        async update(updater) {
            if (typeof updater !== 'function') {
                throw new Error('Game World persistence update requires a function');
            }

            let nextValue = null;
            const result = await context.updateChatState(GAME_WORLD_STATE_NAMESPACE, async (current) => {
                nextValue = await updater(current == null ? null : structuredClone(current));
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
