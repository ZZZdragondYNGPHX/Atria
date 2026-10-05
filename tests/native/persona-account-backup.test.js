import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import AdmZip from 'adm-zip';
import request from 'supertest';
import { PNG } from 'pngjs';
import { USER_DIRECTORY_TEMPLATE } from '../../src/constants.js';
import { router } from '../../src/endpoints/users-private.js';
import { getUserDirectories, USER_BACKUP_SELECTION_DEFAULTS } from '../../src/users.js';
import { getStorageEngine } from '../../src/storage/index.js';
import { makeEndpointHarness } from '../storage/harness/endpoint-harness.js';
import { PersonaRepo } from '../../src/native/repositories/persona-repo.js';
import { AssetStore } from '../../src/native/repositories/asset-store.js';
import { EMPTY_PERSONA_FINGERPRINT as empty } from '../../src/native/persona-contract.js';
const selection = Object.fromEntries(Object.keys(USER_BACKUP_SELECTION_DEFAULTS).map(key => [key, key === 'native']));
async function harness(mode) {
    const h = await makeEndpointHarness({ mode, mount(app, { dirs }) {
        const uploads = path.join(dirs.root, 'uploads'); fs.mkdirSync(uploads, { recursive: true });
        app.use('/api/users/restore-backup', multer({ dest: uploads }).single('avatar'));
        app.use('/api/users', router);
    } });
    globalThis.DATA_ROOT = h.dataRoot;
    Object.assign(h.dirs, Object.fromEntries(Object.entries(USER_DIRECTORY_TEMPLATE).map(([key, rel]) => [key, path.join(h.dirs.root, rel)])));
    Object.assign(getUserDirectories(h.handle), h.dirs); return h;
}
const repo = h => new PersonaRepo({ engine: getStorageEngine(), assetStore: new AssetStore({ engine: getStorageEngine(), directoriesByHandle: () => h.dirs }) });
async function archive(h) {
    const response = await request(h.app).post('/api/users/backup').send({ handle: h.handle, selection }).buffer(true).parse((res, cb) => {
        const chunks = []; res.on('data', bytes => chunks.push(bytes)); res.on('end', () => cb(null, Buffer.concat(chunks))); res.on('error', cb);
    }); expect(response.status).toBe(200); return response.body;
}
const restore = (h, zip, defaults) => {
    let call = request(h.app).post('/api/users/restore-backup').field('handle', h.handle).field('mode', 'overwrite').field('selection', JSON.stringify(selection));
    if (defaults) call = call.field('personaDefault', JSON.stringify(defaults)); return call.attach('avatar', zip, 'native.zip');
};
const probe = (h, zip) => request(h.app).post('/api/users/restore-backup/probe').field('selection', JSON.stringify(selection)).field('mode', 'merge').attach('avatar', zip, 'native.zip');
const content = (name, avatar = null) => ({ name, avatar, description: 'Player', managementNotes: 'PRIVATE' });

describe.each([['fs', 'sqlite'], ['sqlite', 'fs']])('Persona account backup %s → %s', (source, target) => {
    let h; const originalRoot = globalThis.DATA_ROOT;
    afterEach(async () => { if (h) await h.cleanup(); globalThis.DATA_ROOT = originalRoot; });
    test('manifest, all revisions/avatar/receipt, real preflight, preserve default and explicit CAS adoption', async () => {
        h = await harness(source); const r = repo(h);
        const bytes = PNG.sync.write(new PNG({ width: 1, height: 1 }));
        const avatar = await r.avatar(h.handle, { mediaType: 'image/png', bytes: bytes.toString('base64') });
        const a = await r.create(h.handle, { content: content('Same name', avatar), expectedFingerprint: empty });
        const b = await r.revise(h.handle, { personaId: a.ref.personaId, content: content('Changed', avatar), expectedFingerprint: a.expectedFingerprint });
        await r.setDefault(h.handle, { selection: a.ref, expectedFingerprint: empty });
        const rawSource = '{"personas":{"legacy.png":"Legacy"},"extra":42}';
        const plan = await r.migrationPreflight(h.handle, { rawSource });
        const migrated = await r.migrationApply(h.handle, { rawSource, planDigest: plan.planDigest, expectedFingerprint: plan.expectedFingerprint });
        const zip = await archive(h);
        expect(JSON.parse(new AdmZip(zip).readAsText('manifest.json')).personas).toMatchObject({ schemaVersion: 1, defaultSelection: a.ref, avatars: [avatar] });
        await h.cleanup(); h = await harness(target); const t = repo(h);
        const retainedAvatar = await t.avatar(h.handle, { mediaType: 'image/png', bytes: bytes.toString('base64') });
        const existing = await t.create(h.handle, { content: content('Same name', retainedAvatar), expectedFingerprint: empty });
        const d = await t.setDefault(h.handle, { selection: existing.ref, expectedFingerprint: empty });
        const review = await probe(h, zip); expect(review.status).toBe(200); expect(review.body.compatible).toBe(true);
        expect(review.body.personaReview.expectedDefaultFingerprint).toBe(d.expectedFingerprint);
        const kept = await restore(h, zip); expect(kept.status).toBe(200); expect(kept.body.personaRestore.defaultPolicy).toBe('preserved');
        expect((await t.readDefault(h.handle)).selection).toEqual(existing.ref);
        expect((await t.assets.read(h.handle, retainedAvatar.assetId)).bytes).toEqual(bytes);
        expect((await t.get(h.handle, { ref: a.ref })).revision.name).toBe('Same name');
        expect((await t.get(h.handle, { ref: b.ref })).revision.name).toBe('Changed');
        expect((await t.assets.read(h.handle, avatar.assetId)).bytes).toEqual(bytes);
        expect((await t.migrationReceipt(h.handle, { sourceDigest: plan.sourceDigest })).receipt.items).toEqual(migrated.receipt.items);
        expect((await restore(h, zip, { adopt: true, expectedFingerprint: 'f'.repeat(64) })).status).toBeGreaterThanOrEqual(400);
        expect((await t.readDefault(h.handle)).selection).toEqual(existing.ref);
        expect((await restore(h, zip, { adopt: true, expectedFingerprint: d.expectedFingerprint })).status).toBe(200);
        expect((await t.readDefault(h.handle)).selection).toEqual(a.ref);
        const revised = await t.revise(h.handle, { personaId: a.ref.personaId, content: content('Diverged'), expectedFingerprint: (await t.get(h.handle, { personaId: a.ref.personaId })).expectedFingerprint });
        const conflict = await probe(h, zip); expect(conflict.body.compatible).toBe(false); expect(conflict.body.personaReview.conflicts.length).toBeGreaterThan(0);
        expect((await restore(h, zip)).status).toBeGreaterThanOrEqual(400);
        expect((await t.get(h.handle, { ref: revised.ref })).revision.name).toBe('Diverged');
    });
    test('missing manifest/avatar or altered index fails before live publication', async () => {
        h = await harness(source); const r = repo(h);
        const png = PNG.sync.write(new PNG({ width: 1, height: 1 }));
        const avatar = await r.avatar(h.handle, { mediaType: 'image/png', bytes: png.toString('base64') });
        const a = await r.create(h.handle, { content: content('A', avatar), expectedFingerprint: empty });
        const bytes = await archive(h);
        for (const change of ['missing', 'hash', 'avatar']) {
            const zip = new AdmZip(bytes); const manifest = JSON.parse(zip.readAsText('manifest.json'));
            if (change === 'missing') delete manifest.personas; else if (change === 'avatar') zip.deleteFile(`assets/atria-native/blobs/${avatar.contentHash.slice(0, 2)}/${avatar.contentHash}`); else manifest.personas.records[0].hash = '0'.repeat(64);
            zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
            expect((await probe(h, zip.toBuffer())).body.compatible).toBe(false);
            expect((await restore(h, zip.toBuffer())).status).toBeGreaterThanOrEqual(400);
            expect((await r.get(h.handle, { ref: a.ref })).revision.name).toBe('A');
        }
    });
});
