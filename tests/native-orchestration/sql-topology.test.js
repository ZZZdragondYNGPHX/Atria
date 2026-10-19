import { jest } from '@jest/globals';
import mysql from 'mysql2/promise';
import pg from 'pg';
import { DIRECT_NATIVE_SQL_TOPOLOGY, assertNativeSqlTopology, inspectMysqlNativeTopology, inspectPgNativeTopology, assertNativeSqlSession } from '../../src/storage/native-sql-topology.js';
import { MysqlEngine } from '../../src/storage/engines/mysql-engine.js';
import { PgEngine } from '../../src/storage/engines/postgres-engine.js';
import { NativeHostOwner } from '../../src/storage/native-host-owner.js';
import { resolveStorageDbConfig, rewriteStorageBlock } from '../../src/storage/config-persistence.js';

// Transport doubles prove rejection/identity checks only. They cannot prove
// the deployment declaration, proxy topology or a real database session lock.
const session = { databaseName: 'test-db', serverId: 'test-server', sessionId: 7 };
const mysqlConnection = (overrides = {}) => ({ query: jest.fn(async sql => {
    if (sql.startsWith('SHOW')) return [Object.entries({ read_only: 'OFF', super_read_only: 'OFF', ...overrides }).map(([Variable_name, Value]) => ({ Variable_name, Value }))];
    return [[session]];
}) });
const pgClient = (overrides = {}) => ({ query: jest.fn(async () => ({ rows: [{ database_name: 'test-db', session_id: 7, in_recovery: false, read_only: 'off', ...overrides }] })) });
afterEach(() => jest.restoreAllMocks());

test.each([undefined, null, '', 'unknown', 'transaction_pool', 'session_pool', 'multi_primary', true])('unknown or unsupported declaration %p never becomes direct from a successful URL', value => {
    expect(() => assertNativeSqlTopology(value)).toThrow();
});
test('only the explicit supported deployment declaration passes configuration validation', () => {
    expect(() => assertNativeSqlTopology(DIRECT_NATIVE_SQL_TOPOLOGY)).not.toThrow();
});

describe.each([['mysql', MysqlEngine], ['pg', PgEngine]])('%s original Owner adapter with transport double', (kind, Engine) => {
    test.each([false, true])('checks session identity around its real lock call and closes on drift=%s', async drift => {
        let acquired = false;
        const connection = { on: jest.fn(), connect: jest.fn(async () => {}), end: jest.fn(async () => {}),
            execute: jest.fn(async () => { acquired = true; return [[{ acquired: 1 }]]; }),
            query: jest.fn(async sql => {
                if (kind === 'mysql') {
                    if (sql.startsWith('SHOW')) return [[{ Variable_name: 'read_only', Value: 'OFF' }, { Variable_name: 'super_read_only', Value: 'OFF' }]];
                    return [[{ ...session, sessionId: acquired && drift ? 8 : 7 }]];
                }
                if (sql.includes('pg_try_advisory_lock')) { acquired = true; return { rows: [{ acquired: true }] }; }
                return { rows: [{ database_name: 'test-db', session_id: acquired && drift ? 8 : 7, in_recovery: false, read_only: 'off' }] };
            }) };
        if (kind === 'mysql') jest.spyOn(mysql, 'createConnection').mockResolvedValue(connection);
        else jest.spyOn(pg, 'Client').mockImplementation(function () { return connection; });
        const engine = Object.create(Engine.prototype);
        Object.assign(engine, { nativeHostTopology: DIRECT_NATIVE_SQL_TOPOLOGY, _nativeOwnerUrl: 'unused-transport-double' });
        if (drift) await expect(engine.acquireNativeHostOwnership(() => {})).rejects.toMatchObject({ code: 'native_orchestration_sql_topology_unsupported' });
        else {
            const release = await engine.acquireNativeHostOwnership(() => {});
            expect(connection.end).not.toHaveBeenCalled(); await release();
        }
        expect(acquired).toBe(true); expect(connection.end).toHaveBeenCalledTimes(1);
    });
});
test.each([MysqlEngine, PgEngine])('SQL Engine rejects an unknown deployment before opening its dedicated Owner connection', async Engine => {
    const engine = Object.create(Engine.prototype);
    engine.nativeHostTopology = 'unknown';
    await expect(engine.acquireNativeHostOwnership(() => {})).rejects.toMatchObject({ code: 'native_orchestration_sql_topology_unsupported' });
});

test('MySQL probe accepts a writable standalone session and returns its actual database/server/session identity', async () => {
    const connection = mysqlConnection(); expect(await inspectMysqlNativeTopology(connection)).toEqual(session);
    expect(connection.query).toHaveBeenCalledTimes(2);
});
test.each([
    { read_only: 'ON' }, { super_read_only: 'ON' }, { read_only: undefined }, { super_read_only: undefined },
    { ndbcluster: 'ON' }, { have_ndbcluster: 'YES' }, { group_replication_single_primary_mode: 'OFF' },
    { group_replication_group_name: 'configured-cluster' }, { version_comment: 'MySQL Cluster NDB' },
])('MySQL probe refuses unsupported/read-only/multi-primary/NDB evidence %p', async overrides => {
    await expect(inspectMysqlNativeTopology(mysqlConnection(overrides))).rejects.toMatchObject({ code: 'native_orchestration_sql_topology_unsupported' });
});
test('PostgreSQL probe accepts a writable primary session', async () => {
    expect(await inspectPgNativeTopology(pgClient())).toEqual({ databaseName: 'test-db', sessionId: 7 });
});
test.each([{ in_recovery: true }, { in_recovery: null }, { read_only: 'on' }, { session_id: 0 }, { database_name: null }])('PostgreSQL probe rejects standby/read-only/unknown identity %p', async overrides => {
    await expect(inspectPgNativeTopology(pgClient(overrides))).rejects.toMatchObject({ code: 'native_orchestration_sql_topology_unsupported' });
});
test.each([{ databaseName: 'other-db' }, { serverId: 'other-server' }, { sessionId: 8 }])('a dedicated session change around lock acquisition is never accepted %p', change => {
    expect(() => assertNativeSqlSession(session, { ...session, ...change })).toThrow();
});

test('the Host database lease cache cannot let an unknown second Engine bypass topology validation', async () => {
    const owner = new NativeHostOwner(), release = jest.fn(async () => {}), acquire = jest.fn(async () => release);
    const engine = { nativeHostOwnershipKey: 'mysql:' + 'a'.repeat(64), assertNativeHostTopology: () => assertNativeSqlTopology(DIRECT_NATIVE_SQL_TOPOLOGY), acquireNativeHostOwnership: acquire };
    try {
        await owner.acquireDatabase(engine);
        await expect(owner.acquireDatabase({ ...engine, assertNativeHostTopology: () => assertNativeSqlTopology('unknown') })).rejects.toMatchObject({ code: 'native_orchestration_writer_unavailable' });
        expect(acquire).toHaveBeenCalledTimes(1);
    } finally { await owner.close(); }
    expect(release).toHaveBeenCalledTimes(1);
});

test('changing a configured endpoint cannot inherit or persist an earlier topology declaration', () => {
    const result = resolveStorageDbConfig({ inline: { url: 'mysql://new-host/db' }, fromConfig: { url: 'mysql://old-host/db', nativeHostTopology: DIRECT_NATIVE_SQL_TOPOLOGY } });
    expect(result.engine.nativeHostTopology).toBeUndefined(); expect(result.inlineFields.nativeHostTopology).toBe('unknown');
    const written = rewriteStorageBlock('storage:\n  mode: fs\n  mysql:\n    nativeHostTopology: direct_single_primary\n', { targetMode: 'mysql', mysqlInline: result.inlineFields });
    expect(written).toContain('nativeHostTopology: unknown');
});
test('an exact unchanged endpoint retains its declaration, and an explicitly verified replacement persists its own', () => {
    const fromConfig = { url: 'mysql://test-host/db', nativeHostTopology: DIRECT_NATIVE_SQL_TOPOLOGY };
    expect(resolveStorageDbConfig({ inline: { url: fromConfig.url }, fromConfig }).engine.nativeHostTopology).toBe(DIRECT_NATIVE_SQL_TOPOLOGY);
    const result = resolveStorageDbConfig({ inline: { url: 'mysql://new-host/db', nativeHostTopology: DIRECT_NATIVE_SQL_TOPOLOGY }, fromConfig });
    expect(result.engine.nativeHostTopology).toBe(DIRECT_NATIVE_SQL_TOPOLOGY);
    expect(rewriteStorageBlock('storage:\n  mode: fs\n', { targetMode: 'mysql', mysqlInline: result.inlineFields })).toContain('nativeHostTopology: direct_single_primary');
});
