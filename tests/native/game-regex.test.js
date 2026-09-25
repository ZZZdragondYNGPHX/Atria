import { describe, test, expect } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { NativeProductService, WorldRepo, ProjectStore } from '../../src/native/index.js';
import { installFixture, services } from './helpers/session-fixture.js';
import { createNativeProductRouter } from '../../src/endpoints/native-product.js';

const rule = { id: 'same-id', scriptName: 'Game rule', findRegex: '/old/g', replaceString: 'new', placement: [1, 2] };

describe('Game Regex ownership', () => {
    test('publishes real package rules, refreshes live Sessions, preserves history and portable snapshots', async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const f = await installFixture(h);
            const product = new NativeProductService({ ...f, sessionCore: f.core, worldRepo: new WorldRepo({ engine: h.engine }), projectStore: new ProjectStore({ directoriesByHandle: () => h.dirs }) });
            const original = await f.core.create(h.handle, f.start), id = original.session.sessionId;
            const progressed = await f.core.updateState(h.handle, id, { atri_custom_progress: { score: 42 } });
            const setup = await product.getResourceSetup(h.handle, f.start.packageId);
            await product.saveResourceSetup(h.handle, f.start.packageId, setup);
            const before = await product.getPackageRegex(h.handle, f.start.packageId);
            const input = { packageVersionId: before.packageVersionId, regexScripts: [rule] };
            const result = await product.editPackageRegex(h.handle, f.start.packageId, input);
            expect(result.packageVersionId).not.toBe(before.packageVersionId);
            const current = await f.packageInstaller.open(h.handle, f.start.packageId, result.packageVersionId);
            expect(current.manifest.processors.regex[0]).toMatchObject(rule);
            expect(current.manifest.worlds).toEqual(original.manifest.worlds);
            const old = await f.packageInstaller.open(h.handle, f.start.packageId, before.packageVersionId);
            expect(old.manifest.processors?.regex || []).toEqual(before.regexScripts);
            await expect(product.editPackageRegex(h.handle, f.start.packageId, input)).rejects.toMatchObject({ code: 'native_package_regex_conflict' });
            const changed = await f.core.load(h.handle, id);
            expect(changed.manifest.processors.regex[0]).toMatchObject(rule);
            expect(changed.states.atri_custom_progress).toEqual({ score: 42 });
            expect(changed.states.atri_world_state).toEqual(progressed.states.atri_world_state);
            expect(changed.timeline).toEqual(progressed.timeline);
            expect((await f.core.load(h.handle, id)).revision.revisionId).toBe(changed.revision.revisionId);
            const historical = await f.core.load(h.handle, id, { revisionId: progressed.revision.revisionId });
            expect(historical.manifest.processors?.regex || []).toEqual(before.regexScripts);
            expect((await product.startWork(h.handle, f.start.packageId)).manifest.processors.regex[0]).toMatchObject(rule);
            expect((await product.getResourceSetup(h.handle, f.start.packageId)).worldRefs).toEqual(setup.worldRefs);
            const exported = await f.saveSystem.exportSession(h.handle, id);
            const target = await makeTempFsEngineHarness();
            try {
                const restoredServices = services(target);
                await restoredServices.packageInstaller.install(target.handle, await f.assetStore.readBlob(h.handle, original.session.packageContentHash));
                const imported = await restoredServices.saveSystem.importSave(target.handle, exported.archive);
                const restored = await restoredServices.core.load(target.handle, imported.session.sessionId);
                expect(restored.manifest.processors.regex[0]).toMatchObject(rule);
                expect(restored.states.atri_custom_progress).toEqual({ score: 42 });
                await restoredServices.packageInstaller.install(target.handle, await f.assetStore.readBlob(h.handle, current.packageVersion.packageContentHash));
                const packaged = await restoredServices.core.create(target.handle, { ...f.start, packageVersionId: result.packageVersionId });
                expect(packaged.manifest.processors.regex[0]).toMatchObject(rule);
            } finally { await target.cleanup(); }
            const app = express(); app.use(express.json()); app.use((req, res, next) => { if (req.headers['x-test-user']) req.user = { profile: { handle: h.handle } }; next(); });
            app.use(createNativeProductRouter(() => ({ product })));
            const path = `/works/${f.start.packageId}/regex`;
            await supertest(app).put(path).send(input).expect(401);
            await supertest(app).put(path).set('x-test-user', 'yes').send(input).expect(409);
            const latest = await supertest(app).get(path).set('x-test-user', 'yes').expect(200);
            await supertest(app).put(path).set('x-test-user', 'yes').send({ packageVersionId: latest.body.packageVersionId, regexScripts: [rule, rule] }).expect(400);
            expect((await product.getPackageRegex(h.handle, f.start.packageId)).packageVersionId).toBe(latest.body.packageVersionId);
            await supertest(app).put(path).set('x-test-user', 'yes').send({ packageVersionId: latest.body.packageVersionId, regexScripts: [] }).expect(200);
            expect((await f.core.load(h.handle, id)).manifest.processors.regex).toEqual([]);
        } finally { await h.cleanup(); }
    });
});
