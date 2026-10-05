import { jest } from '@jest/globals';
import { PNG } from 'pngjs';
import { PersonaRepo } from '../../src/native/repositories/persona-repo.js';
import { AssetStore } from '../../src/native/repositories/asset-store.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';

const rawSource = '{"personas":{"old.png":"Player"}}';
test.each(['blob', 'ref'])('migration %s failure retains IDs and avatar closure across replay', async point => {
    const h = await makeTempFsEngineHarness();
    try {
        const assets = new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs });
        const repo = new PersonaRepo({ engine: h.engine, assetStore: assets });
        const png = PNG.sync.write(new PNG({ width: 1, height: 1 }));
        const source = { rawSource, avatars: { 'old.png': { bytes: png.toString('base64'), mediaType: 'image/png' } } };
        const plan = await repo.migrationPreflight(h.handle, source);
        const original = h.engine.withTransaction.bind(h.engine);
        const spy = point === 'blob' ? jest.spyOn(assets, 'putBlob').mockRejectedValue(new Error('interrupt blob')) : jest.spyOn(h.engine, 'withTransaction').mockImplementation((handle, operation) => original(handle, tx => {
            const put = tx.putResourceIfMatch.bind(tx);
            tx.putResourceIfMatch = (key, ...args) => { if (key.kind === K.assetRef) throw new Error('interrupt ref'); return put(key, ...args); }; return operation(tx);
        }));
        const failed = await repo.migrationApply(h.handle, { ...source, planDigest: plan.planDigest, expectedFingerprint: plan.expectedFingerprint });
        spy.mockRestore();
        expect(failed.receipt.items['old.png'].status).toBe('failed'); expect((await repo.list(h.handle)).items).toEqual([]);
        const next = await repo.migrationPreflight(h.handle, source);
        const result = await repo.migrationApply(h.handle, { ...source, planDigest: next.planDigest, expectedFingerprint: next.expectedFingerprint });
        const item = result.receipt.items['old.png']; expect(item.personaId).toBe(failed.receipt.items['old.png'].personaId); expect(item.status).toBe('published');
        expect((await assets.read(h.handle, item.assetId)).bytes).toEqual(png);
        await expect(assets.deleteRef(h.handle, item.assetId)).rejects.toMatchObject({ code: 'native_asset_ref_referenced' });
        expect((await repo.list(h.handle)).items).toHaveLength(1);
    } finally { jest.restoreAllMocks(); await h.cleanup(); }
});

test('two accepted copies of the same review serialize to one ledger/root publication', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const repo = new PersonaRepo({ engine: h.engine, assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }) });
        const plan = await repo.migrationPreflight(h.handle, { rawSource });
        const input = { rawSource, planDigest: plan.planDigest, expectedFingerprint: plan.expectedFingerprint };
        const results = await Promise.allSettled([repo.migrationApply(h.handle, input), repo.migrationApply(h.handle, input)]);
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        expect(results.find(result => result.status === 'rejected').reason.code).toBe('native_persona_conflict');
        expect((await repo.list(h.handle)).items).toHaveLength(1);
    } finally { await h.cleanup(); }
});

test('interrupted default adoption replays its prepared receipt without repeating selection publication', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const repo = new PersonaRepo({ engine: h.engine, assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }) });
        const source = { rawSource: '{"personas":{"old.png":"Player"},"default_persona":"old.png"}' };
        const plan = await repo.migrationPreflight(h.handle, source);
        const result = await repo.migrationApply(h.handle, { ...source, planDigest: plan.planDigest, expectedFingerprint: plan.expectedFingerprint });
        const baseline = await repo.readDefault(h.handle);
        const original = h.engine.withTransaction.bind(h.engine);
        let writes = 0;
        const spy = jest.spyOn(h.engine, 'withTransaction').mockImplementation((handle, operation) => original(handle, tx => {
            const cas = tx.putResourceIfMatch.bind(tx);
            tx.putResourceIfMatch = (key, ...args) => { if (key.kind === K.personaMigration && ++writes === 2) throw new Error('after default'); return cas(key, ...args); }; return operation(tx);
        }));
        await expect(repo.migrationAdoptDefault(h.handle, { sourceDigest: plan.sourceDigest, expectedFingerprint: result.expectedFingerprint, expectedDefaultFingerprint: baseline.expectedFingerprint })).rejects.toThrow('after default');
        spy.mockRestore();
        const actual = await repo.readDefault(h.handle), prepared = await repo.migrationReceipt(h.handle, { sourceDigest: plan.sourceDigest });
        expect(prepared.receipt.defaultAdoption.status).toBe('prepared');
        const resumed = await repo.migrationAdoptDefault(h.handle, { sourceDigest: plan.sourceDigest, expectedFingerprint: prepared.expectedFingerprint, expectedDefaultFingerprint: baseline.expectedFingerprint });
        expect(resumed.receipt.defaultAdoption.status).toBe('adopted'); expect(await repo.readDefault(h.handle)).toEqual(actual);
    } finally { jest.restoreAllMocks(); await h.cleanup(); }
});
