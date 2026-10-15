import fs from 'node:fs';
import path from 'node:path';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { NATIVE_RESOURCE_KINDS as K, getNativeResourceKeyFields } from '../../src/native/contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { nativeRecord } from '../../src/native/repositories/common.js';
import { measureAccount } from '../../src/storage/resource-accounting.js';
import { resourceContentBytes } from '../../src/storage/resource-catalog.js';
import { installAccountQuota } from '../../src/storage/account-quota.js';

const hash = 'a'.repeat(64);
const fields = { scopeId: hash, evidenceId: hash, sourceDigest: hash, taskId: 'task-1', goalId: 'goal-1', commitId: 'commit-1', checkpointId: hash, scope: 'probe', namespace: 'atri_probe', head: 'head-1', resourceType: 'core.prompt-module', resourceId: 'probe-resource', revision: 'v1' };
function fixtureKey(kind, handle) {
    return Object.fromEntries([['kind', kind], ...getNativeResourceKeyFields(kind).map(field => [field,
        field === 'handle' ? handle : fields[field] ?? createNativeId(field === 'saveId' ? 'savePoint' : field.slice(0, -2)),
    ])]);
}

describe.each(CONTRACT_HARNESSES)('resource accounting — $name', ({ make }) => {
    let h;
    beforeEach(async () => { h = await make(); });
    afterEach(async () => { await h.cleanup(); });
    const measure = () => measureAccount({ engine: h.engine, handle: h.handle, directories: h.dirs });
    test('all Native kinds, project Git, deduplicated blobs, backups and unknown files reconcile', async () => {
        let expected = 0;
        await h.engine.withTransaction(h.handle, async tx => {
            for (const kind of Object.values(K)) {
                const key = fixtureKey(kind, h.handle), doc = { marker: kind, text: '中文' };
                expected += resourceContentBytes(doc);
                await tx.putResource(key, nativeRecord(doc));
            }
        });
        for (const [relative, text] of [['projects/probe/.git/objects/data', 'git history'], ['assets/atria-native/blobs/aa/' + hash, 'shared blob'], ['backups/one.zip', 'backup'], ['unknown.bin', 'unknown']]) {
            const file = path.join(h.dirs.root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text);
            expected += Buffer.byteLength(text);
        }
        const result = await measure();
        expect(result.errors).toEqual([]);
        expect(result.totalBytes).toBe(expected);
        expect(result.units.filter(unit => unit.source === 'native')).toHaveLength(Object.keys(K).length);
        expect(Object.values(result.categories).reduce((sum, category) => sum + category.bytes, 0)).toBe(expected);
        expect(result.categories.media.bytes).toBe(resourceContentBytes({ marker: K.assetRef, text: '中文' }) + 11);
        expect(result.physical.bytes).toBeGreaterThanOrEqual(35);
    });
    test('transaction net growth, replacements and concurrent writers use the same content authority', async () => {
        let limit = 1000;
        installAccountQuota(h.engine, { directoriesByHandle: () => h.dirs, limit: async () => limit });
        const one = fixtureKey(K.package, h.handle), two = fixtureKey(K.package, h.handle);
        const first = { text: 'a'.repeat(30) }, second = { text: 'b'.repeat(30) };
        limit = resourceContentBytes(first);
        const results = await Promise.allSettled([one, two].map(key => h.engine.withTransaction(h.handle, tx => tx.putResource(key, nativeRecord(first)))));
        expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        expect(results.find(item => item.status === 'rejected').reason.code).toBe('storage_quota_exceeded');
        const winner = results[0].status === 'fulfilled' ? one : two;
        await h.engine.withTransaction(h.handle, tx => tx.putResource(winner, nativeRecord(second)));
        expect((await measure()).totalBytes).toBe(limit);
        await expect(h.engine.withTransaction(h.handle, tx => tx.putResource(winner, nativeRecord({ text: 'c'.repeat(50) })))).rejects.toMatchObject({ code: 'storage_quota_exceeded' });
        expect((await measure()).totalBytes).toBe(limit);
        limit = 0;
        await h.engine.withTransaction(h.handle, tx => tx.deleteResource(winner));
        expect((await measure()).totalBytes).toBe(0);
    });
    test('unknown native FS files are accounted and unreadable ranges never become complete zero', async () => {
        const outside = path.join(h.dirs.root, 'outside');
        fs.mkdirSync(h.dirs.root, { recursive: true });
        fs.symlinkSync(h.dataRoot, outside, 'junction');
        const result = await measure();
        expect(result.completeness).toBe('partial');
        expect(result.totalBytes).toBeNull();
        expect(result.unknownBytes).toBeNull();
        fs.unlinkSync(outside);
    });
    test('high precision JSON numbers preserve the canonical bytes and integrity exactly', async () => {
        const key = fixtureKey(K.packageState, h.handle), doc = { values: [1792037000000.0015, 1792037000000.0059, 0.1, Number.MIN_VALUE, 1e100] };
        const record = nativeRecord(doc);
        await h.engine.withTransaction(h.handle, tx => tx.putResource(key, record));
        const restored = await h.engine.withTransaction(h.handle, tx => tx.getResource(key));
        expect(restored.doc).toEqual(doc); expect(restored.integrity).toBe(record.integrity);
        expect((await measure()).totalBytes).toBe(resourceContentBytes(doc));
    });
});
