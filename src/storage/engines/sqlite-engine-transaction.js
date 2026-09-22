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

export class SqliteTransaction {
    constructor({ db, handle, directoriesByHandle }) {
        this._db = db;
        this._handle = handle;
        this._directoriesByHandle = directoriesByHandle;
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
        if (!h) throw new Error(`SqliteTransaction.${method}: unsupported kind ${kind}`);
        return h;
    }

    async getResource(key)       { return this._h(key.kind, 'getResource').get(key); }
    async getChatRange(key, options = {}) {
        if (key?.kind !== 'chat') {
            throw new Error('SqliteTransaction.getChatRange: chat resource required');
        }
        return this._h(key.kind, 'getChatRange').range(key, options);
    }
    async getChatInfo(key) {
        if (key?.kind !== 'chat') {
            throw new Error('SqliteTransaction.getChatInfo: chat resource required');
        }
        return this._h(key.kind, 'getChatInfo').info(key);
    }
    async appendChatMessages(key, messages, options = {}) {
        if (key?.kind !== 'chat') {
            throw new Error('SqliteTransaction.appendChatMessages: chat resource required');
        }
        return this._h(key.kind, 'appendChatMessages').append(key, messages, options);
    }
    async patchChatMessages(key, operations, options = {}) {
        if (key?.kind !== 'chat') {
            throw new Error('SqliteTransaction.patchChatMessages: chat resource required');
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

function parseJsonEachValue(value, type) {
    if (type === 'object' || type === 'array') {
        try { return JSON.parse(value); } catch { return undefined; }
    }
    if (type === 'null') return null;
    if (type === 'true') return true;
    if (type === 'false') return false;
    if (type === 'integer' || type === 'real') return Number(value);
    if (type === 'text') return String(value);
    return undefined;
}

function chatKeyToParams(key) {
    // Group-chat parity with FsTransaction: the FS handler resolves group chat paths via
    // `groupId ?? name`, so callers may pass only one of the two. Mirror that here by
    // back-filling each from the other before binding to SQL — otherwise stored rows
    // (which always have both populated) won't match a later lookup that drops one side.
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
    const db = tx._db;
    const stmt = {
        get: db.prepare(`SELECT doc, integrity, updated_at, created_at
                         FROM chats WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?`),
        appendMeta: db.prepare(`SELECT integrity,
                                json_type(doc, '$.header') AS header_type,
                                json_type(doc, '$.header.chat_metadata') AS metadata_type,
                                json_type(doc, '$.body') AS body_type
                            FROM chats
                            WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?`),
        rangeMeta: db.prepare(`SELECT
                                json_extract(doc, '$.header') AS header_value,
                                json_type(doc, '$.header') AS header_type,
                                json_type(doc, '$.body') AS body_type,
                                json_array_length(doc, '$.body') AS total_messages,
                                integrity, updated_at, created_at
                            FROM chats
                            WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?`),
        info: db.prepare(`SELECT
                                json_extract(doc, '$.header') AS header_value,
                                json_type(doc, '$.header') AS header_type,
                                json_type(doc, '$.body') AS body_type,
                                json_array_length(doc, '$.body') AS message_count,
                                json_extract(doc, '$.body[#-1]') AS last_message_value,
                                json_type(doc, '$.body[#-1]') AS last_message_type,
                                length(CAST(doc AS BLOB)) AS byte_size,
                                integrity, updated_at, created_at
                            FROM chats
                            WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?`),
        rangeRows: db.prepare(`SELECT
                                CAST(j.key AS INTEGER) AS message_index,
                                j.value AS message_value,
                                j.type AS message_type
                            FROM chats AS c, json_each(c.doc, '$.body') AS j
                            WHERE c.handle=? AND c.char_dir=? AND c.name=? AND c.is_group=? AND c.group_id=?
                              AND CAST(j.key AS INTEGER) >= ?
                              AND (? <= 0 OR CAST(j.key AS INTEGER) < ?)
                            ORDER BY CAST(j.key AS INTEGER) ASC`),
        upsert: db.prepare(`INSERT INTO chats (handle, char_dir, name, is_group, group_id, doc, updated_at, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(handle, char_dir, name, is_group, group_id) DO UPDATE SET
                                doc = excluded.doc, updated_at = excluded.updated_at`),
        del: db.prepare('DELETE FROM chats WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?'),
        listByUpdated: db.prepare(`SELECT char_dir, name, is_group, group_id, updated_at, created_at
                                   FROM chats WHERE handle=? ORDER BY updated_at DESC`),
        listByName: db.prepare(`SELECT char_dir, name, is_group, group_id, updated_at, created_at
                                FROM chats WHERE handle=? ORDER BY name ASC`),
        countMatchingParent: db.prepare(`SELECT 1 FROM chats
                                         WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?`),
        getSidecar: db.prepare(`SELECT doc FROM chat_states
                                WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=? AND namespace=?`),
        upsertSidecar: db.prepare(`INSERT INTO chat_states (handle, char_dir, name, is_group, group_id, namespace, doc)
                                    VALUES (?, ?, ?, ?, ?, ?, ?)
                                    ON CONFLICT(handle, char_dir, name, is_group, group_id, namespace)
                                        DO UPDATE SET doc = excluded.doc`),
        delSidecar: db.prepare(`DELETE FROM chat_states
                                WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=? AND namespace=?`),
        listSidecars: db.prepare(`SELECT namespace FROM chat_states
                                  WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?`),
    };

    tx._handlers.set('chat', {
        patch(key, operations, {
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
            const meta = db.prepare(`SELECT integrity,
                    json_extract(doc, '$.header.chat_metadata') AS metadata_value,
                    json_type(doc, '$.header.chat_metadata') AS metadata_type,
                    json_type(doc, '$.body') AS body_type,
                    json_array_length(doc, '$.body') AS message_count
                FROM chats
                WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?`)
                .get(p.handle, p.char_dir, p.name, p.is_group, p.group_id);
            if (!meta) return { status: 'missing' };
            if (meta.metadata_type !== 'object' || meta.body_type !== 'array') {
                return { status: 'unsupported' };
            }
            const currentIntegrity = String(meta.integrity ?? '');
            if (expectedIntegrity !== null && expectedIntegrity !== undefined
                && currentIntegrity !== expectedIntegrity) {
                return { status: 'conflict', actualIntegrity: currentIntegrity };
            }

            let currentMetadata;
            try { currentMetadata = JSON.parse(meta.metadata_value); } catch { return { status: 'unsupported' }; }
            let messageCount = Math.max(0, Number(meta.message_count) || 0);

            for (const operation of parsedOps) {
                if (operation.index < 0 || operation.index >= messageCount) {
                    if (operation.op === 'test') throw new Error(`JSON Patch test failed at /${operation.index}`);
                    throw new Error(`Invalid JSON Patch ${operation.op} path. Array index out of bounds`);
                }
                const jsonPath = `$.body[${operation.index}]`;
                if (operation.op === 'test') {
                    const row = db.prepare(`SELECT json_extract(doc, ?) AS value, json_type(doc, ?) AS type
                        FROM chats
                        WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?`)
                        .get(jsonPath, jsonPath, p.handle, p.char_dir, p.name, p.is_group, p.group_id);
                    const actual = parseJsonEachValue(row?.value, row?.type);
                    if (!isDeepStrictEqual(actual, operation.value)) {
                        throw new Error(`JSON Patch test failed at /${operation.index}`);
                    }
                    continue;
                }
                if (operation.op === 'replace') {
                    db.prepare(`UPDATE chats
                        SET doc=json_set(doc, ?, json(?))
                        WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?`)
                        .run(jsonPath, operation.serialized, p.handle, p.char_dir, p.name, p.is_group, p.group_id);
                    continue;
                }
                db.prepare(`UPDATE chats
                    SET doc=json_remove(doc, ?)
                    WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?`)
                    .run(jsonPath, p.handle, p.char_dir, p.name, p.is_group, p.group_id);
                messageCount -= 1;
            }

            const mergedMetadata = {
                ...(currentMetadata && typeof currentMetadata === 'object' && !Array.isArray(currentMetadata)
                    ? currentMetadata : {}),
                ...(chatMetadata && typeof chatMetadata === 'object' && !Array.isArray(chatMetadata)
                    ? chatMetadata : {}),
                integrity: newIntegrity,
            };
            db.prepare(`UPDATE chats
                SET doc=json_set(doc, '$.header.chat_metadata', json(?)), updated_at=?
                WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?`)
                .run(
                    JSON.stringify(mergedMetadata),
                    updatedAt,
                    p.handle,
                    p.char_dir,
                    p.name,
                    p.is_group,
                    p.group_id,
                );

            return {
                status: 'ok',
                integrity: newIntegrity,
                applied: parsedOps.length,
                totalMessages: messageCount,
            };
        },
        append(key, messages, {
            expectedIntegrity = null,
            newIntegrity,
            updatedAt = Date.now(),
        } = {}) {
            const p = chatKeyToParams(key);
            const meta = stmt.appendMeta.get(p.handle, p.char_dir, p.name, p.is_group, p.group_id);
            if (!meta) return { status: 'missing' };
            if (meta.header_type !== 'object' || meta.metadata_type !== 'object' || meta.body_type !== 'array') {
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
                const rows = db.prepare(`SELECT DISTINCT json_extract(j.value, '$.extra.gen_id') AS gen_id
                    FROM chats AS c, json_each(c.doc, '$.body') AS j
                    WHERE c.handle=? AND c.char_dir=? AND c.name=? AND c.is_group=? AND c.group_id=?
                      AND json_extract(j.value, '$.extra.gen_id') IN (${placeholders})`)
                    .all(
                        p.handle,
                        p.char_dir,
                        p.name,
                        p.is_group,
                        p.group_id,
                        ...incomingGenIds,
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

            const appendPairs = accepted.map(() => '\'$.body[#]\', json(?)').join(', ');
            const documentExpr = appendPairs ? `json_insert(doc, ${appendPairs})` : 'doc';
            const sql = `UPDATE chats
                SET doc = json_set(${documentExpr}, '$.header.chat_metadata.integrity', ?),
                    updated_at = ?
                WHERE handle=? AND char_dir=? AND name=? AND is_group=? AND group_id=?`;
            const args = [
                ...accepted.map(message => JSON.stringify(message)),
                newIntegrity,
                updatedAt,
                p.handle,
                p.char_dir,
                p.name,
                p.is_group,
                p.group_id,
            ];
            const result = db.prepare(sql).run(...args);
            if (result.changes !== 1) return { status: 'missing' };

            return {
                status: 'ok',
                integrity: newIntegrity,
                accepted: accepted.length,
                dedupedGenIds,
            };
        },
        info(key) {
            const p = chatKeyToParams(key);
            const row = stmt.info.get(p.handle, p.char_dir, p.name, p.is_group, p.group_id);
            if (!row || row.header_type !== 'object' || row.body_type !== 'array') return null;

            let header;
            try { header = JSON.parse(row.header_value); } catch { return null; }
            if (!header || typeof header !== 'object' || Array.isArray(header)) return null;

            let lastMessage = null;
            if (Number(row.message_count) > 0) {
                lastMessage = parseJsonEachValue(row.last_message_value, row.last_message_type);
                if (lastMessage === undefined) return null;
            }

            return {
                header,
                integrity: row.integrity ?? '',
                updatedAt: row.updated_at,
                createdAt: row.created_at,
                messageCount: Math.max(0, Number(row.message_count) || 0),
                byteSize: Math.max(0, Number(row.byte_size) || 0),
                lastMessage,
            };
        },
        range(key, { fromIndex = 0, limit = 0 } = {}) {
            const p = chatKeyToParams(key);
            const meta = stmt.rangeMeta.get(p.handle, p.char_dir, p.name, p.is_group, p.group_id);
            if (!meta || meta.header_type !== 'object' || meta.body_type !== 'array') return null;

            let header;
            try { header = JSON.parse(meta.header_value); } catch { return null; }
            if (!header || typeof header !== 'object' || Array.isArray(header)) return null;

            const totalMessages = Math.max(0, Number(meta.total_messages) || 0);
            const requestedFrom = Math.max(0, Math.floor(Number(fromIndex) || 0));
            const requestedLimit = Math.max(0, Math.floor(Number(limit) || 0));
            const start = Math.min(requestedFrom, totalMessages);
            const end = requestedLimit > 0
                ? Math.min(start + requestedLimit, totalMessages)
                : totalMessages;
            const queryEnd = requestedLimit > 0 ? end : 0;
            const rows = stmt.rangeRows.all(
                p.handle,
                p.char_dir,
                p.name,
                p.is_group,
                p.group_id,
                start,
                queryEnd,
                queryEnd,
            );
            const body = [];
            for (const row of rows) {
                const parsed = parseJsonEachValue(row.message_value, row.message_type);
                if (parsed === undefined) return null;
                body.push(parsed);
            }

            return {
                header,
                body,
                integrity: meta.integrity ?? '',
                updatedAt: meta.updated_at,
                createdAt: meta.created_at,
                totalMessages,
                fromIndex: start,
                nextIndex: end,
                hasMore: end < totalMessages,
            };
        },
        get(key) {
            const p = chatKeyToParams(key);
            const row = stmt.get.get(p.handle, p.char_dir, p.name, p.is_group, p.group_id);
            if (!row) return null;
            let parsed;
            try { parsed = JSON.parse(row.doc); } catch { return null; }
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
        put(key, record) {
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
            const existing = stmt.get.get(p.handle, p.char_dir, p.name, p.is_group, p.group_id);
            const now = Date.now();
            const updatedAt = record.updatedAt ?? now;
            const createdAt = record.createdAt ?? existing?.created_at ?? now;
            stmt.upsert.run(p.handle, p.char_dir, p.name, p.is_group, p.group_id, doc, updatedAt, createdAt);
        },
        delete(key) {
            // FK CASCADE drops chat_states rows automatically when parent row goes.
            const p = chatKeyToParams(key);
            const result = stmt.del.run(p.handle, p.char_dir, p.name, p.is_group, p.group_id);
            return result.changes > 0;
        },
        list(filter) {
            // Build the WHERE clause dynamically — sqlite handles this fine
            // without prepared-statement caching since the contracts run once
            // per query shape. Filters: charDir, isGroup, groupId, limit, orderBy.
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
            const orderClause = filter.orderBy === 'name'
                ? 'ORDER BY name ASC'
                : 'ORDER BY updated_at DESC';
            const sql = `SELECT char_dir, name, is_group, group_id, updated_at, created_at
                         FROM chats WHERE ${where.join(' AND ')} ${orderClause}`;
            const rows = db.prepare(sql).all(...args);
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

    // Sidecar tx methods — direct on tx, matching FsTransaction surface.
    tx.getChatState = (chatKey, namespace) => {
        const p = chatKeyToParams(chatKey);
        const row = stmt.getSidecar.get(p.handle, p.char_dir, p.name, p.is_group, p.group_id, namespace);
        if (!row) return null;
        try { return JSON.parse(row.doc); } catch { return null; }
    };

    tx.putChatState = (chatKey, namespace, doc) => {
        const p = chatKeyToParams(chatKey);
        // Precheck parent exists so we raise a typed NotFoundError instead of
        // bubbling SQLite's raw "FOREIGN KEY constraint failed".
        const parent = stmt.countMatchingParent.get(p.handle, p.char_dir, p.name, p.is_group, p.group_id);
        if (!parent) {
            throw new NotFoundError('chat', {
                handle: chatKey.handle,
                charDir: chatKey.charDir,
                name: chatKey.name,
            });
        }
        stmt.upsertSidecar.run(p.handle, p.char_dir, p.name, p.is_group, p.group_id, namespace, JSON.stringify(doc));
    };

    tx.deleteChatState = (chatKey, namespace) => {
        const p = chatKeyToParams(chatKey);
        const result = stmt.delSidecar.run(p.handle, p.char_dir, p.name, p.is_group, p.group_id, namespace);
        return result.changes > 0;
    };

    tx.listChatStateNamespaces = (chatKey) => {
        const p = chatKeyToParams(chatKey);
        return stmt.listSidecars.all(p.handle, p.char_dir, p.name, p.is_group, p.group_id).map((r) => r.namespace);
    };
}

export function registerSettingsHandler(tx) {
    const db = tx._db;
    const stmt = {
        get: db.prepare('SELECT doc FROM settings WHERE handle = ?'),
        upsert: db.prepare(`INSERT INTO settings (handle, doc, updated_at) VALUES (?, ?, ?)
                            ON CONFLICT(handle) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at`),
        del: db.prepare('DELETE FROM settings WHERE handle = ?'),
    };
    tx._handlers.set('settings', {
        get(key) {
            const row = stmt.get.get(key.handle);
            if (!row) return null;
            try { return JSON.parse(row.doc); } catch { return null; }
        },
        put(key, record) {
            stmt.upsert.run(key.handle, JSON.stringify(record.doc), Date.now());
        },
        delete(key) {
            const result = stmt.del.run(key.handle);
            return result.changes > 0;
        },
        list() { throw new Error('SqliteTransaction.list: settings is a singleton'); },
    });
}

function presetKeyToParams(key) {
    return { handle: key.handle, dir_key: key.dirKey, name: key.name };
}

export function registerPresetHandler(tx) {
    const db = tx._db;
    const stmt = {
        get: db.prepare('SELECT doc FROM presets WHERE handle=? AND dir_key=? AND name=?'),
        upsert: db.prepare(`INSERT INTO presets (handle, dir_key, name, doc, updated_at) VALUES (?, ?, ?, ?, ?)
                            ON CONFLICT(handle, dir_key, name) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at`),
        del: db.prepare('DELETE FROM presets WHERE handle=? AND dir_key=? AND name=?'),
        list: db.prepare('SELECT name FROM presets WHERE handle=? AND dir_key=? ORDER BY name ASC'),
        // Cascading sidecar delete on preset delete is manual (no FK).
        delSidecarsForPreset: db.prepare('DELETE FROM preset_states WHERE handle=? AND dir_key=? AND name=?'),
        getSidecar: db.prepare('SELECT doc FROM preset_states WHERE handle=? AND dir_key=? AND name=? AND namespace=?'),
        upsertSidecar: db.prepare(`INSERT INTO preset_states (handle, dir_key, name, namespace, doc) VALUES (?, ?, ?, ?, ?)
                                    ON CONFLICT(handle, dir_key, name, namespace) DO UPDATE SET doc = excluded.doc`),
        delSidecar: db.prepare('DELETE FROM preset_states WHERE handle=? AND dir_key=? AND name=? AND namespace=?'),
        listSidecars: db.prepare('SELECT namespace FROM preset_states WHERE handle=? AND dir_key=? AND name=?'),
    };
    tx._handlers.set('preset', {
        get(key) {
            const p = presetKeyToParams(key);
            const row = stmt.get.get(p.handle, p.dir_key, p.name);
            if (!row) return null;
            try {
                const parsed = JSON.parse(row.doc);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
                return null;
            } catch { return null; }
        },
        put(key, record) {
            assertSafeRepoNameShape(key.name, { field: 'preset.name' });
            const p = presetKeyToParams(key);
            stmt.upsert.run(p.handle, p.dir_key, p.name, JSON.stringify(record.doc), Date.now());
        },
        delete(key) {
            const p = presetKeyToParams(key);
            // Cascade sidecars manually (no FK).
            stmt.delSidecarsForPreset.run(p.handle, p.dir_key, p.name);
            const result = stmt.del.run(p.handle, p.dir_key, p.name);
            return result.changes > 0;
        },
        list(filter) {
            const rows = stmt.list.all(filter.handle, filter.dirKey);
            return rows.map((row) => ({
                key: { kind: 'preset', handle: filter.handle, dirKey: filter.dirKey, name: row.name },
            }));
        },
    });

    tx.getPresetState = (key, namespace) => {
        const p = presetKeyToParams(key);
        const row = stmt.getSidecar.get(p.handle, p.dir_key, p.name, namespace);
        if (!row) return null;
        try {
            const parsed = JSON.parse(row.doc);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
            return null;
        } catch { return null; }
    };

    tx.putPresetState = (key, namespace, doc) => {
        const p = presetKeyToParams(key);
        // PERMISSIVE: no parent-exists precheck (matches the FS behavior).
        stmt.upsertSidecar.run(p.handle, p.dir_key, p.name, namespace, JSON.stringify(doc));
    };

    tx.deletePresetState = (key, namespace) => {
        const p = presetKeyToParams(key);
        const result = stmt.delSidecar.run(p.handle, p.dir_key, p.name, namespace);
        return result.changes > 0;
    };

    tx.listPresetStateNamespaces = (key) => {
        const p = presetKeyToParams(key);
        return stmt.listSidecars.all(p.handle, p.dir_key, p.name).map((r) => r.namespace);
    };
}

export function registerWorldInfoHandler(tx) {
    const db = tx._db;
    const stmt = {
        get: db.prepare('SELECT doc FROM worlds WHERE handle=? AND name=?'),
        upsert: db.prepare(`INSERT INTO worlds (handle, name, doc, updated_at) VALUES (?, ?, ?, ?)
                            ON CONFLICT(handle, name) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at`),
        del: db.prepare('DELETE FROM worlds WHERE handle=? AND name=?'),
        listNames: db.prepare('SELECT name FROM worlds WHERE handle=? ORDER BY name ASC'),
        listAll: db.prepare('SELECT name, doc FROM worlds WHERE handle=? ORDER BY name ASC'),
    };

    function resolveCanonical(handle, requested) {
        const trimmed = String(requested || '').trim();
        if (!trimmed) return null;
        // Exact match first.
        const exact = stmt.listNames.all(handle).find((r) => r.name === trimmed);
        if (exact) return exact.name;
        // Tolerant fallback via normalizeLookupText (NFC + variation-selector strip).
        const normalizedRequested = normalizeLookupText(trimmed);
        if (!normalizedRequested) return null;
        const tolerant = stmt.listNames.all(handle).find((r) => normalizeLookupText(r.name) === normalizedRequested);
        return tolerant ? tolerant.name : null;
    }

    tx._handlers.set('world', {
        get(key) {
            const canonical = resolveCanonical(key.handle, key.name);
            if (canonical == null) return null;
            const row = stmt.get.get(key.handle, canonical);
            if (!row) return null;
            try {
                const parsed = JSON.parse(row.doc);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
                return parsed;
            } catch { return null; }
        },
        put(key, record) {
            assertSafeRepoNameShape(key.name, { field: 'world.name' });
            // Match FS behavior: if a tolerant match exists under a different name, overwrite THAT one.
            const canonical = resolveCanonical(key.handle, key.name);
            const targetName = canonical ?? String(key.name || '').trim();
            if (!targetName) throw new Error(`world put: invalid name ${key.name}`);
            stmt.upsert.run(key.handle, targetName, JSON.stringify(record.doc), Date.now());
        },
        delete(key) {
            const canonical = resolveCanonical(key.handle, key.name);
            if (canonical == null) return false;
            const result = stmt.del.run(key.handle, canonical);
            return result.changes > 0;
        },
        list(filter) {
            const rows = stmt.listAll.all(filter.handle);
            return rows.map((row) => {
                let parsed = {};
                try {
                    const candidate = JSON.parse(row.doc);
                    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
                        parsed = candidate;
                    }
                } catch { /* swallow */ }
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
    tx.resolveWorldName = (key) => resolveCanonical(key.handle, key.name);
}

export function registerNamedDocHandler(tx) {
    const db = tx._db;
    const stmt = {
        get: db.prepare('SELECT doc FROM named_docs WHERE handle=? AND bucket=? AND name=?'),
        upsert: db.prepare(`INSERT INTO named_docs (handle, bucket, name, doc, updated_at) VALUES (?, ?, ?, ?, ?)
                            ON CONFLICT(handle, bucket, name) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at`),
        del: db.prepare('DELETE FROM named_docs WHERE handle=? AND bucket=? AND name=?'),
        list: db.prepare('SELECT name FROM named_docs WHERE handle=? AND bucket=? ORDER BY name ASC'),
    };
    tx._handlers.set('named-doc', {
        get(key) {
            const row = stmt.get.get(key.handle, key.bucket, key.name);
            if (!row) return null;
            try {
                const parsed = JSON.parse(row.doc);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
                return parsed;
            } catch { return null; }
        },
        put(key, record) {
            assertSafeRepoNameShape(key.name, { field: 'named-doc.name' });
            stmt.upsert.run(key.handle, key.bucket, key.name, JSON.stringify(record.doc), Date.now());
        },
        delete(key) {
            const result = stmt.del.run(key.handle, key.bucket, key.name);
            return result.changes > 0;
        },
        list(filter) {
            const rows = stmt.list.all(filter.handle, filter.bucket);
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
    const db = tx._db;
    const stmt = {
        get: db.prepare('SELECT doc, created_at FROM groups_table WHERE handle=? AND id=?'),
        upsert: db.prepare(`INSERT INTO groups_table (handle, id, doc, updated_at, created_at) VALUES (?, ?, ?, ?, ?)
                            ON CONFLICT(handle, id) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at`),
        del: db.prepare('DELETE FROM groups_table WHERE handle=? AND id=?'),
        list: db.prepare('SELECT id FROM groups_table WHERE handle=? ORDER BY id ASC'),
        listWithDoc: db.prepare('SELECT id, doc, created_at FROM groups_table WHERE handle=? ORDER BY id ASC'),
        // chat_size in FS mode is fs.statSync().size of the .jsonl file. We have no
        // file here — best available proxy is length() of the serialized JSON doc.
        // The numbers DO NOT match FS; the frontend uses chat_size as a rough size
        // indicator only (not load-bearing).
        listGroupChats: db.prepare(`SELECT group_id, updated_at, length(doc) AS doc_len
                                    FROM chats WHERE handle=? AND is_group=1`),
    };

    tx._handlers.set('group', {
        get(key) {
            const p = groupKeyToParams(key);
            const row = stmt.get.get(p.handle, p.id);
            if (!row) return null;
            try {
                const parsed = JSON.parse(row.doc);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
                return parsed;
            } catch { return null; }
        },
        put(key, record) {
            assertSafeRepoNameShape(key.id, { field: 'group.id' });
            const p = groupKeyToParams(key);
            if (!p.id) throw new Error(`group put: invalid id ${key.id}`);
            // Preserve existing created_at on overwrite; freshly set on first insert.
            const existing = stmt.get.get(p.handle, p.id);
            const now = Date.now();
            const updatedAt = record.updatedAt ?? now;
            const createdAt = record.createdAt ?? existing?.created_at ?? now;
            stmt.upsert.run(p.handle, p.id, JSON.stringify(record.doc), updatedAt, createdAt);
        },
        delete(key) {
            const p = groupKeyToParams(key);
            const result = stmt.del.run(p.handle, p.id);
            return result.changes > 0;
        },
        list(filter) {
            const rows = stmt.list.all(filter.handle);
            return rows.map((row) => ({
                key: { kind: 'group', handle: filter.handle, id: row.id },
            }));
        },
    });

    // Composite read for /all — mirrors FsTransaction.listGroupsWithChatStats.
    // chat_size here is the JSON-doc string length of each group chat row, NOT a
    // byte count of an on-disk JSONL file; the two values are not equal.
    tx.listGroupsWithChatStats = (filter) => {
        const groupRows = stmt.listWithDoc.all(filter.handle);
        const chatRows = stmt.listGroupChats.all(filter.handle);
        const chatByGroupId = new Map();
        for (const c of chatRows) {
            const arr = chatByGroupId.get(c.group_id);
            if (arr) arr.push(c);
            else chatByGroupId.set(c.group_id, [c]);
        }
        const out = [];
        for (const row of groupRows) {
            let group;
            try { group = JSON.parse(row.doc); } catch { continue; }
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
                        chat_size += c.doc_len;
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
    const db = tx._db;
    const stmt = {
        get: db.prepare('SELECT doc FROM stats WHERE handle=?'),
        upsert: db.prepare(`INSERT INTO stats (handle, doc, updated_at) VALUES (?, ?, ?)
                            ON CONFLICT(handle) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at`),
        del: db.prepare('DELETE FROM stats WHERE handle=?'),
    };
    tx._handlers.set('stats', {
        get(key) {
            const row = stmt.get.get(key.handle);
            if (!row) return null;
            try { return JSON.parse(row.doc); } catch { return null; }
        },
        put(key, record) {
            stmt.upsert.run(key.handle, JSON.stringify(record.doc), Date.now());
        },
        delete(key) {
            const result = stmt.del.run(key.handle);
            return result.changes > 0;
        },
        list() { throw new Error('SqliteTransaction.list: stats is a singleton'); },
    });
}

export function registerNativeResourceHandlers(tx) {
    const db = tx._db;
    const getStmt = db.prepare(`SELECT doc, integrity, updated_at, created_at
        FROM native_resources WHERE handle=? AND kind=? AND resource_key=?`);
    const upsertStmt = db.prepare(`INSERT INTO native_resources
        (handle, kind, resource_key, doc, integrity, updated_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(handle, kind, resource_key) DO UPDATE SET
            doc=excluded.doc, integrity=excluded.integrity, updated_at=excluded.updated_at`);
    const insertIfAbsentStmt = db.prepare(`INSERT INTO native_resources
        (handle, kind, resource_key, doc, integrity, updated_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(handle, kind, resource_key) DO NOTHING`);
    const updateIfMatchStmt = db.prepare(`UPDATE native_resources
        SET doc=?, integrity=?, updated_at=?
        WHERE handle=? AND kind=? AND resource_key=? AND integrity=?`);
    const deleteStmt = db.prepare(
        'DELETE FROM native_resources WHERE handle=? AND kind=? AND resource_key=?',
    );
    const listStmt = db.prepare(`SELECT resource_key, doc, integrity, updated_at, created_at
        FROM native_resources WHERE handle=? AND kind=?`);

    const params = (key) => {
        const normalized = normalizeNativeResourceKey(key);
        return {
            key: normalized,
            resourceKey: encodeNativeResourceKey(normalized),
        };
    };
    const parseRow = (kind, handle, row) => {
        if (!row) return null;
        let doc;
        try { doc = JSON.parse(row.doc); } catch { return null; }
        return {
            key: decodeNativeResourceKey(kind, handle, row.resource_key),
            doc,
            integrity: String(row.integrity || ''),
            updatedAt: Number(row.updated_at || 0),
            createdAt: Number(row.created_at || 0),
        };
    };
    const handler = {
        get(key) {
            const p = params(key);
            const row = getStmt.get(p.key.handle, p.key.kind, p.resourceKey);
            if (!row) return null;
            return parseRow(p.key.kind, p.key.handle, { ...row, resource_key: p.resourceKey });
        },
        put(key, record) {
            const p = params(key);
            const now = Date.now();
            const existing = getStmt.get(p.key.handle, p.key.kind, p.resourceKey);
            upsertStmt.run(
                p.key.handle,
                p.key.kind,
                p.resourceKey,
                JSON.stringify(record.doc),
                String(record.integrity || ''),
                Number(record.updatedAt ?? now),
                Number(record.createdAt ?? existing?.created_at ?? now),
            );
        },
        putIfMatch(key, expectedIntegrity, record) {
            const p = params(key);
            const now = Date.now();
            if (expectedIntegrity === null) {
                const result = insertIfAbsentStmt.run(
                    p.key.handle,
                    p.key.kind,
                    p.resourceKey,
                    JSON.stringify(record.doc),
                    String(record.integrity || ''),
                    Number(record.updatedAt ?? now),
                    Number(record.createdAt ?? now),
                );
                return { updated: result.changes === 1 };
            }
            const result = updateIfMatchStmt.run(
                JSON.stringify(record.doc),
                String(record.integrity || ''),
                Number(record.updatedAt ?? now),
                p.key.handle,
                p.key.kind,
                p.resourceKey,
                String(expectedIntegrity),
            );
            return { updated: result.changes === 1 };
        },
        delete(key) {
            const p = params(key);
            return deleteStmt.run(p.key.handle, p.key.kind, p.resourceKey).changes > 0;
        },
        list(filter) {
            const rows = listStmt.all(filter.handle, filter.kind);
            const records = rows
                .map(row => parseRow(filter.kind, filter.handle, row))
                .filter(Boolean)
                .filter(record => nativeResourceMatchesFilter(record.key, filter));
            return sortAndLimitNativeRecords(records, filter);
        },
    };
    for (const kind of NATIVE_STORAGE_KINDS) tx._handlers.set(kind, handler);
}
