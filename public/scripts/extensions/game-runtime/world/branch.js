/**
 * Conversation to game-world branch mapping.
 *
 * A branch path records the active swipe id at every chat floor. Events keep
 * the path that was active when they committed. Replay accepts an event only
 * when that historical path is a prefix of the currently selected path.
 */

function normalizeSwipeId(value) {
    return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function normalizeGameBranchPath(input) {
    if (!Array.isArray(input)) return [];
    const output = [];
    for (const value of input) {
        const number = Number(value);
        if (!Number.isInteger(number) || number < 0) {
            throw new Error('Game branch path must contain non-negative integer swipe ids');
        }
        output.push(number);
    }
    return output;
}

export function buildGameBranchPath(chat) {
    if (!Array.isArray(chat)) return [];
    return chat.map(message => normalizeSwipeId(message?.swipe_id));
}

export function getGameBranchId(branchPath) {
    const normalized = normalizeGameBranchPath(branchPath);
    return normalized.length === 0 ? 'root' : 'swipes:' + normalized.join('.');
}

export function isGameBranchPathCompatible(historicalPath, activePath) {
    const historical = normalizeGameBranchPath(historicalPath);
    const active = normalizeGameBranchPath(activePath);
    if (historical.length > active.length) return false;
    for (let index = 0; index < historical.length; index += 1) {
        if (historical[index] !== active[index]) return false;
    }
    return true;
}
