// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared source-write consent, independent of browser and vector transports.
export const MEMORY_SOURCE_WRITES_DEFAULT_ENABLED = false;
export function isHybridMemoryEnabled(settings) { return settings?.enabled !== false; }
export function isMemorySourceWriteEnabled(settings) { return settings?.sourceWritesEnabled === true; }
