import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { jest } from '@jest/globals';
import { makeEndpointHarness } from '../harness/endpoint-harness.js';
import { seedContentForUser } from '../../../src/endpoints/content-manager.js';
import { getPackageRepo, getAssetStore, getSessionRepo } from '../../../src/storage/index.js';
import { PackageInstaller, buildAtriaPackageContainer, createNativeId } from '../../../src/native/index.js';
import { seedBundledPackage } from '../../../src/native/bundled-package.js';
import { sessionFixture, services } from '../../native/helpers/session-fixture.js';
import { serverDirectory } from '../../../src/server-directory.js';

const folder = path.join(serverDirectory, 'default/content');
const entry = JSON.parse(fs.readFileSync(path.join(folder, 'index.json'), 'utf8')).find(item => item.type === 'atria_package');
const index = [{ ...entry, folder }];
const archive = fs.readFileSync(path.join(folder, entry.filename));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

describe.each(['fs', 'sqlite'])('bundled initial game on %s', mode => {
    let h;
    beforeEach(async () => { h = await makeEndpointHarness({ mode, extraHandles: ['second'], mount: () => {} }); });
    afterEach(async () => { await h?.cleanup(); });
    const installer = () => new PackageInstaller({ packageRepo: getPackageRepo(), assetStore: getAssetStore() });

    test('real bundled game seeds for each user, persists and creates no Session', async () => {
        expect(hash(archive)).toBe(entry.sha256);
        const send = jest.spyOn(globalThis, 'fetch').mockImplementation(() => { throw Error('Seeding must not call a model'); });
        try {
            expect(await seedContentForUser(index, h.dirs, [])).toBe(true);
            const record = (await getPackageRepo().list(h.handle))[0];
            const opened = await installer().open(h.handle, record.packageId, record.currentVersionId);
            expect(opened.manifest.name).toBe('雾灯旅舍');
            expect(opened.manifest.version).toBe('1.0.0-rc.4');
            expect(opened.packageVersion.packageContentHash).toBe(entry.sha256);
            expect(opened.sourceFiles.has('CREDITS.md')).toBe(true);
            expect(await getSessionRepo().list(h.handle)).toEqual([]);
            expect(send).not.toHaveBeenCalled();
            await h.reopenEngine();
            expect(await getPackageRepo().get(h.handle, record.packageId)).toEqual(record);
            expect(await seedContentForUser(index, h.dirs, [])).toBe(false);
            expect(await seedContentForUser(index, h.extraDirs.second, [])).toBe(true);
            expect(await getPackageRepo().list('second')).toHaveLength(1);
        } finally { send.mockRestore(); }
    });

    test('existing chosen version and saved progress survive forced defaults', async () => {
        const f = sessionFixture();
        f.manifest.packageId = installer().preflight(archive).packageId;
        f.manifest.packageVersionId = createNativeId('packageVersion');
        f.manifest.name = 'My edited work'; f.manifest.version = '9.0.0';
        const custom = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map(), assetPayloads: new Map() }).archive;
        await installer().install(h.handle, custom);
        const svc = services(h);
        const before = await svc.core.create(h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
        const save = await svc.saveSystem.manualSave(h.handle, before.session.sessionId, { displayName: 'Keep my progress' });
        expect(await seedContentForUser(index, h.dirs, ['atria_package'])).toBe(false);
        const record = await getPackageRepo().get(h.handle, f.manifest.packageId);
        expect(record.currentVersionId).toBe(f.manifest.packageVersionId);
        expect(record.displayName).toBe('My edited work');
        expect(await getPackageRepo().listVersions(h.handle, f.manifest.packageId)).toHaveLength(1);
        expect((await svc.core.load(h.handle, before.session.sessionId)).revision.revisionId).toBe(before.revision.revisionId);
        expect(await svc.savePointRepo.get(h.handle, before.session.sessionId, save.saveId)).not.toBeNull();
    });

    test('normal restart does not resurrect a work deleted after initial seeding', async () => {
        await seedContentForUser(index, h.dirs, []);
        const record = (await getPackageRepo().list(h.handle))[0];
        await getPackageRepo().delete(h.handle, record.packageId);
        expect(await seedContentForUser(index, h.dirs, [])).toBe(false);
        expect(await getPackageRepo().list(h.handle)).toEqual([]);
    });

    test('bad checksum leaves no marker and a repaired bundle can retry', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            expect(await seedContentForUser([{ ...index[0], sha256: '0'.repeat(64) }], h.dirs, [])).toBe(false);
            expect(await getPackageRepo().list(h.handle)).toEqual([]);
            expect(fs.readFileSync(path.join(h.dirs.root, 'content.log'), 'utf8')).not.toContain(entry.filename);
            expect(await seedContentForUser(index, h.dirs, [])).toBe(true);
        } finally { warn.mockRestore(); }
    });

    test('parallel seed operations publish one exact version', async () => {
        const options = { sha256: entry.sha256, packageRepo: getPackageRepo(), assetStore: getAssetStore() };
        const result = await Promise.all([seedBundledPackage(h.handle, archive, options), seedBundledPackage(h.handle, archive, options)]);
        expect(result.sort()).toEqual([false, true]);
        const record = (await getPackageRepo().list(h.handle))[0];
        expect(await getPackageRepo().listVersions(h.handle, record.packageId)).toHaveLength(1);
    });

    test.each([true, false])('bundled defaults reject other permissions (required: %s)', async required => {
        const f = sessionFixture();
        f.manifest.permissions = [{ permission: 'network', required, reason: 'Unreviewed capability' }];
        const bytes = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map(), assetPayloads: new Map() }).archive;
        await expect(seedBundledPackage(h.handle, bytes, { sha256: hash(bytes), packageRepo: getPackageRepo(), assetStore: getAssetStore() })).rejects.toThrow('Unsupported bundled Package permission');
        expect(await getPackageRepo().list(h.handle)).toEqual([]);
    });
});
