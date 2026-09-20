// Synthetic, serial, offline baseline. Not a browser or full scanner benchmark.
// Run: node --expose-gc tests/performance/worldbook-performance-bench.mjs
import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ChatSnapshotCache } from '../../public/scripts/atri-chat-snapshot-cache.js';
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
const prompt = [100, 1000, 10000].map(count => {
    const entries = Array.from({ length: count }, (_, uid) => makeEntry(uid % 2 ? 'private' : 'public', uid));
    return { entries: count, ...measure(() => {
        const payload = makePayload(entries);
        applyProfileWorldInfoFilter(payload, { bookPattern: '^private$' });
        if (payload.worldInfoBeforeEntries.length !== count / 2) throw new Error('Identity regression');
        return { retained: payload.worldInfoBeforeEntries.length };
    }) };
});
const paths = ['public/scripts/atri-chat-snapshot-cache.js', 'public/scripts/atri-world-info-prompt.js', 'public/scripts/atri-world-info-provenance.js'];
console.log(JSON.stringify({
    kind: 'synthetic-offline-only', createdAt: new Date().toISOString(),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
    sourceHashes: Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(new URL('../../' + path, import.meta.url))).digest('hex')])),
    environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, gcExposed: Boolean(globalThis.gc) },
    warmupRuns: 1, samples, retention, prompt,
}, null, 2));
