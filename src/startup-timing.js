import { createLogger } from './logging/logger.js';
import {
    recordServerStartupMilestone,
    recordServerStartupPhase,
    serverBootId,
} from './logging/startup-store.js';

const PROCESS_STARTED_AT_MS = Date.now() - Math.floor(process.uptime() * 1000);
const emittedMilestones = new Set();
const startupLogger = createLogger('startup', { emitToConsole: true });

export function getStartupElapsedMs() {
    return Math.max(0, Date.now() - PROCESS_STARTED_AT_MS);
}

export function markStartupMilestone(name, details = '') {
    const key = String(name || '').trim();
    if (!key || emittedMilestones.has(key)) {
        return;
    }

    emittedMilestones.add(key);
    const elapsedMs = getStartupElapsedMs();
    const suffix = details ? ` ${details}` : '';
    recordServerStartupMilestone({ name: key, elapsedMs, details });
    startupLogger.log(key, `[startup] +${elapsedMs}ms ${key}${suffix}`, {
        serverBootId,
        elapsedMs,
        ...(details ? { details: String(details) } : {}),
    }, {
        category: 'milestone',
        correlation: { operationId: serverBootId },
    });
}

export function startStartupPhase(name) {
    const phase = String(name || '').trim() || 'unknown';
    const startedAt = Date.now();
    return (details = '') => {
        const elapsedMs = Math.max(0, Date.now() - startedAt);
        const suffix = details ? ` ${details}` : '';
        recordServerStartupPhase({ name: phase, durationMs: elapsedMs, details });
        startupLogger.log(`phase.${phase}`, `[startup] phase ${phase} ${elapsedMs}ms${suffix}`, {
            serverBootId,
            phase,
            elapsedMs,
            ...(details ? { details: String(details) } : {}),
        }, {
            category: 'phase',
            correlation: { operationId: serverBootId },
        });
        return elapsedMs;
    };
}

export const __startupTimingTestUtils = {
    clear: () => emittedMilestones.clear(),
};
