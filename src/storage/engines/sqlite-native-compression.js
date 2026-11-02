import { encodeNativeJsonBytes } from './native-json-codec.js';

// Caller owns the Engine transaction (or the offline Host owner). Encoding is
// not a logical write: identities, timestamps and integrity stay untouched.
export function compressNativeRows(db, handle, { shouldPause = () => false } = {}) {
    const started = performance.now();
    let rows = 0, beforeBytes = 0, afterBytes = 0;
    const next = db.prepare('SELECT rowid, doc FROM native_resources WHERE handle=? AND typeof(doc)=\'text\' LIMIT 1');
    const update = db.prepare('UPDATE native_resources SET doc=? WHERE rowid=?');
    while (rows < 64 && beforeBytes < 1024 * 1024 && performance.now() - started < 16 && !shouldPause()) {
        const row = next.get(handle);
        if (!row) break;
        const bytes = Buffer.from(row.doc), encoded = encodeNativeJsonBytes(bytes);
        update.run(encoded, row.rowid);
        rows++; beforeBytes += bytes.length; afterBytes += encoded.length;
    }
    if (!shouldPause()) db.pragma('incremental_vacuum(32)');
    return { rows, beforeBytes, afterBytes, done: !db.prepare('SELECT 1 FROM native_resources WHERE handle=? AND typeof(doc)=\'text\' LIMIT 1').get(handle) };
}
