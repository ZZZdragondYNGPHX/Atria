import { Readable } from 'node:stream';
import { AsyncLocalStorage } from 'node:async_hooks';
import { StringDecoder } from 'node:string_decoder';
import { createRequire } from 'node:module';
import { PgTransaction } from './postgres-engine-transaction.js';
import { initSchema } from './postgres-schema.js';
import { withRetry, isKnownRollbackError } from '../retry.js';
import { StorageCommitUnknownError } from '../errors.js';
import { createHash } from 'node:crypto';
import { logEngineError } from '../engine-logger.js';
import { TransactionScope } from './transaction-scope.js';
import { assertNativeSqlTopology, inspectPgNativeTopology, assertNativeSqlSession } from '../native-sql-topology.js';

const DEFAULT_ACQUIRE_TIMEOUT_MS = 30_000;
const require = createRequire(import.meta.url);
let pg;
const DEFAULT_RETRIES = { transient: 3 };

// User-data tables, listed in INSERT order (parent before child) so a
// `restoreUser` stream that consumes this dump in order satisfies the FK
// constraints declared in migrations/postgres/0001-initial.sql:
//   - chat_states references chats (handle, char_dir, name, is_group, group_id)
//     via `chat_states_fk_chats` ON DELETE CASCADE → chats must precede.
//   - preset_states has NO FK on presets (the schema's missing FK matches
//     the PERMISSIVE put-without-parent policy), but we still order them
//     parents-first for symmetry and so a future FK retrofit is safe.
// `chats` excludes `integrity` because it is a GENERATED STORED column
// (doc #>> '{header,chat_metadata,integrity}') — Postgres rejects explicit
// writes to it with `cannot insert into column "integrity"`.
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

// pg parses JSONB into JS objects by default; mysql2 parses JSON the same way.
// Normalize to JSON.stringify so `restoreUser` re-inserts a value the driver
// will round-trip correctly into JSONB (passing a raw JS object goes through
// pg's text protocol as `[object Object]`). Buffers and Dates pass through
// untouched — BIGINT timestamps are already JS numbers thanks to the
// process-global type-parser registered at the top of this module.
function normalizeDumpValue(v) {
    if (v != null && typeof v === 'object' && !Buffer.isBuffer(v) && !(v instanceof Date)) {
        return JSON.stringify(v);
    }
    return v;
}

export class PgEngine {
    constructor({
        url,
        poolSize = 10,
        acquireTimeoutMs = DEFAULT_ACQUIRE_TIMEOUT_MS,
        retries = DEFAULT_RETRIES,
        nativeHostTopology = 'unknown',
    } = {}) {
        if (typeof url !== 'string' || !url) {
            throw new TypeError('PgEngine requires { url: "postgresql://user:pass@host:port/db" }');
        }
        this.kind = 'postgres';
        Object.defineProperty(this, 'nativeHostTopology', { value: nativeHostTopology });
        this._nativeOwnerUrl = url;
        Object.defineProperty(this, 'nativeHostOwnershipKey', { value: 'postgres:' + createHash('sha256').update(url).digest('hex') });
        this._transactionScope = new TransactionScope();
        this._accountLease = new AsyncLocalStorage();
        this._retries = retries;
        // pg.Pool keyed on connection-string + max. Max caps concurrent
        // leases so withTransaction queues past the limit instead of opening
        // unbounded sockets. The harness encodes a per-test schema into the
        // URL's `options=-csearch_path=...` parameter, so every connection
        // pulled from this pool already targets the right namespace — no
        // per-connection `SET search_path` needed. connectionTimeoutMillis
        // bounds both the initial TCP connect AND the wait time when the
        // pool is exhausted (pg-pool releases queued waiters with a
        // 'timeout exceeded when trying to connect' error).
        if (!pg) {
            pg = require('pg');
            // Our BIGINT columns hold safe millisecond timestamps. Configure
            // the shared parser before the first pool/connection is created.
            pg.types.setTypeParser(20, (val) => (val === null ? null : Number(val)));
        }
        this._pool = new pg.Pool({
            connectionString: url,
            max: poolSize,
            connectionTimeoutMillis: acquireTimeoutMs,
            keepAlive: true,
            keepAliveInitialDelayMillis: 10_000,
        });
        // Lazy schema bootstrap: first ping / withTransaction triggers
        // initSchema once and caches the promise so concurrent first calls
        // share the work. Mirrors MysqlEngine / SqliteEngine bootstrap.
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
                const client = await this._pool.connect();
                try {
                    await client.query('SELECT 1');
                } finally {
                    client.release();
                }
            }, { retries: this._retries.transient });
        } catch (err) {
            logEngineError(this.kind, 'ping', handle ?? null, err);
            throw err;
        }
    }

    assertNativeHostTopology() { assertNativeSqlTopology(this.nativeHostTopology); }

    async acquireNativeHostOwnership(onLost) {
        this.assertNativeHostTopology();
        const client = new pg.Client({ connectionString: this._nativeOwnerUrl });
        client.on('error', onLost);
        client.on('end', onLost);
        try {
            await client.connect();
            const session = await inspectPgNativeTopology(client);
            const digest = createHash('sha256').update('atria.native-host-owner.v1').digest();
            const { rows } = await client.query('SELECT pg_try_advisory_lock($1, $2) AS acquired', [digest.readInt32BE(0), digest.readInt32BE(4)]);
            if (rows[0]?.acquired !== true) throw new Error('Native database already has a Host owner');
            assertNativeSqlSession(session, await inspectPgNativeTopology(client));
            return async () => { await client.end(); };
        } catch (error) { await client.end().catch(() => {}); throw error; }
    }

    async withAccountLock(handle, operation) {
        await this._ensureSchema();
        if (this._accountLease.getStore()?.open && this._accountLease.getStore().handle === handle) return operation();
        const client = await this._pool.connect();
        const name = 'atria:account:' + handle;
        let broken = false;
        try {
            await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [name]);
            const lease = { handle, client, open: true };
            let failure, result;
            try { result = await this._accountLease.run(lease, operation); } catch (error) { failure = error; }
            lease.open = false;
            try { await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [name]); } catch (error) { broken = true; failure ??= error; }
            if (failure) throw failure;
            return result;
        } finally { client.release(broken); }
    }

    hasActiveTransaction(handle) { return this._transactionScope.get(handle) !== null; }

    async withTransaction(handle, fn, { retryMode = 'known_rollback_only' } = {}) {
        if (!['known_rollback_only', 'never'].includes(retryMode)) throw new TypeError('Unsupported storage retryMode');
        const active = this._transactionScope.get(handle);
        if (active) return fn(active);
        await this._ensureSchema();
        const retryableFailures = new WeakSet();
        try {
            return await withRetry(async () => {
                const scope = this._accountLease.getStore(), leased = scope?.open ? scope : null;
                const client = leased?.handle === handle ? leased.client : await this._pool.connect();
                try {
                    await client.query('BEGIN');
                    const tx = new PgTransaction({ client, handle });
                    try {
                        const result = await this._transactionScope.run(handle, tx, () => fn(tx));
                        try { await client.query('COMMIT'); } catch (error) {
                            if (isKnownRollbackError(error)) throw error;
                            throw new StorageCommitUnknownError(error);
                        }
                        return result;
                    } catch (err) {
                        try { await client.query('ROLLBACK'); if (err.code !== 'storage_commit_unknown') err.storageRollbackConfirmed = true; } catch { /* outcome remains unproven */ }
                        if (isKnownRollbackError(err)) retryableFailures.add(err);
                        throw err;
                    }
                } finally {
                    if (client !== leased?.client) client.release();
                }
            }, { retries: this._retries.transient, isRetryable: err => retryMode === 'known_rollback_only' && retryableFailures.has(err) });
        } catch (err) {
            logEngineError(this.kind, 'tx', handle, err);
            throw err;
        }
    }

    /**
     * Postgres parallel of MysqlEngine.deleteUser. Same retry-and-log shell,
     * same table order, same idempotent contract. Uses parameterized queries
     * with `$1` binding (pg convention) instead of `?`. The `_storage_meta`
     * table is schema-version data, NOT user data, and is left untouched.
     * @param {string} handle
     */
    async _withUserAdministration(handle, fn, options) {
        const lifecycle = this.nativeHostLifecycle;
        return lifecycle ? lifecycle.withAdministrativeTransaction(handle, fn, options) : this.withTransaction(handle, fn, options);
    }

    async deleteUser(handle) {
        return this._withUserAdministration(handle, async tx => {
            for (const table of ['chat_states', 'preset_states', 'chats', 'presets', 'worlds', 'named_docs', 'groups_table', 'native_resources', 'settings', 'stats']) {
                const predicate = table === 'native_resources' ? ' AND kind <> $2' : '';
                await tx._client.query(`DELETE FROM ${table} WHERE handle = $1${predicate}`, table === 'native_resources' ? [handle, 'atri_host_fence'] : [handle]);
            }
        });
    }

    async close() {
        await this._pool.end();
    }

    /**
     * postgres dumps to a text stream of newline-separated
     * JSON-encoded `{sql, params}` records — one INSERT per row. The dump
     * is dialect-specific (postgres uses `$1, $2, ...` placeholders); the
     * matching engine kind is recorded in `_engine_meta.json` outside this
     * stream so a cross-dialect restore is caught at the orchestrator
     * layer instead of blowing up here with an opaque SQL error.
     *
     * Tables are emitted in PARENT-FIRST order (DUMP_TABLES) so a streaming
     * restore can INSERT in receive order without buffering: `chats` before
     * `chat_states` (FK CASCADE), `presets` before `preset_states`. The `integrity` column on `chats` is omitted
     * because it is GENERATED STORED — Postgres rejects explicit writes.
     *
     * Uses `Readable.from(asyncGenerator)` so backpressure flows naturally
     * to the consumer (HTTP response, file write, etc.) without holding the
     * whole dump in memory. The pool client is acquired once at stream
     * start and released in the generator's `finally`, so an aborted
     * consumer still frees the slot.
     * @param {string} handle
     * @returns {Promise<import('node:stream').Readable>}
     */
    async dumpUser(handle, { tables = null } = {}) {
        await this._ensureSchema();
        const self = this;

        async function* generate() {
            const client = await self._pool.connect();
            try {
                for (const t of DUMP_TABLES) {
                    if (tables && !tables.includes(t.name)) continue;
                    const colsCsv = t.cols.join(', ');
                    const placeholders = t.cols.map((_, i) => `$${i + 1}`).join(', ');
                    const sqlText = `INSERT INTO ${t.name} (${colsCsv}) VALUES (${placeholders})`;
                    const { rows } = await client.query(
                        `SELECT ${colsCsv} FROM ${t.name} WHERE handle = $1`,
                        [handle],
                    );
                    for (const row of rows) {
                        if (t.name === 'native_resources' && row.kind === 'atri_host_fence') continue;
                        const params = t.cols.map((c) => normalizeDumpValue(row[c]));
                        yield JSON.stringify({ sql: sqlText, params }) + '\n';
                    }
                }
            } finally {
                client.release();
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
                const predicate = table === 'native_resources' ? ' AND kind <> $2' : '';
                await tx._client.query(`DELETE FROM ${table} WHERE handle = $1${predicate}`, table === 'native_resources' ? [handle, 'atri_host_fence'] : [handle]);
            }
            const apply = async line => {
                const { sql, params } = JSON.parse(line);
                // Original dump column order is handle, kind, resource_key...
                // A source Host fence can never replace the destination Owner.
                if (/^INSERT INTO native_resources\s/i.test(sql) && params?.[1] === 'atri_host_fence') return;
                await tx._client.query(sql, params);
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
