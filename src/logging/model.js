import { normalizeLogModule, normalizeLogSide } from './modules.js';
import { redactText, redactValue } from './redact.js';

export const LOG_LEVELS = Object.freeze(['trace', 'debug', 'log', 'info', 'warn', 'error']);
export const LOG_SOURCES = Object.freeze([
    'structured', 'console', 'fetch', 'window-error', 'promise-rejection', 'third-party',
]);
export const CORRELATION_KEYS = Object.freeze([
    'requestId', 'generationId', 'orchestrationRunId', 'startupSessionId', 'operationId',
]);

export function normalizeLogLevel(level) {
    const normalized = String(level || 'log').trim().toLowerCase();
    return LOG_LEVELS.includes(normalized) ? normalized : 'log';
}

export function normalizeLogSource(source) {
    const normalized = String(source || 'structured').trim().toLowerCase();
    return LOG_SOURCES.includes(normalized) ? normalized : 'structured';
}

export function normalizeCorrelation(correlation = {}) {
    const input = correlation && typeof correlation === 'object' ? correlation : {};
    const aliases = {
        requestId: ['requestId', 'request_id'],
        generationId: ['generationId', 'generation_id', 'atri_generation_id'],
        orchestrationRunId: ['orchestrationRunId', 'orchestration_run_id', 'runId', 'run_id'],
        startupSessionId: ['startupSessionId', 'startup_session_id'],
        operationId: ['operationId', 'operation_id'],
    };
    const output = {};
    for (const key of CORRELATION_KEYS) {
        const value = aliases[key]
            .map(alias => input[alias])
            .find(candidate => candidate !== undefined && candidate !== null && String(candidate).trim());
        if (value !== undefined) output[key] = redactText(String(value).trim()).slice(0, 256);
    }
    return output;
}

export function normalizeLogEntry(input = {}, defaults = {}) {
    const side = normalizeLogSide(input.side || defaults.side || 'backend');
    const timestamp = Number.isFinite(Number(input.timestamp))
        ? Math.max(0, Math.floor(Number(input.timestamp)))
        : Date.now();
    return {
        ...(Number.isFinite(Number(input.id)) ? { id: Math.max(1, Math.floor(Number(input.id))) } : {}),
        timestamp,
        side,
        level: normalizeLogLevel(input.level),
        module: normalizeLogModule(input.module || defaults.module, side),
        category: redactText(String(input.category || defaults.category || 'runtime')).slice(0, 128),
        event: redactText(String(input.event || defaults.event || 'log')).slice(0, 160),
        message: redactText(String(input.message || '')).slice(0, 12000),
        data: redactValue(input.data ?? {}),
        correlation: normalizeCorrelation(input.correlation || defaults.correlation),
        source: normalizeLogSource(input.source || defaults.source || 'structured'),
    };
}
