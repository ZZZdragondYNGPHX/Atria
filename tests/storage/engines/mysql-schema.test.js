import { makeTempMysqlEngineHarness } from '../harness/mysql-harness.js';
import { CURRENT_SCHEMA_VERSION, initSchema } from '../../../src/storage/engines/mysql-schema.js';
import { ACCOUNT_CONTENT_TABLES } from '../../../src/storage/engines/account-content.js';
import { NATIVE_RESOURCE_KINDS } from '../../../src/native/contracts.js';
import { createNativeId } from '../../../src/native/identity.js';
import { nativeRecord } from '../../../src/native/repositories/common.js';
import { Readable } from 'node:stream';

const describeMysql = process.env.ATRIA_DISABLE_MYSQL_TESTS ? describe.skip : describe;

describeMysql('MysqlEngine schema bootstrap', () => {
    let harness;
    beforeEach(async () => {
        harness = await makeTempMysqlEngineHarness();
        // ping triggers _ensureSchema -> initSchema once
        await harness.engine.ping(harness.handle);
    });
    afterEach(async () => {
        if (harness) await harness.cleanup();
    });

    test('CURRENT_SCHEMA_VERSION includes lossless JSON content', () => {
        expect(CURRENT_SCHEMA_VERSION).toBe(3);
    });

    test('all expected tables exist (10 storage + _storage_meta)', async () => {
        const [rows] = await harness.engine._pool.query(
            'SELECT TABLE_NAME FROM information_schema.TABLES ' +
            'WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME',
        );
        const names = rows.map(r => r.TABLE_NAME);
        expect(names).toEqual(expect.arrayContaining([
            '_storage_meta',
            'chats', 'chat_states', 'settings', 'presets', 'preset_states',
            'worlds', 'named_docs', 'groups_table', 'stats', 'native_resources',
        ]));
        // Ten storage tables, including first-class Native resources, plus meta.
        expect(names.length).toBe(11);
    });

    test('chats.integrity is a STORED GENERATED column on JSON_UNQUOTE(JSON_EXTRACT(...))', async () => {
        const [rows] = await harness.engine._pool.query(
            'SELECT COLUMN_NAME, GENERATION_EXPRESSION, EXTRA, DATA_TYPE ' +
            'FROM information_schema.COLUMNS ' +
            'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = \'chats\' AND COLUMN_NAME = \'integrity\'',
        );
        expect(rows.length).toBe(1);
        const col = rows[0];
        // EXTRA contains "STORED GENERATED" for STORED generated columns.
        expect(String(col.EXTRA).toUpperCase()).toContain('STORED GENERATED');
        // Generation expression must extract from the chat_metadata.integrity
        // JSON path AND unquote it (otherwise the column returns a JSON
        // string with surrounding quotes).
        const expr = String(col.GENERATION_EXPRESSION).toLowerCase();
        expect(expr).toContain('json_unquote');
        expect(expr).toContain('json_extract');
        expect(expr).toContain('integrity');
    });

    test('integrity column actually unquotes the value on insert', async () => {
        await harness.engine._pool.query(
            `INSERT INTO chats (handle, char_dir, name, is_group, group_id, doc, updated_at, created_at)
             VALUES (?, ?, ?, 0, '', ?, ?, ?)`,
            [harness.handle, 'TestChar', 'chat1',
                JSON.stringify({ header: { chat_metadata: { integrity: 'abc-123' } }, body: [] }),
                100, 100],
        );
        const [rows] = await harness.engine._pool.query(
            'SELECT integrity FROM chats WHERE handle=? AND char_dir=? AND name=?',
            [harness.handle, 'TestChar', 'chat1'],
        );
        expect(rows.length).toBe(1);
        expect(rows[0].integrity).toBe('abc-123');
    });

    test('_storage_meta.schema_version matches the engine after initSchema', async () => {
        const [rows] = await harness.engine._pool.query(
            'SELECT value FROM _storage_meta WHERE `key` = \'schema_version\'',
        );
        expect(rows.length).toBe(1);
        expect(rows[0].value).toBe(String(CURRENT_SCHEMA_VERSION));
    });

    test('initSchema is idempotent — second call is a no-op', async () => {
        // First call already ran via ping. Second direct call must not throw.
        await expect(initSchema(harness.engine._pool)).resolves.toBeUndefined();
        // The version remains current, without duplicate metadata.
        const [rows] = await harness.engine._pool.query(
            'SELECT value FROM _storage_meta WHERE `key` = \'schema_version\'',
        );
        expect(rows.length).toBe(1);
        expect(rows[0].value).toBe(String(CURRENT_SCHEMA_VERSION));
    });
    test('v2 JSON columns upgrade in place and new exact numbers survive dump/restore', async () => {
        // Recreate the v2 content-column types in this isolated harness DB.
        for (const table of ACCOUNT_CONTENT_TABLES) await harness.engine._pool.query(`ALTER TABLE ${table} MODIFY COLUMN doc JSON NOT NULL`);
        await harness.engine._pool.query('UPDATE _storage_meta SET value=\'2\' WHERE `key`=\'schema_version\'');
        const key = { kind: NATIVE_RESOURCE_KINDS.world, handle: harness.handle, worldId: createNativeId('world') };
        const old = nativeRecord({ worldId: key.worldId, displayName: 'Existing v2 data', currentRevisionId: null }, { createdAt: 100, updatedAt: 200 });
        await harness.engine.withTransaction(harness.handle, tx => tx.putResource(key, old));
        await initSchema(harness.engine._pool);
        expect(await harness.engine.withTransaction(harness.handle, tx => tx.getResource(key))).toMatchObject(old);
        const [columns] = await harness.engine._pool.query('SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME=\'doc\'');
        expect(columns).toHaveLength(10); expect(columns.every(row => row.DATA_TYPE === 'longtext')).toBe(true);
        const exact = nativeRecord({ value: 1792037000000.0015, low: Number.MIN_VALUE, high: 1e100 }, { existing: old });
        await harness.engine.withTransaction(harness.handle, tx => tx.putResource(key, exact));
        const chunks = []; for await (const chunk of await harness.engine.dumpUser(harness.handle)) chunks.push(Buffer.from(chunk));
        await harness.engine.deleteUser(harness.handle);
        await harness.engine.restoreUser(harness.handle, Readable.from(Buffer.concat(chunks)));
        expect(await harness.engine.withTransaction(harness.handle, tx => tx.getResource(key))).toMatchObject(exact);
    });
});
