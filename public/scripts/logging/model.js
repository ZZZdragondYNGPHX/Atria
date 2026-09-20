import { normalizeFrontendLogModule } from './modules.js';
import { redactText, redactValue } from './redact.js';

export const FRONTEND_LOG_LEVELS = Object.freeze(['trace', 'debug', 'log', 'info', 'warn', 'error']);
export const FRONTEND_LOG_SOURCES = Object.freeze([
    'structured', 'console', 'fetch', 'window-error', 'promise-rejection', 'third-party',
]);
export const FRONTEND_CORRELATION_KEYS = Object.freeze([
    'requestId', 'generationId', 'orchestrationRunId', 'startupSessionId', 'operationId',
]);

export function normalizeFrontendCorrelation(correlation = {}) {
    const input = correlation && typeof correlation === 'object' ? correlation : {};
    const aliases = {
        requestId: ['requestId', 'request_id'],
        generationId: ['generationId', 'generation_id', 'atri_generation_id'],
        orchestrationRunId: ['orchestrationRunId', 'orchestration_run_id', 'runId', 'run_id'],
        startupSessionId: ['startupSessionId', 'startup_session_id'],
        operationId: ['operationId', 'operation_id'],
    };
    const output = {};
    for (const key of FRONTEND_CORRELATION_KEYS) {
        const value = aliases[key]
            .map(alias => input[alias])
            .find(candidate => candidate !== undefined && candidate !== null && String(candidate).trim());
        if (value !== undefined) output[key] = redactText(String(value).trim()).slice(0, 256);
    }
    return output;
}

export function normalizeFrontendLogEntry(input = {}) {
    const level = String(input.level || 'log').trim().toLowerCase();
    const source = String(input.source || 'structured').trim().toLowerCase();
    return {
        ...(Number.isFinite(Number(input.id)) ? { id: Math.max(1, Math.floor(Number(input.id))) } : {}),
        timestamp: Number.isFinite(Number(input.timestamp)) ? Math.max(0, Math.floor(Number(input.timestamp))) : Date.now(),
        side: 'frontend',
        level: FRONTEND_LOG_LEVELS.includes(level) ? level : 'log',
        module: normalizeFrontendLogModule(input.module),
        category: redactText(String(input.category || 'runtime')).slice(0, 128),
        event: redactText(String(input.event || 'log')).slice(0, 160),
        message: redactText(String(input.message || '')).slice(0, 12000),
        data: redactValue(input.data ?? {}),
        correlation: normalizeFrontendCorrelation(input.correlation),
        source: FRONTEND_LOG_SOURCES.includes(source) ? source : 'structured',
    };
}
