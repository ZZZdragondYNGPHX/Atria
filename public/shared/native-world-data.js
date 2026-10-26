// World data capacity is separate from message/UI declaration complexity.
// Hosts still meter aggregate reads, writes and computation memory per action.
export const WORLD_DATA_LIMITS = Object.freeze({ maxNodes: 1000000, maxDepth: 64, maxString: 65536 });
export const WORLD_CAPACITY = Object.freeze({ arrayItems: 1000000, domainRecords: 1000000, domainBytes: 1024 * 1024 * 1024 });
