import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { sessionFixture, installFixture, services } from './helpers/session-fixture.js';
import { contentFixture } from './helpers/continuity-fixture.js';
import { buildAtriaPackageContainer, createNativeId } from '../../src/native/index.js';
import { contentDigest, composeContent } from '../../src/native/content-composition.js';
import { assertCommunityPayload, assertCommunityRegistry } from '../../public/shared/native-content-contract.js';

describe.each(CONTRACT_HARNESSES)('P7 exact Community composition - $name', ({ make }) => {
    let h, f, base, payload;
    beforeEach(async () => {
        h = await make(); const fixture = sessionFixture(); fixture.manifest.runtime = { experienceContract: contentFixture() };
        f = await installFixture(h, fixture);
        const opened = await f.packageInstaller.open(h.handle, f.manifest.packageId, f.manifest.packageVersionId);
        base = { packageId: opened.manifest.packageId, packageVersionId: opened.manifest.packageVersionId, packageContentHash: opened.packageVersion.packageContentHash };
        payload = { format: 'atria-addon', schemaVersion: 1, id: 'fan-pack', revision: 'r1', target: base, requires: [], conflicts: [],
            contributions: [{ id: 'sword', pointId: 'catalog', kind: 'skill', value: { label: 'Swordsmanship', power: 3 } }] };
    });
    afterEach(async () => { await h?.cleanup(); });
    const install = (value = payload) => f.packageInstaller.installCommunity(h.handle, base, Buffer.from(JSON.stringify(value)));
    test('install, compose, Session create and reopen pin the exact Base/add-on closure without patching Base', async () => {
        const before = await f.packageInstaller.open(h.handle, base.packageId, base.packageVersionId);
        const ref = await install(); const composed = await f.packageInstaller.compose(h.handle, base, [ref]);
        expect(composed.manifest.runtime.experienceContract.contentRuntime.composition).toEqual({ base, resources: [ref] });
        const data = composed.manifest.runtime.experienceContract.dataResources[0];
        const opened = await services(h).packageInstaller.open(h.handle, base.packageId, composed.manifest.packageVersionId);
        expect(JSON.parse(opened.assets.get(data.assetId))).toEqual([{ id: 'fan-pack:sword', kind: 'skill', value: { label: 'Swordsmanship', power: 3 } }]);
        expect((await f.packageRepo.get(h.handle, base.packageId)).currentVersionId).toBe(base.packageVersionId);
        expect((await f.packageInstaller.open(h.handle, base.packageId, base.packageVersionId)).manifest).toEqual(before.manifest);
        const session = await f.core.create(h.handle, { ...f.start, packageVersionId: composed.manifest.packageVersionId });
        expect(session.session.packageContentHash).toBe(composed.packageVersion.packageContentHash);
        expect((await f.core.load(h.handle, session.session.sessionId)).manifest.runtime.experienceContract.contentRuntime.composition.base).toEqual(base);
    });
    test('standalone typed resource need not declare Add-on contributions', async () => {
        const { contributions, ...resource } = payload;
        const ref = await install({ ...resource, format: 'atria-shareable-resource', contribution: contributions[0] });
        expect((await f.packageInstaller.compose(h.handle, base, [ref])).manifest.runtime.experienceContract.dataResources).toHaveLength(1);
    });
    test('Registry discovery is typed inert metadata and does not grant install trust', async () => {
        const ref = await install(); const entry = { id: payload.id, revision: payload.revision, title: 'Fan pack', kind: 'addon', target: base, ref };
        expect(assertCommunityRegistry({ schemaVersion: 1, entries: [entry] }).entries[0].ref).toEqual(ref);
        expect(() => assertCommunityRegistry({ schemaVersion: 1, entries: [{ ...entry, url: 'https://example.com/latest.js' }] })).toThrow();
        expect(() => assertCommunityRegistry({ schemaVersion: 1, entries: [{ ...entry, trusted: true }] })).toThrow();
        const tampered = structuredClone(payload); tampered.contributions[0].value.power = 100;
        await expect(install(tampered)).rejects.toThrow();
    });
    test.each([
        p => { p.contributions[0].value.power = 999; },
        p => { p.script = 'alert(1)'; },
        p => { p.contributions[0].patch = {}; },
        p => { p.contributions[0].pointId = 'undeclared'; },
        p => { p.target.packageVersionId = createNativeId('packageVersion'); },
        p => { p.requires = [{ assetId: 'latest', contentHash: 'url' }]; },
        p => { p.contributions[0].value.secret = 'not in schema'; },
        p => { p.contributions[0].kind = 'javascript'; },
        p => { p.validation = 'trusted'; },
    ])('installation revalidates/sanitizes malformed community payload %#', async mutate => {
        mutate(payload); await expect(install()).rejects.toThrow();
        expect((await f.packageRepo.listVersions(h.handle, base.packageId))).toHaveLength(1);
    });
    test('inert text never becomes executable markup and original objects are detached', () => {
        payload.contributions[0].value.label = '<script>alert(1)</script>';
        const checked = assertCommunityPayload(payload, base, contentFixture().contentRuntime);
        payload.contributions[0].value.power = 9;
        expect(checked.contributions[0].value.power).toBe(3);
        expect(checked.contributions[0].value.label).toBe('<script>alert(1)</script>');
    });
    test('exact dependency closure and stable order, conflicts and duplicate identities', async () => {
        const first = await install();
        const secondPayload = { ...payload, id: 'second', requires: [first] }; const second = await install(secondPayload);
        await expect(f.packageInstaller.compose(h.handle, base, [second])).rejects.toThrow(/Missing exact/);
        const a = await f.packageInstaller.compose(h.handle, base, [second, first]);
        const b = await f.packageInstaller.compose(h.handle, base, [first, second]);
        expect(a.manifest.runtime.experienceContract.contentRuntime.composition).toEqual(b.manifest.runtime.experienceContract.contentRuntime.composition);
        await expect(f.packageInstaller.compose(h.handle, base, [first, first])).rejects.toThrow(/Duplicate/);
        const conflict = await install({ ...secondPayload, conflicts: ['fan-pack'] });
        await expect(f.packageInstaller.compose(h.handle, base, [first, conflict])).rejects.toThrow(/conflict/);
    });
    test('tampered imported composition manifest or contribution bytes cannot claim trusted resolution', async () => {
        const ref = await install(); const result = await f.packageInstaller.compose(h.handle, base, [ref]);
        const opened = await f.packageInstaller.open(h.handle, base.packageId, result.manifest.packageVersionId);
        const manifest = structuredClone(opened.manifest); manifest.packageVersionId = createNativeId('packageVersion'); manifest.name = 'Patched Base';
        const { archive } = buildAtriaPackageContainer({ manifest, sourceFiles: opened.sourceFiles, assetPayloads: opened.assets });
        await expect(f.packageInstaller.install(h.handle, archive)).rejects.toThrow(/differs/);
        const baseBytes = await f.assetStore.readBlob(h.handle, base.packageContentHash);
        expect(() => composeContent(baseBytes, [{ ref, bytes: Buffer.from('{}') }], createNativeId('packageVersion'))).toThrow(/hash/);
    });
    test('derived archive imports into a fresh account with its complete embedded closure', async () => {
        const ref = await install(); const result = await f.packageInstaller.compose(h.handle, base, [ref]);
        const archive = await f.assetStore.readBlob(h.handle, result.packageVersion.packageContentHash);
        const other = await make();
        try {
            const target = services(other); const imported = await target.packageInstaller.install(other.handle, archive);
            expect(imported.packageVersion.packageContentHash).toBe(contentDigest(archive));
            const reopened = await target.packageInstaller.open(other.handle, base.packageId, imported.packageVersion.packageVersionId);
            expect(reopened.manifest.runtime.experienceContract.contentRuntime.composition).toEqual({ base, resources: [ref] });
        } finally { await other.cleanup(); }
    });
    test('Base contract point budgets are enforced during composition', async () => {
        payload.contributions = Array.from({ length: 33 }, (_, index) => ({ ...payload.contributions[0], id: 'item-' + index }));
        const ref = await install(); await expect(f.packageInstaller.compose(h.handle, base, [ref])).rejects.toThrow(/capacity/);
    });
});
