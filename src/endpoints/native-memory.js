import express from 'express';
import { SessionCore } from '../native/session-core.js';
import { PackageInstaller } from '../native/package-composition.js';
import { NativeMemoryAuthority } from '../native/memory-authority.js';
import { getSessionRepo, getSavePointRepo, getPackageRepo, getAssetStore, getKnowledgeRepo, getPersonaRepo, getSettingsRepo } from '../storage/index.js';

function service() {
    const core = new SessionCore({ sessionRepo: getSessionRepo(), savePointRepo: getSavePointRepo(),
        packageInstaller: new PackageInstaller({ packageRepo: getPackageRepo(), assetStore: getAssetStore() }), knowledgeRepo: getKnowledgeRepo(), personaRepo: getPersonaRepo() });
    return new NativeMemoryAuthority({ core, settingsRepo: getSettingsRepo() });
}
export function createNativeMemoryRouter(getAuthority = service) {
    const router = express.Router();
    router.use((req, res, next) => { if (!req.user?.profile?.handle) return res.sendStatus(401); next(); });
    for (const [path, method] of [['observe', 'observe'], ['sources', 'sources'], ['batch', 'apply'], ['graph/observe', 'observeGraph']]) router.post('/' + path, async (req, res) => {
        try { res.set('Cache-Control', 'private, no-store').json(await getAuthority()[method](req.user.profile.handle, req.body)); } catch (error) { res.status(error?.name === 'ConflictError' ? 409 : error?.name === 'NotFoundError' ? 404 : error?.code === 'storage_read_only' ? 503 : 400).json({ error: error?.name === 'ConflictError' ? error.code : 'native_memory_unavailable' }); }
    });
    for (const kind of ['node.create', 'node.edit', 'node.delete', 'relation.upsert', 'relation.delete', 'compact']) router.post('/graph/' + kind.replace('.', '/'), async (req, res) => {
        try { res.set('Cache-Control', 'private, no-store').json(await getAuthority().applyGraph(req.user.profile.handle, req.body, kind)); } catch (error) { res.status(error?.name === 'ConflictError' ? 409 : error?.code === 'storage_read_only' ? 503 : 400).json({ error: error?.name === 'ConflictError' ? error.code : 'native_memory_graph_unavailable' }); }
    });
    return router;
}
