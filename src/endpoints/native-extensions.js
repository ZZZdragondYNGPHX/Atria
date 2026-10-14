import express from 'express';
import { randomUUID } from 'node:crypto';
import { captureBackendIncident } from '../logging/runtime.js';
import { ExtensionsStore, extensionSourceHash } from '../native/extensions-store.js';
import { readExternalExtension, ExtensionPreparationCache, extensionRemote } from '../native/extension-install.js';
import { getStorageEngine } from '../storage/index.js';
import { listAuthoringReferences, readAuthoringReference } from '../native/authoring-reference.js';

export function createNativeExtensionsRouter({ store = () => new ExtensionsStore({ engine: getStorageEngine() }), install = readExternalExtension, captureIncident = captureBackendIncident, preparations = new ExtensionPreparationCache() } = {}) {
    const router = express.Router();
    router.use((req, res, next) => req.user?.profile?.handle ? next() : res.sendStatus(401));
    const route = fn => async (req, res) => {
        try { res.set('Cache-Control', 'private, no-store'); await fn(req, res, store(), req.user.profile.handle); } catch (error) { res.status(error.name === 'ConflictError' ? 409 : error.name === 'NotFoundError' ? 404 : 400).json({ error: error.code ?? error.message }); }
    };
    router.get('/official/illustration', route(async (_req, res, api, handle) => res.json(await api.illustrationSettings(handle))));
    router.put('/official/illustration', route(async (req, res, api, handle) => res.json(await api.saveIllustrationSettings(handle, req.body.value, req.body.expectedRevision))));
    router.get('/settings', route(async (_req, res, api, handle) => res.json(await api.settings(handle))));
    router.put('/settings', route(async (req, res, api, handle) => res.json(await api.saveSettings(handle, req.body.value, req.body.expectedRevision))));
    router.get('/catalog', route(async (req, res) => res.json(listAuthoringReferences(req.query.query))));
    router.get('/catalog/:id', route(async (req, res) => res.json(await readAuthoringReference({ id: req.params.id, offset: Number(req.query.offset ?? 0), limit: Number(req.query.limit ?? 12000) }))));
    router.get('/plugins', route(async (_req, res, api, handle) => res.json(await api.list(handle))));
    router.get('/observations', route(async (req, res, api, handle) => {
        const offset = Number(req.query.offset ?? 0), limit = Number(req.query.limit ?? 20);
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Invalid Extension page');
        const rows = await api.list(handle);
        res.json({ total: rows.length, items: rows.slice(offset, offset + limit).map(({ targets: _targets, ...row }) => row), nextOffset: offset + limit < rows.length ? offset + limit : null,
            activation: 'Native enabled configuration only; frontend document/epoch activation is independently observed' });
    }));
    router.post('/plugins', route(async (req, res, api, handle) => res.json(await api.save(handle, req.body.value, req.body.expectedRevision))));
    router.get('/plugins/:id', route(async (req, res, api, handle) => res.json(await api.get(handle, req.params.id))));
    router.get('/plugins/:id/inspect', route(async (req, res, api, handle) => res.json(await api.inspect(handle, req.params.id))));
    router.get('/plugins/:id/source', route(async (req, res, api, handle) => res.json(await api.source(handle, req.params.id,
        { path: req.query.path, expectedRevision: req.query.expectedRevision, offset: Number(req.query.offset ?? 0), limit: Number(req.query.limit ?? 12000) }))));
    for (const action of ['enable', 'disable', 'targets', 'delete']) router.post('/plugins/:id/actions/' + action,
        route(async (req, res, api, handle) => res.json(await api.exactOperation(handle, req.params.id, req.body, action))));
    router.post('/prepare', route(async (req, res, api, handle) => {
        const input = req.body;
        if (!input || Object.keys(input).some(key => !['url', 'id', 'expectedRevision', 'targets', 'clientInstanceId'].includes(key))
            || !Object.hasOwn(input, 'expectedRevision') || input.expectedRevision !== null && typeof input.expectedRevision !== 'string') throw new TypeError('Exact extension preparation input required');
        const previous = input.id ? await api.get(handle, input.id) : null;
        if ((previous?.revision ?? null) !== input.expectedRevision) throw Object.assign(new Error('Extension preparation revision conflict'), { name: 'ConflictError' });
        if (previous && previous.kind !== 'external') throw new TypeError('Only external plugins update from Git');
        const url = extensionRemote(input.url ?? previous?.sourceUrl).href;
        if (previous && url !== previous.sourceUrl) throw new TypeError('Extension update origin must match the installed source');
        const candidate = await install(url);
        if (candidate.sourceUrl !== url) throw new TypeError('Extension download source changed');
        res.json(preparations.put(handle, input.clientInstanceId, candidate, { previous, targets: input.targets ?? previous?.targets ?? candidate.targets }));
    }));
    router.post('/local/prepare', route(async (req, res, api, handle) => {
        const input = req.body;
        if (!input || Object.keys(input).some(key => !['name', 'source', 'id', 'expectedRevision', 'targets', 'clientInstanceId'].includes(key))
            || !Object.hasOwn(input, 'expectedRevision') || typeof input.source !== 'string') throw new TypeError('Exact local Extension source required');
        const previous = input.id ? await api.get(handle, input.id) : null;
        if ((previous?.revision ?? null) !== input.expectedRevision) throw Object.assign(new Error('Local Extension revision conflict'), { name: 'ConflictError' });
        if (previous && previous.kind !== 'local') throw new TypeError('Local preparation cannot replace external Git source');
        const candidate = { name: input.name, kind: 'local', sourceUrl: null, sourceCommit: null, enabled: false, entrypoint: 'index.js', files: { 'index.js': input.source },
            targets: input.targets ?? previous?.targets ?? { global: false, presets: [], works: [] } };
        candidate.contentHash = extensionSourceHash(candidate);
        res.json(preparations.put(handle, input.clientInstanceId, candidate, { previous }));
    }));
    router.get('/preparations/:preparationId', route(async (req, res, _api, handle) => res.json(preparations.inspect(handle, req.params.preparationId, req.query.clientInstanceId))));
    router.get('/preparations/:preparationId/source', route(async (req, res, _api, handle) => {
        const metadata = preparations.inspect(handle, req.params.preparationId, req.query.clientInstanceId);
        const sourceCommit = req.query.sourceCommit === 'null' ? null : req.query.sourceCommit;
        if (req.query.contentHash !== metadata.contentHash || sourceCommit !== metadata.sourceCommit || req.query.targetsHash !== metadata.targetsHash) throw Object.assign(new Error('Extension source review conflict'), { name: 'ConflictError' });
        res.json(preparations.source(handle, req.params.preparationId, req.query.clientInstanceId, req.query.path,
            { offset: Number(req.query.offset ?? 0), limit: Number(req.query.limit ?? 12000) }));
    }));
    router.post('/preparations/:preparationId/install', route(async (req, res, api, handle) => {
        if (!req.body || Object.keys(req.body).sort().join(',') !== ['clientInstanceId', 'contentHash', 'sourceCommit', 'targetsHash', 'expectedRevision'].sort().join(',')) throw new TypeError('Exact prepared installation required');
        res.json(await preparations.install(handle, req.params.preparationId, req.body, api));
    }));
    router.get('/host-plugins/status', route(async (_req, res) => res.json({ supported: false, reason: 'No active production HostPluginBoundary or operator lifecycle authority is installed; source manifests do not prove active plugins' })));
    router.delete('/plugins/:id', route(async (req, res, api, handle) => res.json(await api.remove(handle, req.params.id, req.body.expectedRevision))));
    router.post('/install', route(async (req, res, api, handle) => {
        const operationId = randomUUID(); let diagnosticStage = 'lookup';
        res.setHeader('x-atria-operation-id', operationId);
        try {
            const previous = req.body.id ? await api.get(handle, req.body.id) : null;
            if (previous && previous.kind !== 'external') throw new TypeError('Only external plugins can update from URL');
            const candidate = await install(previous?.sourceUrl ?? req.body.url, { onStage: stage => { diagnosticStage = stage; } });
            diagnosticStage = 'save';
            res.json(await api.save(handle, { ...candidate, enabled: false, ...(previous ? { id: previous.id, targets: previous.targets } : {}) }, req.body.expectedRevision ?? null, { verifiedSource: true }));
        } catch (error) {
            res.setHeader('x-atria-failure-stage', diagnosticStage);
            // Correlate the failed operation without storing repository URLs,
            // downloaded code, request bodies or arbitrary Git error text.
            try {
                captureIncident({ type: req.body.id ? 'extension_update_failure' : 'extension_install_failure', primaryModule: 'extensions',
                    stage: diagnosticStage, summary: 'Native extension operation failed', correlation: { operationId }, probableOwner: 'extension' });
            } catch { /* Diagnostics cannot replace the original failure. */ }
            throw error;
        }
    }));
    router.get('/files/:id/:revision/*', route(async (req, res, api, handle) => {
        const plugin = await api.get(handle, req.params.id);
        if (!plugin.enabled || plugin.revision !== req.params.revision) return res.sendStatus(409);
        const file = req.params[0]; if (!Object.hasOwn(plugin.files, file)) return res.sendStatus(404);
        res.set('X-Content-Type-Options', 'nosniff').type(file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.json') ? 'application/json' : 'text/plain').send(plugin.files[file]);
    }));
    return router;
}
export const router = createNativeExtensionsRouter();
