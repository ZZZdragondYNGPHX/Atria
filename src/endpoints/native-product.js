import express from 'express';
import { sanitizeProductDetails } from '../../public/scripts/native/product-error-details.js';

import { getUserDirectories } from '../users.js';
import {
    getAssetStore,
    getKnowledgeRepo,
    getPackageRepo,
    getSavePointRepo,
    getSessionRepo,
    getWorldRepo,
} from '../storage/index.js';
import { PackageInstaller } from '../native/package-composition.js';
import { ProjectStore } from '../native/project-store.js';
import { NativeProductService } from '../native/product-service.js';
import { NativeSaveSystem } from '../native/save-system.js';
import { SessionCore } from '../native/session-core.js';

const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;

function decodeArchive(value) {
    if (typeof value !== 'string' || !value || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
        throw Object.assign(new TypeError('Native Product archive must be base64'), { details: { field: 'data' } });
    }
    const bytes = Buffer.from(value, 'base64');
    if (!bytes.length || bytes.length > MAX_ARCHIVE_BYTES) {
        throw Object.assign(new TypeError('Native Product archive is empty or oversized'), { details: { field: 'data' } });
    }
    return bytes;
}

function services() {
    const packageRepo = getPackageRepo();
    const worldRepo = getWorldRepo();
    const knowledgeRepo = getKnowledgeRepo();
    const sessionRepo = getSessionRepo();
    const savePointRepo = getSavePointRepo();
    const assetStore = getAssetStore();
    const packageInstaller = new PackageInstaller({ packageRepo, assetStore });
    const sessionCore = new SessionCore({
        sessionRepo,
        savePointRepo,
        packageInstaller,
        knowledgeRepo,
    });
    const saveSystem = new NativeSaveSystem({
        sessionCore,
        sessionRepo,
        savePointRepo,
        packageInstaller,
        assetStore,
        knowledgeRepo,
    });
    const projectStore = new ProjectStore({ directoriesByHandle: getUserDirectories });
    return {
        product: new NativeProductService({
            packageRepo,
            worldRepo,
            knowledgeRepo,
            sessionRepo,
            savePointRepo,
            packageInstaller,
            saveSystem,
            sessionCore,
            projectStore,
        }),
    };
}

export function createNativeProductRouter(getServices = services) {
    const router = express.Router();
    router.use((request, response, next) => {
        if (!request.user?.profile?.handle) return response.sendStatus(401);
        next();
    });

    const route = operation => async (request, response) => {
        try {
            await operation(
                request,
                response,
                getServices(),
                request.user.profile.handle,
            );
        } catch (error) {
            const status = error?.name === 'ConflictError' || String(error?.code || '').includes('conflict')
                || String(error?.code || '').includes('referenced')
                ? 409
                : error?.name === 'NotFoundError'
                    ? 404
                    : error instanceof TypeError
                        ? 400
                        : 500;
            response.status(status).json({
                error: error?.code || (
                    status === 400 ? 'native_product_invalid_request'
                        : status === 404 ? 'native_product_not_found'
                            : status === 409 ? 'native_product_conflict'
                                : 'native_product_failed'
                ),
                ...(error?.details === undefined && !error?.permissions ? {} : { details: sanitizeProductDetails(error.details || { permissions: error.permissions }) }),
            });
        }
    };

    router.get('/works', route(async (_req, res, { product }, handle) => {
        res.json(await product.listWorks(handle));
    }));
    router.get('/works/:packageId/regex', route(async (req, res, { product }, handle) => {
        res.json(await product.getPackageRegex(handle, req.params.packageId));
    }));
    router.put('/works/:packageId/regex', route(async (req, res, { product }, handle) => {
        res.json(await product.editPackageRegex(handle, req.params.packageId, req.body));
    }));
    router.get('/works/:packageId/knowledge/:knowledgeBaseId', route(async (req, res, { product }, handle) => {
        res.json(await product.getPackageKnowledge(handle, req.params.packageId, req.params.knowledgeBaseId));
    }));
    router.put('/works/:packageId/knowledge/:knowledgeBaseId', route(async (req, res, { product }, handle) => {
        res.json(await product.editPackageKnowledge(handle, req.params.packageId, req.params.knowledgeBaseId, req.body));
    }));
    router.get('/works/:packageId', route(async (req, res, { product }, handle) => {
        res.json(await product.getWork(handle, req.params.packageId));
    }));
    router.get('/works/:packageId/versions/:packageVersionId', route(async (req, res, { product }, handle) => {
        res.json(await product.getWorkVersion(handle, req.params.packageId, req.params.packageVersionId));
    }));
    router.post('/works/:packageId/start', route(async (req, res, { product }, handle) => {
        res.json(await product.startWork(handle, req.params.packageId, req.body || {}));
    }));
    router.delete('/works/:packageId', route(async (req, res, { product }, handle) => {
        res.json({ deleted: await product.deleteWork(handle, req.params.packageId) });
    }));

    router.post('/packages/preflight', route(async (req, res, { product }, handle) => {
        res.json(await product.preflightPackageUpdate(handle, decodeArchive(req.body?.data)));
    }));
    router.post('/packages/install', route(async (req, res, { product }, handle) => {
        res.json(await product.installPackage(handle, decodeArchive(req.body?.data), {
            grantedPermissions: req.body?.grantedPermissions || [],
            ...(req.body?.requiredPackage ? { requiredPackage: req.body.requiredPackage } : {}),
            ...(Object.hasOwn(req.body || {}, 'baseVersionId') ? { baseVersionId: req.body.baseVersionId } : {}),
        }));
    }));

    router.get('/worlds', route(async (_req, res, { product }, handle) => {
        res.json(await product.listWorlds(handle));
    }));
    for (const [path, kind] of [['worlds', 'world'], ['knowledge', 'knowledge']]) {
        router.post(`/${path}/:id/revision-actions/promote`, route(async (req, res, { product }, handle) => {
            res.json(await product.promoteLibraryRevision(handle, kind, req.params.id, req.body));
        }));
        router.post(`/${path}/:id/revision-actions/fork`, route(async (req, res, { product }, handle) => {
            res.status(201).json(await product.forkLibraryRevision(handle, kind, req.params.id, req.body));
        }));
    }
    router.post('/worlds', route(async (req, res, { product }, handle) => {
        res.json(await product.createWorld(handle, req.body || {}));
    }));
    router.get('/worlds/:worldId', route(async (req, res, { product }, handle) => {
        res.json(await product.getWorld(handle, req.params.worldId));
    }));
    router.post('/worlds/:worldId/revisions', route(async (req, res, { product }, handle) => {
        res.status(201).json(await product.commitWorldRevision(handle, req.params.worldId, req.body));
    }));
    router.put('/worlds/:worldId', route(async (req, res, { product }, handle) => {
        res.json(await product.updateWorld(handle, req.params.worldId, req.body || {}));
    }));
    router.delete('/worlds/:worldId', route(async (req, res, { product }, handle) => {
        res.json({ deleted: await product.deleteWorld(handle, req.params.worldId) });
    }));

    router.get('/knowledge-bindings/:id', route(async (req, res, { product }, handle) => {
        res.json(await product.getKnowledgeBinding(handle, req.params.id));
    }));
    router.put('/knowledge-bindings/:id', route(async (req, res, { product }, handle) => {
        res.json(await product.saveKnowledgeBinding(handle, req.params.id, req.body));
    }));
    router.delete('/knowledge-bindings/:id', route(async (req, res, { product }, handle) => {
        res.json({ deleted: await product.deleteKnowledgeBinding(handle, req.params.id, req.body) });
    }));
    router.post('/knowledge-bindings/:id/worlds/:worldId', route(async (req, res, { product }, handle) => {
        res.json(await product.attachKnowledgeBinding(handle, req.params.id, req.params.worldId, req.body));
    }));
    router.get('/knowledge', route(async (_req, res, { product }, handle) => {
        res.json(await product.listKnowledgeBases(handle));
    }));
    router.post('/knowledge', route(async (req, res, { product }, handle) => {
        res.json(await product.createKnowledgeBase(handle, req.body || {}));
    }));
    router.get('/knowledge/:knowledgeBaseId', route(async (req, res, { product }, handle) => {
        res.json(await product.getKnowledgeBase(handle, req.params.knowledgeBaseId, {
            revisionId: req.query.revisionId || null,
        }));
    }));
    router.post('/knowledge/:knowledgeBaseId/revisions', route(async (req, res, { product }, handle) => {
        res.status(201).json(await product.commitKnowledgeRevision(handle, req.params.knowledgeBaseId, req.body));
    }));
    router.put('/knowledge/:knowledgeBaseId', route(async (req, res, { product }, handle) => {
        res.json(await product.updateKnowledgeBase(handle, req.params.knowledgeBaseId, req.body || {}));
    }));
    router.delete('/knowledge/:knowledgeBaseId', route(async (req, res, { product }, handle) => {
        res.json({ deleted: await product.deleteKnowledgeBase(handle, req.params.knowledgeBaseId) });
    }));

    router.post('/saves/preflight', route(async (req, res, { product }, handle) => {
        res.json(await product.preflightSaveImport(handle, decodeArchive(req.body?.data)));
    }));
    router.post('/saves/import', route(async (req, res, { product }, handle) => {
        res.json(await product.importSave(handle, decodeArchive(req.body?.data), {
            ...(req.body?.password === undefined ? {} : { password: req.body.password }),
        }));
    }));

    router.get('/sessions/:sessionId/history', route(async (req, res, { product }, handle) => {
        res.json(await product.getSessionHistory(handle, req.params.sessionId));
    }));
    router.patch('/sessions/:sessionId', route(async (req, res, { product }, handle) => {
        res.json(await product.renameSession(handle, req.params.sessionId, req.body));
    }));
    router.get('/sessions', route(async (req, res, { product }, handle) => {
        res.json(await product.listSessions(handle, {
            packageId: req.query.packageId || null,
        }));
    }));
    router.get('/works/:packageId/resource-setup', route(async (req, res, { product }, handle) => {
        res.json(await product.getResourceSetup(handle, req.params.packageId, { sessionId: req.query.sessionId, entryPointId: req.query.entryPointId }));
    }));
    router.put('/works/:packageId/resource-setup', route(async (req, res, { product }, handle) => {
        res.json(await product.saveResourceSetup(handle, req.params.packageId, req.body, req.body.sessionId));
    }));
    router.get('/sessions/:sessionId', route(async (req, res, { product }, handle) => {
        res.json(await product.getSession(handle, req.params.sessionId));
    }));
    router.post('/sessions/:sessionId/export', route(async (req, res, { product }, handle) => {
        const archive = await product.exportSession(handle, req.params.sessionId, {
            ...(req.body?.password === undefined ? {} : { password: req.body.password }),
        });
        res.json({
            data: archive.toString('base64'),
            fileName: `${req.params.sessionId}.atriasave`,
            mediaType: 'application/octet-stream',
        });
    }));
    router.post('/sessions/:sessionId/saves/:saveId/export', route(async (req, res, { product }, handle) => {
        const archive = await product.exportSnapshot(handle, req.params.sessionId, req.params.saveId, {
            ...(req.body?.password === undefined ? {} : { password: req.body.password }),
        });
        res.json({
            data: archive.toString('base64'),
            fileName: `${req.params.saveId}.atriasave`,
            mediaType: 'application/octet-stream',
        });
    }));
    router.post('/sessions/:sessionId/save', route(async (req, res, { product }, handle) => {
        res.json(await product.createSave(handle, req.params.sessionId, req.body || {}));
    }));
    router.post('/sessions/:sessionId/load', route(async (req, res, { product }, handle) => {
        res.json(await product.restoreSave(
            handle,
            req.params.sessionId,
            req.body?.saveId,
            req.body?.expectedRevisionId,
        ));
    }));
    router.post('/sessions/:sessionId/promote-knowledge', route(async (req, res, { product }, handle) => {
        res.json(await product.promoteEmbeddedKnowledge(handle, req.params.sessionId, req.body || {}));
    }));
    router.delete('/sessions/:sessionId', route(async (req, res, { product }, handle) => {
        res.json({ deleted: await product.deleteSession(handle, req.params.sessionId) });
    }));

    router.get('/projects', route(async (_req, res, { product }, handle) => {
        res.json(await product.listProjects(handle));
    }));
    router.post('/projects', route(async (req, res, { product }, handle) => {
        res.json(await product.createProject(handle, req.body));
    }));
    router.get('/projects/:projectId', route(async (req, res, { product }, handle) => {
        res.json(await product.getProject(handle, req.params.projectId));
    }));
    router.put('/projects/:projectId/dependencies', route(async (req, res, { product }, handle) => {
        res.json(await product.updateProjectDependencies(
            handle,
            req.params.projectId,
            req.body?.dependencies,
        ));
    }));
    router.delete('/projects/:projectId', route(async (req, res, { product }, handle) => {
        res.json({ deleted: await product.deleteProject(handle, req.params.projectId) });
    }));

    return router;
}

export const router = createNativeProductRouter();
