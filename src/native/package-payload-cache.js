import fs from 'node:fs';

export function copyPackagePayload(payload) {
    const copy = Buffer.allocUnsafeSlow(payload.length);
    if (Buffer.isBuffer(payload)) payload.copy(copy);
    else {
        const descriptor = fs.openSync(payload.backing.path, 'r');
        try {
            let read = 0;
            while (read < copy.length) {
                const count = fs.readSync(descriptor, copy, read, copy.length - read, payload.offset + read);
                if (!count) throw new Error('Package payload cache is truncated');
                read += count;
            }
        } finally { fs.closeSync(descriptor); }
    }
    return copy;
}
