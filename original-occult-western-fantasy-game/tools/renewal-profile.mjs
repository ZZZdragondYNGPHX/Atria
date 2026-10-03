// Validation workload only; never changes Native clocks, budgets or world policy.
export function renewalProfile({ regional = false, full = false, century = false, override } = {}) {
    if (century) {
        if (full || (override !== undefined && Number(override) !== 1000)) throw new Error('Century acceptance requires exactly 1000 turns without --regional-full');
        return { turns: 1000, years: 200, fast: false, profile: 'century-acceptance', checkpointEvery: 250, hookEvery: 6, worldEvery: 24 };
    }
    if (full && !regional) throw new Error('--regional-full requires --regional-only');
    const turns = override === undefined ? (regional && !full ? 100 : 5000) : Number(override);
    if (!Number.isSafeInteger(turns) || turns < 1) throw new Error('ATRIA_RENEWAL_TURNS must be a positive safe integer');
    if (full && turns !== 5000) throw new Error('--regional-full requires exactly 5000 turns');
    const fast = regional && turns === 100 && !full;
    return {
        turns, years: 50, fast,
        profile: fast ? 'regional-fast' : regional ? (turns >= 5000 ? 'regional-soak' : 'regional-smoke') : (turns >= 5000 ? 'renewal-soak' : 'renewal-smoke'),
        checkpointEvery: fast ? 25 : 1000,
        // Focused runs force historical reuse and institution changes instead of
        // hoping to reach the long-soak's 20/100-matter intervals.
        hookEvery: fast ? 3 : null,
        worldEvery: fast ? 6 : 100,
    };
}
