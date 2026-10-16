import { randomUUID, createHash } from 'node:crypto';
import { mkdir, open, rename, readdir, lstat, readFile, unlink, realpath, chmod, rmdir } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
const exec = promisify(execFile);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uuid = z.string().uuid();
const states = ['queued', 'awaiting_approval', 'ready', 'running', 'reconciling', 'completed', 'failed', 'cancelled', 'stale', 'unknown'];
const terminal = new Set(['completed', 'failed', 'cancelled', 'stale', 'unknown']);
const retired = new Set(['completed', 'failed', 'cancelled', 'stale']);
const contains = (root, path) => { const rel = relative(root, path); return !rel || (!rel.startsWith('..') && !isAbsolute(rel)); };
const recordSchema = z.strictObject({ version: z.literal(1), operationId: uuid, instanceId: uuid, ownerHash: z.string().regex(/^[a-f0-9]{64}$/),
    action: z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/), risk: z.enum(['INTERACT', 'MUTATE', 'DESTRUCTIVE']),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/), targetHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), serverBootId: z.string().regex(/^[A-Za-z0-9_.:-]{1,256}$/).optional(),
    state: z.enum(states), dispatched: z.boolean(), cancelRequested: z.boolean(), createdAt: z.number(), updatedAt: z.number(),
    receiptId: uuid.optional(), productOperationId: z.string().regex(/^[A-Za-z0-9_.:-]{1,256}$/).optional(),
    reconciliation: z.enum(['not-dispatched', 'owning-authority-required', 'native-response-observed']).optional() });

// No input/output bodies, credentials, mutable business state or reusable approvals are stored.
export class OperationJournal {
    #tail = Promise.resolve();
    constructor({ directory, owner, instanceId = randomUUID(), now = Date.now, maxEntries = 1000, maxInstances = 128, retentionMs = 7 * 86400000 } = {}) {
        this.ownerHash = digest(owner); this.instanceId = instanceId; this.now = now; this.maxEntries = maxEntries;
        uuid.parse(instanceId);
        this.maxInstances = maxInstances; this.retentionMs = retentionMs;
        this.root = resolve(directory ?? join(homedir(), '.atria-mcp', 'state'), this.ownerHash);
        this.directory = join(this.root, instanceId); this.records = new Map();
    }
    async init({ forbiddenRoots = [] } = {}) {
        for (const root of forbiddenRoots) {
            const rel = relative(resolve(root), this.root);
            if (!rel || (!rel.startsWith('..') && !isAbsolute(rel))) throw Error('Journal must be outside source and product data roots');
        }
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        for (let parent = this.root; ; parent = dirname(parent)) {
            if ((await lstat(parent)).isSymbolicLink()) throw Error('Journal symlink denied');
            if (dirname(parent) === parent) break;
        }
        const canonical = await realpath(this.root);
        for (const root of forbiddenRoots) {
            const forbidden = await realpath(resolve(root)).catch(() => resolve(root));
            if (contains(forbidden, canonical)) throw Error('Journal must be outside source and product data roots');
        }
        // Windows mode bits do not enforce a private ACL.
        if (process.platform === 'win32') {
            const { stdout } = await exec('whoami', ['/user', '/fo', 'csv', '/nh'], { windowsHide: true });
            const sid = stdout.match(/S-1-5-[0-9-]+/)?.[0];
            if (!sid) throw Error('Private journal owner unavailable');
            await exec('icacls', [this.root, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`], { windowsHide: true });
        } else await chmod(this.root, 0o700);
        const entries = await readdir(this.root, { withFileTypes: true });
        if (entries.length > this.maxInstances * 2) throw Error('Journal directory capacity reached');
        let retainedInstances = 0;
        for (const entry of entries) {
            if (!entry.isDirectory() || !uuid.safeParse(entry.name).success) continue;
            const directory = join(this.root, entry.name);
            if ((await lstat(directory)).isSymbolicLink()) throw Error('Journal symlink denied');
            const path = join(directory, 'operations.json');
            try {
                const stat = await lstat(path);
                if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) throw Error('Invalid journal file');
                const rows = z.array(recordSchema).max(this.maxEntries).parse(JSON.parse(await readFile(path, 'utf8')));
                for (const row of rows) if (row.ownerHash !== this.ownerHash || row.instanceId !== entry.name) throw Error('Journal owner mismatch');
                let live = false;
                try {
                    const marker = JSON.parse(await readFile(join(directory, 'process.json'), 'utf8'));
                    if (Number.isInteger(marker.pid) && marker.pid > 0) { try { process.kill(marker.pid, 0); live = true; } catch (error) { if (error.code !== 'ESRCH') live = true; } }
                } catch (error) { if (error.code !== 'ENOENT') live = true; }
                if (!live && rows.every(row => retired.has(row.state) && this.now() - row.updatedAt >= this.retentionMs)) {
                    // Remove only the known metadata files, never recursively remove a supplied path.
                    await unlink(path); await unlink(join(directory, 'process.json')).catch(error => { if (error.code !== 'ENOENT') throw error; });
                    await rmdir(directory).catch(error => { if (error.code !== 'ENOTEMPTY') throw error; }); continue;
                }
                if (++retainedInstances >= this.maxInstances || this.records.size + rows.length > this.maxEntries) throw Error('Journal recovery capacity reached; retained unknown records require authority reconciliation');
                for (const row of rows) {
                    if (row.ownerHash !== this.ownerHash || row.instanceId !== entry.name) throw Error('Journal owner mismatch');
                    if (!terminal.has(row.state)) { row.state = row.dispatched ? 'unknown' : 'cancelled'; row.reconciliation = row.dispatched ? 'owning-authority-required' : 'not-dispatched'; }
                    this.records.set(row.operationId, row);
                }
            } catch (error) { if (error.code !== 'ENOENT') throw Error('Journal recovery refused: ' + error.message); }
        }
        await mkdir(this.directory, { mode: 0o700 });
        const marker = await open(join(this.directory, 'process.json'), 'wx', 0o600);
        await marker.writeFile(JSON.stringify({ pid: process.pid, instanceId: this.instanceId, createdAt: this.now() })); await marker.close();
        return this;
    }
    async put(record) {
        const parsed = recordSchema.parse(record);
        if (parsed.instanceId !== this.instanceId || parsed.ownerHash !== this.ownerHash) throw Error('Journal instance mismatch');
        const persist = async () => {
            const next = new Map(this.records); next.set(parsed.operationId, structuredClone(parsed));
            for (const [id, row] of next) if (row.instanceId === this.instanceId && retired.has(row.state) && this.now() - row.updatedAt >= this.retentionMs) next.delete(id);
            if (next.size > this.maxEntries) throw Error('Journal capacity reached; preserve unknown history');
            const own = [...next.values()].filter(item => item.instanceId === this.instanceId);
            const path = join(this.directory, 'operations.json'), temp = path + '.' + randomUUID() + '.tmp';
            let file;
            try {
                file = await open(temp, 'wx', 0o600); await file.writeFile(JSON.stringify(own)); await file.sync(); await file.close(); file = null;
                await rename(temp, path);
                this.records = next;
            } catch (error) { await file?.close(); await unlink(temp).catch(() => {}); throw error; }
        };
        const result = this.#tail.then(persist); this.#tail = result.catch(() => {}); return result;
    }
    async flush() { await this.#tail; }
    async close() { await this.flush(); await unlink(join(this.directory, 'process.json')).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

export class Operations {
    constructor({ journal = null, instanceId = journal?.instanceId ?? randomUUID(), now = Date.now, maxEntries = 1000 } = {}) {
        this.journal = journal; this.instanceId = instanceId; this.now = now; this.maxEntries = maxEntries;
        this.records = new Map(journal?.records ?? []); this.active = new Map();
    }
    async create(action, risk, inputHash, signal) {
        for (const [id, row] of this.records) if (!this.active.has(id) && row.instanceId === this.instanceId && retired.has(row.state)
            && this.now() - row.updatedAt >= (this.journal?.retentionMs ?? 7 * 86400000)) this.records.delete(id);
        if (this.records.size >= this.maxEntries) throw Error('Operation capacity reached; inspect retained history');
        const controller = new AbortController(), operationId = randomUUID();
        const onAbort = () => controller.abort(signal.reason);
        signal?.addEventListener('abort', onAbort, { once: true }); if (signal?.aborted) onAbort();
        this.active.set(operationId, { controller, cleanup: () => signal?.removeEventListener('abort', onAbort) });
        const record = { version: 1, operationId, instanceId: this.instanceId, ownerHash: this.journal?.ownerHash ?? digest(this.instanceId),
            action, risk, inputHash, state: 'queued', dispatched: false, cancelRequested: false, createdAt: this.now(), updatedAt: this.now() };
        try { await this.journal?.put(record); this.records.set(operationId, record); } catch (error) { this.release(operationId); throw error; }
        return { operationId, signal: controller.signal };
    }
    async update(id, patch) {
        const record = recordSchema.parse({ ...this.records.get(id), ...patch, updatedAt: this.now() });
        await this.journal?.put(record); this.records.set(id, record); return structuredClone(record);
    }
    get(id) { const item = this.records.get(id); if (!item) throw Error('Unknown owned operation'); return structuredClone(item); }
    list({ offset = 0, limit = 30 } = {}) {
        const rows = [...this.records.values()].sort((a, b) => b.createdAt - a.createdAt);
        return { total: rows.length, operations: rows.slice(offset, offset + limit).map(item => structuredClone(item)) };
    }
    async cancel(id) {
        const record = this.get(id), active = this.active.get(id);
        if (!active || terminal.has(record.state)) return { ...record, cancellation: 'not-running-in-this-instance' };
        active.controller.abort(Error('Owned operation cancellation requested'));
        await this.update(id, { cancelRequested: true });
        return { ...this.get(id), cancellation: record.dispatched ? 'requested-remote-result-unconfirmed' : 'requested-before-dispatch' };
    }
    release(id) { const active = this.active.get(id); active?.cleanup(); this.active.delete(id); }
    async close() { for (const id of this.active.keys()) await this.cancel(id); await this.journal?.close(); }
}

export function registerOperationActions(registry, operations, scheduler, { observeProduct = null } = {}) {
    const descriptor = (id, risk) => ({ version: 1, id, domain: 'operation', title: id, risk,
        authority: 'MCP instance-owned invocation metadata; Native authority owns business results', adapter: 'local-control', externalEffects: [],
        guards: risk === 'READ' ? [] : ['instance-owned-operation'], approval: risk === 'READ' ? 'none' : 'trusted-approval-required', availability: { available: true, reason: 'Never replays product requests' } });
    registry.register(descriptor('operation.list', 'READ'), z.strictObject({ offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(30) }), z.json(), i => operations.list(i));
    registry.register(descriptor('operation.get', 'READ'), z.strictObject({ operationId: uuid }), z.json(), i => operations.get(i.operationId));
    registry.register(descriptor('operation.reconcile', 'READ'), z.strictObject({ operationId: uuid }), z.json(), async i => {
        const record = operations.get(i.operationId);
        const native = record.productOperationId && observeProduct ? await observeProduct(record) : null;
        return { operation: record, native, automaticReplay: false,
            recovery: 'Native results own business completion; this read neither retries nor resumes effects.' };
    });
    registry.register(descriptor('operation.scheduler', 'READ'), z.strictObject({}), z.json(), () => scheduler.snapshot());
    registry.register(descriptor('operation.cancel', 'INTERACT'), z.strictObject({ operationId: uuid }), z.json(), i => operations.cancel(i.operationId),
        async i => { const op = operations.get(i.operationId); return { target: { operationId: op.operationId, instanceId: op.instanceId }, serverBootId: op.serverBootId ?? null }; });
    return registry;
}
