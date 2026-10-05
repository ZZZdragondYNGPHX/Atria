import express from 'express';
import request from 'supertest';
import { PersonaRepo } from '../../src/native/repositories/persona-repo.js';
import { AssetStore } from '../../src/native/repositories/asset-store.js';
import { EMPTY_PERSONA_FINGERPRINT as empty } from '../../src/native/persona-contract.js';
import { createNativeProductRouter } from '../../src/endpoints/native-product.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { jest } from '@jest/globals';

export const content = (name = 'Player') => ({ name, avatar: null, description: 'Player supplied account', managementNotes: 'PRIVATE NOTE' });
const makeRepo = h => new PersonaRepo({ engine: h.engine, assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }) });
describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('Persona resource %s', (_label, make) => {
    test('immutable exact refs, owner isolation, mandatory CAS, archive/default and deletion', async () => {
        const h = await make();
        try {
            const repo = makeRepo(h), owner = h.handle;
            const created = await repo.create(owner, { content: content(), expectedFingerprint: empty });
            const other = await repo.create(owner, { content: content(), expectedFingerprint: empty });
            expect(other.ref.personaId).not.toBe(created.ref.personaId);
            await expect(repo.get(h.handle, { ref: { ...created.ref, personaId: other.ref.personaId } })).rejects.toMatchObject({ code: 'native_persona_unavailable' });
            await expect(repo.revise(owner, { personaId: created.ref.personaId, content: content() })).rejects.toMatchObject({ code: 'native_persona_invalid' });
            await expect(repo.setDefault(owner, { expectedFingerprint: empty })).rejects.toMatchObject({ code: 'native_persona_invalid' });
            await expect(repo.create(owner, { content: content() })).rejects.toMatchObject({ code: 'native_persona_invalid' });
            const d = await repo.setDefault(owner, { selection: created.ref, expectedFingerprint: empty });
            const updated = await repo.revise(owner, { personaId: created.ref.personaId, content: content('New'), expectedFingerprint: created.expectedFingerprint });
            expect((await repo.get(owner, { ref: created.ref })).revision.name).toBe('Player');
            expect((await repo.capture(owner, undefined)).snapshot.name).toBe('Player');
            await expect(repo.setDefault(owner, { selection: updated.ref, expectedFingerprint: empty })).rejects.toMatchObject({ code: 'native_persona_conflict' });
            await repo.archive(owner, { personaId: created.ref.personaId, archived: true, expectedFingerprint: updated.expectedFingerprint });
            await expect(repo.capture(owner, undefined)).rejects.toMatchObject({ code: 'native_persona_unavailable' });
            expect((await repo.list(owner)).items).toHaveLength(1);
            expect((await repo.get(owner, { ref: created.ref })).revision.name).toBe('Player');
            await expect(repo.delete(owner, { personaId: other.ref.personaId, expectedFingerprint: empty })).rejects.toMatchObject({ code: 'native_persona_conflict' });
            await repo.delete(owner, { personaId: other.ref.personaId, expectedFingerprint: other.expectedFingerprint });
            expect((await repo.list(owner)).items).toHaveLength(0);
            await repo.setDefault(owner, { selection: null, expectedFingerprint: d.expectedFingerprint });
        } finally { await h.cleanup(); }
    });
    test('concurrent revise has one publication; unknown fields and UTF-8 boundaries reject', async () => {
        const h = await make();
        try {
            const repo = makeRepo(h), created = await repo.create(h.handle, { content: content(), expectedFingerprint: empty });
            const results = await Promise.allSettled(['A', 'B'].map(name => repo.revise(h.handle, { personaId: created.ref.personaId, content: content(name), expectedFingerprint: created.expectedFingerprint })));
            expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
            expect((await repo.revisions(h.handle, { personaId: created.ref.personaId }))).toHaveLength(2);
            for (const invalid of [{ ...content(), unknown: true }, content('🙂'.repeat(257)), { ...content(), description: '你'.repeat(21846) }, { ...content(), managementNotes: 'n'.repeat(16385) }]) {
                await expect(repo.create(h.handle, { content: invalid, expectedFingerprint: empty })).rejects.toMatchObject({ code: 'native_persona_invalid' });
            }
            const maximum = await repo.create(h.handle, { content: { ...content('🙂'.repeat(256)), description: 'a'.repeat(65536), managementNotes: 'n'.repeat(16384) }, expectedFingerprint: empty });
            expect(maximum.published).toBe(true);
        } finally { await h.cleanup(); }
    });
});

test('FS interrupted root publication cannot expose an uncommitted revision', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const repo = makeRepo(h), created = await repo.create(h.handle, { content: content(), expectedFingerprint: empty });
        const original = h.engine.withTransaction.bind(h.engine);
        const spy = jest.spyOn(h.engine, 'withTransaction').mockImplementation((owner, operation) => original(owner, tx => {
            const put = tx.putResourceIfMatch.bind(tx);
            tx.putResourceIfMatch = (key, ...args) => { if (key.kind === K.persona) throw new Error('crash at root'); return put(key, ...args); };
            return operation(tx);
        }));
        await expect(repo.revise(h.handle, { personaId: created.ref.personaId, content: content('Unpublished'), expectedFingerprint: created.expectedFingerprint })).rejects.toThrow('crash');
        spy.mockRestore();
        const all = await original(h.handle, tx => tx.listResources({ kind: K.personaRevision, handle: h.handle }));
        const orphan = all.find(item => item.doc.name === 'Unpublished');
        await expect(repo.get(h.handle, { ref: { personaId: orphan.doc.personaId, revisionId: orphan.doc.revisionId, contentIdentity: orphan.integrity } })).rejects.toMatchObject({ code: 'native_persona_unavailable' });
        expect(await repo.revisions(h.handle, { personaId: created.ref.personaId })).toHaveLength(1);
        expect((await repo.get(h.handle, { personaId: created.ref.personaId })).revision.name).toBe('Player');
    } finally { await h.cleanup(); }
});

test('POST commands use authenticated account and reject forged owner and malformed avatar', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const repo = makeRepo(h), app = express(); app.use(express.json());
        app.use((req, _res, next) => { if (req.headers['x-user']) req.user = { profile: { handle: req.headers['x-user'] } }; next(); });
        app.use(createNativeProductRouter(() => ({ personas: repo })));
        await request(app).post('/personas/list').send({}).expect(401);
        const create = value => request(app).post('/personas/create').set('x-user', h.handle).send(value);
        await create({ content: content(), expectedFingerprint: empty, handle: 'victim' }).expect(400);
        const created = await create({ content: content(), expectedFingerprint: empty }).expect(200);
        await request(app).post('/personas/get').set('x-user', h.handle).send({ ref: { ...created.body.ref, personaId: 'persona_' + 'f'.repeat(32) } }).expect(404);
        await expect(repo.avatar(h.handle, { bytes: Buffer.from('broken').toString('base64'), mediaType: 'image/png' })).rejects.toMatchObject({ code: 'native_persona_invalid' });
    } finally { await h.cleanup(); }
});

test('durable migration targets protect resources; notes containing an ID do not create a reference', async () => {
    const { nativeRecord, hashNativeDocument } = await import('../../src/native/repositories/common.js');
    const h = await makeTempFsEngineHarness();
    try {
        const repo = makeRepo(h), a = await repo.create(h.handle, { content: content('Mapped'), expectedFingerprint: empty });
        const b = await repo.create(h.handle, { content: content('Unmapped'), expectedFingerprint: empty });
        const sourceDigest = hashNativeDocument('fixture-source');
        await h.engine.withTransaction(h.handle, tx => tx.putResource({ kind: K.personaMigration, handle: h.handle, sourceDigest }, nativeRecord({
            schemaVersion: 1, sourceDigest, items: { old: { personaId: a.ref.personaId, revisionId: a.ref.revisionId, target: a.ref, status: 'published', original: { title: b.ref.personaId } } },
        })));
        expect((await repo.usedBy(h.handle, { personaId: a.ref.personaId })).references).toContainEqual({ kind: 'migration-receipt', sourceDigest });
        await expect(repo.delete(h.handle, { personaId: a.ref.personaId, expectedFingerprint: a.expectedFingerprint })).rejects.toMatchObject({ code: 'native_persona_referenced' });
        await expect(repo.delete(h.handle, { personaId: b.ref.personaId, expectedFingerprint: b.expectedFingerprint })).resolves.toMatchObject({ deleted: true });
    } finally { await h.cleanup(); }
});
