// Timing projections only. Actual Session/Range/Host checks remain their owners.
export function markStartupReadiness(name, documentRef = globalThis.document) {
    const state = globalThis.__atriaStartupTiming;
    if (!state || Number.isFinite(state[name])) return;
    state[name] = performance.now();
    performance.mark?.('atria:' + name);
    documentRef?.dispatchEvent(new CustomEvent('atria-startup-readiness', { detail: { name, atMs: state[name] } }));
}
