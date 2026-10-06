// Preserve only directly reported counters. Missing/invalid values stay unknown;
// do not sum provider subdivisions or infer settled prices.
export function observedGenerationUsage(raw, fields) {
    const usage = {};
    for (const [target, source] of Object.entries(fields)) {
        const value = raw?.[source];
        if (Number.isSafeInteger(value) && value >= 0) usage[target] = value;
    }
    return Object.keys(usage).length ? usage : null;
}
