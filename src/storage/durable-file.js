import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Fail closed when the filesystem cannot supply the required directory barrier.
// This is a software contract, not a claim of verified hardware power-loss safety.
export function syncDirectory(directory) {
    const fd = fs.openSync(directory, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

export function durableMkdir(directory) {
    if (fs.existsSync(directory)) return;
    durableMkdir(path.dirname(directory));
    try { fs.mkdirSync(directory); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    syncDirectory(path.dirname(directory));
    syncDirectory(directory);
}

export function durableWrite(file, bytes) {
    durableMkdir(path.dirname(file));
    const temporary = file + '.' + randomUUID() + '.prepare';
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try {
        try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        fs.renameSync(temporary, file); syncDirectory(path.dirname(file));
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

export function durableRemove(file) {
    if (!fs.existsSync(file)) return;
    fs.unlinkSync(file);
    syncDirectory(path.dirname(file));
}

export async function syncDirectoryAsync(directory) {
    const file = await fsp.open(directory, 'r');
    try { await file.sync(); } finally { await file.close(); }
}
export async function durableMkdirAsync(directory) {
    try { await fsp.stat(directory); return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await durableMkdirAsync(path.dirname(directory));
    try { await fsp.mkdir(directory); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    await syncDirectoryAsync(path.dirname(directory)); await syncDirectoryAsync(directory);
}
export async function durableWriteAsync(file, bytes) {
    await durableMkdirAsync(path.dirname(file));
    const temporary = file + '.' + randomUUID() + '.prepare', handle = await fsp.open(temporary, 'wx', 0o600);
    try {
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        await fsp.rename(temporary, file); await syncDirectoryAsync(path.dirname(file));
    } finally { await fsp.rm(temporary, { force: true }); }
}
export async function durableRemoveAsync(file) {
    try { await fsp.unlink(file); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    await syncDirectoryAsync(path.dirname(file)); return true;
}
