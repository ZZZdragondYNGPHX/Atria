import variant from '@jitl/quickjs-singlefile-browser-release-sync';
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import { createScriptVM } from './script-vm.js';
import { scriptMessage } from '../../../shared/native-frontend-script.js';

const engine = newQuickJSWASMModuleFromVariant(variant);
let vm, artifact;
function diagnostic(error) {
    const stack = String(error.stack ?? '');
    let source = { file: artifact?.entry ?? '', line: 1, column: 1 };
    let nearest = Infinity;
    for (const module of artifact?.modules ?? []) {
        const escaped = module.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = new RegExp(escaped + ':(\\d+)(?::(\\d+))?').exec(stack);
        if (!match || match.index >= nearest) continue;
        nearest = match.index;
        const original = originalPositionFor(new TraceMap(module.map), { line: Math.max(1, Number(match[1]) - 1), column: Math.max(0, Number(match[2] ?? 1) - 1) });
        source = { file: original.source ?? module.id, line: original.line ?? 1, column: (original.column ?? 0) + 1 };
    }
    return { category: 'script', reasonCode: /interrupt|budget|out of memory|stack overflow/i.test(error.message) ? 'script_budget_exceeded' : 'script_exception', source, message: String(error.message ?? 'Script failed').slice(0, 512) };
}
// Main serializes requests; this queue additionally prevents overlapping init
// during the asynchronous engine load. No Package callbacks enter this realm.
let chain = Promise.resolve();
globalThis.onmessage = event => {
    chain = chain.then(async () => {
        const message = event.data, start = performance.now();
        try {
            if (message.kind === 'init') { artifact = message.artifact; vm = createScriptVM(await engine, artifact); globalThis.postMessage({ sequence: message.sequence, calls: [], cpu: performance.now() - start }); } else {
                const calls = vm.run(scriptMessage(message));
                const failure = calls.find(call => call.method === 'exception');
                globalThis.postMessage({ sequence: message.sequence, calls: calls.filter(call => call.method !== 'exception'), cpu: performance.now() - start, ...(failure ? { error: diagnostic(failure.args[0]) } : {}) });
            }
        } catch (error) { globalThis.postMessage({ sequence: message.sequence, calls: [], error: diagnostic(error), cpu: performance.now() - start }); }
    });
};
