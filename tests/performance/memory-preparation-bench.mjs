import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { buildMemoryCorpus, rankMemory } from '../../public/scripts/agents/memory/hybrid-retrieval.js';
import { prepareMemoryRanking, attachMemoryRanking } from '../../public/scripts/agents/memory/ranking-index.js';
import { largeMemory } from '../memory-graph/fixtures/large-memory.js';
const query = 'Where is Person 42?';
if (!isMainThread) {
    parentPort.on('message', corpus => { attachMemoryRanking(corpus, prepareMemoryRanking(corpus)); parentPort.postMessage(rankMemory(query, corpus, [], { now: 0 })); });
} else {
    const worker = new Worker(new URL(import.meta.url));
    const samples = [];
    const measure = async run => { const times = []; for (let i = 0; i < 3; i++) { const start = performance.now(); await run(); times.push(performance.now() - start); } times.sort((a, b) => a - b); return { p50Ms: times[1], p95Ms: times[2] }; };
    try {
        for (const size of [100, 1000, 5000]) {
            const corpus = buildMemoryCorpus(largeMemory(size)), baseline = rankMemory(query, corpus, [], { now: 0 });
            const raw = await measure(() => assert.deepEqual(rankMemory(query, corpus, [], { now: 0 }), baseline));
            const start = performance.now(), index = prepareMemoryRanking(corpus), preparationMs = performance.now() - start;
            const ready = attachMemoryRanking({ ...corpus }, index);
            const prepared = await measure(() => assert.deepEqual(rankMemory(query, ready, [], { now: 0 }), baseline));
            const transfer = await measure(async () => { const result = new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); }); worker.postMessage(corpus); assert.deepEqual(await result, baseline); });
            samples.push({ size, documents: corpus.documents.length, preparationMs, estimatedCacheBytes: new TextEncoder().encode(JSON.stringify(corpus)).length + index.bytes, raw, prepared, workerWithSerialization: transfer, first: baseline.candidates[0].id });
        }
        console.log(JSON.stringify({ node: process.version, samples, conditions: '3 warm samples, offline equal-rank fixture; first Worker sample includes startup', costs: 'no external calls; no real-model RP or pricing claim' }, null, 2));
    } finally { await worker.terminate(); }
}
