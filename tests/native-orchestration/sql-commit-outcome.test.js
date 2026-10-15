import { jest } from '@jest/globals';
import { MysqlEngine } from '../../src/storage/engines/mysql-engine.js';
import { PgEngine } from '../../src/storage/engines/postgres-engine.js';

describe.each([['mysql', MysqlEngine], ['postgres', PgEngine]])('%s SQL commit outcome', (kind, Engine) => {
    let engine, commit, operation;
    beforeEach(() => {
        // Use the real Engine transaction method with a transport fault double,
        // without creating a pool, socket or artificial second storage service.
        engine = Object.create(Engine.prototype);
        Object.assign(engine, { kind, _schemaReady: Promise.resolve(), _retries: { transient: 2 }, _acquireTimeoutMs: 1000 });
        commit = jest.fn(async () => {});
        operation = jest.fn(async () => 'outcome');
        const connection = { beginTransaction: async () => {}, commit, rollback: async () => {}, release: () => {},
            query: async sql => { if (sql === 'COMMIT') return commit(); return { rows: [] }; } };
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
});
