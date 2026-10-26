import { runComputationJob } from './package-computation-pool.js';
import { compileController } from './frontend/script-compiler.js';
import { assertJsonDeclaration } from '../../public/shared/native-values.js';
import { resourcePath } from '../../public/shared/native-frontend-contract.js';
import { hashNativeDocument } from './repositories/common.js';
import { packageDeclarationKey } from './package-declarations.js';
import { computationPolicy } from './computation-policy.js';

// Cache only exact immutable module declarations, never inputs or outcomes.
const artifacts = new Map(), installedArtifacts = new WeakMap();
function freezeProgram(value) {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freezeProgram(child);
        Object.freeze(value);
    }
    return value;
}
export function compilePackageComputation(source, files) {
    return pinnedArtifact(source, files).artifact;
}

function pinnedArtifact(source, files) {
    const limits = computationPolicy();
    resourcePath(source);
    if (!/\.(js|ts)$/.test(source)) throw new TypeError('Package computation requires JS/TS');
    // Build validation and execution share the exact linked program. A package
    // with many transactions must not transpile the same world rules per use.
    for (const [key, cached] of artifacts) {
        if (cached.source !== source || !cached.modules.every(([path, bytes]) => files.has(path) && bytes.equals(files.get(path)))) continue;
        artifacts.delete(key); artifacts.set(key, cached);
        return cached;
    }
    const artifact = compileController(source, path => {
        const bytes = files.get(path);
        if (!bytes || bytes.length > limits.computationModuleBytes) throw new TypeError('Missing computation module');
        return bytes.toString('utf8');
    }, { modules: limits.computationModules, moduleBytes: limits.computationModuleBytes, synchronous: true });
    freezeProgram(artifact);
    const entry = { source, artifact, modules: artifact.modules.map(module => [module.id, Buffer.from(files.get(module.id))]),
        resourceHash: hashNativeDocument(artifact) };
    if (artifacts.size >= 8) artifacts.delete(artifacts.keys().next().value);
    artifacts.set(entry.resourceHash, entry);
    return entry;
}

export async function runPackageComputation(installed, source, method, input, { partitioned = false, signal } = {}) {
    if (!['precondition', 'compute', 'invariant', 'derive', 'transform'].includes(method)) throw new TypeError('Invalid computation stage');
    const identity = packageDeclarationKey(installed);
    let entry = identity && installedArtifacts.get(identity)?.get(source);
    if (!entry) {
        entry = pinnedArtifact(source, installed.sourceFiles);
        if (identity) {
            let entries = installedArtifacts.get(identity);
            if (!entries) { entries = new Map(); installedArtifacts.set(identity, entries); }
            entries.set(source, entry);
        }
    }
    const { artifact, resourceHash } = entry, limits = computationPolicy();
    const jsonLimits = { maxNodes: limits.computationNodes, maxDepth: limits.computationDepth, maxString: limits.computationInputBytes };
    const safe = assertJsonDeclaration(input, 'Computation input', limits.computationInputBytes, jsonLimits);
    const inputText = JSON.stringify(safe), inputBytes = Buffer.byteLength(inputText);
    const batch = new AbortController();
    const abort = () => batch.abort(signal.reason);
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    async function run(stage, extra = undefined) {
        const extraText = extra === undefined ? undefined : JSON.stringify(extra);
        const bytes = inputBytes + (extraText ? Buffer.byteLength(extraText) : 0);
        if (bytes > limits.computationInputBytes) throw new TypeError('Computation input byte limit');
        const text = await runComputationJob({ artifact, resourceHash, source, method: stage, inputText, extraText, bytes, limits }, { signal: batch.signal });
        return assertJsonDeclaration(JSON.parse(text), 'Computation output', limits.computationOutputBytes, jsonLimits);
    }
    try {
        let value;
        if (partitioned && method === 'compute') {
            const shards = await run('partition');
            if (!Array.isArray(shards) || !shards.length || shards.length > limits.computationShards) throw new TypeError('Computation shard limit');
            // Bounded producers keep a large partition from flooding the shared pool.
            const results = new Array(shards.length); let next = 0;
            await Promise.all(Array.from({ length: Math.min(shards.length, limits.workers) }, async () => {
                while (next < shards.length) {
                    const index = next++;
                    results[index] = await run('compute', { shard: shards[index], shardIndex: index, shardCount: shards.length });
                }
            }));
            value = await run('reduce', { results });
        } else value = await run(method);
        return { value, evidence: { source, resourceHash, stage: method } };
    } catch (error) { batch.abort(error); throw error; } finally { signal?.removeEventListener('abort', abort); }
}
