import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import mysql from 'mysql2/promise';
import { MysqlTransaction } from './mysql-engine-transaction.js';
import { initSchema } from './mysql-schema.js';
import { withRetry, isKnownRollbackError } from '../retry.js';
import { StorageCommitUnknownError } from '../errors.js';
import { createHash } from 'node:crypto';
import { logEngineError } from '../engine-logger.js';

const DEFAULT_ACQUIRE_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = { transient: 3 };

// User-data tables, listed in INSERT order (parent before child) so a
// `restoreUser` stream that consumes this dump in order satisfies the FK
// constraints declared in migrations/mysql/0001-initial.sql:
//   - chat_states references chats (handle, char_dir, name, is_group, group_id)
//     via `chat_states_fk_chats` ON DELETE CASCADE → chats must precede.
//   - preset_states has NO FK on presets (the schema's missing FK matches
//     the PERMISSIVE put-without-parent policy), but we still order them
//     parents-first for symmetry and so a future FK retrofit is safe.
// `chats` excludes `integrity` because it is a GENERATED STORED column
// (JSON_EXTRACT of doc.header.chat_metadata.integrity) — the engine derives
// it on INSERT/UPDATE and rejects explicit writes.
const DUMP_TABLES = Object.freeze([
    { name: 'settings', cols: ['handle', 'doc', 'updated_at'] },
    { name: 'stats', cols: ['handle', 'doc', 'updated_at'] },
    { name: 'native_resources', cols: ['handle', 'kind', 'resource_key', 'doc', 'integrity', 'updated_at', 'created_at'] },
    { name: 'groups_table', cols: ['handle', 'id', 'doc', 'updated_at', 'created_at'] },
    { name: 'named_docs', cols: ['handle', 'bucket', 'name', 'doc', 'updated_at'] },
    { name: 'worlds', cols: ['handle', 'name', 'doc', 'updated_at'] },
    { name: 'presets', cols: ['handle', 'dir_key', 'name', 'doc', 'updated_at'] },
    { name: 'preset_states', cols: ['handle', 'dir_key', 'name', 'namespace', 'doc'] },
    { name: 'chats', cols: ['handle', 'char_dir', 'name', 'is_group', 'group_id', 'doc', 'updated_at', 'created_at'] },
    { name: 'chat_states', cols: ['handle', 'char_dir', 'name', 'is_group', 'group_id', 'namespace', 'doc'] },
]);

// mysql2 parses JSON columns into JS objects by default; Postgres returns
// JSONB as JS objects too. Normalize to JSON.stringify so `restoreUser` re-
// inserts a value the driver will store correctly (mysql JSON accepts a JSON
// string literal — passing a raw object would be sent as `[object Object]`).
// Buffers and Dates pass through untouched: BIGINT timestamps land as JS
// numbers (per the pg type-parser registered in postgres-engine.js, and
// mysql2's native number coercion), and no binary blobs live in the schema
// today — but we keep the typeof-object check buffer- and date-aware so a
// future binary column doesn't get stringified into garbage.
function normalizeDumpValue(v) {
    if (v != null && typeof v === 'object' && !Buffer.isBuffer(v) && !(v instanceof Date)) {
        return JSON.stringify(v);
    }
    return v;
}

// mysql2's pool has no native acquire-wait timeout: `connectTimeout` only
// covers initial TCP/handshake, and once `connectionLimit` is reached the
// pool enqueues without an upper bound. Wrap `getConnection()` in a
// Promise.race so the caller fails fast on pool exhaustion. If the queued
// connection eventually arrives after the timeout, immediately release it
// back to the pool so it isn't permanently stranded.
function acquireWithTimeout(pool, timeoutMs) {
    let timerId;
    return new Promise((resolve, reject) => {
        let settled = false;
        timerId = setTimeout(() => {
            if (settled) return;
            settled = true;
            const err = new Error(`mysql pool acquire timed out after ${timeoutMs}ms`);
            err.code = 'POOL_ACQUIRE_TIMEOUT';
            reject(err);
        }, timeoutMs);
        pool.getConnection()
            .then((conn) => {
                if (settled) {
                    // Caller already timed out and moved on; hand the slot back.
                    try { conn.release(); } catch { /* pool may be closing */ }
                    return;
                }
                settled = true;
                clearTimeout(timerId);
                resolve(conn);
            })
            .catch((err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timerId);
                reject(err);
            });
    });
}

export class MysqlEngine {
    /**
     * `acquireTimeoutMs` is currently THREADED INTO TWO semantically different
     * phases:
     *   1. `mysql.createPool({ connectTimeout })` — bounds the initial TCP /
     *      handshake when a fresh socket is opened.
     *   2. `acquireWithTimeout(pool, timeoutMs)` — bounds the pool-acquire
     *      wait once `connectionLimit` is reached and callers must queue.
     * Lowering this knob for snappy contention-failure visibility will also
     * make brand-new connections to a slow-DNS DB host fail. If a future
     * operator hits this, the cleanest split is to introduce a separate
     * `connectTimeoutMs` alongside `acquireTimeoutMs`.
     */
    constructor({
        url,
        poolSize = 10,
        acquireTimeoutMs = DEFAULT_ACQUIRE_TIMEOUT_MS,
        retries = DEFAULT_RETRIES,
    } = {}) {
        if (typeof url !== 'string' || !url) {
            throw new TypeError('MysqlEngine requires { url: "mysql://user:pass@host:port/db" }');
        }
        this.kind = 'mysql';
        this._nativeOwnerUrl = url;
        Object.defineProperty(this, 'nativeHostOwnershipKey', { value: 'mysql:' + createHash('sha256').update(url).digest('hex') });
        this._acquireTimeoutMs = acquireTimeoutMs;
        this._retries = retries;
        // mysql2/promise pool. charset=utf8mb4 keeps inserts consistent with
        // the schema's utf8mb4_bin collation; connectionLimit caps concurrent
        // leases so withTransaction queues past the limit instead of opening
        // unbounded sockets. connectTimeout bounds the initial TCP handshake;
        // pool acquire-wait is bounded separately via acquireWithTimeout.
        this._pool = mysql.createPool({
            uri: url,
            connectionLimit: poolSize,
            connectTimeout: acquireTimeoutMs,
            charset: 'utf8mb4',
            // Allow multiple PK fields without auto-string casts; the
            // composite-key handlers rely on raw 0/1 for is_group.
            namedPlaceholders: false,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10_000,
        });
        // Lazy schema bootstrap: first ping / withTransaction triggers
        // initSchema once and caches the promise so concurrent first calls
        // share the work. Mirrors SqliteEngine's _dbFor(handle) bootstrap.
        this._schemaReady = null;
    }

    async _ensureSchema() {
        if (!this._schemaReady) {
            this._schemaReady = initSchema(this._pool).catch((err) => {
                // Reset so a transient failure doesn't permanently block
                // future bootstraps; subsequent calls retry.
                this._schemaReady = null;
                logEngineError(this.kind, 'schema-bootstrap', null, err);
                throw err;
            });
        }
        return this._schemaReady;
    }

    async ping(handle) { // eslint-disable-line no-unused-vars
        await this._ensureSchema();
        try {
            await withRetry(async () => {
                const conn = await acquireWithTimeout(this._pool, this._acquireTimeoutMs);
                try {
                    await conn.query('SELECT 1');
                } finally {
                    conn.release();
                }
            }, { retries: this._retries.transient });
        } catch (err) {
            logEngineError(this.kind, 'ping', handle ?? null, err);
            throw err;
        }
    }

    async acquireNativeHostOwnership(onLost) {
        // Never take the lifetime lock from the business pool (including max=1).
        const conn = await mysql.createConnection(this._nativeOwnerUrl);
        conn.on('error', onLost);
        conn.on('end', onLost);
        try {
            const [databaseRows] = await conn.query('SELECT DATABASE() AS databaseName');
            const database = databaseRows[0]?.databaseName;
            if (!database) throw new Error('Native Owner requires an actual database');
            const lockName = 'atria.native-host.' + createHash('sha256').update(database).digest('hex').slice(0, 40);
            const [rows] = await conn.execute('SELECT GET_LOCK(?, 0) AS acquired', [lockName]);
            if (rows[0]?.acquired !== 1) throw new Error('Native database already has a Host owner');
            return async () => { await conn.end(); };
        } catch (error) { await conn.end().catch(() => {}); throw error; }
    }

    async withTransaction(handle, fn, { retryMode = 'known_rollback_only' } = {}) {
        if (!['known_rollback_only', 'never'].includes(retryMode)) throw new TypeError('Unsupported storage retryMode');
        await this._ensureSchema();
        const retryableFailures = new WeakSet();
        try {
            return await withRetry(async () => {
                const conn = await acquireWithTimeout(this._pool, this._acquireTimeoutMs);
                try {
                    await conn.beginTransaction();
                    const tx = new MysqlTransaction({ conn, handle });
                    try {
                        const result = await fn(tx);
                        try { await conn.commit(); } catch (error) {
                            if (isKnownRollbackError(error)) throw error;
                            throw new StorageCommitUnknownError(error);
                        }
                        return result;
                    } catch (err) {
                        let rolledBack = false;
                        try { await conn.rollback(); rolledBack = true; } catch { /* unknown COMMIT stays unknown */ }
                        if (rolledBack && err.code !== 'storage_commit_unknown') err.storageRollbackConfirmed = true;
                        if (isKnownRollbackError(err) && (rolledBack || err.code === 'ER_LOCK_DEADLOCK')) retryableFailures.add(err);
                        throw err;
                    }
                } finally {
                    conn.release();
                }
            }, { retries: this._retries.transient, isRetryable: err => retryMode === 'known_rollback_only' && retryableFailures.has(err) });
        } catch (err) {
            logEngineError(this.kind, 'tx', handle, err);
            throw err;
        }
    }

    /**
     * Removes all of a user's data across every user-data table in one
     * transaction. Retry-wrapped and log-on-final-fail to match `ping` and
     * `withTransaction`. Idempotent — zero rows to delete is a success. The
     * `_storage_meta` table holds schema-version data, NOT user data, and is
     * intentionally left alone.
     *
     * Table order matters where there are FKs: child rows first (chat_states
     * has an FK on chats), then parents, then unrelated singletons. The list
     * is the user-data tables from migrations/mysql/0001-initial.sql.
     * @param {string} handle
     */
    async _withUserAdministration(handle, fn, options) {
        const lifecycle = this.nativeHostLifecycle;
        return lifecycle ? lifecycle.withAdministrativeTransaction(handle, fn, options) : this.withTransaction(handle, fn, options);
    }

    async deleteUser(handle) {
        return this._withUserAdministration(handle, async tx => {
            for (const table of ['chat_states', 'preset_states', 'chats', 'presets', 'worlds', 'named_docs', 'groups_table', 'native_resources', 'settings', 'stats']) {
                const predicate = table === 'native_resources' ? ' AND kind <> ?' : '';
                await tx._conn.query(`DELETE FROM ${table} WHERE handle = ?${predicate}`, table === 'native_resources' ? [handle, 'atri_host_fence'] : [handle]);
            }
        });
    }

    async close() {
        await this._pool.end();
    }

    /**
     * mysql dumps to a text stream of newline-separated JSON-
     * encoded `{sql, params}` records — one INSERT per row. The dump is
     * dialect-specific (mysql uses `?` placeholders); the matching engine
     * kind is recorded in `_engine_meta.json` outside this stream so a
     * cross-dialect restore is caught at the orchestrator layer instead of
     * blowing up here with an opaque SQL error.
     *
     * Tables are emitted in PARENT-FIRST order (DUMP_TABLES) so a streaming
     * restore can INSERT in receive order without buffering: `chats` before
     * `chat_states` (FK CASCADE), `presets` before `preset_states` (no FK
     * today, future-proofed). The `integrity` column on `chats` is omitted
     * because it is GENERATED STORED — MySQL rejects explicit writes to it.
     *
     * Uses `Readable.from(asyncGenerator)` so backpressure flows naturally
     * to the consumer (HTTP response, file write, etc.) without holding the
     * whole dump in memory. The pool connection is acquired once at stream
     * start and released in the generator's `finally`, so an aborted
     * consumer still frees the slot.
     * @param {string} handle
     * @returns {Promise<import('node:stream').Readable>}
     */
    async dumpUser(handle, { tables = null } = {}) {
        await this._ensureSchema();
        const self = this;

        async function* generate() {
            const conn = await acquireWithTimeout(self._pool, self._acquireTimeoutMs);
            try {
                for (const t of DUMP_TABLES) {
                    if (tables && !tables.includes(t.name)) continue;
                    const colsCsv = t.cols.join(', ');
                    const placeholders = t.cols.map(() => '?').join(', ');
                    const sqlText = `INSERT INTO ${t.name} (${colsCsv}) VALUES (${placeholders})`;
                    const [rows] = await conn.query(
                        `SELECT ${colsCsv} FROM ${t.name} WHERE handle = ?`,
                        [handle],
                    );
                    for (const row of rows) {
                        const params = t.cols.map((c) => normalizeDumpValue(row[c]));
                        yield JSON.stringify({ sql: sqlText, params }) + '\n';
                    }
                }
            } finally {
                conn.release();
            }
        }

        return Readable.from(generate());
    }

    /** Restore the original dump in one non-replayed transaction, retaining the destination Host fence. */
    async restoreUser(handle, stream) {
        // One transaction preserves prior data on malformed/failed input. A
        // consumed stream is never replayed, even after a confirmed rollback.
        return this._withUserAdministration(handle, async tx => {
            for (const table of ['chat_states', 'preset_states', 'chats', 'presets', 'worlds', 'named_docs', 'groups_table', 'native_resources', 'settings', 'stats']) {
                const predicate = table === 'native_resources' ? ' AND kind <> ?' : '';
                await tx._conn.query(`DELETE FROM ${table} WHERE handle = ?${predicate}`, table === 'native_resources' ? [handle, 'atri_host_fence'] : [handle]);
            }
            const apply = async line => {
                const { sql, params } = JSON.parse(line);
                // Original dump column order is handle, kind, resource_key...
                // A source Host fence can never replace the destination Owner.
                if (/^INSERT INTO native_resources\s/i.test(sql) && params?.[1] === 'atri_host_fence') return;
                await tx._conn.query(sql, params);
            };
            const decoder = new StringDecoder('utf8');
            let buffer = '';
            for await (const chunk of stream) {
                buffer += decoder.write(chunk);
                let newline;
                while ((newline = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.slice(0, newline).trim();
                    buffer = buffer.slice(newline + 1);
                    if (line) await apply(line);
                }
            }
            buffer += decoder.end();
            if (buffer.trim()) await apply(buffer.trim());
        }, { retryMode: 'never' });
    }
}
