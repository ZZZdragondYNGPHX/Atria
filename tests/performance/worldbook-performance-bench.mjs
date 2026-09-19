// Synthetic, serial, offline baseline. Not a browser or full scanner benchmark.
// Run: node --expose-gc tests/performance/worldbook-performance-bench.mjs
import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ChatSnapshotCache } from '../../public/scripts/atri-chat-snapshot-cache.js';
import { getMessageDepthFromTail } from '../../public/scripts/atri-message-depth.js';
import { buildMemoryCorpus, rankMemory } from '../../public/scripts/extensions/memory-graph/hybrid-retrieval.js';
import { largeMemory } from '../memory-graph/fixtures/large-memory.js';
import { WorldInfoSelectionIndex } from '../../public/scripts/atri-world-info-selection.js';
import { applyProfileWorldInfoFilter } from '../../public/scripts/extensions/orchestrator/lorebook-filter.js';
import { makeEntry, makePayload } from '../world-info/prompt-fixture.js';

const samples = 7;
function measure(run) {
    run();
    const timingsMs = [];
    let result;
    for (let i = 0; i < samples; i++) {
        globalThis.gc?.();
        const start = performance.now();
        result = run();
        timingsMs.push(Number((performance.now() - start).toFixed(3)));
    }
    return { timingsMs, medianMs: [...timingsMs].sort((a, b) => a - b)[Math.floor(samples / 2)], result };
}
const retention = [250, 2500, 10000].map(messageCount => {
    const messages = Array.from({ length: messageCount }, (_, i) => ({ mes: 'x'.repeat(1024) + i }));
    const wire = JSON.stringify(messages);
    const run = bounded => {
        let active = '';
        const cache = bounded ? new ChatSnapshotCache({ activeKey: () => active }) : new Map();
        for (let i = 0; i < 16; i++) {
            active = 'chat:' + i;
            const snapshot = JSON.parse(wire);
            if (bounded) cache.set(active, 'messages', snapshot);
            else cache.set(active, snapshot);
        }
        return { retainedChats: cache.size, retainedWireBytes: cache.size * Buffer.byteLength(wire) };
    };
    return { messageCount, unbounded: measure(() => run(false)), bounded: measure(() => run(true)) };
});
const messageDepth = [250, 2500, 10000].map(messageCount => {
    const messages = Array.from({ length: messageCount }, (_, index) => ({
        mes: 'm-' + index,
        is_system: index % 31 === 0,
    }));
    messages.at(-1).is_system = false;
    const latest = measure(() => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) sum += getMessageDepthFromTail(messages, messageCount - 1);
        if (sum !== 0) throw new Error('Latest message depth regression');
        return { depth: 0, calls: 1000 };
    });
    const visibleWindowStart = Math.max(0, messageCount - 100);
    const recent = measure(() => {
        let sum = 0;
        for (let i = visibleWindowStart; i < messageCount; i++) {
            const depth = getMessageDepthFromTail(messages, i);
            if (Number.isFinite(depth)) sum += depth;
        }
        return { start: visibleWindowStart, messages: messageCount - visibleWindowStart, checksum: sum };
    });
    return { messageCount, latest, recent };
});

const memoryRetrieval = [500, 1500, 3000].map(relationCount => {
    const snapshot = largeMemory(relationCount);
    const corpus = measure(() => buildMemoryCorpus(snapshot));
    const built = corpus.result;
    const ranking = measure(() => {
        const result = rankMemory('Where is Person 42?', built, [], { now: 0 });
        if (result.candidates[0]?.id !== 'relation:r42') throw new Error('Memory ranking regression');
        return { candidates: result.candidates.length, first: result.candidates[0]?.id };
    });
    return {
        relationCount,
        corpusSize: built.documents.length,
        corpus: { timingsMs: corpus.timingsMs, medianMs: corpus.medianMs },
        ranking,
    };
});

const prompt = [100, 1000, 10000].map(count => {
    const entries = Array.from({ length: count }, (_, uid) => makeEntry(uid % 2 ? 'private' : 'public', uid));
    return { entries: count, ...measure(() => {
        const payload = makePayload(entries);
        applyProfileWorldInfoFilter(payload, { bookPattern: '^private$' });
        if (payload.worldInfoBeforeEntries.length !== count / 2) throw new Error('Identity regression');
        return { retained: payload.worldInfoBeforeEntries.length };
    }) };
});
const candidateIndex = [1000, 10000].map(count => {
    const entries = Array.from({ length: count }, (_, uid) => {
        const prefix = uid.toString(36).padStart(3, '0');
        return {
            world: 'bench',
            uid,
            hash: 'v1:' + uid,
            key: [prefix + '-world-key'],
            content: 'content-' + uid,
            decorators: [],
        };
    });
    const target = entries[Math.floor(count * 0.73)];
    const scanText = 'ordinary chat text ' + target.key[0] + ' ordinary tail';
    const cold = measure(() => {
        const index = new WorldInfoSelectionIndex();
        return index.update(entries);
    });
    const warmIndex = new WorldInfoSelectionIndex();
    warmIndex.update(entries);
    const incremental = measure(() => warmIndex.update(entries));
    const query = measure(() => {
        const selected = warmIndex.select({ getScanText: () => scanText });
        if (selected.entries.length !== 1 || selected.entries[0].uid !== target.uid) {
            throw new Error('Candidate index regression');
        }
        return {
            candidates: selected.entries.length,
            degraded: selected.diagnostics.degraded,
        };
    });
    return { entries: count, cold, incremental, query };
});

const paths = [
    'public/scripts/atri-chat-snapshot-cache.js',
    'public/scripts/atri-message-depth.js',
    'public/scripts/atri-world-info-prompt.js',
    'public/scripts/atri-world-info-provenance.js',
    'public/scripts/atri-world-info-selection.js',
    'public/scripts/extensions/memory-graph/hybrid-retrieval.js',
];
console.log(JSON.stringify({
    kind: 'synthetic-offline-only', createdAt: new Date().toISOString(),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
    sourceHashes: Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(new URL('../../' + path, import.meta.url))).digest('hex')])),
    environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, gcExposed: Boolean(globalThis.gc) },
    warmupRuns: 1, samples, retention, messageDepth, memoryRetrieval, prompt, candidateIndex,
}, null, 2));
