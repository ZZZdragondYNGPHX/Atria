import express from 'express';
import { createHash } from 'node:crypto';
import { SessionCore } from '../native/session-core.js';
import { PackageInstaller } from '../native/package-composition.js';
import { NativeSaveSystem } from '../native/save-system.js';
import { ProjectStore } from '../native/project-store.js';
import { NativeProductUiService } from '../native/product-ui-service.js';
import { createNativeId, assertNativeId } from '../native/identity.js';
import { getSessionRepo, getSavePointRepo, getPackageRepo, getAssetStore, getKnowledgeRepo, getWorldRepo } from '../storage/index.js';
import { getUserDirectories } from '../users.js';

function services() {
    const assets = getAssetStore();
    const sessionRepo = getSessionRepo();
    const savePointRepo = getSavePointRepo();
    const packageRepo = getPackageRepo();
    const knowledgeRepo = getKnowledgeRepo();
    const packageInstaller = new PackageInstaller({ packageRepo, assetStore: assets });
    const core = new SessionCore({
        sessionRepo,
        savePointRepo,
        packageInstaller,
        knowledgeRepo,
    });
    const saveSystem = new NativeSaveSystem({
        sessionCore: core,
        sessionRepo,
        savePointRepo,
        packageInstaller,
        assetStore: assets,
        knowledgeRepo,
    });
    const product = new NativeProductUiService({
        packageRepo,
        worldRepo: getWorldRepo(),
        knowledgeRepo,
        sessionRepo,
        savePointRepo,
        packageInstaller,
        saveSystem,
        sessionCore: core,
        projectStore: new ProjectStore({ directoriesByHandle: getUserDirectories }),
    });
    return { core, assets, sessionRepo, product };
}

/** Authenticated handle is server-owned. No arbitrary repo method dispatch or legacy fallback. */
export function createNativeSessionRouter(getServices = services) {
    const router = express.Router();
    router.use((request, response, next) => {
        if (!request.user?.profile?.handle) return response.sendStatus(401);
        next();
    });
    const route = operation => async (request, response) => {
        try {
            await operation(request, response, getServices(), request.user.profile.handle);
        } catch (error) {
            const status = error.code?.includes('conflict') ? 409
                : error instanceof TypeError ? 400 : error.name === 'NotFoundError' ? 404 : 500;
            response.status(status).json({
                error: error.code || (status === 400 ? 'native_invalid_command' : 'native_session_failed'),
                ...(error.details === undefined ? {} : { details: error.details }),
                ...(error.permissions === undefined ? {} : { permissions: error.permissions }),
            });
        }
    };
    router.post('/create', route(async (req, res, { core }, handle) => {
        res.json(await core.create(handle, req.body));
    }));
    router.post('/load', route(async (req, res, { core }, handle) => {
        res.json(await core.load(handle, req.body.sessionId, { revisionId: req.body.revisionId }));
    }));
    router.post('/command', route(async (req, res, { core, assets }, handle) => {
        const { sessionId, expectedRevisionId, command } = req.body;
        // Runtime writes must name their projected revision. Never silently rebase a stale client.
        assertNativeId(expectedRevisionId, 'revision');
        if (command?.type === 'timeline' || command?.type === 'runtime') {
            const commands = command?.type === 'timeline' ? command.commands : (command.commands ?? []);
            if (!Array.isArray(commands) || commands.some(item => item?.type !== 'append' || item.beforeMessageId !== undefined)) {
                throw new TypeError('Native runtime Timeline commands are append-only');
            }
            for (const item of commands) {
                for (const attachment of item.draft?.metadata?.attachments ?? []) {
                    assertNativeId(attachment.assetId, 'asset');
                    if (!await assets.getRef(handle, attachment.assetId)) throw new TypeError('Missing Native attachment');
                }
            }
            if (command?.type === 'runtime') {
                res.json(await core.applyRuntimeCommit(handle, sessionId, {
                    commands,
                    statePatch: command.statePatch ?? {},
                    deleteNamespaces: command.deleteNamespaces ?? [],
                }, { expectedRevisionId }));
            } else {
                res.json(await core.applyTimelineCommands(handle, sessionId, commands, { expectedRevisionId }));
            }
        } else if (command?.type === 'restore') {
            if (typeof command.saveId !== 'string') throw new TypeError('Native restore requires saveId');
            res.json(await core.restoreSavePoint(handle, sessionId, command.saveId, { expectedRevisionId }));
        } else if (command?.type === 'fork') {
            res.json(await core.forkBranch(handle, sessionId, { ...command, expectedRevisionId }));
        } else if (command?.type === 'retry') {
            res.json(await core.retryReply(handle, sessionId, {
                messageId: command.messageId,
                expectedRevisionId,
            }));
        } else if (command?.type === 'switch') {
            res.json(await core.switchBranch(handle, sessionId, command.branchId, { expectedRevisionId }));
        } else throw new TypeError('Unsupported Native runtime command');
    }));
    router.post('/timeline', route(async (req, res, { sessionRepo }, handle) => {
        if (!sessionRepo) throw new TypeError('Native SessionRepo timeline reader is unavailable');
        const {
            sessionId,
            revisionId = null,
            messageIds,
            fromSequence = 0,
            toSequence = null,
            limit = 256,
        } = req.body ?? {};
        if (typeof sessionId !== 'string' || !sessionId) throw new TypeError('Native Timeline read requires sessionId');
        if (revisionId !== null) assertNativeId(revisionId, 'revision');
        if (messageIds !== undefined) {
            res.json(await sessionRepo.readTimelineByMessageIds(handle, sessionId, messageIds, { revisionId }));
            return;
        }
        res.json(await sessionRepo.readTimelineRange(handle, sessionId, {
            revisionId,
            fromSequence,
            toSequence,
            limit,
        }));
    }));
    // N9 Product UI routes are a thin projection over Native authorities.
    router.get('/product/library', route(async (_req, res, { product }, handle) => {
        res.json(await product.librarySnapshot(handle));
    }));
    router.post('/product/work/detail', route(async (req, res, { product }, handle) => {
        res.json(await product.getWork(handle, req.body.packageId));
    }));
    router.post('/product/world/detail', route(async (req, res, { product }, handle) => {
        res.json(await product.getWorld(handle, req.body.worldId));
    }));
    router.post('/product/world/create', route(async (req, res, { product }, handle) => {
        res.json(await product.createWorld(handle, req.body));
    }));
    router.post('/product/world/delete', route(async (req, res, { product }, handle) => {
        res.json({ deleted: await product.deleteWorld(handle, req.body.worldId) });
    }));
    router.post('/product/knowledge/detail', route(async (req, res, { product }, handle) => {
        res.json(await product.getKnowledgeBase(handle, req.body.knowledgeBaseId));
    }));
    router.post('/product/knowledge/create', route(async (req, res, { product }, handle) => {
        res.json(await product.createKnowledgeBase(handle, req.body));
    }));
    router.post('/product/knowledge/delete', route(async (req, res, { product }, handle) => {
        res.json({ deleted: await product.deleteKnowledgeBase(handle, req.body.knowledgeBaseId) });
    }));
    router.post('/product/session/list', route(async (req, res, { product }, handle) => {
        res.json(await product.listSessions(handle, req.body ?? {}));
    }));
    router.post('/product/session/detail', route(async (req, res, { product }, handle) => {
        res.json(await product.getSession(handle, req.body.sessionId));
    }));
    router.post('/product/session/start', route(async (req, res, { product }, handle) => {
        res.json(await product.startSession(handle, req.body));
    }));
    router.post('/product/session/continue', route(async (req, res, { product }, handle) => {
        res.json(await product.continueSession(handle, req.body.sessionId));
    }));
    router.post('/product/session/delete', route(async (req, res, { product }, handle) => {
        res.json({ deleted: await product.deleteSession(handle, req.body.sessionId) });
    }));
    router.post('/product/save', route(async (req, res, { product }, handle) => {
        res.json(await product.saveSession(handle, req.body.sessionId, req.body));
    }));
    router.post('/product/save/load', route(async (req, res, { product }, handle) => {
        res.json(await product.loadSave(
            handle,
            req.body.sessionId,
            req.body.saveId,
            req.body.expectedRevisionId,
        ));
    }));
    router.post('/product/save/export', route(async (req, res, { product }, handle) => {
        res.json(await product.exportSave(handle, req.body.sessionId, req.body));
    }));
    router.post('/product/save/import-preflight', route(async (req, res, { product }, handle) => {
        res.json(await product.preflightSaveImport(handle, req.body.archiveBase64));
    }));
    router.post('/product/save/import', route(async (req, res, { product }, handle) => {
        res.json(await product.importSave(handle, req.body.archiveBase64, req.body));
    }));
    router.post('/product/knowledge/promote', route(async (req, res, { product }, handle) => {
        res.json(await product.promoteEmbeddedKnowledge(handle, req.body.sessionId, req.body));
    }));
    router.post('/product/package/preflight', route(async (req, res, { product }, handle) => {
        res.json(await product.preflightPackage(handle, req.body.archiveBase64));
    }));
    router.post('/product/package/install', route(async (req, res, { product }, handle) => {
        res.json(await product.installPackage(handle, req.body.archiveBase64, req.body));
    }));
    router.post('/product/package/delete', route(async (req, res, { product }, handle) => {
        res.json({ deleted: await product.deletePackage(handle, req.body.packageId) });
    }));
    router.get('/product/projects', route(async (_req, res, { product }, handle) => {
        res.json(await product.listProjects(handle));
    }));
    router.post('/product/project/detail', route(async (req, res, { product }, handle) => {
        res.json(await product.getProject(handle, req.body.projectId));
    }));
    router.post('/product/project/dependencies', route(async (req, res, { product }, handle) => {
        res.json(await product.updateProjectDependencies(handle, req.body.projectId, req.body.dependencies));
    }));
    router.post('/product/project/delete', route(async (req, res, { product }, handle) => {
        res.json({ deleted: await product.deleteProject(handle, req.body.projectId) });
    }));

    router.post('/attachment', route(async (req, res, { core, assets }, handle) => {
        const { sessionId, data, mediaType = 'application/octet-stream', displayName = 'Attachment' } = req.body;
        await core.load(handle, sessionId);
        if (typeof data !== 'string' || data.length > 24 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
            throw new TypeError('Invalid or oversized Native attachment');
        }
        const bytes = Buffer.from(data, 'base64');
        const ref = { assetId: createNativeId('asset'), contentHash: createHash('sha256').update(bytes).digest('hex'),
            size: bytes.length, mediaType, logicalName: displayName };
        // Immutable upload; the explicit Timeline command attaches the ref. Unattached uploads are not Session progress.
        res.json(await assets.put(handle, ref, bytes));
    }));
    router.get('/asset/:assetId', route(async (req, res, { assets }, handle) => {
        assertNativeId(req.params.assetId, 'asset');
        const asset = await assets.read(handle, req.params.assetId);
        if (!asset) return res.sendStatus(404);
        // Never execute uploaded HTML/SVG/scripts in the application origin.
        const mediaType = /^(image\/(png|jpeg|gif|webp|avif)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|text\/plain)$/.test(asset.ref.mediaType)
            ? asset.ref.mediaType : 'application/octet-stream';
        res.set({ 'Content-Type': mediaType, 'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': 'sandbox; default-src \'none\'', 'Cache-Control': 'private, max-age=3600' });
        res.send(asset.bytes);
    }));
    return router;
}

export const router = createNativeSessionRouter();
