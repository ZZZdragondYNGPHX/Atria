import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import vectra from 'vectra';
import { sync as writeFileAtomic } from 'write-file-atomic';
import { assertWritable } from '../storage/read-only-mode.js';

const writes = new Map();
let queued = 0;
const MAX_BYTES = 16777216;
const indexIdentity = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
const unavailable = () => Object.assign(new Error('Bounded Native index work unavailable'), { code: 'native_retrieval_compute_unavailable' });
async function cleanStage(stage, indexPath) {
    if (path.dirname(path.resolve(stage)) !== path.dirname(path.resolve(indexPath)) || !path.basename(stage).startsWith('.atri-index-work-')) throw unavailable();
    await fs.rm(stage, { recursive: true, force: true });
}

// One server writer, matching the original FS authority boundary. This is a
// physical index permit, not another owner budget or a cross-process lock.
export async function withNativeIndexWrite(indexPath, signal, operation) {
    return withIndexPermit(indexPath, signal, operation, true);
}
async function withIndexPermit(indexPath, signal, operation, write) {
    if (queued >= 128) throw unavailable();
    const identity = indexIdentity(indexPath), previous = writes.get(identity) ?? Promise.resolve();
    queued++;
    const next = previous.catch(() => {}).then(() => { signal?.throwIfAborted(); if (write) assertWritable(); return operation(); });
    writes.set(identity, next);
    try { return await next; } finally {
        queued--;
        if (writes.get(identity) === next) writes.delete(identity);
    }
}

export async function queryNativeIndexes({ indexes, query, vector, topK, threshold, includeVectors = false, getVector, compute, signal, mode = 'query' }) {
    if (!['query', 'list'].includes(mode) || (mode === 'list' && indexes.length !== 1)) throw unavailable();
    const listing = mode === 'list';
    const supplied = vector !== undefined;
    if (supplied && (!Array.isArray(vector) || !vector.length || vector.length > 65536 || vector.some(n => !Number.isFinite(n)))) throw unavailable();
    // The original caller may wait behind an index writer. Freeze its vector
    // before that await, just like the serialized query/input admission bound.
    const frozenVector = supplied ? Object.freeze([...vector]) : null;
    if (!indexes.length || indexes.length > 16 || new Set(indexes.map(row => indexIdentity(row.indexPath))).size !== indexes.length
        || (!listing && !supplied && (typeof query !== 'string' || !query.trim() || Buffer.byteLength(query, 'utf8') > 8192))
        || (!listing && (!Number.isSafeInteger(topK) || topK < 1 || topK > 100 || !Number.isFinite(threshold)))) throw unavailable();
    const inputBytes = Buffer.byteLength(JSON.stringify({ collections: indexes.map(row => row.collectionId),
        ...(listing ? { operation: 'list' } : { ...(supplied ? { vector: frozenVector } : { query }), topK, threshold, includeVectors }) }), 'utf8');
    if (inputBytes > MAX_BYTES) throw unavailable();
    const paths = indexes.map(row => row.indexPath).sort((a, b) => indexIdentity(a) < indexIdentity(b) ? -1 : indexIdentity(a) > indexIdentity(b) ? 1 : 0);
    const enter = depth => depth === paths.length ? execute() : withIndexPermit(paths[depth], signal, () => enter(depth + 1), false);
    return enter(0);

    async function execute() {
        const started = performance.now(), cpu = process.cpuUsage();
        let ticket, outcome = 'failed', result;
        try {
            ticket = await compute?.beforeLocalWork({ items: indexes.length, inputBytes, indexPath: paths, kind: listing ? 'index_list' : 'index_query' });
            signal?.throwIfAborted();
            let bytes = 0, count = 0, values = 0;
            const stores = [];
            for (const row of indexes) {
                signal?.throwIfAborted();
                const file = path.join(row.indexPath, 'index.json');
                const stat = await fs.stat(file).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
                if (!stat) continue;
                if ((bytes += stat.size) > MAX_BYTES) throw unavailable();
                const raw = await fs.readFile(file), doc = JSON.parse(raw.toString('utf8'));
                if (!Array.isArray(doc.items) || (count += doc.items.length) > 10000 || doc.metadata_config?.indexed?.length || raw.length > stat.size) throw unavailable();
                for (const item of doc.items) {
                    if (item.metadataFile || !Array.isArray(item.vector) || !item.vector.length || item.vector.length > 65536
                        || (values += item.vector.length) > 1048576 || item.vector.some(n => !Number.isFinite(n)) || !Number.isFinite(item.norm)) throw unavailable();
                }
                stores.push({ ...row, ...(listing ? { doc } : { store: new vectra.LocalIndex(row.indexPath) }) });
            }
            // Existing empty indexes also have no candidates. No provider
            // usage is invented for this deterministic no-send decision.
            if (listing) {
                result = (stores[0]?.doc.items ?? []).map(item => {
                    if (item.metadata?.hash === null || !Number.isFinite(Number(item.metadata?.hash))) throw unavailable();
                    return Number(item.metadata.hash);
                });
            } else if (!count) result = { groups: {}, single: { hashes: [], metadata: [] } };
            else {
                if (compute) await compute.publishLocalIndex(() => { signal?.throwIfAborted(); });
                const vector = supplied ? frozenVector : await getVector();
                signal?.throwIfAborted();
                if (!Array.isArray(vector) || !vector.length || vector.length > 65536 || vector.some(n => !Number.isFinite(n))) throw unavailable();
                const hits = [];
                for (const row of stores) {
                    signal?.throwIfAborted();
                    const selected = await row.store.queryItems(vector, topK);
                    hits.push(...selected.map(hit => ({ collectionId: row.collectionId, hit })));
                }
                const selected = hits.sort((a, b) => b.hit.score - a.hit.score).filter(row => row.hit.score >= threshold).slice(0, topK);
                const groups = Object.create(null);
                for (const { collectionId, hit } of selected) {
                    const group = groups[collectionId] ??= { hashes: [], metadata: [] };
                    group.hashes.push(Number(hit.item.metadata.hash));
                    group.metadata.push({ ...hit.item.metadata, score: hit.score,
                        ...(includeVectors ? { vector: hit.item.vector } : {}) });
                }
                const single = groups[indexes[0].collectionId] ?? { hashes: [], metadata: [] };
                if (includeVectors) single.queryVector = vector;
                result = { groups, single };
            }
            // Cost settlement may await storage. Currentness is checked again
            // afterwards, while the same physical permits are still held.
            if (compute) await compute.publishLocalIndex(() => { signal?.throwIfAborted(); });
            signal?.throwIfAborted();
            outcome = 'completed';
        } catch (error) {
            if (signal?.aborted) outcome = 'cancelled';
            throw error;
        } finally {
            const used = process.cpuUsage(cpu);
            await compute?.settleLocalWork(ticket, { wallMs: performance.now() - started, cpuUserMicros: used.user,
                cpuSystemMicros: used.system, cpuScope: 'process', outcome });
        }
        const current = () => { signal?.throwIfAborted(); return result; };
        return compute ? compute.publishLocalIndex(current) : current();
    }
}

export async function insertNativeIndex({ indexPath, items, getVectors, compute, signal }) {
    if (!items.length) return { insertedCount: 0, vectorDim: null };
    if (items.length > 10000 || items.some(item => typeof item.text !== 'string' || !item.text)) throw unavailable();
    const inputBytes = Buffer.byteLength(JSON.stringify(items), 'utf8');
    if (inputBytes > MAX_BYTES) throw unavailable();
    return withNativeIndexWrite(indexPath, signal, async () => {
        const started = performance.now(), cpu = process.cpuUsage();
        let ticket, stage, store, outcome = 'failed';
        try {
            ticket = await compute?.beforeLocalWork({ items: items.length, inputBytes, indexPath });
            signal?.throwIfAborted();
            const indexFile = path.join(indexPath, 'index.json');
            const existing = await fs.stat(indexFile).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
            if (existing && existing.size > MAX_BYTES) throw unavailable();
            const parent = path.dirname(indexPath);
            await fs.mkdir(parent, { recursive: true });
            stage = await fs.mkdtemp(path.join(parent, '.atri-index-work-'));
            store = new vectra.LocalIndex(stage);
            if (existing) {
                const original = await fs.readFile(indexFile);
                const doc = JSON.parse(original.toString('utf8'));
                // Native indexes use full in-file metadata. Reject an unknown
                // multi-file format instead of publishing missing sidecars.
                if (original.length > MAX_BYTES || doc.metadata_config?.indexed?.length || doc.items?.some(item => item.metadataFile)) throw unavailable();
                await fs.writeFile(path.join(stage, 'index.json'), original);
            } else await store.createIndex();
            await store.beginUpdate();
            const vectors = await getVectors();
            signal?.throwIfAborted();
            let values = 0;
            if (!Array.isArray(vectors) || vectors.length !== items.length) throw unavailable();
            for (const vector of vectors) {
                if (!Array.isArray(vector) || !vector.length || vector.length > 65536 || (values += vector.length) > 1048576 || vector.some(n => !Number.isFinite(n))) throw unavailable();
            }
            for (let i = 0; i < items.length; i++) {
                signal?.throwIfAborted();
                const item = items[i];
                await store.upsertItem({ vector: vectors[i], metadata: { hash: item.hash, text: item.text, index: item.index, ...(item.metadata || {}) } });
            }
            await store.endUpdate();
            const resultFile = path.join(stage, 'index.json');
            if ((await fs.stat(resultFile)).size > MAX_BYTES) throw unavailable();
            const result = await fs.readFile(resultFile);
            await fs.mkdir(indexPath, { recursive: true });
            const publish = () => {
                // No await between the final cancellation/authority decision
                // and rename. Original Run/Task/Project permits cover this
                // bounded synchronous replacement; settlement is still separate.
                signal?.throwIfAborted(); assertWritable();
                writeFileAtomic(indexFile, result);
            };
            if (compute) await compute.publishLocalIndex(publish);
            else publish();
            outcome = 'completed';
            return { insertedCount: items.length, vectorDim: Array.isArray(vectors[0]) ? vectors[0].length : null };
        } catch (error) {
            if (signal?.aborted) outcome = 'cancelled';
            throw error;
        } finally {
            store?.cancelUpdate();
            try {
                if (stage) {
                    // Only our mkdtemp sibling may be recursively removed.
                    await cleanStage(stage, indexPath);
                }
            } finally {
                const used = process.cpuUsage(cpu);
                await compute?.settleLocalWork(ticket, { wallMs: performance.now() - started, cpuUserMicros: used.user,
                    cpuSystemMicros: used.system, cpuScope: 'process', outcome });
            }
        }
    });
}
