import fs from 'node:fs/promises';
import path from 'node:path';
import { makeTempFsEngineHarness } from './harness/contract-harness.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { nativeRecord } from '../../src/native/repositories/common.js';
import { nativeResourceFileId } from '../../src/storage/engines/native-resource-key.js';

describe('original FS Native envelope listings', () => {
    let h, runId, filter;
    const key = index => ({ kind: K.orchestrationRecord, handle: h.handle, runId, recordType: 'receipt', recordId: 'row-' + index });
    beforeEach(async () => {
        h = await makeTempFsEngineHarness(); runId = createNativeId('orchestrationRun');
        filter = { kind: K.orchestrationRecord, handle: h.handle, runId, recordType: 'receipt' };
        await h.engine.withTransaction(h.handle, async tx => {
            for (let index = 0; index < 19; index++) await tx.putResource(key(index), nativeRecord({ index }, { createdAt: index + 1, updatedAt: index + 1 }));
            await tx.putResource({ ...key('other'), runId: createNativeId('orchestrationRun') }, nativeRecord({ foreignRun: true }));
        });
    });
    afterEach(async () => { await h.engine.close(); await h.cleanup(); });

    test('canonical order and limits survive journal overlays and fresh committed edits', async () => {
        const list = options => h.engine.withTransaction(h.handle, tx => tx.listResources({ ...filter, ...options }));
        expect((await list({ orderBy: 'updatedAt', limit: 3 })).map(row => row.doc.index)).toEqual([18, 17, 16]);
        const original = await list();
        expect(original.map(row => row.key.recordId)).toEqual([...original.map(row => row.key.recordId)].sort((a, b) => a.localeCompare(b)));
        await h.engine.withTransaction(h.handle, async tx => {
            await tx.deleteResource(key(18));
            await tx.putResource(key(0), nativeRecord({ index: 200 }, { createdAt: 1, updatedAt: 100 }));
            expect((await tx.listResources({ ...filter, orderBy: 'updatedAt', limit: 2 })).map(row => row.doc.index)).toEqual([200, 17]);
        });
        expect((await list({ orderBy: 'updatedAt', limit: 2 })).map(row => row.doc.index)).toEqual([200, 17]);
        original[0].doc.index = 'caller mutation';
        expect((await list()).some(row => row.doc.index === 'caller mutation')).toBe(false);
        expect((await list({ limit: 0 }))).toEqual([]);
    });

    test('malformed, foreign-owner and misnamed envelopes never enter a filtered list', async () => {
        const dir = path.join(h.dirs.root, 'atria-native/resources', K.orchestrationRecord);
        const saved = JSON.parse(await fs.readFile(path.join(dir, nativeResourceFileId(key(0)) + '.json'), 'utf8'));
        await fs.writeFile(path.join(dir, 'malformed.json'), '{');
        await fs.writeFile(path.join(dir, 'wrong-filename.json'), JSON.stringify(saved));
        const foreignKey = { ...key('foreign'), handle: 'foreign' };
        await fs.writeFile(path.join(dir, nativeResourceFileId(foreignKey) + '.json'), JSON.stringify({ ...saved, key: foreignKey }));
        const rows = await h.engine.withTransaction(h.handle, tx => tx.listResources(filter));
        expect(rows).toHaveLength(19);
        expect(rows.every(row => row.key.handle === h.handle && row.key.runId === runId)).toBe(true);
        expect(rows.map(row => row.doc.index).sort((a, b) => a - b)).toEqual(Array.from({ length: 19 }, (_, index) => index));
    });

    test('maintenance scans retain their file cursor, byte accounting and bounded pages', async () => {
        let after = '', done = false;
        const records = [], cursors = [];
        while (!done) {
            const page = await h.engine.scanNativeCandidates(h.handle, { ...filter, limit: 3, maxBytes: 100000, after });
            expect(page.scanned).toBeGreaterThan(0); expect(page.scanned).toBeLessThanOrEqual(3);
            expect(page.bytes).toBeGreaterThan(0); expect(page.cursor > after).toBe(true);
            after = page.cursor; done = page.done; cursors.push(after); records.push(...page.records);
        }
        expect(new Set(cursors).size).toBe(cursors.length);
        expect(records).toHaveLength(19);
        expect(new Set(records.map(row => row.key.recordId)).size).toBe(19);
        expect(records.map(row => row.doc.index).sort((a, b) => a - b)).toEqual(Array.from({ length: 19 }, (_, index) => index));
    });
});
