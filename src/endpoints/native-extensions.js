import express from 'express';
import { ExtensionsStore } from '../native/extensions-store.js';
import { readExternalExtension } from '../native/extension-install.js';
import { getStorageEngine } from '../storage/index.js';
import { listAuthoringReferences, readAuthoringReference } from '../native/authoring-reference.js';

export function createNativeExtensionsRouter({ store = () => new ExtensionsStore({ engine: getStorageEngine() }), install = readExternalExtension } = {}) {
    const router = express.Router();
    router.use((req, res, next) => req.user?.profile?.handle ? next() : res.sendStatus(401));
    const route = fn => async (req, res) => {
        try { res.set('Cache-Control', 'private, no-store'); await fn(req, res, store(), req.user.profile.handle); } catch (error) { res.status(error.name === 'ConflictError' ? 409 : error.name === 'NotFoundError' ? 404 : 400).json({ error: error.code ?? error.message }); }
    };
    router.get('/settings', route(async (_req, res, api, handle) => res.json(await api.settings(handle))));
    router.put('/settings', route(async (req, res, api, handle) => res.json(await api.saveSettings(handle, req.body.value, req.body.expectedRevision))));
    router.get('/catalog', route(async (req, res) => res.json(listAuthoringReferences(req.query.query))));
    router.get('/catalog/:id', route(async (req, res) => res.json(await readAuthoringReference({ id: req.params.id, offset: Number(req.query.offset ?? 0), limit: Number(req.query.limit ?? 12000) }))));
    router.get('/plugins', route(async (_req, res, api, handle) => res.json(await api.list(handle))));
    router.post('/plugins', route(async (req, res, api, handle) => res.json(await api.save(handle, req.body.value, req.body.expectedRevision))));
    router.get('/plugins/:id', route(async (req, res, api, handle) => res.json(await api.get(handle, req.params.id))));
    router.delete('/plugins/:id', route(async (req, res, api, handle) => res.json(await api.remove(handle, req.params.id, req.body.expectedRevision))));
    router.post('/install', route(async (req, res, api, handle) => {
        const previous = req.body.id ? await api.get(handle, req.body.id) : null;
        if (previous && previous.kind !== 'external') throw new TypeError('Only external plugins can update from URL');
        const candidate = await install(previous?.sourceUrl ?? req.body.url);
        res.json(await api.save(handle, { ...candidate, enabled: false, ...(previous ? { id: previous.id, targets: previous.targets } : {}) }, req.body.expectedRevision ?? null));
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
