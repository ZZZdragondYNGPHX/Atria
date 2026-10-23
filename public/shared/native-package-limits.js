// Shared by container validation and local Work import. Save archives and
// temporary MCP staging retain their own, independent budgets.
export const PACKAGE_LIMITS = Object.freeze({
    archiveBytes: 512 * 1024 * 1024,
    uncompressedBytes: 1024 * 1024 * 1024,
    entries: 16384,
});
