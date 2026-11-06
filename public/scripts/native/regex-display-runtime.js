import { nativeRegexApplies } from '../../shared/native-regex.js';

export function processNativeDisplayRegex(value, scripts, options = {}, { signal, timeoutMs = 250 } = {}) {
    scripts = scripts.filter(script => nativeRegexApplies(script, { ...options, scope: 'display' }));
    if (!scripts.length) return Promise.resolve({ value, diagnostics: [] });
    return new Promise(resolve => {
        let timer, ruleId, worker, budget, settled = false;
        const finish = result => { if (settled) return; settled = true; clearTimeout(timer); clearTimeout(budget); signal?.removeEventListener('abort', cancel); worker?.terminate(); resolve(result); };
        const fail = code => finish({ value, diagnostics: [{ ruleId, code }] });
        const cancel = () => fail('regex_cancelled');
        try { worker = new Worker(new URL('./regex-display-worker.js', import.meta.url), { type: 'module' }); } catch { fail('regex_worker_failed'); return; }
        budget = setTimeout(() => fail('regex_budget_exceeded'), 5000);
        worker.onmessage = ({ data }) => {
            if (data.result) finish(data.result);
            else if (data.ruleId) { ruleId = data.ruleId; clearTimeout(timer); timer = setTimeout(() => fail('regex_timeout'), timeoutMs); }
        };
        worker.onerror = () => fail('regex_worker_failed');
        timer = setTimeout(() => fail('regex_worker_timeout'), 2000);
        signal?.addEventListener('abort', cancel, { once: true });
        if (signal?.aborted) cancel(); else worker.postMessage({ value, scripts: structuredClone(scripts), options: { ...options, scope: 'display' } });
    });
}
