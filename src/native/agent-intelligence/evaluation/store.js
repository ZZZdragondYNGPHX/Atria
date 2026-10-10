import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FsEngine } from '../../../storage/engines/fs-engine.js';
import { USER_DIRECTORY_TEMPLATE } from '../../../constants.js';

// Only the trusted evaluator creates these roots. No user path is accepted.
export async function createEvaluationStore() {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atri-evaluation-'));
    const handle = 'evaluation', userDir = path.join(dataRoot, handle);
    const dirs = Object.fromEntries(Object.entries(USER_DIRECTORY_TEMPLATE).map(([key, value]) => [key, path.join(userDir, value)]));
    fs.mkdirSync(dirs.characters, { recursive: true }); fs.mkdirSync(dirs.chats, { recursive: true });
    const engine = new FsEngine({ directoriesByHandle: owner => {
        if (owner !== handle) throw new Error('Evaluation owner mismatch'); return dirs;
    } });
    return { engine, dataRoot, handle, dirs, cleanup: () => fs.rmSync(dataRoot, { recursive: true, force: true }) };
}
