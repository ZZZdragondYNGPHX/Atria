// A bounded preparation slice inside its existing TaskScheduler/Turn owner.
// Inputs must already be proven independent and pinned to the same authority.
export async function prepareIndependent(items, prepare, { signal, concurrency = 2 } = {}) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new TypeError('Invalid preparation concurrency');
    const controller = new AbortController(), results = new Array(items.length);
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    let cursor = 0, failure;
    const check = () => { if (controller.signal.aborted) throw Object.assign(new Error('Preparation cancelled'), { name: 'AbortError', code: 'generation_cancelled' }); };
    try {
        const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
            while (!failure && cursor < items.length) {
                check(); const index = cursor++;
                try { results[index] = await prepare(items[index], index, controller.signal); } catch (error) { failure ??= error; controller.abort(); throw error; }
            }
        });
        await Promise.allSettled(workers); // Failed siblings settle before owner exits.
        if (failure) throw failure;
        check(); return results;
    } finally { signal?.removeEventListener('abort', abort); }
}
