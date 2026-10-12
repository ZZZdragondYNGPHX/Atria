import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@jest/globals';
import { withPrivateTestRun } from './private-test-run.js';

test.each([false, true])('private run removes diagnostics after success or failure (%s), retaining quota', async fail => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-retention-test-'));
    let scratch;
    try {
        fs.writeFileSync(path.join(directory, 'api-primary.json'), JSON.stringify({ apiKey: 'fixture-secret' }));
        fs.writeFileSync(path.join(directory, 'm1-api-quota.json'), JSON.stringify({ schemaVersion: 1,
            carry: { requests: 0, at: 0 }, admissions: [{ id: 'expired', at: 0 }] }));
        const execution = withPrivateTestRun(directory, async run => {
            scratch = run.directory;
            expect(run.connection().apiKey).toBe('fixture-secret');
            expect(() => run.connection('../outside.json')).toThrow('invalid_private_connection_name');
            await expect(withPrivateTestRun(directory, async () => {})).rejects.toMatchObject({ code: 'EEXIST' });
            await run.quota.waitAvailable();
            run.quota.admit('actual-send');
            fs.writeFileSync(path.join(scratch, 'response.txt'), 'private diagnostic');
            if (fail) throw new Error('fixture_failure');
            return 'stage-complete';
        });
        const outcome = await execution.then(value => ({ value }), error => ({ error: error.message }));
        expect(outcome).toEqual(fail ? { error: 'fixture_failure' } : { value: 'stage-complete' });
        expect(fs.existsSync(scratch)).toBe(false);
        expect(fs.readdirSync(directory).sort()).toEqual(['api-primary.json', 'm1-api-quota.json']);
        const saved = JSON.parse(fs.readFileSync(path.join(directory, 'm1-api-quota.json'), 'utf8'));
        expect(saved.admissions.map(a => a.id)).toEqual(['actual-send']);
        expect(JSON.stringify(saved)).not.toContain('private diagnostic');
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
