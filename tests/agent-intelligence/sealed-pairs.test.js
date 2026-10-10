import { expect, test, jest } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSealedSource } from '../../src/native/agent-intelligence/evaluation/sealed-sources.js';
import { selectCases, loadFixture } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { EvolutionEvaluator, promotionDecision } from '../../src/native/agent-intelligence/evolution-evaluator.js';

const promotion = selectCases({ purpose: 'evaluation', split: 'promotion', profileId: 'rp.m1.information' })[0];

test('the sealed reader rejects development, arbitrary case identity and changed bytes before parsing', () => {
    const directory = mkdtempSync(join(tmpdir(), 'atri-sealed-'));
    try {
        writeFileSync(join(directory, promotion.sourceId + '.json'), 'Private text that is not valid JSON');
        expect(() => readSealedSource(promotion, directory)).toThrow('sealed_source_changed');
        expect(() => readSealedSource({ ...promotion, sourceId: '../secret' }, directory)).toThrow('identity');
        const development = selectCases({ purpose: 'evaluation', split: 'development', profileId: 'rp.m1.information' })[0];
        expect(() => readSealedSource(development, directory)).toThrow('sealed_source_unavailable');
        expect(() => loadFixture(promotion, { purpose: 'extraction', sealedSource: {} })).toThrow('evaluator-only');
    } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('sealed sources reject links at the source path and directory aliases', () => {
    const root = mkdtempSync(join(tmpdir(), 'atri-sealed-'));
    try {
        const other = join(root, 'payload');
        // Windows junctions exercise real reparse points without requiring
        // Developer Mode or the file-symlink privilege on the test machine.
        if (process.platform === 'win32') mkdirSync(other);
        else writeFileSync(other, '{}');
        symlinkSync(other, join(root, promotion.sourceId + '.json'), process.platform === 'win32' ? 'junction' : 'file');
        expect(() => readSealedSource(promotion, root)).toThrow('sealed_source_unavailable');
        symlinkSync(root, join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
        expect(() => readSealedSource(promotion, join(root, 'alias'))).toThrow('sealed_source_unavailable');
        expect(() => readSealedSource(promotion, 'relative')).toThrow('sealed_source_unavailable');
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test.each(['rp', 'project'])('sealed %s observations require all three independent cases and three repetitions', async domain => {
    const evaluator = new EvolutionEvaluator({ host: {}, repository: {} });
    evaluator._evaluate = jest.fn(async () => ({ origin: 'host_pair_probe' }));
    const selection = { profileId: domain === 'rp' ? 'rp.m1.information' : 'project.m1.related', split: 'promotion', repetitions: 3,
        mode: 'sealed_pair_probe', sealedDirectory: '/private/sealed' };
    const args = ['owner', { domain }, { baseline: {}, candidate: {} }, { baseline: {}, candidate: {} }, new AbortController().signal, async () => {}, async () => {}, async () => {}];
    await expect(evaluator.observePairs(...args, selection)).resolves.toEqual({ origin: 'host_pair_probe' });
    expect(evaluator._evaluate).toHaveBeenCalledWith(...args, selection);
    for (const change of [{ repetitions: 1 }, { split: 'development' }, { caseIds: [promotion.caseId] }, { mode: 'source_probe' },
        { sealedDirectory: 'relative' }, { profileId: domain === 'rp' ? 'project.m1.related' : 'rp.m1.information' }]) {
        await expect(evaluator.observePairs(...args, { ...selection, ...change })).rejects.toThrow('Invalid sealed pair observation');
    }
    await expect(evaluator.compare(...args, selection)).rejects.toThrow('source_unready');
    expect(promotionDecision({ origin: 'host_pair_probe' }).eligible).toBe(false);
    expect(evaluator._evaluate).toHaveBeenCalledTimes(1);
});
