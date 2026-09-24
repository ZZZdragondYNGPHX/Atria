import express from 'express';

import { getUserDirectories } from '../users.js';
import {
    getAssetStore,
    getKnowledgeRepo,
    getPackageRepo,
    getStorageEngine,
    getWorldRepo,
} from '../storage/index.js';
import { ProjectStore } from '../native/project-store.js';
import { VersionedJsonResourceHandler } from '../native/model-prompt-runtime/persistence.js';
import { StudioService } from '../native/authoring/studio-service.js';
import { ProjectAgentService } from '../native/project-agent.js';

let studioService = null;
let projectAgentService = null;

function services() {
    if (!studioService) {
        studioService = new StudioService({
            projectStore: new ProjectStore({ directoriesByHandle: getUserDirectories }),
            worldRepo: getWorldRepo(),
            knowledgeRepo: getKnowledgeRepo(),
            assetStore: getAssetStore(),
            packageRepo: getPackageRepo(),
            versionedJsonResources: new VersionedJsonResourceHandler({
                engine: getStorageEngine(),
            }),
        });
        projectAgentService = new ProjectAgentService({ studio: studioService });
    }
    return { studio: studioService, agent: projectAgentService };
}

function decodeProjectFiles(value) {
    if (value == null) return new Map();
    if (!Array.isArray(value)) throw new TypeError('Native Studio project files must be an array');
    return new Map(value.map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new TypeError(`Native Studio project files[${index}] must be an object`);
        }
        if (typeof item.path !== 'string' || !item.path) {
            throw new TypeError(`Native Studio project files[${index}].path is required`);
        }
        const encoding = item.encoding == null ? 'utf8' : String(item.encoding);
        if (encoding !== 'utf8' && encoding !== 'base64') {
            throw new TypeError(`Native Studio project files[${index}].encoding is unsupported`);
        }
        if (typeof item.content !== 'string') {
            throw new TypeError(`Native Studio project files[${index}].content must be a string`);
        }
        const bytes = encoding === 'base64'
            ? Buffer.from(item.content, 'base64')
            : Buffer.from(item.content, 'utf8');
        return [item.path, bytes];
    }));
}

function workspaceFromBody(studio, projectId, body = {}) {
    return studio.createWorkspace({
        projectId,
        baseRevision: body.baseRevision,
        origin: body.origin,
        operations: body.operations,
        ...(body.workspaceId == null ? {} : { workspaceId: body.workspaceId }),
    });
}

export function createNativeStudioRouter(getServices = services) {
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
            const status = error?.name === 'ConflictError'
                || String(error?.code || '').includes('conflict')
                || String(error?.code || '').includes('referenced')
                || String(error?.code || '').includes('target_exists')
                ? 409
                : error?.name === 'NotFoundError'
                    ? 404
                    : error instanceof TypeError
                        ? 400
                        : 500;
            response.status(status).json({
                error: error?.code || (
                    status === 400 ? 'native_studio_invalid_request'
                        : status === 404 ? 'native_studio_not_found'
                            : status === 409 ? 'native_studio_conflict'
                                : 'native_studio_failed'
                ),
                ...(error?.details === undefined ? {} : { details: error.details }),
            });
        }
    };

    router.post('/resources/bundle/export', route(async (req, res, { studio }, handle) => {
        res.json(await studio.exportResourceBundle(handle, req.body?.ref));
    }));
    router.post('/resources/bundle/preflight', route(async (req, res, { studio }, handle) => {
        res.json(await studio.preflightResourceBundle(handle, req.body?.bundle, req.body?.token));
    }));
    router.post('/resources/bundle/import', route(async (req, res, { studio }, handle) => {
        res.json(await studio.importResourceBundle(handle, req.body?.bundle, req.body?.token));
    }));

    router.get('/resources/registry', route(async (_req, res, { studio }) => {
        res.json(studio.getResourceRegistry());
    }));

    router.get('/library/resources', route(async (req, res, { studio }, handle) => {
        res.json(await studio.listLibraryResources(handle, {
            ...(req.query.resourceType == null ? {} : { resourceType: req.query.resourceType }),
            ...(req.query.search == null ? {} : { search: req.query.search }),
        }));
    }));

    router.get('/resources/graph', route(async (_req, res, { studio }, handle) => {
        res.json(await studio.getResourceGraph(handle));
    }));

    router.get('/resources', route(async (req, res, { studio }, handle) => {
        res.json(await studio.queryResources(handle, {
            ...(req.query.resourceType == null ? {} : { resourceType: req.query.resourceType }),
            ...(req.query.projectId == null ? {} : { projectId: req.query.projectId }),
            ...(req.query.ownership == null ? {} : { ownership: req.query.ownership }),
            ...(req.query.search == null ? {} : { search: req.query.search }),
        }));
    }));

    router.post('/resources/references', route(async (req, res, { studio }, handle) => {
        const body = req.body || {};
        res.json(await studio.getResourceReferences(handle, {
            resourceType: body.resourceType,
            resourceId: body.resourceId,
            ...(body.revision == null ? {} : { revision: body.revision }),
            ...Object.fromEntries(['scope', 'projectId', 'packageId', 'packageVersionId'].filter(key => body[key] != null).map(key => [key, body[key]])),
        }, { reverse: body.reverse === true }));
    }));

    router.post('/resources/delete-safety', route(async (req, res, { studio }, handle) => {
        const body = req.body || {};
        res.json(await studio.inspectResourceDelete(handle, {
            resourceType: body.resourceType,
            resourceId: body.resourceId,
            ...(body.revision == null ? {} : { revision: body.revision }),
            ...Object.fromEntries(['scope', 'projectId', 'packageId', 'packageVersionId'].filter(key => body[key] != null).map(key => [key, body[key]])),
        }));
    }));

    router.get('/projects', route(async (_req, res, { studio }, handle) => {
        res.json(await studio.listProjects(handle));
    }));

    router.post('/projects', route(async (req, res, { studio }, handle) => {
        if (!req.body?.source) throw new TypeError('Native Studio project source is required');
        res.json(await studio.createProject(handle, req.body.source, {
            files: decodeProjectFiles(req.body.files),
        }));
    }));

    router.get('/projects/:projectId', route(async (req, res, { studio }, handle) => {
        res.json(await studio.getProject(handle, req.params.projectId));
    }));

    router.delete('/projects/:projectId', route(async (req, res, { studio }, handle) => {
        res.json({
            deleted: await studio.deleteProject(
                handle,
                req.params.projectId,
                req.body?.baseRevision,
            ),
        });
    }));

    router.get('/projects/:projectId/revision', route(async (req, res, { studio }, handle) => {
        res.json(await studio.getRevision(handle, req.params.projectId));
    }));

    router.get('/projects/:projectId/sources', route(async (req, res, { studio }, handle) => {
        res.json(await studio.listSources(handle, req.params.projectId));
    }));

    router.get('/projects/:projectId/source', route(async (req, res, { studio }, handle) => {
        res.json(await studio.readSource(handle, req.params.projectId, req.query.path));
    }));

    router.put('/projects/:projectId/source', route(async (req, res, { studio }, handle) => {
        res.json(await studio.writeSource(handle, req.params.projectId, req.body || {}));
    }));

    router.post('/projects/:projectId/source/move', route(async (req, res, { studio }, handle) => {
        res.json(await studio.moveSource(handle, req.params.projectId, req.body || {}));
    }));

    router.delete('/projects/:projectId/source', route(async (req, res, { studio }, handle) => {
        res.json(await studio.deleteSource(handle, req.params.projectId, req.body || {}));
    }));

    router.put('/projects/:projectId/manifest', route(async (req, res, { studio }, handle) => {
        res.json(await studio.saveProjectSource(handle, req.params.projectId, req.body || {}));
    }));

    router.post('/projects/:projectId/operations/prepare', route(async (req, res, { studio }, handle) => {
        res.json(await studio.prepareAuthoringOperation(handle, req.params.projectId, req.body));
    }));
    router.post('/projects/:projectId/workspaces/inspect', route(async (req, res, { studio }, handle) => {
        const workspace = workspaceFromBody(studio, req.params.projectId, req.body || {});
        res.json(await studio.inspectWorkspace(handle, workspace));
    }));

    router.post('/projects/:projectId/workspaces/execute', route(async (req, res, { studio }, handle) => {
        const workspace = workspaceFromBody(studio, req.params.projectId, req.body || {});
        res.json(await studio.executeWorkspace(handle, workspace));
    }));

    router.get('/projects/:projectId/agent/tasks', route(async (req, res, { agent }, handle) => {
        res.json(agent.listTasks(handle, req.params.projectId));
    }));

    router.post('/projects/:projectId/agent/tasks', route(async (req, res, { agent }, handle) => {
        res.json(await agent.createTask(handle, req.params.projectId, req.body || {}));
    }));

    router.get('/projects/:projectId/agent/tasks/:taskId', route(async (req, res, { agent }, handle) => {
        res.json(agent.getTask(handle, req.params.projectId, req.params.taskId));
    }));

    router.get('/projects/:projectId/agent/tasks/:taskId/context', route(async (req, res, { agent }, handle) => {
        res.json(await agent.getContext(handle, req.params.projectId, req.params.taskId));
    }));

    router.post('/projects/:projectId/agent/tasks/:taskId/tool', route(async (req, res, { agent }, handle) => {
        res.json(await agent.executeTool(
            handle,
            req.params.projectId,
            req.params.taskId,
            req.body || {},
        ));
    }));

    router.post('/projects/:projectId/agent/tasks/:taskId/commit', route(async (req, res, { agent }, handle) => {
        res.json(await agent.commit(handle, req.params.projectId, req.params.taskId));
    }));

    router.post('/projects/:projectId/agent/tasks/:taskId/takeover', route(async (req, res, { agent }, handle) => {
        res.json(agent.takeOver(handle, req.params.projectId, req.params.taskId));
    }));

    router.get('/projects/:projectId/resources/closure', route(async (req, res, { studio }, handle) => {
        res.json(await studio.resolveResourceClosure(handle, req.params.projectId));
    }));

    router.post('/projects/:projectId/resources/attach', route(async (req, res, { studio }, handle) => {
        res.json(await studio.attachLibraryResource(handle, req.params.projectId, req.body || {}));
    }));

    router.post('/projects/:projectId/resources/fork', route(async (req, res, { studio }, handle) => {
        res.json(await studio.forkLibraryResource(handle, req.params.projectId, req.body || {}));
    }));

    router.post('/projects/:projectId/resources/update', route(async (req, res, { studio }, handle) => {
        res.json(await studio.updateLibraryResource(handle, req.params.projectId, req.body || {}));
    }));

    router.post('/projects/:projectId/validate', route(async (req, res, { studio }, handle) => {
        res.json(await studio.validateProject(handle, req.params.projectId));
    }));

    router.get('/projects/:projectId/history', route(async (req, res, { studio }, handle) => {
        const limit = req.query.limit == null ? 50 : Number(req.query.limit);
        res.json(await studio.history(handle, req.params.projectId, { limit }));
    }));

    router.get('/projects/:projectId/history/:revision/diff', route(async (req, res, { studio }, handle) => {
        res.json(await studio.diff(handle, req.params.projectId, req.params.revision));
    }));

    router.post('/projects/:projectId/preflight', route(async (req, res, { studio }, handle) => {
        res.json(await studio.preflightProject(handle, req.params.projectId, req.body || {}));
    }));

    router.post('/projects/:projectId/build', route(async (req, res, { studio }, handle) => {
        const result = await studio.buildProject(handle, req.params.projectId, req.body || {});
        res.json({
            projectId: req.params.projectId,
            revision: result.revision,
            manifest: result.built.manifest,
            packageVersion: result.built.packageVersion,
            preflight: result.built.preflight,
            data: result.built.archive.toString('base64'),
            fileName: `${req.params.projectId}.atria`,
            mediaType: 'application/octet-stream',
        });
    }));

    router.post('/projects/:projectId/preview', route(async (req, res, { studio }, handle) => {
        res.json(await studio.previewProject(handle, req.params.projectId, req.body || {}));
    }));

    router.post('/projects/:projectId/simulate', route(async (req, res, { studio }, handle) => {
        res.json(await studio.simulateProject(handle, req.params.projectId, req.body || {}));
    }));

    router.get('/previews', route(async (req, res, { studio }, handle) => {
        res.json(studio.listPreviews(handle, req.query.projectId || null));
    }));

    router.delete('/previews/:previewId', route(async (req, res, { studio }, handle) => {
        res.json({ closed: studio.closePreview(handle, req.params.previewId) });
    }));

    return router;
}

export const router = createNativeStudioRouter();
export { services as getNativeStudioServices };
