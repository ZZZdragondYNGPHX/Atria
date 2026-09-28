import express from 'express';
import request from 'supertest';

import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { buildAtriaPackageContainer, createNativeId } from '../../src/native/index.js';
import { createNativeSessionRouter } from '../../src/endpoints/native-session.js';
import { services, sessionFixture } from './helpers/session-fixture.js';
import { compileFrontend } from '../../src/native/frontend/compiler.js';

function textFixture() {
    const fixture = sessionFixture();
    fixture.manifest.capabilities = [...fixture.manifest.capabilities, 'game-runtime'];
    fixture.manifest.entryPoints[0] = {
        ...fixture.manifest.entryPoints[0],
        runtime: {
            experience: { mode: 'text' },
            game: {
                logic: 'logic/main.json',
                observations: 'llm/observations.json',
            },
        },
    };
    fixture.manifest.worlds[0].revision.schema = {
        type: 'object',
        additionalProperties: true,
    };
    return fixture;
}

async function installVersion(h, svc, manifest, marker) {
    const { archive } = buildAtriaPackageContainer({
        manifest,
        sourceFiles: new Map([
            ['logic/main.json', Buffer.from(JSON.stringify({ marker, commands: [], reducers: [] }))],
            ['llm/observations.json', Buffer.from('[]')],
        ]),
        assetPayloads: new Map(),
    });
    return svc.packageInstaller.install(h.handle, archive);
}

function appFor(h, svc) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.user = { profile: { handle: h.handle } };
        next();
    });
    app.use(createNativeSessionRouter(() => ({
        core: svc.core,
        assets: svc.assetStore,
        sessionRepo: svc.sessionRepo,
        packageInstaller: svc.packageInstaller,
    })));
    return app;
}

describe('A3 Native Package -> Runtime Descriptor HTTP', () => {
    test('v3 Runtime serves only its exact compiled graph, never optional author/remix source', async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const svc = services(h), fixture = textFixture();
            const sourceFiles = new Map([
                ['frontend.json', Buffer.from(JSON.stringify({ format: 'atria-frontend-source', version: 3, primaryView: 'main',
                    views: [{ id: 'main', root: 'Main', surface: 'app.root' }], components: [{ id: 'Main', source: 'Main.aui' }] }))],
                ['Main.aui', Buffer.from('<template><main node-id="root">Compiled</main></template>')],
                ['controller.ts', Buffer.from('throw new Error("never execute")')],
            ]);
            const compiled = compileFrontend({ source: 'frontend.json', files: sourceFiles, mode: 'full' });
            fixture.manifest.entryPoints[0].runtime = { experience: { mode: 'full', frontend: { kind: 'native', version: 3, entry: compiled.entry } } };
            const { archive } = buildAtriaPackageContainer({ manifest: fixture.manifest, sourceFiles: new Map([...sourceFiles, ...compiled.files]) });
            await svc.packageInstaller.install(h.handle, archive);
            const view = await svc.core.create(h.handle, { packageId: fixture.manifest.packageId, packageVersionId: fixture.manifest.packageVersionId, entryPointId: fixture.entryPointId });
            const app = appFor(h, svc), sessionId = view.session.sessionId;
            const resolved = await request(app).post('/runtime/resolve').send({ sessionId });
            expect(resolved.status).toBe(200);
            expect(resolved.body.runtime.experience.frontend.entry).toBe(compiled.entry);
            const index = await request(app).post('/runtime/resource').send({ sessionId, path: compiled.entry });
            expect(index.status).toBe(200);
            expect(index.body.format).toBe('atria-frontend-index');
            for (const ref of index.body.resources) {
                const resource = await request(app).post('/runtime/resource').send({ sessionId, path: ref.path });
                expect(resource.status).toBe(200);
            }
            for (const path of ['frontend.json', 'Main.aui', 'controller.ts', '../frontend.json', 'runtime/frontend/other/index.json']) {
                expect((await request(app).post('/runtime/resource').send({ sessionId, path })).status).toBe(400);
            }
        } finally { await h.cleanup(); }
    });

    test('Session resolves exact PackageVersion and never follows Package current', async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const svc = services(h);
            const fixture = textFixture();
            await installVersion(h, svc, fixture.manifest, 'v1');
            const view = await svc.core.create(h.handle, {
                packageId: fixture.manifest.packageId,
                packageVersionId: fixture.manifest.packageVersionId,
                entryPointId: fixture.entryPointId,
            });
            const app = appFor(h, svc);

            const first = await request(app).post('/runtime/resolve').send({
                sessionId: view.session.sessionId,
            });
            expect(first.status).toBe(200);
            expect(first.body.descriptor).toMatchObject({
                format: 'atria-native-runtime-descriptor',
                packageId: fixture.manifest.packageId,
                packageVersionId: fixture.manifest.packageVersionId,
                entryPointId: fixture.entryPointId,
                experience: { mode: 'text' },
            });

            const newer = structuredClone(fixture.manifest);
            newer.packageVersionId = createNativeId('packageVersion');
            newer.version = '2.0.0';
            await installVersion(h, svc, newer, 'v2');

            const pinned = await request(app).post('/runtime/resolve').send({
                sessionId: view.session.sessionId,
            });
            expect(pinned.body.descriptor.packageVersionId).toBe(fixture.manifest.packageVersionId);

            const resource = await request(app).post('/runtime/resource').send({
                sessionId: view.session.sessionId,
                path: 'logic/main.json',
            });
            expect(resource.status).toBe(200);
            expect(JSON.parse(resource.text).marker).toBe('v1');
        } finally {
            await h.cleanup();
        }
    });

    test('runtime resource endpoint rejects executable and traversal paths', async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const svc = services(h);
            const fixture = textFixture();
            await installVersion(h, svc, fixture.manifest, 'safe');
            const view = await svc.core.create(h.handle, {
                packageId: fixture.manifest.packageId,
                packageVersionId: fixture.manifest.packageVersionId,
                entryPointId: fixture.entryPointId,
            });
            const app = appFor(h, svc);
            for (const path of ['runtime/main.js', '../logic/main.json', '/logic/main.json']) {
                const result = await request(app).post('/runtime/resource').send({
                    sessionId: view.session.sessionId,
                    path,
                });
                expect(result.status).toBe(400);
            }
        } finally {
            await h.cleanup();
        }
    });
});
