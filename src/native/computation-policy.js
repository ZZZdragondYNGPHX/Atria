import { availableParallelism, totalmem } from 'node:os';
import { getConfigFilePath, getConfigValue } from '../util.js';
import { AUTHORITY_EXECUTION_LIMITS } from './authority-execution-limits.js';

let policy;
export function computationPolicy() {
    if (policy) return policy;
    const config = getConfigFilePath() ? getConfigValue('native.computation', {}) : {};
    function number(key, fallback, minimum = 1) {
        const value = config[key] ?? fallback;
        if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError('Invalid native.computation.' + key);
        return value;
    }
    const mib = 1024 * 1024, cores = availableParallelism();
    const constrained = process.constrainedMemory();
    const memory = constrained > 0 ? Math.min(totalmem(), constrained) : totalmem();
    const heapMiB = number('heapMiB', 0, 0) || Math.max(16, Math.floor(memory / Math.max(8, cores * 8) / mib));
    const automaticWorkers = Math.max(1, Math.min(cores - 1, Math.floor(memory / (heapMiB * mib * 8))));
    policy = Object.freeze({
        ...AUTHORITY_EXECUTION_LIMITS,
        computationHeapBytes: heapMiB * mib,
        computationWallMs: number('timeoutMs', AUTHORITY_EXECUTION_LIMITS.computationWallMs),
        computationModules: number('modules', AUTHORITY_EXECUTION_LIMITS.computationModules),
        computationModuleBytes: number('moduleMiB', AUTHORITY_EXECUTION_LIMITS.computationModuleBytes / mib) * mib,
        computationInputBytes: number('inputMiB', 16) * mib,
        computationOutputBytes: number('outputMiB', 16) * mib,
        computationNodes: number('nodes', 1000000),
        computationDepth: number('depth', 64),
        computationShards: number('shards', Math.max(4, cores * 4)),
        computationQueueBytes: number('queueMiB', 128) * mib,
        workers: number('workers', 0, 0) || automaticWorkers,
    });
    return policy;
}
