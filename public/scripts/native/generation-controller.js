import { runNativePlayGeneration } from './play-generation.js';
import { executeNativeGeneration, executeNativeOperation } from './generation-client.js';

/** One operation owner over the existing generation and Session authorities. */
export function createNativeGenerationController({ runtime, host, run = runNativePlayGeneration }) {
    let operation = null;
    const currentScope = () => ({
        sessionId: runtime.snapshot?.session?.sessionId,
        branchId: runtime.snapshot?.revision?.branchId,
        revisionId: runtime.snapshot?.revision?.revisionId,
    });
    const stale = () => Object.assign(new Error('Native generation context changed'), { code: 'native_generation_revision_conflict' });
    return Object.freeze({
        isRunning: () => Boolean(operation),
        cancel(reason = 'Requested stop') {
            if (!operation || operation.controller.signal.aborted) return false;
            operation.controller.abort(reason);
            return true;
        },
        async generate(type, { input = '', scope, signal, quietPrompt = '', onInputAccepted } = {}) {
            if (operation) throw Object.assign(new Error('Generation is already running.'), { code: 'native_generation_busy' });
            if (!runtime.active || !scope || Object.keys(currentScope()).some(key => scope[key] !== currentScope()[key])) throw stale();
            if (typeof input !== 'string' || input.length > 65536) throw new TypeError('Invalid Native input');
            runtime.assertWritable();
            const controller = new AbortController();
            const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
            const owned = { controller, scope, epoch: runtime.projectionEpoch };
            let adapter;
            operation = owned;
            const guard = ({ allowAbort = false } = {}) => {
                if (requestSignal.aborted && !allowAbort) throw Object.assign(new Error('Native generation cancelled'), { code: 'generation_cancelled' });
                const current = currentScope();
                if (operation !== owned || runtime.projectionEpoch !== owned.epoch || current.sessionId !== scope.sessionId || current.branchId !== scope.branchId) throw stale();
            };
            try {
                const accepted = receipt => {
                    try {
                        guard({ allowAbort: true });
                        if (receipt?.sessionId === scope.sessionId && receipt?.branchId === scope.branchId) onInputAccepted?.(receipt);
                    } catch { /* The receipt reports an issued commit; presentation cannot undo it. */ }
                };
                adapter = typeof host === 'function' ? host(requestSignal, guard, accepted) : host;
                const guardedHost = { ...adapter };
                for (const key of ['started', 'submitUser', 'commitAssistant', 'impersonate', 'gameApi', 'context', 'onChunk', 'onState']) {
                    if (typeof adapter[key] === 'function') guardedHost[key] = (...args) => { guard({ allowAbort: key === 'onState' }); return adapter[key](...args); };
                }
                return await run({ runtime, type, input, signal: requestSignal, quietPrompt, host: guardedHost,
                    execute: async args => {
                        guard();
                        const revision = runtime.snapshot.revision.revisionId;
                        const result = await executeNativeGeneration(args);
                        guard();
                        if (runtime.snapshot.revision.revisionId !== revision) throw stale();
                        return result;
                    },
                    executeOperation: (...args) => { guard(); return executeNativeOperation(...args); },
                });
            } finally {
                if (operation === owned) {
                    operation = null;
                    try { adapter?.onState?.(runtime.generationProjection); } catch { /* Presentation observers do not own cleanup. */ }
                }
            }
        },
    });
}
