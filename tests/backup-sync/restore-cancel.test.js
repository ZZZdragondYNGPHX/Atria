import {
    isRestoreCancelledError,
    RestoreCancelledError,
    throwIfRestoreCancelled,
} from '../../src/backup-sync/restore-cancel.js';

describe('restore cancellation primitives', () => {
    test('controller abort reason survives throwIfRestoreCancelled', () => {
        const controller = new AbortController();
        const reason = new RestoreCancelledError('cancel requested');
        controller.abort(reason);

        expect(() => throwIfRestoreCancelled(controller.signal)).toThrow(reason);
        expect(isRestoreCancelledError(reason)).toBe(true);
    });

    test('generic aborts normalize to restore cancellation', () => {
        const controller = new AbortController();
        controller.abort();

        try {
            throwIfRestoreCancelled(controller.signal);
            throw new Error('expected cancellation');
        } catch (error) {
            expect(error).toMatchObject({
                code: 'ATRIA_RESTORE_CANCELLED',
                rolledBack: false,
            });
        }
    });

    test('rolled-back cancellation carries terminal state', () => {
        const error = new RestoreCancelledError(
            'Restore cancelled by user; previous data restored from recovery point.',
            { rolledBack: true },
        );
        expect(error.code).toBe('ATRIA_RESTORE_CANCELLED');
        expect(error.rolledBack).toBe(true);
    });
});
