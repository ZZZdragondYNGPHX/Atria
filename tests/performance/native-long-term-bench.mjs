// Local, offline production-repository baseline. Never claims physical power-loss proof.
import assert from 'node:assert/strict';
import os from 'node:os';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from '../native/helpers/session-fixture.js';
import { buildMemoryCorpus, rankMemory } from '../../public/scripts/agents/memory/hybrid-retrieval.js';
import { largeMemory } from '../memory-graph/fixtures/large-memory.js';

const samples = Number(process.env.ATRIA_BENCH_SAMPLES || 3);
const sizes = (process.env.ATRIA_BENCH_SIZES || '100,1000,5000').split(',').map(Number);
async function measure(run) {
    const timings = [];
    for (let i = 0; i < samples; i++) {
        const start = performance.now();
        await run();
        timings.push(performance.now() - start);
    }
    timings.sort((a, b) => a - b);
    return { samples, p50Ms: timings[Math.floor(timings.length / 2)], p95Ms: timings[Math.ceil(timings.length * .95) - 1] };
}
const delay = monitorEventLoopDelay({ resolution: 10 });
delay.enable();
const storage = [];
for (const [engine, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    for (const size of sizes) {
        const h = await make();
        try {
            const f = await installFixture(h);
            const first = await f.core.create(h.handle, f.start);
            const additions = Array.from({ length: size - first.timeline.length }, (_, i) => f.core._newEntry(first,
                { role: i % 2 ? 'assistant' : 'user', content: `Turn ${i}: ` + '原始剧情、可追溯世界变化。'.repeat(30) }, first.timeline.length + i));
            let view = await f.core._publish(h.handle, first, { timeline: [...first.timeline, ...additions.map(item => item.entry)],
                entries: additions.map(item => item.entry), variants: additions.map(item => item.variant) });
            const sessionId = view.session.sessionId;
            const load = await measure(async () => assert.equal((await f.core.load(h.handle, sessionId)).timeline.length, view.timeline.length));
            const range = await measure(async () => {
                const page = await f.sessionRepo.readTimelineRange(h.handle, sessionId, { fromSequence: size - 20, limit: 20 });
                assert.equal(page.entries.length, 20);
                assert.equal(page.entries.at(-1).content, view.timeline[size - 1].content);
            });
            const append = await measure(async () => { view = await f.core.appendTimeline(h.handle, sessionId, { role: 'user', content: 'Measured append' }); });
            const save = await f.core.createSavePoint(h.handle, sessionId);
            for (let depth = 0; depth < 3; depth++) view = await f.core.restoreSavePoint(h.handle, sessionId, save.saveId);
            assert.equal(view.states.atri_world_state.worlds[f.worldId].state.hp, 8);
            const gc = await measure(async () => assert.deepEqual(await f.sessionRepo.gcRevisions(h.handle, sessionId), []));
            storage.push({ engine, size, cache: 'warm after fixture publication', load, range, append, gc, memory: process.memoryUsage() });
        } finally { await h.cleanup(); }
        await new Promise(resolve => setImmediate(resolve));
    }
}
const retrieval = [];
for (const size of sizes) {
    const corpus = buildMemoryCorpus(largeMemory(size));
    const rank = await measure(() => assert.equal(rankMemory('Where is Person 42?', corpus, [], { now: 0 }).candidates[0]?.id, 'relation:r42'));
    retrieval.push({ size, rank });
}
delay.disable();
console.log(JSON.stringify({ schemaVersion: 1, head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    environment: { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model, memoryBytes: os.totalmem(),
        node: process.version, v8: process.versions.v8, abi: process.versions.modules },
    storage, retrieval, eventLoop: { p95Ms: delay.percentile(95) / 1e6, maxMs: delay.max / 1e6 },
    missingEvidence: ['Windows', 'Android Termux', 'physical power loss', 'browser T0–T4/DOM/input/scroll', 'real Provider cost and RP quality'] }, null, 2));
