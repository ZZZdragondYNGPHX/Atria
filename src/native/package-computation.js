import { runComputationJob } from './package-computation-pool.js';
import { compileController } from './frontend/script-compiler.js';
import { assertJsonDeclaration } from '../../public/shared/native-values.js';
import { resourcePath } from '../../public/shared/native-frontend-contract.js';
import { hashNativeDocument } from './repositories/common.js';
import { AUTHORITY_EXECUTION_LIMITS } from './authority-execution-limits.js';
import { computationPolicy } from './computation-policy.js';

// Cache only exact immutable module declarations, never inputs or outcomes.
const artifacts = new Map();
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

export async function runPackageComputation(installed, source, method, input) {
    if (!['precondition', 'compute', 'invariant', 'derive', 'transform'].includes(method)) throw new TypeError('Invalid computation stage');
    const { artifact, resourceHash } = pinnedArtifact(source, installed.sourceFiles);
    // Several budgeted reads/values form one input; the frontend bridge message
    // ceiling is not the Authority aggregate. Guest execution limits still apply.
    const safe = assertJsonDeclaration(input, 'Computation input', AUTHORITY_EXECUTION_LIMITS.totalValueBytes);
    const limits = computationPolicy();
    const text = await runComputationJob({ artifact, resourceHash, source, method, safe, limits });
    const value = assertJsonDeclaration(JSON.parse(text), 'Computation output', limits.computationOutputBytes);
    return { value, evidence: { source, resourceHash, stage: method } };
}
