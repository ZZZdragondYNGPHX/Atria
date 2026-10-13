import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeLearningExports, analyzeLearningFiles, assertLearningExport, learningExport, learningRecord } from '../../src/native/agent-intelligence/learning-trajectory.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';

const execute = promisify(execFile);
const script = fileURLToPath(new URL('../../scripts/analyze-learning.js', import.meta.url));
const scope = { domain: 'rp_chat', charDir: 'Actor', name: 'offline', isGroup: false, groupId: '' };
const makeExport = (id = 'first', owner = 'owner', family = scope) => learningExport(owner, family, 0, 100, [learningRecord(family, {
    id, revision: 0, kind: 'explicit', origin: 'user', signal: 'prefer', dimension: 'style', source: { kind: 'evidence', integrity: hashNativeDocument(id) },
}, { status: 'completed', origin: 'client_observation', outcome: null })]);
const resign = value => {
    const { integrity, ...content } = value;
    return { ...content, integrity: hashNativeDocument(content) };
};

describe('offline learning CLI and strict metadata', () => {
    let directory;
    beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'atria-learning-cli-')); });
    afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
    const run = args => execute(process.execPath, [script, ...args], { cwd: directory, timeout: 10000, maxBuffer: 1048576 });
    test('cold CLI reads actual exports outside app cwd, deduplicates and leaves input unchanged', async () => {
        const path = join(directory, 'export.json'), text = JSON.stringify(makeExport());
        await writeFile(path, text);
        const result = await run([path, path]);
        expect(result.stderr).toBe('');
        expect(JSON.parse(result.stdout)).toMatchObject({ format: 'atria-learning-analysis', records: 1, derivedLabels: 0, derivedDiagnoses: 0,
            coverage: { observation: 1, action: 1, outcome: 0, receipt: 0, preference: 1, reward: 0 } });
        expect(await readFile(path, 'utf8')).toBe(text);
    });
    test('CLI help and argument errors need no application services', async () => {
        expect((await run(['--help'])).stdout).toContain('Offline only');
        await expect(run([])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('Usage:') });
        await expect(run(['--train'])).rejects.toMatchObject({ code: 2, stdout: '' });
        await expect(run(Array(33).fill('export.json'))).rejects.toMatchObject({ code: 2, stdout: '' });
    });
    test('CLI fails closed without reflecting private bytes or filenames', async () => {
        const path = join(directory, 'PRIVATE-FILENAME.json');
        await writeFile(path, 'PRIVATE INPUT NOT JSON');
        const failed = await run([path]).catch(error => error);
        expect(failed.code).toBe(1);
        expect(failed.stdout).toBe('');
        expect(failed.stderr).not.toContain('PRIVATE');
        await expect(run([join(directory, 'PRIVATE-MISSING.json')])).rejects.toMatchObject({ code: 1, stdout: '' });
    });
    test('actual file consumer rejects oversized, non-file, malformed UTF-8 and unbounded lists', async () => {
        const path = join(directory, 'oversized.json');
        await writeFile(path, Buffer.alloc(262145, 32));
        await expect(analyzeLearningFiles([path])).rejects.toThrow('budget');
        await expect(analyzeLearningFiles([directory])).rejects.toThrow();
        await writeFile(path, Buffer.from([0xff, 0xfe]));
        await expect(analyzeLearningFiles([path])).rejects.toThrow();
        await expect(analyzeLearningFiles([])).rejects.toThrow('Bounded');
        await expect(analyzeLearningFiles(Array(33).fill(path))).rejects.toThrow('Bounded');
        await expect(analyzeLearningFiles([null])).rejects.toThrow('Local file');
    });
    test.each([
        ['schema version', value => { value.schemaVersion = 2; }],
        ['injected content', value => { value.records[0].note = 'PRIVATE'; }],
        ['numeric reward', value => { value.records[0].reward = 1; }],
        ['missing reason', value => { value.records[0].missingReasons.reward = 'quality_passed'; }],
        ['unmarked missing value', value => { value.records[0].missing = ['reward']; }],
        ['false human origin', value => { value.records[0].label.origin = 'host'; }],
        ['false derived marker', value => { value.records[0].label.derived = true; }],
        ['unrelated family', value => { value.records[0].family = hashNativeDocument('other'); }],
        ['duplicated record', value => { value.records.push(structuredClone(value.records[0])); }],
        ['diagnosis as human truth', value => { value.records[0].diagnoses = [{ id: hashNativeDocument('diagnosis'), origin: 'user', direction: 'prompt', derived: false }]; }],
    ])('strict metadata rejects %s even after recalculated integrity', (_label, mutate) => {
        const value = makeExport(); mutate(value);
        expect(() => assertLearningExport(resign(value))).toThrow();
    });
    test('different owners and conflicting copies cannot be silently merged', () => {
        expect(() => analyzeLearningExports([makeExport(), makeExport('second', 'other')])).toThrow('Mixed offline owners');
        const original = makeExport(), changed = structuredClone(original);
        changed.records[0].label.signal = 'avoid'; changed.records[0].preference.signal = 'avoid';
        expect(() => analyzeLearningExports([original, resign(changed)])).toThrow('Conflicting offline record');
    });
    test('family splitting is deterministic and preserves all same-source versions together', () => {
        const exports = [makeExport('first'), makeExport('second'), makeExport('third', 'owner', { ...scope, name: 'other' })];
        const forward = analyzeLearningExports(exports), reversed = analyzeLearningExports([...exports].reverse());
        expect(forward).toEqual(reversed);
        const ids = exports.slice(0, 2).map(value => value.records[0].id);
        expect(Object.values(forward.splits).some(split => ids.every(id => split.includes(id)))).toBe(true);
        expect(forward.limitations).toContain('integrity_is_not_authenticity');
        expect(forward.limitations).toContain('split_not_independent_acceptance_qualification');
    });
});
