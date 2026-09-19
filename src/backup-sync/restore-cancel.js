export class RestoreCancelledError extends Error {
    constructor(message = 'Restore cancelled by user.', { rolledBack = false } = {}) {
        super(message);
        this.name = 'RestoreCancelledError';
        this.code = 'ATRIA_RESTORE_CANCELLED';
        this.rolledBack = Boolean(rolledBack);
    }
}

export function isRestoreCancelledError(error) {
    return error?.code === 'ATRIA_RESTORE_CANCELLED';
}

export function throwIfRestoreCancelled(signal) {
    if (!signal?.aborted) return;
    const reason = signal.reason;
    if (isRestoreCancelledError(reason)) {
        throw reason;
    }
    throw new RestoreCancelledError();
}
