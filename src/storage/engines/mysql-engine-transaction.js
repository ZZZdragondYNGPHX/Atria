import { isDeepStrictEqual } from 'node:util';
import { NotFoundError } from '../errors.js';
import { assertSafeRepoNameShape } from '../name-validation.js';
import { normalizeLookupText } from '../../util.js';
import {
    NATIVE_STORAGE_KINDS,
    decodeNativeResourceKey,
    encodeNativeResourceKey,
    nativeResourceMatchesFilter,
    normalizeNativeResourceKey,
    sortAndLimitNativeRecords,
} from './native-resource-key.js';

// MysqlTransaction — mysql2/promise port of SqliteTransaction. Same handler
// surface and per-kind methods so Repos remain engine-agnostic. Differences
// from the SQLite version:
//   - methods are `async` (mysql2 is async; SQLite was sync wrapped in
//     Promise.resolve at the engine boundary)
//   - `conn.execute(sql, params)` returns `[rows, fields]` — destructure
//   - upserts use the MySQL 8.0.20+ aliased ROW form
//     (`INSERT ... AS new ON DUPLICATE KEY UPDATE col = new.col`), avoiding
//     the deprecated `VALUES(col)` reference
//   - JSON columns are auto-parsed by mysql2 into JS objects on SELECT;
//     `coerceJson` defensively handles the rare case where a driver upgrade
//     starts returning strings, so we don't have to re-audit every handler
//   - chats.integrity is a STORED GENERATED column, populated automatically
//     by MySQL from the JSON path the schema declares
export class MysqlTransaction {
    constructor({ conn, handle }) {
        this._conn = conn;
        this._handle = handle;
        this._handlers = new Map();
        registerChatHandler(this);
        registerSettingsHandler(this);
        registerPresetHandler(this);
        registerWorldInfoHandler(this);
        registerNamedDocHandler(this);
        registerGroupHandler(this);
        registerStatsHandler(this);
        registerNativeResourceHandlers(this);
    }

    _h(kind, method) {
        const h = this._handlers.get(kind);
        if (!h) throw new Error(`MysqlTransaction.${method}: unsupported kind ${kind}`);
        return h;
    }

    async getResource(key)       { return this._h(key.kind, 'getResource').get(key); }
    async getChatRange(key, options = {}) {
        if (key?.kind !== 'chat') throw new Error('MysqlTransaction.getChatRange: chat resource required');
        return this._h(key.kind, 'getChatRange').range(key, options);
    }
    async getChatInfo(key) {
        if (key?.kind !== 'chat') throw new Error('MysqlTransaction.getChatInfo: chat resource required');
        return this._h(key.kind, 'getChatInfo').info(key);
    }
    async appendChatMessages(key, messages, options = {}) {
        if (key?.kind !== 'chat') {
            throw new Error('MysqlTransaction.appendChatMessages: chat resource required');
        }
        return this._h(key.kind, 'appendChatMessages').append(key, messages, options);
    }
    async patchChatMessages(key, operations, options = {}) {
        if (key?.kind !== 'chat') {
            throw new Error('MysqlTransaction.patchChatMessages: chat resource required');
        }
        return this._h(key.kind, 'patchChatMessages').patch(key, operations, options);
    }
    async putResource(key, rec)  { return this._h(key.kind, 'putResource').put(key, rec); }
    async deleteResource(key)    { return this._h(key.kind, 'deleteResource').delete(key); }
    async listResources(filter)  { return this._h(filter.kind, 'listResources').list(filter); }

    async putResourceIfMatch(key, expectedIntegrity, record) {
        const handler = this._h(key.kind, 'putResourceIfMatch');
        if (typeof handler.putIfMatch === 'function') {
            return handler.putIfMatch(key, expectedIntegrity, record);
        }
        const existing = await this.getResource(key);
        if (expectedIntegrity === null) {
            if (existing !== null) return { updated: false };
        } else {
            if (existing === null) return { updated: false };
            if (existing.integrity !== expectedIntegrity) return { updated: false };
        }
        await this.putResource(key, record);
        return { updated: true };
    }
}

// mysql2 auto-parses JSON columns to JS objects, but be defensive: a future
// connection-flag change or driver upgrade could revert to raw strings. This
// helper covers both shapes uniformly so each handler keeps a single read
// path. Returns the parsed object or null on parse failure / non-object.
function coerceJson(value) {
    if (value == null) return null;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return null;
    try {
        const parsed = JSON.parse(value);
        return parsed;
    } catch { return null; }
}

// Same parity note as SqliteTransaction: group chats may be addressed by
// `groupId` alone or `name` alone; stored rows always have both populated,
// so back-fill each from the other before binding to SQL or a later lookup
// that drops one side won't match.
function chatKeyToParams(key) {
    const isGroup = !!key.isGroup;
    const groupIdRaw = key.groupId != null ? String(key.groupId) : '';
    const nameRaw = key.name != null ? String(key.name) : '';
    const groupId = isGroup ? (groupIdRaw || nameRaw) : groupIdRaw;
    const name = isGroup ? (nameRaw || groupIdRaw) : nameRaw;
    return {
        handle: key.handle,
        char_dir: key.charDir ?? '',
        name,
        is_group: isGroup ? 1 : 0,
        group_id: groupId,
    };
}

export function registerChatHandler(tx) {
    const conn = tx._conn;

    async function readRow(p) {
        const [rows] = await conn.execute(
            `SELECT doc, integrity, updated_at, created_at
             FROM chats WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?`,
            [p.handle, p.char_dir, p.name, p.is_group, p.group_id],
        );
        return rows[0] || null;
    }

    tx._handlers.set('chat', {
        async patch(key, operations, {
            expectedIntegrity = null,
            newIntegrity,
            updatedAt = Date.now(),
            chatMetadata = {},
        } = {}) {
            const parsedOps = [];
            for (const operation of Array.isArray(operations) ? operations : []) {
                const op = String(operation?.op || '').trim().toLowerCase();
                const match = /^\/(0|[1-9]\d*)$/.exec(String(operation?.path || ''));
                if (!['test', 'replace', 'remove'].includes(op) || !match) {
                    return { status: 'unsupported' };
                }
                if ((op === 'test' || op === 'replace') && !Object.hasOwn(operation, 'value')) {
                    return { status: 'unsupported' };
                }
                const serialized = op === 'replace' ? JSON.stringify(operation.value) : null;
                if (op === 'replace' && serialized === undefined) return { status: 'unsupported' };
                parsedOps.push({ op, index: Number(match[1]), value: operation?.value, serialized });
            }
            if (parsedOps.length === 0) return { status: 'unsupported' };

            const p = chatKeyToParams(key);
            const [metaRows] = await conn.execute(
                `SELECT integrity,
                        JSON_EXTRACT(doc, '$.header.chat_metadata') AS metadata_value,
                        JSON_TYPE(JSON_EXTRACT(doc, '$.header.chat_metadata')) AS metadata_type,
                        JSON_TYPE(JSON_EXTRACT(doc, '$.body')) AS body_type,
                        JSON_LENGTH(doc, '$.body') AS message_count
                 FROM chats
                 WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?
                 FOR UPDATE`,
                [p.handle, p.char_dir, p.name, p.is_group, p.group_id],
            );
            const meta = metaRows[0];
            if (!meta) return { status: 'missing' };
            if (meta.metadata_type !== 'OBJECT' || meta.body_type !== 'ARRAY') {
                return { status: 'unsupported' };
            }
            const currentIntegrity = String(meta.integrity ?? '');
            if (expectedIntegrity !== null && expectedIntegrity !== undefined
                && currentIntegrity !== expectedIntegrity) {
                return { status: 'conflict', actualIntegrity: currentIntegrity };
            }

            const currentMetadata = coerceJson(meta.metadata_value);
            if (!currentMetadata || typeof currentMetadata !== 'object' || Array.isArray(currentMetadata)) {
                return { status: 'unsupported' };
            }
            let messageCount = Math.max(0, Number(meta.message_count) || 0);

            for (const operation of parsedOps) {
                if (operation.index < 0 || operation.index >= messageCount) {
                    if (operation.op === 'test') throw new Error(`JSON Patch test failed at /${operation.index}`);
                    throw new Error(`Invalid JSON Patch ${operation.op} path. Array index out of bounds`);
                }
                const jsonPath = `$.body[${operation.index}]`;
                if (operation.op === 'test') {
                    const [rows] = await conn.execute(
                        'SELECT JSON_EXTRACT(doc, ?) AS value FROM chats WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?',
                        [jsonPath, p.handle, p.char_dir, p.name, p.is_group, p.group_id],
                    );
                    const actual = coerceJson(rows[0]?.value);
                    if (!isDeepStrictEqual(actual, operation.value)) {
                        throw new Error(`JSON Patch test failed at /${operation.index}`);
                    }
                    continue;
                }
                if (operation.op === 'replace') {
                    await conn.execute(
                        'UPDATE chats SET doc=JSON_SET(doc, ?, CAST(? AS JSON)) WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?',
                        [jsonPath, operation.serialized, p.handle, p.char_dir, p.name, p.is_group, p.group_id],
                    );
                    continue;
                }
                await conn.execute(
                    'UPDATE chats SET doc=JSON_REMOVE(doc, ?) WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?',
                    [jsonPath, p.handle, p.char_dir, p.name, p.is_group, p.group_id],
                );
                messageCount -= 1;
            }

            const mergedMetadata = {
                ...currentMetadata,
                ...(chatMetadata && typeof chatMetadata === 'object' && !Array.isArray(chatMetadata)
                    ? chatMetadata : {}),
                integrity: newIntegrity,
            };
            await conn.execute(
                `UPDATE chats
                 SET doc=JSON_SET(doc, '$.header.chat_metadata', CAST(? AS JSON)),
                     updated_at=?
                 WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?`,
                [
                    JSON.stringify(mergedMetadata),
                    updatedAt,
                    p.handle,
                    p.char_dir,
                    p.name,
                    p.is_group,
                    p.group_id,
                ],
            );

            return {
                status: 'ok',
                integrity: newIntegrity,
                applied: parsedOps.length,
                totalMessages: messageCount,
            };
        },
        async range(key, { fromIndex = 0, limit = 0 } = {}) {
            const p = chatKeyToParams(key);
            const [metaRows] = await conn.execute(
                `SELECT JSON_EXTRACT(doc, '$.header') AS header_value,
                        JSON_TYPE(JSON_EXTRACT(doc, '$.header')) AS header_type,
                        JSON_TYPE(JSON_EXTRACT(doc, '$.body')) AS body_type,
                        JSON_LENGTH(doc, '$.body') AS total_messages,
                        integrity, updated_at, created_at
                 FROM chats
                 WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?`,
                [p.handle, p.char_dir, p.name, p.is_group, p.group_id],
            );
            const meta = metaRows[0];
            if (!meta || meta.header_type !== 'OBJECT' || meta.body_type !== 'ARRAY') return null;
            const header = coerceJson(meta.header_value);
            if (!header || typeof header !== 'object' || Array.isArray(header)) return null;

            const totalMessages = Math.max(0, Number(meta.total_messages) || 0);
            const requestedFrom = Math.max(0, Math.floor(Number(fromIndex) || 0));
            const requestedLimit = Math.max(0, Math.floor(Number(limit) || 0));
            const start = Math.min(requestedFrom, totalMessages);
            const end = requestedLimit > 0
                ? Math.min(start + requestedLimit, totalMessages)
                : totalMessages;

            const [rows] = await conn.execute(
                `SELECT jt.message_value
                 FROM chats AS c
                 JOIN JSON_TABLE(
                     c.doc,
                     '$.body[*]' COLUMNS(
                         ord FOR ORDINALITY,
                         message_value JSON PATH '$'
                     )
                 ) AS jt
                 WHERE c.handle=? AND c.char_dir=? AND c.name=? AND c.is_group=? AND c.group_id=?
                   AND jt.ord > ?
                   AND (? <= 0 OR jt.ord <= ?)
                 ORDER BY jt.ord ASC`,
                [
                    p.handle,
                    p.char_dir,
                    p.name,
                    p.is_group,
                    p.group_id,
                    start,
                    requestedLimit,
                    end,
                ],
            );
            const body = [];
            for (const row of rows) {
                const parsed = coerceJson(row.message_value);
                if (parsed === null && row.message_value !== null) return null;
                body.push(parsed);
            }
            return {
                header,
                body,
                integrity: meta.integrity ?? '',
                updatedAt: Number(meta.updated_at),
                createdAt: Number(meta.created_at),
                totalMessages,
                fromIndex: start,
                nextIndex: end,
                hasMore: end < totalMessages,
            };
        },
        async info(key) {
            const p = chatKeyToParams(key);
            const [metaRows] = await conn.execute(
                `SELECT JSON_EXTRACT(doc, '$.header') AS header_value,
                        JSON_TYPE(JSON_EXTRACT(doc, '$.header')) AS header_type,
                        JSON_TYPE(JSON_EXTRACT(doc, '$.body')) AS body_type,
                        JSON_LENGTH(doc, '$.body') AS message_count,
                        OCTET_LENGTH(CAST(doc AS CHAR)) AS byte_size,
                        integrity, updated_at, created_at
                 FROM chats
                 WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?`,
                [p.handle, p.char_dir, p.name, p.is_group, p.group_id],
            );
            const row = metaRows[0];
            if (!row || row.header_type !== 'OBJECT' || row.body_type !== 'ARRAY') return null;
            const header = coerceJson(row.header_value);
            if (!header || typeof header !== 'object' || Array.isArray(header)) return null;

            const messageCount = Math.max(0, Number(row.message_count) || 0);
            let lastMessage = null;
            if (messageCount > 0) {
                const [lastRows] = await conn.execute(
                    `SELECT jt.message_value
                     FROM chats AS c
                     JOIN JSON_TABLE(
                         c.doc,
                         '$.body[*]' COLUMNS(
                             ord FOR ORDINALITY,
                             message_value JSON PATH '$'
                         )
                     ) AS jt
                     WHERE c.handle=? AND c.char_dir=? AND c.name=? AND c.is_group=? AND c.group_id=?
                     ORDER BY jt.ord DESC
                     LIMIT 1`,
                    [p.handle, p.char_dir, p.name, p.is_group, p.group_id],
                );
                if (!lastRows.length) return null;
                lastMessage = coerceJson(lastRows[0].message_value);
                if (lastMessage === null && lastRows[0].message_value !== null) return null;
            }

            return {
                header,
                integrity: row.integrity ?? '',
                updatedAt: Number(row.updated_at),
                createdAt: Number(row.created_at),
                messageCount,
                byteSize: Math.max(0, Number(row.byte_size) || 0),
                lastMessage,
            };
        },
        async append(key, messages, {
            expectedIntegrity = null,
            newIntegrity,
            updatedAt = Date.now(),
        } = {}) {
            const p = chatKeyToParams(key);
            const [metaRows] = await conn.execute(
                `SELECT integrity,
                        JSON_TYPE(JSON_EXTRACT(doc, '$.header')) AS header_type,
                        JSON_TYPE(JSON_EXTRACT(doc, '$.header.chat_metadata')) AS metadata_type,
                        JSON_TYPE(JSON_EXTRACT(doc, '$.body')) AS body_type
                 FROM chats
                 WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?
                 FOR UPDATE`,
                [p.handle, p.char_dir, p.name, p.is_group, p.group_id],
            );
            const meta = metaRows[0];
            if (!meta) return { status: 'missing' };
            if (meta.header_type !== 'OBJECT' || meta.metadata_type !== 'OBJECT' || meta.body_type !== 'ARRAY') {
                return { status: 'unsupported' };
            }

            const currentIntegrity = String(meta.integrity ?? '');
            if (expectedIntegrity !== null && expectedIntegrity !== undefined
                && currentIntegrity !== expectedIntegrity) {
                return { status: 'conflict', actualIntegrity: currentIntegrity };
            }

            const input = Array.isArray(messages) ? messages : [];
            const incomingGenIds = [...new Set(input
                .map(message => message?.extra?.gen_id)
                .filter(id => typeof id === 'string' && id.length > 0))];
            const seenGenIds = new Set();

            if (incomingGenIds.length > 0) {
                const placeholders = incomingGenIds.map(() => '?').join(',');
                const [rows] = await conn.execute(
                    `SELECT DISTINCT jt.gen_id
                     FROM chats AS c
                     JOIN JSON_TABLE(
                         c.doc,
                         '$.body[*]' COLUMNS(
                             gen_id VARCHAR(255) PATH '$.extra.gen_id' NULL ON EMPTY
                         )
                     ) AS jt
                     WHERE c.handle=? AND c.char_dir=? AND c.name=? AND c.is_group=? AND c.group_id=?
                       AND jt.gen_id IN (${placeholders})`,
                    [
                        p.handle,
                        p.char_dir,
                        p.name,
                        p.is_group,
                        p.group_id,
                        ...incomingGenIds,
                    ],
                );
                for (const row of rows) {
                    if (typeof row.gen_id === 'string') seenGenIds.add(row.gen_id);
                }
            }

            const accepted = [];
            const dedupedGenIds = [];
            for (const message of input) {
                const genId = message?.extra?.gen_id;
                if (typeof genId === 'string' && genId.length > 0 && seenGenIds.has(genId)) {
                    dedupedGenIds.push(genId);
                    continue;
                }
                if (typeof genId === 'string' && genId.length > 0) seenGenIds.add(genId);
                accepted.push(message);
            }

            const params = [];
            const bodyExpr = accepted.length > 0
                ? 'JSON_MERGE_PRESERVE(JSON_EXTRACT(doc, \'$.body\'), JSON_EXTRACT(?, \'$\'))'
                : 'JSON_EXTRACT(doc, \'$.body\')';
            if (accepted.length > 0) params.push(JSON.stringify(accepted));
            params.push(
                newIntegrity,
                updatedAt,
                p.handle,
                p.char_dir,
                p.name,
                p.is_group,
                p.group_id,
            );
            const [result] = await conn.execute(
                `UPDATE chats
                 SET doc = JSON_SET(
                         doc,
                         '$.body', ${bodyExpr},
                         '$.header.chat_metadata.integrity', ?
                     ),
                     updated_at = ?
                 WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?`,
                params,
            );
            if (result.affectedRows !== 1) return { status: 'missing' };
            return {
                status: 'ok',
                integrity: newIntegrity,
                accepted: accepted.length,
                dedupedGenIds,
            };
        },
        async get(key) {
            const p = chatKeyToParams(key);
            const row = await readRow(p);
            if (!row) return null;
            const parsed = coerceJson(row.doc);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
            if (!parsed.header || typeof parsed.header !== 'object' || Array.isArray(parsed.header)) return null;
            if (!Array.isArray(parsed.body)) return null;
            return {
                key,
                header: parsed.header,
                body: parsed.body,
                integrity: row.integrity ?? '',
                updatedAt: row.updated_at,
                createdAt: row.created_at,
            };
        },
        async put(key, record) {
            if (key.isGroup) {
                assertSafeRepoNameShape(key.groupId ?? key.name, { field: 'chat.groupId' });
            } else {
                assertSafeRepoNameShape(key.charDir, { field: 'chat.charDir' });
                assertSafeRepoNameShape(key.name, { field: 'chat.name' });
            }
            const p = chatKeyToParams(key);
            const headerWithIntegrity = {
                ...record.header,
                chat_metadata: {
                    ...(record.header.chat_metadata ?? {}),
                    integrity: record.integrity,
                },
            };
            const doc = JSON.stringify({ header: headerWithIntegrity, body: record.body });
            // Preserve existing created_at on upsert; only set fresh on first insert.
            const existing = await readRow(p);
            const now = Date.now();
            const updatedAt = record.updatedAt ?? now;
            const createdAt = record.createdAt ?? existing?.created_at ?? now;
            await conn.execute(
                `INSERT INTO chats (handle, char_dir, name, is_group, group_id, doc, updated_at, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?) AS new
                 ON DUPLICATE KEY UPDATE doc = new.doc, updated_at = new.updated_at`,
                [p.handle, p.char_dir, p.name, p.is_group, p.group_id, doc, updatedAt, createdAt],
            );
        },
        async delete(key) {
            // FK CASCADE drops chat_states rows automatically when parent row goes.
            const p = chatKeyToParams(key);
            const [result] = await conn.execute(
                'DELETE FROM chats WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?',
                [p.handle, p.char_dir, p.name, p.is_group, p.group_id],
            );
            return result.affectedRows > 0;
        },
        async list(filter) {
            const where = ['handle = ?'];
            const args = [filter.handle];
            if (typeof filter.charDir === 'string') {
                where.push('char_dir = ?');
                args.push(filter.charDir);
            }
            if (typeof filter.isGroup === 'boolean') {
                where.push('is_group = ?');
                args.push(filter.isGroup ? 1 : 0);
            }
            if (typeof filter.groupId === 'string') {
                where.push('group_id = ?');
                args.push(filter.groupId);
            }
            const orderClause = filter.orderBy === 'name' ? 'ORDER BY name ASC' : 'ORDER BY updated_at DESC';
            const [rows] = await conn.execute(
                `SELECT char_dir, name, is_group, group_id, updated_at, created_at
                 FROM chats WHERE ${where.join(' AND ')} ${orderClause}`,
                args,
            );
            const out = rows.map((row) => ({
                key: {
                    kind: 'chat',
                    handle: filter.handle,
                    charDir: row.char_dir,
                    name: row.name,
                    isGroup: !!row.is_group,
                    groupId: row.group_id || undefined,
                },
                header: undefined,
                body: undefined,
                integrity: undefined,
                updatedAt: row.updated_at,
                createdAt: row.created_at,
            }));
            if (typeof filter.limit === 'number') return out.slice(0, filter.limit);
            return out;
        },
    });

    // Sidecar tx methods — direct on tx, matching SqliteTransaction surface.
    tx.getChatState = async (chatKey, namespace) => {
        const p = chatKeyToParams(chatKey);
        const [rows] = await conn.execute(
            `SELECT doc FROM chat_states
             WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=? AND namespace=?`,
            [p.handle, p.char_dir, p.name, p.is_group, p.group_id, namespace],
        );
        const row = rows[0];
        if (!row) return null;
        return coerceJson(row.doc);
    };

    tx.putChatState = async (chatKey, namespace, doc) => {
        const p = chatKeyToParams(chatKey);
        // Precheck parent exists so we raise a typed NotFoundError instead of
        // bubbling MySQL's raw FK error (ER_NO_REFERENCED_ROW_2).
        const [parentRows] = await conn.execute(
            'SELECT 1 FROM chats WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?',
            [p.handle, p.char_dir, p.name, p.is_group, p.group_id],
        );
        if (!parentRows.length) {
            throw new NotFoundError('chat', {
                handle: chatKey.handle,
                charDir: chatKey.charDir,
                name: chatKey.name,
            });
        }
        await conn.execute(
            `INSERT INTO chat_states (handle, char_dir, name, is_group, group_id, namespace, doc)
             VALUES (?, ?, ?, ?, ?, ?, ?) AS new
             ON DUPLICATE KEY UPDATE doc = new.doc`,
            [p.handle, p.char_dir, p.name, p.is_group, p.group_id, namespace, JSON.stringify(doc)],
        );
    };

    tx.deleteChatState = async (chatKey, namespace) => {
        const p = chatKeyToParams(chatKey);
        const [result] = await conn.execute(
            `DELETE FROM chat_states
             WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=? AND namespace=?`,
            [p.handle, p.char_dir, p.name, p.is_group, p.group_id, namespace],
        );
        return result.affectedRows > 0;
    };

    tx.listChatStateNamespaces = async (chatKey) => {
        const p = chatKeyToParams(chatKey);
        const [rows] = await conn.execute(
            `SELECT namespace FROM chat_states
             WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?`,
            [p.handle, p.char_dir, p.name, p.is_group, p.group_id],
        );
        return rows.map((r) => r.namespace);
    };
}

export function registerSettingsHandler(tx) {
    const conn = tx._conn;
    tx._handlers.set('settings', {
        async get(key) {
            const [rows] = await conn.execute('SELECT doc FROM settings WHERE handle=?', [key.handle]);
            if (!rows.length) return null;
            return coerceJson(rows[0].doc);
        },
        async put(key, record) {
            await conn.execute(
                `INSERT INTO settings (handle, doc, updated_at) VALUES (?, ?, ?) AS new
                 ON DUPLICATE KEY UPDATE doc = new.doc, updated_at = new.updated_at`,
                [key.handle, JSON.stringify(record.doc), Date.now()],
            );
        },
        async delete(key) {
            const [result] = await conn.execute('DELETE FROM settings WHERE handle=?', [key.handle]);
            return result.affectedRows > 0;
        },
        list() { throw new Error('MysqlTransaction.list: settings is a singleton'); },
    });
}

function presetKeyToParams(key) {
    return { handle: key.handle, dir_key: key.dirKey, name: key.name };
}

export function registerPresetHandler(tx) {
    const conn = tx._conn;
    tx._handlers.set('preset', {
        async get(key) {
            const p = presetKeyToParams(key);
            const [rows] = await conn.execute(
                'SELECT doc FROM presets WHERE handle=? AND dir_key=? AND name=?',
                [p.handle, p.dir_key, p.name],
            );
            if (!rows.length) return null;
            const parsed = coerceJson(rows[0].doc);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
            return null;
        },
        async put(key, record) {
            assertSafeRepoNameShape(key.name, { field: 'preset.name' });
            const p = presetKeyToParams(key);
            await conn.execute(
                `INSERT INTO presets (handle, dir_key, name, doc, updated_at) VALUES (?, ?, ?, ?, ?) AS new
                 ON DUPLICATE KEY UPDATE doc = new.doc, updated_at = new.updated_at`,
                [p.handle, p.dir_key, p.name, JSON.stringify(record.doc), Date.now()],
            );
        },
        async delete(key) {
            const p = presetKeyToParams(key);
            // Cascade sidecars manually (no FK on preset_states; mirrors SQLite).
            await conn.execute(
                'DELETE FROM preset_states WHERE handle=? AND dir_key=? AND name=?',
                [p.handle, p.dir_key, p.name],
            );
            const [result] = await conn.execute(
                'DELETE FROM presets WHERE handle=? AND dir_key=? AND name=?',
                [p.handle, p.dir_key, p.name],
            );
            return result.affectedRows > 0;
        },
        async list(filter) {
            const [rows] = await conn.execute(
                'SELECT name FROM presets WHERE handle=? AND dir_key=? ORDER BY name ASC',
                [filter.handle, filter.dirKey],
            );
            return rows.map((row) => ({
                key: { kind: 'preset', handle: filter.handle, dirKey: filter.dirKey, name: row.name },
            }));
        },
    });

    tx.getPresetState = async (key, namespace) => {
        const p = presetKeyToParams(key);
        const [rows] = await conn.execute(
            'SELECT doc FROM preset_states WHERE handle=? AND dir_key=? AND name=? AND namespace=?',
            [p.handle, p.dir_key, p.name, namespace],
        );
        if (!rows.length) return null;
        const parsed = coerceJson(rows[0].doc);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        return null;
    };

    tx.putPresetState = async (key, namespace, doc) => {
        const p = presetKeyToParams(key);
        // PERMISSIVE: no parent-exists precheck (matches FsTransaction and
        // SqliteTransaction; the schema's missing FK on preset_states is the
        // structural counterpart of this policy).
        await conn.execute(
            `INSERT INTO preset_states (handle, dir_key, name, namespace, doc) VALUES (?, ?, ?, ?, ?) AS new
             ON DUPLICATE KEY UPDATE doc = new.doc`,
            [p.handle, p.dir_key, p.name, namespace, JSON.stringify(doc)],
        );
    };

    tx.deletePresetState = async (key, namespace) => {
        const p = presetKeyToParams(key);
        const [result] = await conn.execute(
            'DELETE FROM preset_states WHERE handle=? AND dir_key=? AND name=? AND namespace=?',
            [p.handle, p.dir_key, p.name, namespace],
        );
        return result.affectedRows > 0;
    };

    tx.listPresetStateNamespaces = async (key) => {
        const p = presetKeyToParams(key);
        const [rows] = await conn.execute(
            'SELECT namespace FROM preset_states WHERE handle=? AND dir_key=? AND name=?',
            [p.handle, p.dir_key, p.name],
        );
        return rows.map((r) => r.namespace);
    };
}

export function registerWorldInfoHandler(tx) {
    const conn = tx._conn;

    async function listAllNames(handle) {
        const [rows] = await conn.execute('SELECT name FROM worlds WHERE handle=?', [handle]);
        return rows;
    }

    async function resolveCanonical(handle, requested) {
        const trimmed = String(requested || '').trim();
        if (!trimmed) return null;
        // Exact match first (cheap path: utf8mb4_bin makes WHERE name=? exact).
        const [exactRows] = await conn.execute(
            'SELECT name FROM worlds WHERE handle=? AND name=?',
            [handle, trimmed],
        );
        if (exactRows.length) return exactRows[0].name;
        // Tolerant fallback via normalizeLookupText (NFC + variation-selector strip).
        const normalizedRequested = normalizeLookupText(trimmed);
        if (!normalizedRequested) return null;
        const all = await listAllNames(handle);
        const tolerant = all.find((r) => normalizeLookupText(r.name) === normalizedRequested);
        return tolerant ? tolerant.name : null;
    }

    tx._handlers.set('world', {
        async get(key) {
            const canonical = await resolveCanonical(key.handle, key.name);
            if (canonical == null) return null;
            const [rows] = await conn.execute(
                'SELECT doc FROM worlds WHERE handle=? AND name=?',
                [key.handle, canonical],
            );
            if (!rows.length) return null;
            const parsed = coerceJson(rows[0].doc);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
            return parsed;
        },
        async put(key, record) {
            assertSafeRepoNameShape(key.name, { field: 'world.name' });
            // Match FS behavior: if a tolerant match exists under a different
            // name, overwrite THAT one (so users can't accidentally create a
            // visually-identical-but-byte-distinct duplicate).
            const canonical = await resolveCanonical(key.handle, key.name);
            const targetName = canonical ?? String(key.name || '').trim();
            if (!targetName) throw new Error(`world put: invalid name ${key.name}`);
            await conn.execute(
                `INSERT INTO worlds (handle, name, doc, updated_at) VALUES (?, ?, ?, ?) AS new
                 ON DUPLICATE KEY UPDATE doc = new.doc, updated_at = new.updated_at`,
                [key.handle, targetName, JSON.stringify(record.doc), Date.now()],
            );
        },
        async delete(key) {
            const canonical = await resolveCanonical(key.handle, key.name);
            if (canonical == null) return false;
            const [result] = await conn.execute(
                'DELETE FROM worlds WHERE handle=? AND name=?',
                [key.handle, canonical],
            );
            return result.affectedRows > 0;
        },
        async list(filter) {
            const [rows] = await conn.execute(
                'SELECT name, doc FROM worlds WHERE handle=? ORDER BY name ASC',
                [filter.handle],
            );
            return rows.map((row) => {
                let parsed = {};
                const candidate = coerceJson(row.doc);
                if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
                    parsed = candidate;
                }
                const extensions = parsed.extensions && typeof parsed.extensions === 'object' && !Array.isArray(parsed.extensions)
                    ? parsed.extensions
                    : {};
                return {
                    key: { kind: 'world', handle: filter.handle, name: row.name },
                    name: parsed.name || row.name,
                    extensions,
                };
            });
        },
    });

    // Returns the canonical world name (no extension) — what WorldInfoRepo.get/save expect.
    tx.resolveWorldName = async (key) => resolveCanonical(key.handle, key.name);
}

export function registerNamedDocHandler(tx) {
    const conn = tx._conn;
    tx._handlers.set('named-doc', {
        async get(key) {
            const [rows] = await conn.execute(
                'SELECT doc FROM named_docs WHERE handle=? AND bucket=? AND name=?',
                [key.handle, key.bucket, key.name],
            );
            if (!rows.length) return null;
            const parsed = coerceJson(rows[0].doc);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
            return parsed;
        },
        async put(key, record) {
            assertSafeRepoNameShape(key.name, { field: 'named-doc.name' });
            await conn.execute(
                `INSERT INTO named_docs (handle, bucket, name, doc, updated_at) VALUES (?, ?, ?, ?, ?) AS new
                 ON DUPLICATE KEY UPDATE doc = new.doc, updated_at = new.updated_at`,
                [key.handle, key.bucket, key.name, JSON.stringify(record.doc), Date.now()],
            );
        },
        async delete(key) {
            const [result] = await conn.execute(
                'DELETE FROM named_docs WHERE handle=? AND bucket=? AND name=?',
                [key.handle, key.bucket, key.name],
            );
            return result.affectedRows > 0;
        },
        async list(filter) {
            const [rows] = await conn.execute(
                'SELECT name FROM named_docs WHERE handle=? AND bucket=? ORDER BY name ASC',
                [filter.handle, filter.bucket],
            );
            return rows.map((row) => ({
                key: {
                    kind: 'named-doc',
                    handle: filter.handle,
                    bucket: filter.bucket,
                    name: row.name,
                },
            }));
        },
    });
}

function groupKeyToParams(key) {
    return { handle: key.handle, id: String(key.id ?? '') };
}

export function registerGroupHandler(tx) {
    const conn = tx._conn;

    async function readRow(p) {
        const [rows] = await conn.execute(
            'SELECT doc, created_at FROM groups_table WHERE handle=? AND id=?',
            [p.handle, p.id],
        );
        return rows[0] || null;
    }

    tx._handlers.set('group', {
        async get(key) {
            const p = groupKeyToParams(key);
            const row = await readRow(p);
            if (!row) return null;
            const parsed = coerceJson(row.doc);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
            return parsed;
        },
        async put(key, record) {
            assertSafeRepoNameShape(key.id, { field: 'group.id' });
            const p = groupKeyToParams(key);
            if (!p.id) throw new Error(`group put: invalid id ${key.id}`);
            // Preserve existing created_at on overwrite; freshly set on first insert.
            const existing = await readRow(p);
            const now = Date.now();
            const updatedAt = record.updatedAt ?? now;
            const createdAt = record.createdAt ?? existing?.created_at ?? now;
            await conn.execute(
                `INSERT INTO groups_table (handle, id, doc, updated_at, created_at) VALUES (?, ?, ?, ?, ?) AS new
                 ON DUPLICATE KEY UPDATE doc = new.doc, updated_at = new.updated_at`,
                [p.handle, p.id, JSON.stringify(record.doc), updatedAt, createdAt],
            );
        },
        async delete(key) {
            const p = groupKeyToParams(key);
            const [result] = await conn.execute(
                'DELETE FROM groups_table WHERE handle=? AND id=?',
                [p.handle, p.id],
            );
            return result.affectedRows > 0;
        },
        async list(filter) {
            const [rows] = await conn.execute(
                'SELECT id FROM groups_table WHERE handle=? ORDER BY id ASC',
                [filter.handle],
            );
            return rows.map((row) => ({
                key: { kind: 'group', handle: filter.handle, id: row.id },
            }));
        },
    });

    // Composite read for /all — mirrors FsTransaction.listGroupsWithChatStats.
    // chat_size note: SQLite uses length(doc) which returns the JSON text
    // length. In MySQL the equivalent is LENGTH(CAST(doc AS CHAR)) — but
    // MySQL re-serializes JSON with extra whitespace (e.g. "a": 1 vs "a":1),
    // so the integer differs from both SQLite's length() and the original
    // JSON.stringify length. The frontend treats chat_size as a rough size
    // indicator only (not load-bearing), so the divergence is documented
    // and accepted (sqlite-engine-transaction.js comments same caveat).
    tx.listGroupsWithChatStats = async (filter) => {
        const [groupRows] = await conn.execute(
            'SELECT id, doc, created_at FROM groups_table WHERE handle=? ORDER BY id ASC',
            [filter.handle],
        );
        const [chatRows] = await conn.execute(
            `SELECT group_id, updated_at, LENGTH(CAST(doc AS CHAR)) AS doc_len
             FROM chats WHERE handle=? AND is_group=1`,
            [filter.handle],
        );
        const chatByGroupId = new Map();
        for (const c of chatRows) {
            const arr = chatByGroupId.get(c.group_id);
            if (arr) arr.push(c);
            else chatByGroupId.set(c.group_id, [c]);
        }
        const out = [];
        for (const row of groupRows) {
            const group = coerceJson(row.doc);
            if (!group || typeof group !== 'object' || Array.isArray(group)) continue;
            // Prefer doc.date_added (set by GroupRepo.save on first write)
            // so the value survives FS↔DB migration. Fall back to row.created_at
            // for groups created before the GroupRepo started stamping date_added.
            const docDateAdded = (typeof group.date_added === 'number' && Number.isFinite(group.date_added))
                ? group.date_added
                : null;
            group.date_added = docDateAdded ?? row.created_at;
            group.create_date = new Date(group.date_added).toISOString();
            let chat_size = 0;
            let date_last_chat = 0;
            if (Array.isArray(group.chats)) {
                for (const chatId of group.chats) {
                    const matches = chatByGroupId.get(String(chatId));
                    if (!matches) continue;
                    for (const c of matches) {
                        chat_size += Number(c.doc_len) || 0;
                        if (c.updated_at > date_last_chat) date_last_chat = c.updated_at;
                    }
                }
            }
            group.date_last_chat = date_last_chat;
            group.chat_size = chat_size;
            out.push(group);
        }
        return out;
    };
}

export function registerStatsHandler(tx) {
    const conn = tx._conn;
    tx._handlers.set('stats', {
        async get(key) {
            const [rows] = await conn.execute('SELECT doc FROM stats WHERE handle=?', [key.handle]);
            if (!rows.length) return null;
            return coerceJson(rows[0].doc);
        },
        async put(key, record) {
            await conn.execute(
                `INSERT INTO stats (handle, doc, updated_at) VALUES (?, ?, ?) AS new
                 ON DUPLICATE KEY UPDATE doc = new.doc, updated_at = new.updated_at`,
                [key.handle, JSON.stringify(record.doc), Date.now()],
            );
        },
        async delete(key) {
            const [result] = await conn.execute('DELETE FROM stats WHERE handle=?', [key.handle]);
            return result.affectedRows > 0;
        },
        list() { throw new Error('MysqlTransaction.list: stats is a singleton'); },
    });
}

export function registerNativeResourceHandlers(tx) {
    const conn = tx._conn;
    const params = (key) => {
        const normalized = normalizeNativeResourceKey(key);
        return { key: normalized, resourceKey: encodeNativeResourceKey(normalized) };
    };
    const parseRow = (kind, handle, resourceKey, row) => {
        if (!row) return null;
        const doc = coerceJson(row.doc);
        if (doc === null) return null;
        return {
            key: decodeNativeResourceKey(kind, handle, resourceKey),
            doc,
            integrity: String(row.integrity || ''),
            updatedAt: Number(row.updated_at || 0),
            createdAt: Number(row.created_at || 0),
        };
    };
    const handler = {
        async get(key) {
            const p = params(key);
            const [rows] = await conn.execute(
                `SELECT doc, integrity, updated_at, created_at FROM native_resources
                 WHERE handle=? AND kind=? AND resource_key=?`,
                [p.key.handle, p.key.kind, p.resourceKey],
            );
            return rows.length ? parseRow(p.key.kind, p.key.handle, p.resourceKey, rows[0]) : null;
        },
        async put(key, record) {
            const p = params(key);
            const now = Date.now();
            const [existingRows] = await conn.execute(
                'SELECT created_at FROM native_resources WHERE handle=? AND kind=? AND resource_key=?',
                [p.key.handle, p.key.kind, p.resourceKey],
            );
            await conn.execute(
                `INSERT INTO native_resources
                 (handle, kind, resource_key, doc, integrity, updated_at, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?) AS new
                 ON DUPLICATE KEY UPDATE
                    doc=new.doc, integrity=new.integrity, updated_at=new.updated_at`,
                [
                    p.key.handle,
                    p.key.kind,
                    p.resourceKey,
                    JSON.stringify(record.doc),
                    String(record.integrity || ''),
                    Number(record.updatedAt ?? now),
                    Number(record.createdAt ?? existingRows[0]?.created_at ?? now),
                ],
            );
        },
        async putIfMatch(key, expectedIntegrity, record) {
            const p = params(key);
            const now = Date.now();
            if (expectedIntegrity === null) {
                const [result] = await conn.execute(
                    `INSERT IGNORE INTO native_resources
                     (handle, kind, resource_key, doc, integrity, updated_at, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        p.key.handle,
                        p.key.kind,
                        p.resourceKey,
                        JSON.stringify(record.doc),
                        String(record.integrity || ''),
                        Number(record.updatedAt ?? now),
                        Number(record.createdAt ?? now),
                    ],
                );
                return { updated: result.affectedRows === 1 };
            }
            const [result] = await conn.execute(
                `UPDATE native_resources SET doc=?, integrity=?, updated_at=?
                 WHERE handle=? AND kind=? AND resource_key=? AND integrity=?`,
                [
                    JSON.stringify(record.doc),
                    String(record.integrity || ''),
                    Number(record.updatedAt ?? now),
                    p.key.handle,
                    p.key.kind,
                    p.resourceKey,
                    String(expectedIntegrity),
                ],
            );
            return { updated: result.affectedRows === 1 };
        },
        async delete(key) {
            const p = params(key);
            const [result] = await conn.execute(
                'DELETE FROM native_resources WHERE handle=? AND kind=? AND resource_key=?',
                [p.key.handle, p.key.kind, p.resourceKey],
            );
            return result.affectedRows > 0;
        },
        async list(filter) {
            const [rows] = await conn.execute(
                `SELECT resource_key, doc, integrity, updated_at, created_at
                 FROM native_resources WHERE handle=? AND kind=?`,
                [filter.handle, filter.kind],
            );
            const records = rows
                .map(row => parseRow(filter.kind, filter.handle, row.resource_key, row))
                .filter(Boolean)
                .filter(record => nativeResourceMatchesFilter(record.key, filter));
            return sortAndLimitNativeRecords(records, filter);
        },
    };
    for (const kind of NATIVE_STORAGE_KINDS) tx._handlers.set(kind, handler);
}
