import { getConfigFilePath, getConfigValue } from '../util.js';
// Shared by Authority accounting and the isolated computation transport.
// A composed input can contain several individually bounded values.
export const AUTHORITY_EXECUTION_LIMITS = Object.freeze({
    valueBytes: 16 * 1024 * 1024, totalValueBytes: 128 * 1024 * 1024, readBytes: 64 * 1024 * 1024,
    recordScans: 1000000, ruleEvaluations: 16384, steps: 65536,
    // Server world programs are independent of the interactive UI sandbox.
    // Isolated processes keep computation and engine faults off the host.
    computationWallMs: 2000,
    computationHeapBytes: 128 * 1024 * 1024,
    computationOutputBytes: 1024 * 1024,
    computationModules: 512,
    computationModuleBytes: 8 * 1024 * 1024,
});

let policy;
export function authorityExecutionLimits() {
    if (policy) return policy;
    const config = getConfigFilePath() ? getConfigValue('native.authority', {}) : {};
    const values = { ...AUTHORITY_EXECUTION_LIMITS };
    for (const key of ['valueBytes', 'totalValueBytes', 'readBytes', 'recordScans', 'ruleEvaluations', 'steps']) {
        if (config[key] === undefined) continue;
        if (!Number.isSafeInteger(config[key]) || config[key] < 1) throw new TypeError('Invalid native.authority.' + key);
        values[key] = config[key];
    }
    return policy = Object.freeze(values);
}
