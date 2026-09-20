import { createLogger } from '../logging/logger.js';
import { captureBackendIncident } from '../logging/runtime.js';

const storageLogger = createLogger('storage', { emitToConsole: true });

export function logEngineError(engineKind, op, handle, err, meta = {}) {
    const code = err?.code ?? err?.name ?? 'UnknownError';
    const message = err?.message ?? String(err);
    const safeHandle = handle ?? '-';
    const line = `[storage:${engineKind}] op=${op} handle=${safeHandle} err=${code}: ${message}`;
    const extra = meta && typeof meta === 'object' ? meta : {};
    const operationId = `storage:${engineKind}:${op}:${safeHandle}`;
    storageLogger.error('engine.error', line, {
        engineKind,
        op,
        handle: safeHandle,
        code,
        ...extra,
    }, {
        category: 'engine',
        correlation: { operationId },
    });
    captureBackendIncident({
        type: 'storage_failure',
        severity: 'error',
        primaryModule: 'storage',
        stage: `engine.${op}`,
        summary: line,
        failure: err,
        subjectUser: safeHandle === '-' ? '' : String(safeHandle),
        correlation: { operationId },
        environment: {
            engineKind,
            op,
            handle: safeHandle,
            code: String(code || ''),
            ...extra,
        },
    });
}
