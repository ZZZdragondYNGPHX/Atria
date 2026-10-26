import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directories = new Set();
function remove(directory) {
    fs.rmSync(directory, { recursive: true, force: true });
    directories.delete(directory);
}
// GC cleanup must not synchronously delete large package files on the host
// event loop. Retain failed removals for the existing exit cleanup to retry.
const released = new globalThis.FinalizationRegistry(directory => {
    fs.promises.rm(directory, { recursive: true, force: true }).then(() => directories.delete(directory), () => {});
});
process.once('exit', () => { for (const directory of directories) remove(directory); });

// Private, disposable backing only; durable package/blob ownership stays with
// the existing repositories. Referencing this object keeps its bytes alive.
export function createTemporaryPayload(prefix) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    directories.add(directory);
    const payload = {
        path: path.join(directory, 'payload'),
        dispose() { remove(directory); released.unregister(payload); },
    };
    try { fs.closeSync(fs.openSync(payload.path, 'wx', 0o600)); } catch (error) { remove(directory); throw error; }
    released.register(payload, directory, payload);
    return payload;
}
