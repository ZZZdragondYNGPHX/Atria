import { getQuickJS } from 'quickjs-emscripten';
import { compileController } from './frontend/script-compiler.js';
import { SCRIPT_LIMITS } from '../../public/shared/native-frontend-script.js';
import { assertJsonDeclaration } from '../../public/shared/native-values.js';
import { resourcePath } from '../../public/shared/native-frontend-contract.js';
import { hashNativeDocument } from './repositories/common.js';

// Cache only exact immutable module declarations, never inputs or outcomes.
const artifacts = new Map();
export function compilePackageComputation(source, files) {
    resourcePath(source);
    if (!/\.(js|ts)$/.test(source)) throw new TypeError('Package computation requires JS/TS');
    const artifact = compileController(source, path => {
        const bytes = files.get(path);
        if (!bytes || bytes.length > SCRIPT_LIMITS.moduleBytes) throw new TypeError('Missing computation module');
        return bytes.toString('utf8');
    });
    return artifact;
}

function pinnedArtifact(installed, source) {
    // Include all source bytes in the key: imports cannot follow mutable latest.
    const key = hashNativeDocument({ source, files: [...installed.sourceFiles].map(([path, bytes]) => [path, hashNativeDocument(bytes.toString('utf8'))]).sort() });
    if (!artifacts.has(key)) {
        const artifact = compilePackageComputation(source, installed.sourceFiles);
        if (artifacts.size >= 8) artifacts.delete(artifacts.keys().next().value);
        artifacts.set(key, artifact);
    }
    return artifacts.get(key);
}

export async function runPackageComputation(installed, source, method, input) {
    if (!['precondition', 'compute', 'invariant', 'derive'].includes(method)) throw new TypeError('Invalid computation stage');
    const artifact = pinnedArtifact(installed, source);
    const safe = assertJsonDeclaration(input, 'Computation input', SCRIPT_LIMITS.messageBytes);
    const engine = await getQuickJS();
    const runtime = engine.newRuntime();
    runtime.setMemoryLimit(SCRIPT_LIMITS.heap); runtime.setMaxStackSize(SCRIPT_LIMITS.stack);
    const vm = runtime.newContext();
    const deadline = Date.now() + SCRIPT_LIMITS.cpuMs;
    runtime.setInterruptHandler(() => Date.now() > deadline);
    try {
        // No host bridge is installed. Module factories, loader, checks and JSON
        // serialization all execute in the bounded guest heap, never Node eval.
        const result = vm.evalCode(`(() => {
            const modules = Object.create(null), cache = Object.create(null);
            const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
            for (const proto of [Function.prototype, Object.getPrototypeOf(async function(){}), Object.getPrototypeOf(function*(){}), Object.getPrototypeOf(async function*(){})])
                Object.defineProperty(proto, 'constructor', { value: undefined, configurable: false, writable: false });
            for (const key of ['eval', 'Function', 'Date', 'WebAssembly', 'SharedArrayBuffer', 'Atomics'])
                Object.defineProperty(globalThis, key, { value: undefined, configurable: false, writable: false });
            Object.defineProperty(Math, 'random', { value: undefined, configurable: false, writable: false });
            ${artifact.modules.map(module => `modules[${JSON.stringify(module.id)}] = { imports: ${JSON.stringify(module.imports)}, factory: function(require,module,exports){\n${module.code}\n} };`).join('\n')}
            const load = id => {
                if (cache[id]) return cache[id].exports;
                const record = modules[id]; if (!record) throw Error('Unlinked module');
                const module = { exports: {} }; cache[id] = module;
                record.factory(name => { if (!Object.hasOwn(record.imports, name)) throw Error('Unlinked import'); return load(record.imports[name]); }, module, module.exports);
                return module.exports;
            };
            const handler = load(${JSON.stringify(artifact.entry)}).default?.[${JSON.stringify(method)}];
            if (typeof handler !== 'function') throw Error('Missing computation stage');
            const value = handler(freeze(JSON.parse(${JSON.stringify(JSON.stringify(safe))})));
            const check = (value, depth = 0) => {
                if (depth > 32) throw Error('Computation depth');
                if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
                if (typeof value === 'number' && Number.isFinite(value)) return;
                if (!value || typeof value !== 'object' || value.then || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw Error('Computation JSON required');
                Object.values(value).forEach(child => check(child, depth + 1));
            };
            check(value);
            const text = JSON.stringify(value);
            if (text.length > ${SCRIPT_LIMITS.messageBytes}) throw Error('Computation output budget');
            return text;
        })()`, source);
        if (result.error) { result.error.dispose(); throw new TypeError('Package computation failed'); }
        let value;
        try { value = assertJsonDeclaration(JSON.parse(vm.getString(result.value)), 'Computation output', SCRIPT_LIMITS.messageBytes); } finally { result.value.dispose(); }
        if (runtime.hasPendingJob()) throw new TypeError('Asynchronous computation denied');
        return { value, evidence: { source, resourceHash: hashNativeDocument(artifact), stage: method } };
    } finally { vm.dispose(); runtime.dispose(); }
}
