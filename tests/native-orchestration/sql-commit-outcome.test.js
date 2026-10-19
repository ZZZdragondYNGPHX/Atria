import { jest } from '@jest/globals';
import { AsyncLocalStorage } from 'node:async_hooks';
import { TransactionScope } from '../../src/storage/engines/transaction-scope.js';
import { installAccountQuota } from '../../src/storage/account-quota.js';
import { MysqlEngine } from '../../src/storage/engines/mysql-engine.js';
import { PgEngine } from '../../src/storage/engines/postgres-engine.js';

describe.each([['mysql', MysqlEngine], ['postgres', PgEngine]])('%s SQL commit outcome', (kind, Engine) => {
    let engine, commit, operation, unlock, connection;
    beforeEach(() => {
        // Use the real Engine transaction method with a transport fault double,
        // without creating a pool, socket or artificial second storage service.
        engine = Object.create(Engine.prototype);
        Object.assign(engine, { kind, _schemaReady: Promise.resolve(), _retries: { transient: 2 }, _acquireTimeoutMs: 1000,
            _accountLease: new AsyncLocalStorage(), _transactionScope: new TransactionScope() });
        commit = jest.fn(async () => {});
        operation = jest.fn(async () => 'outcome');
        unlock = jest.fn(async () => ({}));
        connection = { beginTransaction: async () => {}, commit, rollback: async () => {}, release: jest.fn(), destroy: jest.fn(),
            query: async sql => {
                if (sql === 'COMMIT') return commit();
                if (sql.includes('RELEASE_LOCK') || sql.includes('pg_advisory_unlock')) return unlock();
                if (sql.includes('DATABASE()')) return [[{ db: 'controlled-test-db' }]];
                if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
                return { rows: [] };
            } };
        engine._pool = { getConnection: async () => connection, connect: async () => connection };
    });

    test('COMMIT ACK loss stays unknown and never reexecutes the transaction closure', async () => {
        commit.mockRejectedValueOnce(Object.assign(new Error('ACK lost'), { code: 'ECONNRESET' }));
        await expect(engine.withTransaction('test', operation)).rejects.toMatchObject({ code: 'storage_commit_unknown' });
        expect(operation).toHaveBeenCalledTimes(1);
        expect(commit).toHaveBeenCalledTimes(1);
    });

    test('a server-confirmed deadlock may retry the same deterministic operation', async () => {
        operation.mockRejectedValueOnce(Object.assign(new Error('deadlock'), { code: kind === 'mysql' ? 'ER_LOCK_DEADLOCK' : '40P01' }));
        expect(await engine.withTransaction('test', operation)).toBe('outcome');
        expect(operation).toHaveBeenCalledTimes(2);
        expect(commit).toHaveBeenCalledTimes(1);
    });

    test('a network error during the closure is not promoted to known rollback/retry', async () => {
        operation.mockRejectedValueOnce(Object.assign(new Error('connection lost'), { code: 'ECONNRESET' }));
        await expect(engine.withTransaction('test', operation)).rejects.toMatchObject({ code: 'ECONNRESET' });
        expect(operation).toHaveBeenCalledTimes(1);
        expect(commit).not.toHaveBeenCalled();
    });

    test('an account-lock release failure preserves the original COMMIT-unknown and discards the broken lease', async () => {
        commit.mockRejectedValueOnce(Object.assign(new Error('ACK lost'), { code: 'ECONNRESET' }));
        unlock.mockRejectedValueOnce(new Error('unlock also lost'));
        await expect(engine.withAccountLock('test', () => engine.withTransaction('test', operation))).rejects.toMatchObject({ code: 'storage_commit_unknown' });
        expect(operation).toHaveBeenCalledTimes(1);
        if (kind === 'mysql') expect(connection.destroy).toHaveBeenCalledTimes(1);
        else expect(connection.release).toHaveBeenCalledWith(true);
    });

    test('original quota composition preserves never-retry transaction options', async () => {
        installAccountQuota(engine, { directoriesByHandle: () => ({}), limit: async () => -1 });
        operation.mockRejectedValueOnce(Object.assign(new Error('stream cannot rewind'), { code: kind === 'mysql' ? 'ER_LOCK_DEADLOCK' : '40P01' }));
        await expect(engine.withTransaction('test', operation, { retryMode: 'never' })).rejects.toThrow('cannot rewind');
        expect(operation).toHaveBeenCalledTimes(1);
    });
});
