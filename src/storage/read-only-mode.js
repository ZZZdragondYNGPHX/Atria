import { StorageReadOnlyError } from './errors.js';
import { AsyncLocalStorage } from 'node:async_hooks';

let _readOnly = false;
const bypassContext = new AsyncLocalStorage();

export function setReadOnly(value) { _readOnly = !!value; }
export function isReadOnly() { return _readOnly; }

/**
 * Throws when the global read-only flag is set, UNLESS the caller is currently
 * inside a `withReadOnlyBypass` scope (which the migration runner uses to write
 * to the destination engine while the source is frozen).
 */
export function assertWritable() {
    if (_readOnly && bypassContext.getStore() !== true) throw new StorageReadOnlyError();
}

/**
 * Temporarily suspends the read-only guard for the duration of `fn`. Used by
 * MigrationRunner so its destination writes go through while the global flag
 * keeps HTTP request handlers locked out.
 *
 * Async-local so a suspended migration cannot authorize unrelated HTTP writes.
 * Nested migration scopes inherit the bypass without a process-global window.
 *
 * @template T
 * @param {() => Promise<T> | T} fn
 * @returns {Promise<T>}
 */
export async function withReadOnlyBypass(fn) {
    return bypassContext.run(true, fn);
}
