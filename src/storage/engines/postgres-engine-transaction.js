import { isDeepStrictEqual } from 'node:util';
import { NotFoundError } from '../errors.js';
import { assertSafeRepoNameShape } from '../name-validation.js';
import { normalizeLookupText } from '../../util.js';

// PgTransaction — pg-driver port of MysqlTransaction / SqliteTransaction.
// Same handler surface and per-kind methods so Repos remain engine-agnostic.
// Differences from the MySQL version:
//   - `client.query(sql, params)` returns `{rows, rowCount, ...}` — no array
//     destructuring; access `.rows` directly and use `.rowCount` for affected-
//     row checks (mysql2 uses `affectedRows` on the result object).
//   - Placeholders are `$1, $2, ...` instead of `?`. Written directly into the
//     SQL strings, no rewriting needed.
//   - Upsert syntax: `INSERT ... ON CONFLICT (cols) DO UPDATE SET col = EXCLUDED.col`
//     instead of MySQL's aliased-row form (`AS new ... DO UPDATE SET col =
//     new.col`). Semantics identical.
//   - JSONB columns return parsed JS objects from the driver by default;
//     `coerceJson` defensively handles the rare case where a driver upgrade
//     starts returning strings, mirroring the MysqlTransaction helper.
//   - For BIGINT timestamps, postgres-engine.js installs a process-global type
//     parser converting OID 20 → Number, so updated_at/created_at arrive as JS
//     numbers (same shape as mysql2 / better-sqlite3).
//   - chats.integrity is a STORED GENERATED column using `doc #>>
//     '{header,chat_metadata,integrity}'` (returns text directly, no
//     UNQUOTE wrapper needed unlike MySQL's JSON_UNQUOTE(JSON_EXTRACT(...))).
//   - For listGroupsWithChatStats's chat_size, MySQL uses LENGTH(CAST(doc AS
//     CHAR)); Postgres uses LENGTH(doc::text). Same approximate semantics —
//     the documented MysqlTransaction caveat (JSON gets re-serialized with
//     whitespace, so the integer differs from the original JSON.stringify
//     length) applies equally here.
export class PgTransaction {
    constructor({ client, handle }) {
        this._client = client;
        this._handle = handle;
        this._handlers = new Map();
        registerChatHandler(this);
        registerSettingsHandler(this);
        registerPresetHandler(this);
        registerWorldInfoHandler(this);
        registerNamedDocHandler(this);
        registerGroupHandler(this);
        registerStatsHandler(this);
    }

    _h(kind, method) {
        const h = this._handlers.get(kind);
        if (!h) throw new Error(`PgTransaction.${method}: unsupported kind ${kind}`);
        return h;
    }

    async getResource(key)       { return this._h(key.kind, 'getResource').get(key); }
    async getChatRange(key, options = {}) {
        if (key?.kind !== 'chat') throw new Error('PgTransaction.getChatRange: chat resource required');
        return this._h(key.kind, 'getChatRange').range(key, options);
    }
    async getChatInfo(key) {
        if (key?.kind !== 'chat') throw new Error('PgTransaction.getChatInfo: chat resource required');
        return this._h(key.kind, 'getChatInfo').info(key);
    }
    async appendChatMessages(key, messages, options = {}) {
        if (key?.kind !== 'chat') {
            throw new Error('PgTransaction.appendChatMessages: chat resource required');
        }
        return this._h(key.kind, 'appendChatMessages').append(key, messages, options);
    }
    async patchChatMessages(key, operations, options = {}) {
        if (key?.kind !== 'chat') {
            throw new Error('PgTransaction.patchChatMessages: chat resource required');
        }
        return this._h(key.kind, 'patchChatMessages').patch(key, operations, options);
    }
    async putResource(key, rec)  { return this._h(key.kind, 'putResource').put(key, rec); }
    async deleteResource(key)    { return this._h(key.kind, 'deleteResource').delete(key); }
    async listResources(filter)  { return this._h(filter.kind, 'listResources').list(filter); }

    async putResourceIfMatch(key, expectedIntegrity, record) {
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

// pg auto-parses JSONB columns to JS objects, but be defensive: a future
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

// Same parity note as MysqlTransaction / SqliteTransaction: group chats may
// be addressed by `groupId` alone or `name` alone; stored rows always have
// both populated, so back-fill each from the other before binding to SQL or
// a later lookup that drops one side won't match.
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
    const client = tx._client;

    async function readRow(p) {
        const r = await client.query(
            `SELECT doc, integrity, updated_at, created_at
             FROM chats WHERE handle=$1 AND char_dir=$2 AND name=$3 AND is_group=$4 AND group_id=$5`,
            [p.handle, p.char_dir, p.name, p.is_group, p.group_id],
        );
        return r.rows[0] || null;
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
            const metaQuery = await client.query(
                `SELECT integrity,
                        doc#>'{header,chat_metadata}' AS metadata_value,
                        jsonb_typeof(doc#>'{header,chat_metadata}') AS metadata_type,
                        jsonb_typeof(doc->'body') AS body_type,
                        jsonb_array_length(doc->'body') AS message_count
                 FROM chats
                 WHERE handle=$1 AND char_dir=$2 AND name=$3 AND is_group=$4 AND group_id=$5
                 FOR UPDATE`,
                [p.handle, p.char_dir, p.name, p.is_group, p.group_id],
            );
            const meta = metaQuery.rows[0];
            if (!meta) return { status: 'missing' };
            if (meta.metadata_type !== 'object' || meta.body_type !== 'array') {
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
                if (operation.op === 'test') {
                    const result = await client.query(
                        `SELECT (doc->'body')->$6 AS value FROM chats WHERE handle=$1 AND char_dir=$2 AND name=$3 AND is_group=$4 AND group_id=$5`,
                        [p.handle, p.char_dir, p.name, p.is_group, p.group_id, operation.index],
                    );
                    const actual = coerceJson(result.rows[0]?.value);
                    if (!isDeepStrictEqual(actual, operation.value)) {
                        throw new Error(`JSON Patch test failed at /${operation.index}`);
                    }
                    continue;
                }
                if (operation.op === 'replace') {
                    await client.query(
                        `UPDATE chats
                         SET doc=jsonb_set(doc, ARRAY['body', $6::text], $7::jsonb, false)
                         WHERE handle=$1 AND char_dir=$2 AND name=$3 AND is_group=$4 AND group_id=$5`,
                        [p.handle, p.char_dir, p.name, p.is_group, p.group_id, operation.index, operation.serialized],
                    );
                    continue;
                }
                await client.query(
                    `UPDATE chats
                     SET doc=jsonb_set(doc, '{body}', (doc->'body') - $6, false)
                     WHERE handle=$1 AND char_dir=$2 AND name=$3 AND is_group=$4 AND group_id=$5`,
                    [p.handle, p.char_dir, p.name, p.is_group, p.group_id, operation.index],
                );
                messageCount -= 1;
            }

            const mergedMetadata = {
                ...currentMetadata,
                ...(chatMetadata && typeof chatMetadata === 'object' && !Array.isArray(chatMetadata)
                    ? chatMetadata : {}),
                integrity: newIntegrity,
            };
            await client.query(
                `UPDATE chats
                 SET doc=jsonb_set(doc, '{header,chat_metadata}', $1::jsonb, false),
                     updated_at=$2
                 WHERE handle=$3 AND char_dir=$4 AND name=$5 AND is_group=$6 AND group_id=$7`,
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
            const metaQuery = await client.query(
                `SELECT doc->'header' AS header_value, jsonb_typeof(doc->'header') AS header_type, jsonb_typeof(doc->'body') AS body_type, jsonb_array_length(doc->'body') AS total_messages, integrity, updated_at, created_at FROM chats WHERE handle=$1 AND char_dir=$2 AND name=$3 AND is_group=$4 AND group_id=$5`,
                [p.handle, p.char_dir, p.name, p.is_group, p.group_id],
            );
            const meta = metaQuery.rows[0];
            if (!meta || meta.header_type !== 'object' || meta.body_type !== 'array') return null;
            const header = coerceJson(meta.header_value);
            if (!header || typeof header !== 'object' || Array.isArray(header)) return null;

            const totalMessages = Math.max(0, Number(meta.total_messages) || 0);
            const requestedFrom = Math.max(0, Math.floor(Number(fromIndex) || 0));
            const requestedLimit = Math.max(0, Math.floor(Number(limit) || 0));
            const start = Math.min(requestedFrom, totalMessages);
            const end = requestedLimit > 0 ? Math.min(start + requestedLimit, totalMessages) : totalMessages;

            const rowsQuery = await client.query(
                `SELECT t.elem AS message_value FROM chats AS c CROSS JOIN LATERAL jsonb_array_elements(c.doc->'body') WITH ORDINALITY AS t(elem, ord) WHERE c.handle=$1 AND c.char_dir=$2 AND c.name=$3 AND c.is_group=$4 AND c.group_id=$5 AND t.ord > $6 AND ($7 <= 0 OR t.ord <= $8) ORDER BY t.ord ASC`,
                [p.handle, p.char_dir, p.name, p.is_group, p.group_id, start, requestedLimit, end],
            );
            const body = [];
            for (const row of rowsQuery.rows) {
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
            const metaQuery = await client.query(
                `SELECT doc->'header' AS header_value, jsonb_typeof(doc->'header') AS header_type, jsonb_typeof(doc->'body') AS body_type, jsonb_array_length(doc->'body') AS message_count, octet_length(doc::text) AS byte_size, integrity, updated_at, created_at FROM chats WHERE handle=$1 AND char_dir=$2 AND name=$3 AND is_group=$4 AND group_id=$5`,
                [p.handle, p.char_dir, p.name, p.is_group, p.group_id],
            );
            const row = metaQuery.rows[0];
            if (!row || row.header_type !== 'object' || row.body_type !== 'array') return null;
            const header = coerceJson(row.header_value);
            if (!header || typeof header !== 'object' || Array.isArray(header)) return null;

            const messageCount = Math.max(0, Number(row.message_count) || 0);
            let lastMessage = null;
            if (messageCount > 0) {
                const lastQuery = await client.query(
                    `SELECT (doc->'body')->(jsonb_array_length(doc->'body') - 1) AS message_value FROM chats WHERE handle=$1 AND char_dir=$2 AND name=$3 AND is_group=$4 AND group_id=$5`,
                    [p.handle, p.char_dir, p.name, p.is_group, p.group_id],
                );
                if (!lastQuery.rows.length) return null;
                lastMessage = coerceJson(lastQuery.rows[0].message_value);
                if (lastMessage === null && lastQuery.rows[0].message_value !== null) return null;
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
            const metaQuery = await client.query(
                `SELECT integrity,
                        jsonb_typeof(doc->'header') AS header_type,
                        jsonb_typeof(doc#>'{header,chat_metadata}') AS metadata_type,
                        jsonb_typeof(doc->'body') AS body_type
                 FROM chats
                 WHERE handle=$1 AND char_dir=$2 AND name=$3 AND is_group=$4 AND group_id=$5
                 FOR UPDATE`,
                [p.handle, p.char_dir, p.name, p.is_group, p.group_id],
            );
            const meta = metaQuery.rows[0];
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
                const existingIds = await client.query(
                    `SELECT DISTINCT elem->'extra'->>'gen_id' AS gen_id
                     FROM chats AS c
                     CROSS JOIN LATERAL jsonb_array_elements(c.doc->'body') AS elem
                     WHERE c.handle=$1 AND c.char_dir=$2 AND c.name=$3 AND c.is_group=$4 AND c.group_id=$5
                       AND elem->'extra'->>'gen_id' = ANY($6::text[])`,
                    [p.handle, p.char_dir, p.name, p.is_group, p.group_id, incomingGenIds],
                );
                for (const row of existingIds.rows) {
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

            const update = await client.query(
                `UPDATE chats
                 SET doc = jsonb_set(
                         jsonb_set(
                             doc,
                             '{body}',
                             (doc->'body') || $1::jsonb,
                             false
                         ),
                         '{header,chat_metadata,integrity}',
                         to_jsonb($2::text),
                         false
                     ),
                     updated_at = $3
                 WHERE handle=$4 AND char_dir=$5 AND name=$6 AND is_group=$7 AND group_id=$8`,
                [
                    JSON.stringify(accepted),
                    newIntegrity,
                    updatedAt,
                    p.handle,
                    p.char_dir,
                    p.name,
                    p.is_group,
                    p.group_id,
                ],
            );
            if (update.rowCount !== 1) return { status: 'missing' };
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
            await client.query(
                `INSERT INTO chats (handle, char_dir, name, is_group, group_id, doc, updated_at, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
                 ON CONFLICT (handle, char_dir, name, is_group, group_id)
                 DO UPDATE SET doc = EXCLUDED.doc, updated_at = EXCLUDED.updated_at`,
                [p.handle, p.char_dir, p.name, p.is_group, p.group_id, doc, updatedAt, createdAt],
            );
        },
        async delete(key) {
            // FK CASCADE drops chat_states rows automatically when parent row goes.
            const p = chatKeyToParams(key);
            const r = await client.query(
                'DELETE FROM chats WHERE handle=$1 AND char_dir=$2 AND name=$3 AND is_group=$4 AND group_id=$5',
                [p.handle, p.char_dir, p.name, p.is_group, p.group_id],
            );
            return r.rowCount > 0;
        },
        async list(filter) {
            const where = ['handle = $1'];
            const args = [filter.handle];
            if (typeof filter.charDir === 'string') {
                args.push(filter.charDir);
                where.push(`char_dir = $${args.length}`);
            }
            if (typeof filter.isGroup === 'boolean') {
                args.push(filter.isGroup ? 1 : 0);
                where.push(`is_group = $${args.length}`);
            }
            if (typeof filter.groupId === 'string') {
                args.push(filter.groupId);
                where.push(`group_id = $${args.length}`);
            }
            const orderClause = filter.orderBy === 'name' ? 'ORDER BY name ASC' : 'ORDER BY updated_at DESC';
            const r = await client.query(
                `SELECT char_dir, name, is_group, group_id, updated_at, created_at
                 FROM chats WHERE ${where.join(' AND ')} ${orderClause}`,
                args,
            );
            const out = r.rows.map((row) => ({
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

    // Sidecar tx methods — direct on tx, matching MysqlTransaction surface.
    tx.getChatState = async (chatKey, namespace) => {
        const p = chatKeyToParams(chatKey);
        const r = await client.query(
            `SELECT doc FROM chat_states
             WHERE handle=$1 AND char_dir=$2 AND name=$3 AND is_group=$4 AND group_id=$5 AND namespace=$6`,
            [p.handle, p.char_dir, p.name, p.is_group, p.group_id, namespace],
        );
        const row = r.rows[0];
        if (!row) return null;
        return coerceJson(row.doc);
    };

    tx.putChatState = async (chatKey, namespace, doc) => {
        const p = chatKeyToParams(chatKey);
        // Precheck parent exists so we raise a typed NotFoundError instead of
        // bubbling Postgres's raw FK error (foreign_key_violation, SQLSTATE
        // 23503). Same STRICT behavior as MysqlTransaction.
        const parentRows = await client.query(
            'SELECT 1 FROM chats WHERE handle=$1 AND char_dir=$2 AND name=$3 AND is_group=$4 AND group_id=$5',
            [p.handle, p.char_dir, p.name, p.is_group, p.group_id],
        );
        if (!parentRows.rows.length) {
            throw new NotFoundError('chat', {
                handle: chatKey.handle,
                charDir: chatKey.charDir,
                name: chatKey.name,
            });
        }
        await client.query(
            `INSERT INTO chat_states (handle, char_dir, name, is_group, group_id, namespace, doc)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
             ON CONFLICT (handle, char_dir, name, is_group, group_id, namespace)
             DO UPDATE SET doc = EXCLUDED.doc`,
            [p.handle, p.char_dir, p.name, p.is_group, p.group_id, namespace, JSON.stringify(doc)],
        );
    };

    tx.deleteChatState = async (chatKey, namespace) => {
        const p = chatKeyToParams(chatKey);
        const r = await client.query(
            `DELETE FROM chat_states
             WHERE handle=$1 AND char_dir=$2 AND name=$3 AND is_group=$4 AND group_id=$5 AND namespace=$6`,
            [p.handle, p.char_dir, p.name, p.is_group, p.group_id, namespace],
        );
        return r.rowCount > 0;
    };

    tx.listChatStateNamespaces = async (chatKey) => {
        const p = chatKeyToParams(chatKey);
        const r = await client.query(
            `SELECT namespace FROM chat_states
             WHERE handle=$1 AND char_dir=$2 AND name=$3 AND is_group=$4 AND group_id=$5`,
            [p.handle, p.char_dir, p.name, p.is_group, p.group_id],
        );
        return r.rows.map((row) => row.namespace);
    };
}

export function registerSettingsHandler(tx) {
    const client = tx._client;
    tx._handlers.set('settings', {
        async get(key) {
            const r = await client.query('SELECT doc FROM settings WHERE handle=$1', [key.handle]);
            if (!r.rows.length) return null;
            return coerceJson(r.rows[0].doc);
        },
        async put(key, record) {
            await client.query(
                `INSERT INTO settings (handle, doc, updated_at) VALUES ($1, $2::jsonb, $3)
                 ON CONFLICT (handle) DO UPDATE SET doc = EXCLUDED.doc, updated_at = EXCLUDED.updated_at`,
                [key.handle, JSON.stringify(record.doc), Date.now()],
            );
        },
        async delete(key) {
            const r = await client.query('DELETE FROM settings WHERE handle=$1', [key.handle]);
            return r.rowCount > 0;
        },
        list() { throw new Error('PgTransaction.list: settings is a singleton'); },
    });
}

function presetKeyToParams(key) {
    return { handle: key.handle, dir_key: key.dirKey, name: key.name };
}

export function registerPresetHandler(tx) {
    const client = tx._client;
    tx._handlers.set('preset', {
        async get(key) {
            const p = presetKeyToParams(key);
            const r = await client.query(
                'SELECT doc FROM presets WHERE handle=$1 AND dir_key=$2 AND name=$3',
                [p.handle, p.dir_key, p.name],
            );
            if (!r.rows.length) return null;
            const parsed = coerceJson(r.rows[0].doc);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
            return null;
        },
        async put(key, record) {
            assertSafeRepoNameShape(key.name, { field: 'preset.name' });
            const p = presetKeyToParams(key);
            await client.query(
                `INSERT INTO presets (handle, dir_key, name, doc, updated_at) VALUES ($1, $2, $3, $4::jsonb, $5)
                 ON CONFLICT (handle, dir_key, name) DO UPDATE SET doc = EXCLUDED.doc, updated_at = EXCLUDED.updated_at`,
                [p.handle, p.dir_key, p.name, JSON.stringify(record.doc), Date.now()],
            );
        },
        async delete(key) {
            const p = presetKeyToParams(key);
            // Cascade sidecars manually (no FK on preset_states; mirrors SQLite/MySQL).
            await client.query(
                'DELETE FROM preset_states WHERE handle=$1 AND dir_key=$2 AND name=$3',
                [p.handle, p.dir_key, p.name],
            );
            const r = await client.query(
                'DELETE FROM presets WHERE handle=$1 AND dir_key=$2 AND name=$3',
                [p.handle, p.dir_key, p.name],
            );
            return r.rowCount > 0;
        },
        async list(filter) {
            const r = await client.query(
                'SELECT name FROM presets WHERE handle=$1 AND dir_key=$2 ORDER BY name ASC',
                [filter.handle, filter.dirKey],
            );
            return r.rows.map((row) => ({
                key: { kind: 'preset', handle: filter.handle, dirKey: filter.dirKey, name: row.name },
            }));
        },
    });

    tx.getPresetState = async (key, namespace) => {
        const p = presetKeyToParams(key);
        const r = await client.query(
            'SELECT doc FROM preset_states WHERE handle=$1 AND dir_key=$2 AND name=$3 AND namespace=$4',
            [p.handle, p.dir_key, p.name, namespace],
        );
        if (!r.rows.length) return null;
        const parsed = coerceJson(r.rows[0].doc);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        return null;
    };

    tx.putPresetState = async (key, namespace, doc) => {
        const p = presetKeyToParams(key);
        // PERMISSIVE: no parent-exists precheck (matches FsTransaction,
        // SqliteTransaction, and MysqlTransaction; the schema's missing FK on
        // preset_states is the structural counterpart of this policy).
        await client.query(
            `INSERT INTO preset_states (handle, dir_key, name, namespace, doc) VALUES ($1, $2, $3, $4, $5::jsonb)
             ON CONFLICT (handle, dir_key, name, namespace) DO UPDATE SET doc = EXCLUDED.doc`,
            [p.handle, p.dir_key, p.name, namespace, JSON.stringify(doc)],
        );
    };

    tx.deletePresetState = async (key, namespace) => {
        const p = presetKeyToParams(key);
        const r = await client.query(
            'DELETE FROM preset_states WHERE handle=$1 AND dir_key=$2 AND name=$3 AND namespace=$4',
            [p.handle, p.dir_key, p.name, namespace],
        );
        return r.rowCount > 0;
    };

    tx.listPresetStateNamespaces = async (key) => {
        const p = presetKeyToParams(key);
        const r = await client.query(
            'SELECT namespace FROM preset_states WHERE handle=$1 AND dir_key=$2 AND name=$3',
            [p.handle, p.dir_key, p.name],
        );
        return r.rows.map((row) => row.namespace);
    };
}

export function registerWorldInfoHandler(tx) {
    const client = tx._client;

    async function listAllNames(handle) {
        const r = await client.query('SELECT name FROM worlds WHERE handle=$1', [handle]);
        return r.rows;
    }

    async function resolveCanonical(handle, requested) {
        const trimmed = String(requested || '').trim();
        if (!trimmed) return null;
        // Exact match first (cheap path; VARCHAR comparison in Postgres is
        // case-sensitive and byte-exact by default).
        const exactRows = await client.query(
            'SELECT name FROM worlds WHERE handle=$1 AND name=$2',
            [handle, trimmed],
        );
        if (exactRows.rows.length) return exactRows.rows[0].name;
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
            const r = await client.query(
                'SELECT doc FROM worlds WHERE handle=$1 AND name=$2',
                [key.handle, canonical],
            );
            if (!r.rows.length) return null;
            const parsed = coerceJson(r.rows[0].doc);
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
            await client.query(
                `INSERT INTO worlds (handle, name, doc, updated_at) VALUES ($1, $2, $3::jsonb, $4)
                 ON CONFLICT (handle, name) DO UPDATE SET doc = EXCLUDED.doc, updated_at = EXCLUDED.updated_at`,
                [key.handle, targetName, JSON.stringify(record.doc), Date.now()],
            );
        },
        async delete(key) {
            const canonical = await resolveCanonical(key.handle, key.name);
            if (canonical == null) return false;
            const r = await client.query(
                'DELETE FROM worlds WHERE handle=$1 AND name=$2',
                [key.handle, canonical],
            );
            return r.rowCount > 0;
        },
        async list(filter) {
            const r = await client.query(
                'SELECT name, doc FROM worlds WHERE handle=$1 ORDER BY name ASC',
                [filter.handle],
            );
            return r.rows.map((row) => {
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
    const client = tx._client;
    tx._handlers.set('named-doc', {
        async get(key) {
            const r = await client.query(
                'SELECT doc FROM named_docs WHERE handle=$1 AND bucket=$2 AND name=$3',
                [key.handle, key.bucket, key.name],
            );
            if (!r.rows.length) return null;
            const parsed = coerceJson(r.rows[0].doc);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
            return parsed;
        },
        async put(key, record) {
            assertSafeRepoNameShape(key.name, { field: 'named-doc.name' });
            await client.query(
                `INSERT INTO named_docs (handle, bucket, name, doc, updated_at) VALUES ($1, $2, $3, $4::jsonb, $5)
                 ON CONFLICT (handle, bucket, name) DO UPDATE SET doc = EXCLUDED.doc, updated_at = EXCLUDED.updated_at`,
                [key.handle, key.bucket, key.name, JSON.stringify(record.doc), Date.now()],
            );
        },
        async delete(key) {
            const r = await client.query(
                'DELETE FROM named_docs WHERE handle=$1 AND bucket=$2 AND name=$3',
                [key.handle, key.bucket, key.name],
            );
            return r.rowCount > 0;
        },
        async list(filter) {
            const r = await client.query(
                'SELECT name FROM named_docs WHERE handle=$1 AND bucket=$2 ORDER BY name ASC',
                [filter.handle, filter.bucket],
            );
            return r.rows.map((row) => ({
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
    const client = tx._client;

    async function readRow(p) {
        const r = await client.query(
            'SELECT doc, created_at FROM groups_table WHERE handle=$1 AND id=$2',
            [p.handle, p.id],
        );
        return r.rows[0] || null;
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
            await client.query(
                `INSERT INTO groups_table (handle, id, doc, updated_at, created_at) VALUES ($1, $2, $3::jsonb, $4, $5)
                 ON CONFLICT (handle, id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = EXCLUDED.updated_at`,
                [p.handle, p.id, JSON.stringify(record.doc), updatedAt, createdAt],
            );
        },
        async delete(key) {
            const p = groupKeyToParams(key);
            const r = await client.query(
                'DELETE FROM groups_table WHERE handle=$1 AND id=$2',
                [p.handle, p.id],
            );
            return r.rowCount > 0;
        },
        async list(filter) {
            const r = await client.query(
                'SELECT id FROM groups_table WHERE handle=$1 ORDER BY id ASC',
                [filter.handle],
            );
            return r.rows.map((row) => ({
                key: { kind: 'group', handle: filter.handle, id: row.id },
            }));
        },
    });

    // Composite read for /all — mirrors FsTransaction.listGroupsWithChatStats.
    // chat_size note: SQLite uses length(doc) which returns the JSON text
    // length. MySQL uses LENGTH(CAST(doc AS CHAR)); Postgres uses
    // LENGTH(doc::text). Both server-side serializations re-emit JSON with
    // extra whitespace (e.g. "a": 1 vs "a":1), so the integer differs from
    // both SQLite's length() and the original JSON.stringify length. The
    // frontend treats chat_size as a rough size indicator only (not
    // load-bearing), so the divergence is documented and accepted (same
    // caveat is documented in sqlite-engine-transaction.js and
    // mysql-engine-transaction.js).
    tx.listGroupsWithChatStats = async (filter) => {
        const groupQ = await client.query(
            'SELECT id, doc, created_at FROM groups_table WHERE handle=$1 ORDER BY id ASC',
            [filter.handle],
        );
        const chatQ = await client.query(
            `SELECT group_id, updated_at, LENGTH(doc::text) AS doc_len
             FROM chats WHERE handle=$1 AND is_group=1`,
            [filter.handle],
        );
        const chatByGroupId = new Map();
        for (const c of chatQ.rows) {
            const arr = chatByGroupId.get(c.group_id);
            if (arr) arr.push(c);
            else chatByGroupId.set(c.group_id, [c]);
        }
        const out = [];
        for (const row of groupQ.rows) {
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
    const client = tx._client;
    tx._handlers.set('stats', {
        async get(key) {
            const r = await client.query('SELECT doc FROM stats WHERE handle=$1', [key.handle]);
            if (!r.rows.length) return null;
            return coerceJson(r.rows[0].doc);
        },
        async put(key, record) {
            await client.query(
                `INSERT INTO stats (handle, doc, updated_at) VALUES ($1, $2::jsonb, $3)
                 ON CONFLICT (handle) DO UPDATE SET doc = EXCLUDED.doc, updated_at = EXCLUDED.updated_at`,
                [key.handle, JSON.stringify(record.doc), Date.now()],
            );
        },
        async delete(key) {
            const r = await client.query('DELETE FROM stats WHERE handle=$1', [key.handle]);
            return r.rowCount > 0;
        },
        list() { throw new Error('PgTransaction.list: stats is a singleton'); },
    });
}
