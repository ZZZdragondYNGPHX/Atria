/** Settle the driver even when a port ignores abort. Never detach an unhandled rejection. */
export function abortable(work, signal, onLateResult) {
    return new Promise((resolve, reject) => {
        let stopped = false;
        const abort = () => {
            stopped = true;
            reject(new Error('Cancelled'));
        };
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
        Promise.resolve(work).then(value => {
            signal.removeEventListener('abort', abort);
            if (stopped) onLateResult();
            else resolve(value);
        }, error => {
            signal.removeEventListener('abort', abort);
            if (stopped) onLateResult();
            else reject(error);
        });
    });
}
