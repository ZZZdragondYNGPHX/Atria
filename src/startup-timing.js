const PROCESS_STARTED_AT_MS = Date.now() - Math.floor(process.uptime() * 1000);
const emittedMilestones = new Set();

export function getStartupElapsedMs() {
    return Math.max(0, Date.now() - PROCESS_STARTED_AT_MS);
}

export function markStartupMilestone(name, details = '') {
    const key = String(name || '').trim();
    if (!key || emittedMilestones.has(key)) {
        return;
    }

    emittedMilestones.add(key);
    const suffix = details ? ` ${details}` : '';
    console.log(`[startup] +${getStartupElapsedMs()}ms ${key}${suffix}`);
}

export function startStartupPhase(name) {
    const startedAt = Date.now();
    return (details = '') => {
        const elapsed = Math.max(0, Date.now() - startedAt);
        const suffix = details ? ` ${details}` : '';
        console.log(`[startup] phase ${name} ${elapsed}ms${suffix}`);
        return elapsed;
    };
}

export const __startupTimingTestUtils = {
    clear: () => emittedMilestones.clear(),
};
