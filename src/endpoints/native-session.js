import express from 'express';
import { createHash } from 'node:crypto';
import { SessionCore } from '../native/session-core.js';
import { PackageInstaller } from '../native/package-composition.js';
import { createNativeId, assertNativeId } from '../native/identity.js';
import { resolveNativeRuntimePackage } from '../native/runtime-descriptor.js';
import { getSessionRepo, getSavePointRepo, getPackageRepo, getAssetStore, getKnowledgeRepo } from '../storage/index.js';

function services() {
    const assets = getAssetStore();
    const sessionRepo = getSessionRepo();
    const packageInstaller = new PackageInstaller({ packageRepo: getPackageRepo(), assetStore: assets });
    const core = new SessionCore({ sessionRepo, savePointRepo: getSavePointRepo(),
        packageInstaller,
        knowledgeRepo: getKnowledgeRepo() });
    return { core, assets, sessionRepo, packageInstaller };
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
            response.status(status).json({ error: error.code || (status === 400 ? 'native_invalid_command' : 'native_session_failed') });
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
            if (command.variantId !== undefined || command.swipeId !== undefined) {
                throw new TypeError('Native Branch cannot select a committed Variant');
            }
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
    router.post('/runtime/resolve', route(async (req, res, { core, packageInstaller }, handle) => {
        const snapshot = await core.load(handle, req.body?.sessionId);
        const opened = await packageInstaller.open(
            handle,
            snapshot.session.packageId,
            snapshot.session.packageVersionId,
        );
        if (!opened) throw new TypeError('Native Runtime PackageVersion is unavailable');
        if (opened.packageVersion.packageContentHash !== snapshot.session.packageContentHash) {
            throw new TypeError('Native Runtime PackageVersion content mismatch');
        }
        const resolved = resolveNativeRuntimePackage(opened, snapshot.session.entryPointId);
        res.json({
            descriptor: resolved.descriptor,
            runtime: resolved.runtime,
        });
    }));
    router.post('/runtime/resource', route(async (req, res, { core, packageInstaller }, handle) => {
        const snapshot = await core.load(handle, req.body?.sessionId);
        const opened = await packageInstaller.open(
            handle,
            snapshot.session.packageId,
            snapshot.session.packageVersionId,
        );
        if (!opened || opened.packageVersion.packageContentHash !== snapshot.session.packageContentHash) {
            throw new TypeError('Native Runtime PackageVersion content mismatch');
        }
        // Runtime v1 executes only host-validated declarative resources. Do not
        // provide an executable JS/module transport from package source.
        const path = String(req.body?.path || '').trim();
        if (
            !path
            || path.length > 512
            || path.includes('\\')
            || path.includes('\0')
            || path.startsWith('/')
            || path.split('/').some(segment => !segment || segment === '.' || segment === '..')
            || !path.toLowerCase().endsWith('.json')
        ) {
            throw new TypeError('Native Runtime resource path must be a safe declarative .json path');
        }
        const bytes = opened.sourceFiles.get(path);
        if (!bytes) {
            const error = new Error('Native Runtime Package resource not found');
            error.name = 'NotFoundError';
            throw error;
        }
        res.set({
            'Content-Type': 'application/json; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, no-store',
        });
        res.send(bytes);
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
export { services as getNativeSessionServices };
