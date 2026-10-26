// Resolved storage promises do not let the event loop service sockets or worker
// replies. Share a host quantum across Sessions, without changing game budgets,
// batch sizes or transaction ordering. Call only outside storage transactions.
let resumed = performance.now();
const waiting = [];
let scheduled = false;
function resume() {
    resumed = performance.now();
    waiting.shift()();
    // One continuation per event-loop turn. Resolving a shared promise here
    // would release all four Sessions into another uninterrupted microtask run.
    if (waiting.length) setImmediate(resume);
    else scheduled = false;
}
export function yieldHostWork() {
    if (!scheduled && performance.now() - resumed < 4) return;
    return new Promise(resolve => {
        waiting.push(resolve);
        if (!scheduled) { scheduled = true; setImmediate(resume); }
    });
}
