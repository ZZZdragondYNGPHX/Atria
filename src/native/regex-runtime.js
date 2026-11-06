import { Worker } from 'node:worker_threads';
import { nativeRegexApplies } from '../../public/shared/native-regex.js';

export function processNativeRegex(text, scripts, options = {}, { signal, timeoutMs = 250 } = {}) {
    scripts = scripts.filter(script => nativeRegexApplies(script, options));
    if (!scripts.length) return Promise.resolve({ text, diagnostics: [] });
    return new Promise(resolve => {
        let ruleId, timer, budget, worker, settled = false;
        const finish = result => { if (settled) return; settled = true; clearTimeout(timer); clearTimeout(budget); signal?.removeEventListener('abort', cancel); void worker?.terminate(); resolve(result); };
        const cancel = () => finish({ text, diagnostics: [{ ruleId, code: 'regex_cancelled' }] });
        try { worker = new Worker(new URL('./regex-worker.js', import.meta.url), { workerData: { text, scripts, options }, execArgv: [] }); } catch { finish({ text, diagnostics: [{ code: 'regex_worker_failed' }] }); return; }
        budget = setTimeout(() => finish({ text, diagnostics: [{ ruleId, code: 'regex_budget_exceeded' }] }), 5000);
        worker.on('message', message => {
            if (message.ruleId) { ruleId = message.ruleId; clearTimeout(timer); timer = setTimeout(() => finish({ text, diagnostics: [{ ruleId, code: 'regex_timeout' }] }), timeoutMs); } else if (message.result) finish(message.result);
        });
        worker.on('error', () => finish({ text, diagnostics: [{ ruleId, code: 'regex_worker_failed' }] }));
        timer = setTimeout(() => finish({ text, diagnostics: [{ ruleId, code: 'regex_worker_timeout' }] }), Math.max(2000, timeoutMs));
        signal?.addEventListener('abort', cancel, { once: true });
        if (signal?.aborted) cancel();
    });
}
