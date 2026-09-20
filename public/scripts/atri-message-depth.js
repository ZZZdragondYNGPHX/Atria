/**
 * Computes SillyTavern/Atria regex depth for a chat message.
 *
 * Depth is the number of non-system messages after the target message.
 * Scanning from the target to the tail preserves exact semantics while making
 * the streaming/latest-message hot path constant-time instead of rebuilding a
 * full mapped/filtered copy of the entire chat on every format pass.
 *
 * @param {Array<object>} messages Full chat array
 * @param {number|string} messageId Message index
 * @returns {number|undefined}
 */
export function getMessageDepthFromTail(messages, messageId) {
    if (!Array.isArray(messages)) return undefined;
    const index = Number(messageId);
    if (!Number.isInteger(index) || index < 0 || index >= messages.length) return undefined;
    if (messages[index]?.is_system) return undefined;

    let depth = 0;
    for (let i = index + 1; i < messages.length; i++) {
        if (!messages[i]?.is_system) depth += 1;
    }
    return depth;
}
