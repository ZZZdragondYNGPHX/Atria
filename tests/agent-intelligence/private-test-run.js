import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import { M1ApiQuota } from './m1-quota.js';

// Shared quota is the only persistent test state. Fixtures and diagnostics are
// disposable; callers record a stage conclusion without credentials or raw text.
export async function withPrivateTestRun(directory, run) {
    const quotaPath = path.join(directory, 'm1-api-quota.json');
    const lockPath = quotaPath + '.lock';
    const descriptor = fs.openSync(lockPath, 'wx', 0o600);
    let scratch;
    try {
        const snapshot = JSON.parse(fs.readFileSync(quotaPath, 'utf8'));
        const quota = new M1ApiQuota(snapshot, next => writeFileAtomic.sync(quotaPath,
            JSON.stringify(next) + '\n', { mode: 0o600 }));
        scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-private-test-'));
        return await run({ directory: scratch, quota,
            connection(name = 'api-primary.json') {
                if (!['api-primary.json', 'api-secondary.json', 'api-minimax-temporary.json',
                    'minimax-subscription-key.json'].includes(name)) throw new Error('invalid_private_connection_name');
                return JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
            } });
    } finally {
        try {
            if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
        } finally {
            fs.closeSync(descriptor);
            fs.unlinkSync(lockPath);
        }
    }
}
