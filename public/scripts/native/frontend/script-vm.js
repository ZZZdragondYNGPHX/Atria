import { SCRIPT_LIMITS, assertScriptArtifact, scriptMessage, scriptMethod } from '../../../shared/native-frontend-script.js';

// This adapter never executes Package code in the Worker JS realm. Even the
// module linker and promise callbacks below execute inside QuickJS's own heap.
export function createScriptVM(QuickJS, artifact) {
    assertScriptArtifact(artifact);
    const runtime = QuickJS.newRuntime(); runtime.setMemoryLimit(SCRIPT_LIMITS.heap); runtime.setMaxStackSize(SCRIPT_LIMITS.stack);
    const vm = runtime.newContext(); let deadline = 0, calls = [], dead = false;
    runtime.setInterruptHandler(() => Date.now() > deadline);
    const send = vm.newFunction('send', handle => {
        const value = vm.getString(handle);
        if (value.length > SCRIPT_LIMITS.messageBytes || calls.length >= SCRIPT_LIMITS.queue) throw new Error('script_message_budget');
        calls.push(scriptMessage(JSON.parse(value))); return vm.undefined;
    });
    vm.setProp(vm.global, '__atriSend', send); send.dispose();
    function evaluate(code, file = 'atria-controller-host') {
        const result = vm.evalCode(code, file);
        if (result.error) { const error = vm.dump(result.error); result.error.dispose(); throw Object.assign(new Error(String(error.message ?? 'Script exception').slice(0, 512)), { stack: String(error.stack ?? '').slice(0, 4096) }); }
        result.value.dispose();
    }
    function jobs() {
        let count = 0;
        while (runtime.hasPendingJob()) {
            if (++count > 256 || Date.now() > deadline) throw new Error('script_cpu_budget');
            const result = runtime.executePendingJobs(1);
            if (result.error) { result.error.dispose(); throw new Error('script_job_failed'); }
        }
    }
    try {
        deadline = Date.now() + SCRIPT_LIMITS.cpuMs;
        evaluate(`globalThis.__atri = (() => {
            const send = __atriSend; delete globalThis.__atriSend;
            const modules = Object.create(null), cache = Object.create(null), pending = new Map();
            let snapshot = {}, controller, sequence = 0;
            const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
            const notify = (method, args, intent = null) => send(JSON.stringify({ method, args, ...(intent ? { intent } : {}) }));
            const request = (method, args, intent = null) => {
                if (pending.size >= ${SCRIPT_LIMITS.outstanding}) throw Error('script_outstanding_budget');
                const id = ++sequence; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); send(JSON.stringify({ id, method, args, ...(intent ? { intent } : {}) })); });
            };
            const context = intent => Object.freeze({
                get props() { return snapshot.props; }, get state() { return snapshot.state; }, get env() { return snapshot.env; },
                set: (path, value) => notify('state', [path, value]), emit: (name, value) => notify('emit', [name, value], intent),
                bridge: Object.freeze(Object.fromEntries(['snapshot','page','invoke','start','operation','cancel'].map(method => [method, (...args) => request('bridge', [method, ...args], intent)]))),
                node: (id, method = 'measure', value) => request('node', [id, method, value]),
                media: (binding, ref) => request('media', [binding, ref]), canvas: (id, buffer) => notify('canvas', [id, buffer]),
                scheduler: Object.freeze({ timer: ms => request('timer', [ms]), frame: () => request('frame', []), yield: () => request('yield', []) }),
                clock: () => snapshot.time, random: () => Math.random()
            });
            const load = id => {
                if (cache[id]) return cache[id].exports;
                const record = modules[id]; if (!record) throw Error('Unlinked module');
                const module = { exports: {} }; cache[id] = module;
                record.factory(name => { if (!Object.hasOwn(record.imports, name)) throw Error('Unlinked import'); return load(record.imports[name]); }, module, module.exports);
                return module.exports;
            };
            const errors = error => notify('exception', [{ message: String(error?.message ?? error).slice(0,512), stack: String(error?.stack ?? '').slice(0,4096) }]);
            // Removing every dynamic-function constructor also closes computed
            // property/prototype escapes that a source scan cannot establish.
            for (const proto of [Function.prototype, Object.getPrototypeOf(async function(){}), Object.getPrototypeOf(function*(){}), Object.getPrototypeOf(async function*(){})])
                Object.defineProperty(proto, 'constructor', { value: undefined, configurable: false, writable: false });
            for (const key of ['eval','Function','WebAssembly','SharedArrayBuffer','Atomics']) Object.defineProperty(globalThis, key, { value: undefined, configurable: false, writable: false });
            return Object.freeze({
                register(id, imports, factory) { modules[id] = { imports, factory }; },
                start(id) { controller = load(id).default; if (!controller || typeof controller !== 'object') throw Error('Controller default object required'); },
                run(method, input, event, intent) { snapshot = freeze(input); if (typeof controller[method] === 'function') { const result = controller[method](context(intent), freeze(event)); if (result?.then) result.catch(errors); } },
                settle(id, ok, value, input) { snapshot = freeze(input); const task = pending.get(id); if (task) { pending.delete(id); (ok ? task.resolve : task.reject)(freeze(value)); } }
            });
        })();`);
        for (const module of artifact.modules) evaluate(`__atri.register(${JSON.stringify(module.id)},${JSON.stringify(module.imports)},function(require,module,exports){\n${module.code}\n});`, module.id);
        evaluate(`__atri.start(${JSON.stringify(artifact.entry)})`); jobs();
    } catch (error) { vm.dispose(); runtime.dispose(); throw error; }
    return {
        run(message) {
            if (dead) throw new Error('script_disposed');
            calls = []; deadline = Date.now() + SCRIPT_LIMITS.cpuMs;
            if (message.kind === 'invoke') { scriptMethod(message.method); evaluate(`__atri.run(${JSON.stringify(message.method)},${JSON.stringify(scriptMessage(message.snapshot))},${JSON.stringify(scriptMessage(message.event ?? {}))},${JSON.stringify(message.intent ?? null)})`); } else if (message.kind === 'settle') evaluate(`__atri.settle(${JSON.stringify(message.id)},${message.ok === true},${JSON.stringify(scriptMessage(message.value ?? null))},${JSON.stringify(scriptMessage(message.snapshot))})`);
            else throw new Error('script_protocol');
            jobs(); return scriptMessage(calls);
        },
        dispose() { if (dead) return; dead = true; vm.dispose(); runtime.dispose(); },
    };
}
