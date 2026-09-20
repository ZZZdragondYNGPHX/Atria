import {
    BACKUP_SYNC_JOB_STATES,
    BackupSyncJobManager,
} from '../../../src/backup-sync/jobs/manager.js';

describe('backup/sync job manager', () => {
    test('tracks provider operation progress through success', () => {
        const manager = new BackupSyncJobManager();
        const created = manager.create({
            providerId: 'google-drive',
            operation: 'upload',
            metadata: { artifact: 'backup.zip' },
        });
        expect(created.state).toBe(BACKUP_SYNC_JOB_STATES.QUEUED);

        const started = manager.start(created.id, { phase: 'upload', total: 100 });
        expect(started.state).toBe(BACKUP_SYNC_JOB_STATES.RUNNING);

        const progressed = manager.progress(created.id, {
            phase: 'upload',
            current: 45,
            total: 100,
            message: '45%',
        });
        expect(progressed.progress).toMatchObject({ current: 45, total: 100 });

        const done = manager.succeed(created.id, { remoteId: 'abc' });
        expect(done.state).toBe(BACKUP_SYNC_JOB_STATES.SUCCEEDED);
        expect(done.result).toEqual({ remoteId: 'abc' });
        expect(done.finishedAt).toBeTruthy();
    });

    test('normalizes failures and cancellation', () => {
        const manager = new BackupSyncJobManager();
        const failed = manager.create({ providerId: 'github', operation: 'download' });
        manager.start(failed.id);
        const error = new Error('network failed');
        error.code = 'E_NETWORK';
        const result = manager.fail(failed.id, error);
        expect(result).toMatchObject({
            state: BACKUP_SYNC_JOB_STATES.FAILED,
            error: { message: 'network failed', code: 'E_NETWORK' },
        });

        const cancelled = manager.create({ providerId: 'lan-sync', operation: 'sync' });
        const cancelledResult = manager.cancel(cancelled.id, 'user stopped');
        expect(cancelledResult).toMatchObject({
            state: BACKUP_SYNC_JOB_STATES.CANCELLED,
            error: { code: 'ABORTED', message: 'user stopped' },
        });
    });

    test('returns defensive copies and filters job history', () => {
        const manager = new BackupSyncJobManager();
        const one = manager.create({ providerId: 'local-file', operation: 'restore' });
        manager.create({ providerId: 'lan-sync', operation: 'sync' });
        const copy = manager.get(one.id);
        copy.metadata.changed = true;
        expect(manager.get(one.id).metadata.changed).toBeUndefined();
        expect(manager.list({ providerId: 'lan-sync' })).toHaveLength(1);
    });
});
