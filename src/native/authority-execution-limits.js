// Shared by Authority accounting and the isolated computation transport.
// A composed input can contain several individually bounded values.
export const AUTHORITY_EXECUTION_LIMITS = Object.freeze({
    valueBytes: 65536, totalValueBytes: 1048576, readBytes: 262144,
    recordScans: 4096, ruleEvaluations: 256, steps: 1024,
});
