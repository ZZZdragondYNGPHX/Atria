import { runComputationJob } from './package-computation-pool.js';
import { collectControllerSources, captureControllerSources, validateScriptArtifact } from './frontend/script-compiler.js';
import { assertScriptArtifact } from '../../public/shared/native-frontend-script.js';
import { transpileComputation } from './computation-transpiler.js';
import { assertJsonDeclaration, parseJsonDeclaration, jsonDeclarationBytes } from '../../public/shared/native-values.js';
import { resourcePath } from '../../public/shared/native-frontend-contract.js';
import { hashNativeDocument } from './repositories/common.js';
import { packageDeclarationKey } from './package-declarations.js';
import { readPackagePayload } from './package-payload-cache.js';
import { computationPolicy } from './computation-policy.js';

// Cache only exact immutable module declarations, never inputs or outcomes.
const artifacts = new Map(), installedArtifacts = new WeakMap();
const preparations = new Set();
function sameSources(source, files, entry) {
    if (entry.source !== source) return false;
    for (const [path, bytes] of entry.modules) if (!files.has(path) || !bytes.equals(readPackagePayload(files, path))) return false;
    return true;
}
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
    const cached = cachedArtifact(source, files);
    if (cached) return cached;
    const modules = collectControllerSources(source, path => moduleText(files, path, limits), compilerLimits(limits));
    const artifact = validateScriptArtifact(transpileComputation(source, modules), compilerLimits(limits));
    return rememberArtifact(source, files, artifact, hashNativeDocument(artifact));
}
const compilerLimits = limits => ({ modules: limits.computationModules, moduleBytes: limits.computationModuleBytes, synchronous: true });
function moduleText(files, path, limits) {
    const bytes = readPackagePayload(files, path);
    if (!bytes || bytes.length > limits.computationModuleBytes) throw new TypeError('Missing computation module');
    return bytes.toString('utf8');
}
function cachedArtifact(source, files) {
    // Build validation and execution share the exact linked program. A package
    // with many transactions must not transpile the same world rules per use.
    for (const [key, cached] of artifacts) {
        if (!sameSources(source, files, cached)) continue;
        artifacts.delete(key); artifacts.set(key, cached);
        return cached;
    }
}
function rememberArtifact(source, files, artifact, resourceHash, captured = null) {
    freezeProgram(artifact);
    const entry = { source, artifact, modules: artifact.modules.map(module => [module.id, captured?.get(module.id) ?? Buffer.from(readPackagePayload(files, module.id))]),
        resourceHash };
    if (artifacts.size >= 8) artifacts.delete(artifacts.keys().next().value);
    artifacts.set(entry.resourceHash, entry);
    return entry;
}

async function prepareArtifact(source, files, signal) {
    signal?.throwIfAborted();
    resourcePath(source);
    if (!/\.(js|ts)$/.test(source)) throw new TypeError('Package computation requires JS/TS');
    const cached = cachedArtifact(source, files);
    if (cached) return cached;
    for (const entry of preparations) if (!entry.controller.signal.aborted && sameSources(source, files, entry)) return joinPreparation(entry, signal);
    const limits = computationPolicy();
    // Only exact reachable sources cross IPC, never an entire package/asset Map.
    const captured = new Map();
    const modules = captureControllerSources(source, path => {
        const bytes = readPackagePayload(files, path);
        if (!bytes || bytes.length > limits.computationModuleBytes) throw new TypeError('Missing computation module');
        captured.set(path, Buffer.from(bytes));
        return bytes.toString('utf8');
    }, compilerLimits(limits));
    const bytes = modules.reduce((sum, module) => sum + Buffer.byteLength(module.source), 0);
    const entry = { source, modules: captured, controller: new AbortController(), callers: 0, done: false };
    preparations.add(entry);
    entry.promise = runComputationJob({ compile: { modules }, source, method: 'compile',
        resourceHash: null, bytes, limits }, { signal: entry.controller.signal }).then(artifact => {
        assertScriptArtifact(artifact, compilerLimits(limits));
        return rememberArtifact(source, files, artifact, hashNativeDocument(artifact), captured);
    }).finally(() => { entry.done = true; preparations.delete(entry); });
    return joinPreparation(entry, signal);
}

// Concurrent cold sessions share compilation, but cancelling one caller must
// not kill another's job. The last departing caller still retires the worker.
function joinPreparation(entry, signal) {
    entry.callers++;
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback, value) => {
            if (settled) return;
            settled = true; signal?.removeEventListener('abort', abort);
            if (--entry.callers === 0 && !entry.done) entry.controller.abort();
            callback(value);
        };
        const abort = () => finish(reject, signal.reason);
        signal?.addEventListener('abort', abort, { once: true });
        entry.promise.then(value => finish(resolve, value), error => finish(reject, error));
        if (signal?.aborted) abort();
    });
}

export async function runPackageComputation(installed, source, method, input, { partitioned = false, signal } = {}) {
    if (!['precondition', 'compute', 'invariant', 'derive', 'transform'].includes(method)) throw new TypeError('Invalid computation stage');
    const identity = packageDeclarationKey(installed);
    let entry = identity && installedArtifacts.get(identity)?.get(source);
    if (!entry) {
        entry = await prepareArtifact(source, installed.sourceFiles, signal);
        if (identity) {
            let entries = installedArtifacts.get(identity);
            if (!entries) { entries = new Map(); installedArtifacts.set(identity, entries); }
            entries.set(source, entry);
        }
    }
    const { artifact, resourceHash } = entry, limits = computationPolicy();
    const jsonLimits = { maxNodes: limits.computationNodes, maxDepth: limits.computationDepth, maxString: limits.computationInputBytes };
    const safe = assertJsonDeclaration(input, 'Computation input', limits.computationInputBytes, jsonLimits);
    const inputText = JSON.stringify(safe), inputBytes = jsonDeclarationBytes(safe);
    const batch = new AbortController();
    const abort = () => batch.abort(signal.reason);
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    async function run(stage, extra = undefined) {
        const extraText = extra === undefined ? undefined : JSON.stringify(extra);
        const bytes = inputBytes + (extraText ? Buffer.byteLength(extraText) : 0);
        if (bytes > limits.computationInputBytes) throw new TypeError('Computation input byte limit');
        const text = await runComputationJob({ artifact, resourceHash, source, method: stage, inputText, extraText, bytes, limits }, { signal: batch.signal });
        return parseJsonDeclaration(text, 'Computation output', limits.computationOutputBytes, jsonLimits);
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
