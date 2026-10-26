import { getSettingsRepo } from '../storage/index.js';
import { captureLocalPersonaSource } from '../native/persona-local-source.js';
import { personaFields } from '../native/persona-contract.js';
import { getPersonaRepo } from '../storage/index.js';
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
import { nativeMcpArtifacts, artifactRefFromQuery } from '../native/mcp-artifacts.js';
import { mountNativeSessionArchives } from './native-session-archives.js';
import { PACKAGE_LIMITS } from '../../public/shared/native-package-limits.js';
import { isFilePayload, stageFilePayload } from '../native/file-payload.js';
import { deliverAssetResponse } from '../native/asset-delivery.js';

const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const packageBinary = async (req, res, next) => {
    if (!req.is('application/octet-stream')) return next();
    if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') return res.sendStatus(415);
    if (Number(req.headers['content-length']) > PACKAGE_LIMITS.archiveBytes) return res.sendStatus(413);
    try { req.body = await stageFilePayload(req, PACKAGE_LIMITS.archiveBytes); next(); } catch (error) { next(error); }
};

function packageOptions(req) {
    if (!Buffer.isBuffer(req.body) && !isFilePayload(req.body)) return req.body;
    const header = req.get('X-Atria-Package-Options') || '';
    if (header.length > 8192) throw new TypeError('Package options exceed budget');
    let options;
    try { options = header ? JSON.parse(decodeURIComponent(header)) : {}; } catch { throw new TypeError('Invalid Package options'); }
    if (!options || Array.isArray(options) || typeof options !== 'object' || Object.keys(options).some(key => !['grantedPermissions', 'baseVersionId', 'requiredPackage'].includes(key))) throw new TypeError('Invalid Package options');
    return options;
}

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
        personaRepo: getPersonaRepo(),
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
    const lifecycle = async (...args) => (await import('../storage/center-instance.js')).recycleNativeResource(...args);
    return {
        lifecycle,
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
            lifecycle,
        }),
    };
}

export function createNativeProductRouter(getServices = services, artifacts = nativeMcpArtifacts) {
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
            if (response.headersSent) { response.destroy(error); return; }
            const status = error?.code === 'storage_quota_exceeded' ? 413 : error?.code === 'storage_usage_unavailable' ? 503 : error?.code === 'native_persona_scope_denied' ? 403 : error?.code === 'native_persona_unavailable' ? 404 : error?.code === 'storage_read_only' ? 503 : error?.name === 'ConflictError' || String(error?.code || '').includes('conflict')
                || String(error?.code || '').includes('referenced')
                ? 409
                : error?.name === 'NotFoundError'
                    ? 404
                    : error instanceof RangeError ? 413 : error instanceof TypeError
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
        } finally { if (isFilePayload(request.body)) await request.body.close(); }
    };

    for (const command of ['preflight', 'apply']) router.post('/personas/migration/local/' + command, route(async (req, res, service, handle) => {
        personaFields(req.body, command === 'preflight' ? ['convertUser'] : ['convertUser', 'planDigest', 'expectedFingerprint']);
        const record = await (service.settings ?? getSettingsRepo()).get(handle);
        const source = await captureLocalPersonaSource(record?.doc ?? record, req.user.directories ?? getUserDirectories(handle));
        const input = { ...source, ...req.body };
        const repo = service.personas ?? getPersonaRepo();
        res.json(await (command === 'preflight' ? repo.migrationPreflight(handle, input) : repo.migrationApply(handle, input)));
    }));
    const personaMethods = { list: 'list', get: 'get', revisions: 'revisions', create: 'create', revise: 'revise', archive: 'archive',
        'migration/preflight': 'migrationPreflight', 'migration/apply': 'migrationApply', 'migration/receipt': 'migrationReceipt', 'migration/adopt-default': 'migrationAdoptDefault',
        'default/read': 'readDefault', 'default/set': 'setDefault', 'used-by': 'usedBy', delete: 'delete', avatar: 'avatar' };
    for (const [command, method] of Object.entries(personaMethods)) router.post('/personas/' + command, route(async (req, res, service, handle) => {
        if (command === 'delete' && service.lifecycle) {
            personaFields(req.body, ['personaId', 'expectedFingerprint']);
            if (!/^[a-f0-9]{64}$/.test(req.body.expectedFingerprint)) throw new TypeError('Persona fingerprint required');
            return res.json({ deleted: await service.lifecycle(handle, { type: 'persona', id: req.body.personaId }, req.body) });
        }
        res.json(await (service.personas ?? getPersonaRepo())[method](handle, req.body));
    }));
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
    router.get('/works/:packageId/versions/:packageVersionId/identity', route(async (req, res, { product }, handle) => {
        res.set('Cache-Control', 'private, no-store').json(await product.getWorkVersionIdentity(handle, req.params.packageId, req.params.packageVersionId));
    }));
    router.post('/works/:packageId/start', route(async (req, res, { product }, handle) => {
        res.json(await product.startWork(handle, req.params.packageId, req.body || {}));
    }));
    router.delete('/works/:packageId', route(async (req, res, { product }, handle) => {
        res.json({ deleted: await product.deleteWork(handle, req.params.packageId, { baseVersionId: req.body?.baseVersionId }) });
    }));

    router.post('/artifacts/staging', route(async (req, res, _service, handle) => {
        res.set('Cache-Control', 'private, no-store').json(artifacts.begin(handle, req.body));
    }));
    router.put('/artifacts/:artifactId/chunk', express.raw({ type: 'application/octet-stream', limit: '1mb' }), route(async (req, res, _service, handle) => {
        res.set('Cache-Control', 'private, no-store').json(artifacts.write(handle, artifactRefFromQuery(req), Number(req.query.offset), req.body, req.headers['x-atria-chunk-sha256']));
    }));
    router.post('/artifacts/:artifactId/finalize', route(async (req, res, _service, handle) => {
        if (req.body?.artifactRef?.artifactId !== req.params.artifactId) throw new TypeError('Artifact reference mismatch');
        res.set('Cache-Control', 'private, no-store').json(artifacts.finalize(handle, req.body.artifactRef));
    }));
    router.get('/artifacts/:artifactId/chunk', route(async (req, res, _service, handle) => {
        const result = artifacts.readChunk(handle, artifactRefFromQuery(req), Number(req.query.offset), Number(req.query.length));
        res.status(206).set({ 'Cache-Control': 'private, no-store', 'Content-Type': 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff', 'Content-Length': String(result.bytes.length), 'X-Atria-Chunk-Sha256': result.contentHash,
            'ETag': '"' + req.query.contentHash + '"', 'Content-Range': `bytes ${result.offset}-${result.offset + result.bytes.length - 1}/${result.totalBytes}` }).send(result.bytes);
    }));
    router.delete('/artifacts/:artifactId', route(async (req, res, _service, handle) => {
        if (req.body?.artifactRef?.artifactId !== req.params.artifactId) throw new TypeError('Artifact reference mismatch');
        res.json(artifacts.cancel(handle, req.body.artifactRef));
    }));
    const withArchive = (handle, body, consume) => {
        if (Buffer.isBuffer(body) || isFilePayload(body)) {
            if (!body.length || body.length > PACKAGE_LIMITS.archiveBytes) throw new TypeError('Package archive is empty or oversized');
            return consume(body);
        }
        if (body?.artifactRef) {
            if (body.data !== undefined) throw new TypeError('Choose one archive source');
            if (!['development-upload', 'studio-project', 'installed-package'].includes(artifacts.inspect(handle, body.artifactRef).source.kind)) throw new TypeError('Package artifact purpose required');
            return artifacts.withBytes(handle, body.artifactRef, consume);
        }
        return consume(decodeArchive(body?.data));
    };
    router.post('/packages/preflight', packageBinary, route(async (req, res, { product }, handle) => {
        res.json(await withArchive(handle, req.body, archive => product.preflightPackageUpdate(handle, archive)));
    }));
    router.post('/packages/export-artifact', route(async (req, res, { product }, handle) => {
        if (!req.body || Object.keys(req.body).sort().join(',') !== ['clientInstanceId', 'expectedContentHash', 'packageId', 'packageVersionId'].sort().join(',')) throw new TypeError('Exact Package export source required');
        const { clientInstanceId, packageId, packageVersionId, expectedContentHash } = req.body;
        const opened = await product.exportPackageArchive(handle, packageId, packageVersionId, expectedContentHash);
        res.set('Cache-Control', 'private, no-store').json(artifacts.capturePackage(handle, clientInstanceId, packageId, packageVersionId, expectedContentHash, opened.archive));
    }));
    router.get('/packages/:packageId/versions/:packageVersionId/archive', route(async (req, res, { product }, handle) => {
        await product.withPackageArchive(handle, req.params.packageId, req.params.packageVersionId, req.query.contentHash, async archive => {
            res.set('Content-Disposition', 'attachment; filename="' + req.params.packageVersionId + '.atria"');
            await deliverAssetResponse(req, res, { ref: { size: archive.length, contentHash: archive.contentHash, mediaType: 'application/octet-stream' },
                stream: (start, end) => archive.stream(start, end), close: async () => {} });
        });
    }));
    router.post('/packages/install', packageBinary, route(async (req, res, { product }, handle) => {
        const options = packageOptions(req);
        if (options?.artifactRef && !Object.hasOwn(options, 'baseVersionId')) throw new TypeError('Staged install requires exact baseVersionId');
        res.json(await withArchive(handle, req.body, archive => product.installPackage(handle, archive, {
            grantedPermissions: options?.grantedPermissions || [],
            ...(options?.requiredPackage ? { requiredPackage: options.requiredPackage } : {}),
            ...(Object.hasOwn(options || {}, 'baseVersionId') ? { baseVersionId: options.baseVersionId } : {}),
        })));
    }));
    router.post('/community/install', route(async (req, res, { product }, handle) => {
        res.json(await product.installCommunity(handle, req.body.base, decodeArchive(req.body.data)));
    }));
    router.post('/packages/compose', route(async (req, res, { product }, handle) => {
        res.json(await product.composePackage(handle, req.body.base, req.body.resources, { grantedPermissions: req.body.grantedPermissions || [] }));
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

    mountNativeSessionArchives(router, route, artifacts);
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
    router.get('/works/:packageId/resource-setup/observe', route(async (req, res, { product }, handle) => {
        res.set('Cache-Control', 'private, no-store').json(await product.getResourceSetup(handle, req.params.packageId, { sessionId: req.query.sessionId, entryPointId: req.query.entryPointId, observe: true }));
    }));
    router.put('/works/:packageId/resource-setup', route(async (req, res, { product }, handle) => {
        res.json(await product.saveResourceSetup(handle, req.params.packageId, req.body, req.body.sessionId));
    }));
    router.get('/sessions/:sessionId', route(async (req, res, { product }, handle) => {
        res.json(await product.getSession(handle, req.params.sessionId));
    }));
    router.get('/sessions/:sessionId/observe', route(async (req, res, { product }, handle) => {
        res.set('Cache-Control', 'private, no-store').json(await product.observeSession(handle, req.params.sessionId));
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
        res.json({ deleted: await product.deleteSession(handle, req.params.sessionId, { expectedRevisionId: req.body?.expectedRevisionId }) });
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
