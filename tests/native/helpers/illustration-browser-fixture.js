import express from 'express';
import { fileURLToPath } from 'node:url';
import { makeTempFsEngineHarness } from '../../storage/harness/contract-harness.js';
import { installFixture, sessionFixture } from './session-fixture.js';
import { ExtensionsStore } from '../../../src/native/extensions-store.js';
import { IllustrationService } from '../../../src/native/illustration-service.js';
import { createNativeExtensionsRouter } from '../../../src/endpoints/native-extensions.js';
import { createNativeSessionRouter } from '../../../src/endpoints/native-session.js';
import { defaultIllustrationSettings } from '../../../public/shared/illustration-plugin-contract.js';
import { createNativeId } from '../../../src/native/identity.js';
import { createHash } from 'node:crypto';

// Disposable authenticated local fixture using the real storage and HTTP APIs.
export async function createIllustrationBrowserFixture() {
    const h = await makeTempFsEngineHarness(), spec = sessionFixture();
    spec.manifest.entryPoints[0].initialTimeline[0].content = '**Alice** stands at the window.\n\nBob waits by the door.';
    const services = await installFixture(h, spec), snapshot = await services.core.create(h.handle, services.start);
    const store = new ExtensionsStore({ engine: h.engine });
    const initial = await store.illustrationSettings(h.handle), settings = defaultIllustrationSettings(); settings.enabled = true;
    settings.characters = [{ id: 'alice', name: 'Alice', aliases: ['Al'], fixedPrompt: 'blue eyes', defaultClothing: 'coat', enabled: true, storyActorId: '' }];
    settings.works[snapshot.session.packageId] = { characterIds: ['alice'] };
    await store.saveIllustrationSettings(h.handle, settings, initial.revision);
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
    app.get('/fixture/snapshot', async (_req, res) => res.json(await services.core.load(h.handle, snapshot.session.sessionId)));
    app.get('/api/native/product/works', (_req, res) => res.json([{ package: { packageId: snapshot.session.packageId, displayName: 'Fixture work' } }]));
    app.get('/api/native/generation/configuration', (_req, res) => res.json({ connections: [{ connectionProfileId: 'conn_fixture', displayName: 'Fixture image connection' }], routes: [{ runtimeRouteId: 'route_fixture', displayName: 'Fixture prompt route' }] }));
    app.post('/fixture/image', async (req, res) => {
        const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7N0AAAAASUVORK5CYII=', 'base64');
        const assetId = createNativeId('asset');
        await services.assetStore.put(h.handle, { assetId, contentHash: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, mediaType: 'image/png' }, bytes);
        res.json(await new IllustrationService({ sessionRepo: services.sessionRepo }).addImageVersion(h.handle, snapshot.session.sessionId, { annotationId: req.body.annotationId, assetId, width: 1, height: 1, alt: 'Fixture illustration', prompt: 'actual image prompt', parameters: { seed: 1 } }));
    });
    app.use('/api/native/extensions', createNativeExtensionsRouter({ store: () => store }));
    app.use('/api/native/session', createNativeSessionRouter(() => ({ ...services, assets: services.assetStore })));
    app.get('/fixture', (_req, res) => res.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/css/atria-tokens.css"><style>body { margin:0; padding:24px; color:var(--atri-text-primary); background:var(--atri-canvas); font:16px/1.75 var(--atri-font-sans); } main { max-width:640px; } .atria-narrative-illustration img { max-width:100%; height:auto; }</style></head><body><h1>插图交互验证</h1><main id="prose"></main><script type="module">
        import { renderSafeProse } from '/shared/native-safe-prose.js';
        import { updateIllustrationSurface } from '/scripts/native/illustration-surfaces.js';
        import { createNativeExtensionsHost } from '/scripts/native/extensions-host.js';
        window.runtime = { active:true, history:false, snapshot:await (await fetch('/fixture/snapshot')).json(), assertWritable() { if (this.history) throw new Error('readonly'); }, async request(path, body) { const response = await fetch('/api/native/session/' + path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) }); const result = await response.json(); if (!response.ok) throw Object.assign(new Error(result.error), { status:response.status }); return result; } };
        window.paint = () => { const { snapshot } = runtime, entry = snapshot.timeline[0], root = document.querySelector('#prose'); if (root.dataset.source !== entry.content) { renderSafeProse(root, entry.content); root.dataset.source = entry.content; } updateIllustrationSurface(root, { sessionId:snapshot.session.sessionId, branchId:snapshot.revision.branchId, revisionId:snapshot.revision.revisionId, entry, state:snapshot.illustrations }); };
        paint(); window.originalLeaf = document.querySelector('strong').firstChild;
        window.extensionHost = createNativeExtensionsHost({ document, runtime, nativeApi:() => ({ isExperienceReady:() => true }), readPreset:async () => ({ preset:null }), onLifecycle:() => () => {}, onConfiguration:() => () => {} }); await extensionHost.refresh(); window.fixtureReady = true;
    </script></body></html>`));
    app.use(express.static(fileURLToPath(new URL('../../../public/', import.meta.url))));
    const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    return { baseURL: 'http://127.0.0.1:' + server.address().port, async dispose() { await new Promise(resolve => server.close(resolve)); await h.cleanup(); } };
}
