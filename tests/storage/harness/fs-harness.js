import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';

import { USER_DIRECTORY_TEMPLATE } from '../../../src/constants.js';

export async function makeTempFsEngine() {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-fs-engine-test-'));
    const handle = 'u';
    const userDir = path.join(dataRoot, handle);
    const dirs = {};
    for (const [key, rel] of Object.entries(USER_DIRECTORY_TEMPLATE)) {
        dirs[key] = path.join(userDir, rel);
    }
    // Pre-create the directories existing tests rely on. Preset/other handlers
    // mkdirSync-on-write so they don't need pre-creation here.
    fs.mkdirSync(dirs.characters, { recursive: true });
    fs.mkdirSync(dirs.chats, { recursive: true });

    const engine = new FsEngine({
        directoriesByHandle: (h) => {
            if (h !== handle) throw new Error(`unknown handle ${h}`);
            return dirs;
        },
    });

    return {
        engine,
        dataRoot,
        handle,
        charsDir: dirs.characters,
        chatsDir: dirs.chats,
        dirs,
        cleanup: () => fs.rmSync(dataRoot, { recursive: true, force: true }),
    };
}
