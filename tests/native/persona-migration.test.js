import { jest } from '@jest/globals';
import { PersonaRepo } from '../../src/native/repositories/persona-repo.js';
import { AssetStore } from '../../src/native/repositories/asset-store.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { EMPTY_PERSONA_FINGERPRINT as empty } from '../../src/native/persona-contract.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

const rawSource = JSON.stringify({ personas: { 'old.png': 'Player', 'other.png': 'Player' }, persona_descriptions: { 'old.png': { name: 'Player', description: '{{user}} {{char}} {{unknown}}', title: 'PRIVATE', lorebook: 'old-world', extra: 42 } }, default_persona: 'old.png', unknown: { keep: true } });
const makeRepo = h => new PersonaRepo({ engine: h.engine, assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }) });
const apply = (repo, handle, plan, source = rawSource) => repo.migrationApply(handle, { rawSource: source, convertUser: true, planDigest: plan.planDigest, expectedFingerprint: plan.expectedFingerprint });

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('Persona migration %s', (_label, make) => {
    test('read-only review, exact copies, source preservation, replay and independent default CAS', async () => {
        const h = await make();
        try {
            const repo = makeRepo(h), handle = h.handle;
            const plan = await repo.migrationPreflight(handle, { rawSource, convertUser: true });
            expect((await repo.list(handle)).items).toHaveLength(0);
            expect(plan.items['old.png'].content.description).toBe('Player {{char}} {{unknown}}');
            expect(plan.items['old.png'].pending).toEqual(expect.arrayContaining(['avatar_missing', 'macros_unmapped', 'lorebook_unmapped']));
            const result = await apply(repo, handle, plan);
            expect((await repo.list(handle)).items).toHaveLength(2);
            expect(Buffer.from(result.receipt.rawSource, 'base64').toString()).toBe(rawSource);
            expect((await repo.readDefault(handle)).selection).toBeNull();
            const again = await repo.migrationPreflight(handle, { rawSource, convertUser: true });
            expect((await apply(repo, handle, again)).receipt.items).toEqual(result.receipt.items);
            expect((await repo.list(handle)).items).toHaveLength(2);
            await expect(repo.migrationAdoptDefault(handle, { sourceDigest: plan.sourceDigest, expectedFingerprint: again.expectedFingerprint, expectedDefaultFingerprint: 'a'.repeat(64) })).rejects.toMatchObject({ code: 'native_persona_conflict' });
            await repo.migrationAdoptDefault(handle, { sourceDigest: plan.sourceDigest, expectedFingerprint: again.expectedFingerprint, expectedDefaultFingerprint: empty });
            expect((await repo.readDefault(handle)).selection).toEqual(result.receipt.items['old.png'].target);
            await expect(repo.delete(handle, { personaId: result.receipt.items['other.png'].personaId, expectedFingerprint: (await repo.get(handle, { ref: result.receipt.items['other.png'].target })).expectedFingerprint })).rejects.toMatchObject({ code: 'native_persona_referenced' });
            await expect(apply(repo, handle, { ...again, planDigest: 'f'.repeat(64) })).rejects.toMatchObject({ code: 'native_persona_conflict' });
        } finally { await h.cleanup(); }
    });
});

test.each(['prepared', 'revision', 'root', 'receipt'])('FS resumes interruption at %s with preallocated IDs', async point => {
    const h = await makeTempFsEngineHarness();
    try {
        const repo = makeRepo(h), plan = await repo.migrationPreflight(h.handle, { rawSource, convertUser: true });
        const original = h.engine.withTransaction.bind(h.engine); let migrationWrites = 0;
        const spy = jest.spyOn(h.engine, 'withTransaction').mockImplementation((owner, operation) => original(owner, tx => {
            const put = tx.putResource.bind(tx), cas = tx.putResourceIfMatch.bind(tx);
            tx.putResource = (key, ...args) => { if (point === 'revision' && key.kind === K.personaRevision) throw new Error('interrupt'); return put(key, ...args); };
            tx.putResourceIfMatch = (key, ...args) => {
                if (key.kind === K.personaMigration) migrationWrites++;
                if ((point === 'prepared' && migrationWrites === 1 && key.kind === K.personaMigration) || (point === 'receipt' && migrationWrites > 1 && key.kind === K.personaMigration) || (point === 'root' && key.kind === K.persona) || (point === 'revision' && key.kind === K.personaRevision)) throw new Error('interrupt');
                return cas(key, ...args);
            };
            return operation(tx);
        }));
        await apply(repo, h.handle, plan).catch(() => {});
        spy.mockRestore();
        const before = await repo.migrationPreflight(h.handle, { rawSource, convertUser: true });
        const ids = before.receipt ? Object.values(before.receipt.items).map(item => item.personaId) : null;
        const resumed = await apply(repo, h.handle, before);
        expect(Object.values(resumed.receipt.items).every(item => item.status === 'published')).toBe(true);
        expect((await repo.list(h.handle)).items).toHaveLength(2);
        if (ids) expect(Object.values(resumed.receipt.items).map(item => item.personaId)).toEqual(ids);
        const revised = await repo.migrationPreflight(h.handle, { rawSource, convertUser: false });
        await expect(repo.migrationApply(h.handle, { rawSource, planDigest: revised.planDigest, expectedFingerprint: revised.expectedFingerprint })).rejects.toMatchObject({ code: 'native_persona_conflict' });
    } finally { await h.cleanup(); }
});

test('malformed, unknown explicit version and invalid uploads reject; empty and unknown fields survive', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const repo = makeRepo(h);
        for (const source of ['{', '[]', JSON.stringify({ personas: [] }), JSON.stringify({ personas: { a: 3 } }), ' '.repeat(16 * 1024 * 1024 + 1)]) await expect(repo.migrationPreflight(h.handle, { rawSource: source })).rejects.toMatchObject({ code: 'native_persona_invalid' });
        const source = JSON.stringify({ version: 99, personas: {} });
        const plan = await repo.migrationPreflight(h.handle, { rawSource: source });
        expect(plan.supported).toBe(false);
        await expect(apply(repo, h.handle, plan, source)).rejects.toMatchObject({ code: 'native_persona_invalid' });
        const emptyPlan = await repo.migrationPreflight(h.handle, { rawSource: '{}' });
        const result = await repo.migrationApply(h.handle, { rawSource: '{}', planDigest: emptyPlan.planDigest, expectedFingerprint: emptyPlan.expectedFingerprint });
        expect(result.receipt.items).toEqual({});
        await expect(repo.migrationPreflight(h.handle, { rawSource, avatars: { 'old.png': { bytes: Buffer.from('bad').toString('base64'), mediaType: 'image/png' } } })).rejects.toMatchObject({ code: 'native_persona_invalid' });
    } finally { await h.cleanup(); }
});

test('authenticated local capture includes only Persona settings, pins avatar hashes, refuses traversal and rechecks changed sources', async () => {
    const { captureLocalPersonaSource } = await import('../../src/native/persona-local-source.js');
    const { PNG } = await import('pngjs');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const h = await makeTempFsEngineHarness();
    try {
        const repo = makeRepo(h);
        const settings = { secret: 'NEVER', power_user: { unrelated: 'NEVER', personas: { 'old.png': 'Local', '../outside.png': 'Traversal' }, persona_descriptions: { 'old.png': { name: 'Local', description: '玩家 {{user}}', title: '管理备注', unknown: true } }, default_persona: 'old.png', persona_unknown: { preserved: true } } };
        await fs.mkdir(h.dirs.avatars, { recursive: true });
        await fs.writeFile(path.join(h.dirs.avatars, 'old.png'), PNG.sync.write(new PNG({ width: 1, height: 1 })));
        const source = await captureLocalPersonaSource(settings, h.dirs);
        expect(source.rawSource).not.toContain('NEVER'); expect(source.avatars['../outside.png']).toBeUndefined();
        expect(JSON.parse(source.rawSource).atri_local_source.avatarPending['../outside.png']).toBe('avatar_missing_or_invalid');
        const plan = await repo.migrationPreflight(h.handle, { ...source, convertUser: true });
        settings.power_user.personas['new.png'] = 'Changed';
        const changed = await captureLocalPersonaSource(settings, h.dirs);
        await expect(repo.migrationApply(h.handle, { ...changed, convertUser: true, planDigest: plan.planDigest, expectedFingerprint: plan.expectedFingerprint })).rejects.toMatchObject({ code: 'native_persona_conflict' });
        const result = await repo.migrationApply(h.handle, { ...source, convertUser: true, planDigest: plan.planDigest, expectedFingerprint: plan.expectedFingerprint });
        expect((await repo.get(h.handle, { ref: result.receipt.items['old.png'].target })).revision.description).toBe('玩家 Local');
        expect(result.receipt.items['old.png'].avatar.contentHash).toBe(JSON.parse(source.rawSource).atri_local_source.avatarHashes['old.png']);
    } finally { await h.cleanup(); }
});
