import ivm from 'isolated-vm';

// No Node references or host callbacks cross into a game context. Native V8
// faults are contained in this disposable child process, outside the host.
const programs = new Map(), scripts = new Map();
let isolate;
function reset() {
    for (const script of scripts.values()) script.release();
    scripts.clear(); programs.clear();
    if (isolate && !isolate.isDisposed) isolate.dispose();
    isolate = null;
}
process.on('disconnect', () => { reset(); process.exit(0); });
process.on('message', async ({ artifact, resourceHash, source, method, safe, limits }) => {
    let context;
    try {
        isolate ??= new ivm.Isolate({ memoryLimit: limits.computationHeapBytes / 1048576,
            onCatastrophicError: () => process.exit(1) });
        if (artifact) {
            if (programs.size >= 8) {
                const oldest = programs.keys().next().value;
                programs.delete(oldest);
                for (const [key, script] of scripts) if (key.startsWith(oldest + ':')) { script.release(); scripts.delete(key); }
            }
            programs.set(resourceHash, artifact);
        }
        const program = programs.get(resourceHash);
        if (!program) throw new Error('Computation program is not loaded');
        const key = resourceHash + ':' + method;
        let script = scripts.get(key);
        if (!script) {
            script = await isolate.compileScript(programText(program, source, method, limits), { filename: source });
            scripts.set(key, script);
        }
        context = await isolate.createContext();
        await context.global.set('__atriInput', JSON.stringify(safe));
        const value = await script.run(context, { timeout: limits.computationWallMs });
        process.send({ value, programs: [...programs.keys()] });
    } catch (error) {
        context?.release(); context = null; reset();
        process.send({ error: { message: error.message, code: error.code }, programs: [] });
    } finally { context?.release(); }
});

function programText(artifact, source, method, limits) {
    return `(() => {
            const modules = Object.create(null), cache = Object.create(null);
            const freeze = value => {
                if (value && typeof value === 'object') {
                    for (const key of Object.keys(value)) {
                        const child = value[key];
                        if (child && typeof child === 'object') freeze(child);
                    }
                    Object.freeze(value);
                }
                return value;
            };
            for (const proto of [Function.prototype, Object.getPrototypeOf(async function(){}), Object.getPrototypeOf(function*(){}), Object.getPrototypeOf(async function*(){})])
                Object.defineProperty(proto, 'constructor', { value: undefined, configurable: false, writable: false });
            for (const key of ['eval', 'Function', 'Date', 'WebAssembly', 'SharedArrayBuffer', 'Atomics', 'Promise', 'WeakRef', 'FinalizationRegistry', 'Intl'])
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
            const value = handler(freeze(JSON.parse(__atriInput)));
            const check = (value, depth = 0) => {
                if (depth > 32) throw Error('Computation depth');
                if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
                if (typeof value === 'number' && Number.isFinite(value)) return;
                if (!value || typeof value !== 'object' || value.then || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw Error('Computation JSON required');
                Object.values(value).forEach(child => check(child, depth + 1));
            };
            check(value);
            const text = JSON.stringify(value);
            if (text.length > ${limits.computationOutputBytes}) throw Error('Computation output budget');
            return text;
        })()`;
}
