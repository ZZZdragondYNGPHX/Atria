import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import vectra from 'vectra';
import { sync as writeFileAtomic } from 'write-file-atomic';
import { assertWritable } from '../storage/read-only-mode.js';

const writes = new Map();
let queued = 0;
const MAX_BYTES = 16777216;
const unavailable = () => Object.assign(new Error('Bounded Native index work unavailable'), { code: 'native_retrieval_compute_unavailable' });
async function cleanStage(stage, indexPath) {
    if (path.dirname(path.resolve(stage)) !== path.dirname(path.resolve(indexPath)) || !path.basename(stage).startsWith('.atri-index-work-')) throw unavailable();
    await fs.rm(stage, { recursive: true, force: true });
}

// One server writer, matching the original FS authority boundary. This is a
// physical index permit, not another owner budget or a cross-process lock.
export async function withNativeIndexWrite(indexPath, signal, operation) {
    if (queued >= 128) throw unavailable();
    const previous = writes.get(indexPath) ?? Promise.resolve();
    queued++;
    const next = previous.catch(() => {}).then(() => { signal?.throwIfAborted(); assertWritable(); return operation(); });
    writes.set(indexPath, next);
    try { return await next; } finally {
        queued--;
        if (writes.get(indexPath) === next) writes.delete(indexPath);
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
