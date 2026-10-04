import { beforeEach, afterEach, describe, expect, jest, test } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { sessionFixture, services } from './helpers/session-fixture.js';
import { minimalFrontend } from './helpers/frontend-fixture.js';
import { authorityFixture } from './helpers/authority-fixture.js';
import { validateExperienceResources } from '../../src/native/experience-validation.js';
import { buildAtriaPackageContainer, resolveNativeRuntimePackage } from '../../src/native/index.js';
import { loadGameLogicDefinition } from '../../public/scripts/native/experience/logic/package.js';
import { createTaskWorld } from '../../src/native/task-authority.js';

let h, svc, fixture, manifest, logic, files;
beforeEach(async () => {
    h = await makeTempFsEngineHarness(); svc = services(h); fixture = sessionFixture(); manifest = fixture.manifest;
    const authority = authorityFixture(); logic = authority.logic;
    authority.contract.capabilities[0].required = false;
    manifest.runtime = { experience: minimalFrontend().experience, game: { logic: 'logic/main.json' }, experienceContract: authority.contract };
    files = new Map([...minimalFrontend().files]); syncLogic();
});
afterEach(async () => { await h.cleanup(); });
function syncLogic() { files.set('logic/main.json', Buffer.from(JSON.stringify(logic))); }
const archive = () => buildAtriaPackageContainer({ manifest, sourceFiles: files, assetPayloads: new Map() }).archive;
const validate = (lower = false) => validateExperienceResources(manifest, files, new Map(), { lower });

describe('C1 pinned Package/Build/Runtime declaration closure', () => {
    test('Build does not erase v3 transactions, and install/reopen retains optional metadata', async () => {
        validate(true); expect(JSON.parse(files.get('logic/main.json'))).toEqual(logic);
        await svc.packageInstaller.install(h.handle, archive());
        const opened = await svc.packageInstaller.open(h.handle, manifest.packageId, manifest.packageVersionId);
        const resolved = resolveNativeRuntimePackage(opened, fixture.entryPointId);
        expect(resolved.descriptor.experienceContract.authorityRuntime).toEqual(manifest.runtime.experienceContract.authorityRuntime);
        const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => logic }));
        const loaded = await loadGameLogicDefinition({ sessionId: 'session_fixture', runtime: resolved.runtime, descriptor: resolved.descriptor }, { fetchImpl });
        expect(loaded.transactions).toEqual(logic.transactions); expect(loaded.derivedPublications).toEqual(logic.derivedPublications);
        expect(loaded.commands).toEqual([]); expect(fetchImpl).toHaveBeenCalledTimes(1);
        // Loading declarative metadata never exposes private execution to the browser.
        expect(loaded).not.toHaveProperty('executeTransaction');
    });
    test('C4 required capability activates only through the verified runtime contract', async () => {
        manifest.runtime.experienceContract.capabilities[0].required = true;
        await svc.packageInstaller.install(h.handle, archive());
        const opened = await svc.packageInstaller.open(h.handle, manifest.packageId, manifest.packageVersionId);
        expect(resolveNativeRuntimePackage(opened, fixture.entryPointId).descriptor.experienceContract.capabilities)
            .toContainEqual({ id: 'authority-transaction', version: 1, required: true });
        const view = await svc.core.create(h.handle, { packageId: manifest.packageId, packageVersionId: manifest.packageVersionId, entryPointId: fixture.entryPointId });
        expect(view.manifest.runtime.experienceContract.authorityRuntime).toEqual(manifest.runtime.experienceContract.authorityRuntime);
    });
    test('server pinned World compiler validates v3 without preparing transaction effects', async () => {
        await svc.packageInstaller.install(h.handle, archive());
        const view = await svc.core.create(h.handle, { packageId: manifest.packageId, packageVersionId: manifest.packageVersionId, entryPointId: fixture.entryPointId });
        const opened = await svc.packageInstaller.open(h.handle, manifest.packageId, manifest.packageVersionId);
        const before = structuredClone(view.states);
        const result = await createTaskWorld(view, { ...opened, entryPoint: manifest.entryPoints[0] });
        expect(result.logic.transactions).toEqual(logic.transactions);
        expect(view.states).toEqual(before); expect(result.statePatch).toEqual({});
    });
    test.each(['capability', 'domain', 'command', 'event', 'version', 'missing', 'entry'])('Build fails closed for broken %s closure', kind => {
        if (kind === 'capability') { delete manifest.runtime.experienceContract.authorityRuntime; manifest.runtime.experienceContract.capabilities = []; }
        if (kind === 'domain') logic.transactions[0].effects[1].domainId = 'missing';
        if (kind === 'command') logic.transactions[0].effects[1].commandId = 'missing';
        if (kind === 'event') logic.transactions[0].effects[0].type = 'Missing';
        if (kind === 'version') logic.schemaVersion = 2;
        if (kind === 'entry') manifest.entryPoints.push({ ...manifest.entryPoints[0], runtime: { game: { logic: 'logic/other.json' } } });
        syncLogic(); if (kind === 'missing') files.delete('logic/main.json');
        expect(() => validate()).toThrow();
    });
    test('rejects undeclared Transaction fields hidden inside legacy logic', () => {
        delete manifest.runtime.experienceContract.authorityRuntime; manifest.runtime.experienceContract.capabilities = [];
        logic = { transactions: [] }; syncLogic(); expect(() => validate()).toThrow(/unknown field/);
    });
    test('install rejects malformed transaction effects before creating a Package revision', async () => {
        logic.transactions[0].effects[0] = { kind: 'json.patch', patch: [] }; syncLogic();
        await expect(svc.packageInstaller.install(h.handle, archive())).rejects.toThrow(/Unsupported Transaction effect/);
        expect(await svc.packageRepo.get(h.handle, manifest.packageId)).toBeNull();
    });
    test.each([1, 2])('legacy v%i Package installs and runs without acquiring authorityRuntime', async version => {
        delete manifest.runtime.experienceContract;
        logic = version === 1 ? { schemaVersion: 1, commands: [], reducers: [], rules: [] } : { schemaVersion: 2, mutations: [] }; syncLogic();
        validate(true); await svc.packageInstaller.install(h.handle, archive());
        const opened = await svc.packageInstaller.open(h.handle, manifest.packageId, manifest.packageVersionId);
        const resolved = resolveNativeRuntimePackage(opened, fixture.entryPointId);
        expect(resolved.descriptor.experienceContract).toBeUndefined();
        const loaded = await loadGameLogicDefinition({ sessionId: 'session_legacy', runtime: resolved.runtime, descriptor: resolved.descriptor },
            { fetchImpl: async () => ({ ok: true, json: async () => JSON.parse(files.get('logic/main.json')) }) });
        expect(loaded).not.toHaveProperty('transactions'); expect(loaded.commands).toEqual([]);
        const session = await svc.core.create(h.handle, { packageId: manifest.packageId, packageVersionId: manifest.packageVersionId, entryPointId: fixture.entryPointId });
        expect(session.states).not.toHaveProperty('atri_authority');
        expect(session.timeline[0].content).toBe('Opening');
    });
});
