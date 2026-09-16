import { performance } from 'node:perf_hooks';
import { largeMemory } from './fixtures/large-memory.js';
import { projectTemporalGraph } from '../../public/scripts/extensions/memory-graph/temporal-graph.js';
import { buildMemoryCorpus, rankMemory } from '../../public/scripts/extensions/memory-graph/hybrid-retrieval.js';

const sizes = process.argv.slice(2).map(Number);
const results = [];
for (const size of sizes.length ? sizes : [500, 1500, 3000]) {
    const snapshot = largeMemory(size); const started = performance.now();
    const graph = projectTemporalGraph(snapshot.state, snapshot.chat);
    const projected = performance.now(); const corpus = buildMemoryCorpus(snapshot); const built = performance.now();
    const ranking = rankMemory('Where is Person 42?', corpus); const ranked = performance.now();
    results.push({ size, entities: graph.entities.length, relations: graph.relations.length,
        projectionMs: +(projected - started).toFixed(1), corpusMs: +(built - projected).toFixed(1), rankingMs: +(ranked - built).toFixed(1),
        first: ranking.candidates[0]?.text });
}
console.log(JSON.stringify(results, null, 2));
