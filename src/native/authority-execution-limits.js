// Shared by Authority accounting and the isolated computation transport.
// A composed input can contain several individually bounded values.
export const AUTHORITY_EXECUTION_LIMITS = Object.freeze({
    valueBytes: 65536, totalValueBytes: 1048576, readBytes: 262144,
    recordScans: 4096, ruleEvaluations: 256, steps: 1024,
    // Server world programs are independent of the interactive UI sandbox.
    // Isolated processes keep computation and engine faults off the host.
    computationWallMs: 2000,
    computationHeapBytes: 128 * 1024 * 1024,
    computationOutputBytes: 1024 * 1024,
    computationModules: 512,
    computationModuleBytes: 8 * 1024 * 1024,
});
