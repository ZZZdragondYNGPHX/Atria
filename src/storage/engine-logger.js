import { createLogger } from '../logging/logger.js';

const storageLogger = createLogger('storage', { emitToConsole: true });

export function logEngineError(engineKind, op, handle, err, meta = {}) {
    const code = err?.code ?? err?.name ?? 'UnknownError';
    const message = err?.message ?? String(err);
    const safeHandle = handle ?? '-';
    const line = `[storage:${engineKind}] op=${op} handle=${safeHandle} err=${code}: ${message}`;
    const extra = meta && typeof meta === 'object' ? meta : {};
    storageLogger.error('engine.error', line, {
        engineKind,
        op,
        handle: safeHandle,
        code,
        ...extra,
    }, {
        category: 'engine',
    });
}
