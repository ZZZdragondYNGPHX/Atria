import fsp from 'node:fs/promises';
import { decodeNativeJsonAsync, nativeJsonBytes } from './native-json-codec.js';

const stamp = stat => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs, stat.birthtimeNs].join(':');
function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
}

// A decoded file cache, not a Session HEAD authority. Every hit checks the
// current file identity, including replacement and in-place modification.
export class FsNativeCache {
    entries = new Map();
    bytes = 0;
    delete(path) { const entry = this.entries.get(path); if (entry) { this.bytes -= entry.bytes; this.entries.delete(path); } }
    async written(path) {
        this.delete(path);
        while (this.entries.size >= 4096) this.delete(this.entries.keys().next().value);
        this.entries.set(path, { stamp: stamp(await fsp.stat(path, { bigint: true })), bytes: 0 });
    }
    async read(path, changed = () => {}) {
        const file = await fsp.open(path, 'r');
        try {
            const identity = stamp(await file.stat({ bigint: true }));
            const cached = this.entries.get(path);
            if (cached?.stamp === identity && cached.value !== undefined) {
                this.entries.delete(path); this.entries.set(path, cached); return cached.value;
            }
            this.delete(path);
            if (cached?.stamp !== identity) changed();
            const bytes = await file.readFile();
            if (stamp(await file.stat({ bigint: true })) !== identity) throw new Error('Native resource changed during read');
            const value = freeze(await decodeNativeJsonAsync(bytes)), size = nativeJsonBytes(bytes);
            if (size <= 16 * 1024 * 1024) {
                while (this.entries.size >= 4096 || this.bytes + size > 64 * 1024 * 1024) this.delete(this.entries.keys().next().value);
                this.entries.set(path, { value, bytes: size, stamp: identity }); this.bytes += size;
            }
            return value;
        } finally { await file.close(); }
    }
}
