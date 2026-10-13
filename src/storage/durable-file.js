import fs from 'node:fs';
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
