import express from 'express';
import { createHash } from 'node:crypto';
import { SessionCore } from '../native/session-core.js';
import { PackageInstaller } from '../native/package-composition.js';
import { createNativeId, assertNativeId } from '../native/identity.js';
import { getSessionRepo, getSavePointRepo, getPackageRepo, getAssetStore, getKnowledgeRepo } from '../storage/index.js';

function services() {
    const assets = getAssetStore();
    const core = new SessionCore({ sessionRepo: getSessionRepo(), savePointRepo: getSavePointRepo(),
        packageInstaller: new PackageInstaller({ packageRepo: getPackageRepo(), assetStore: assets }),
        knowledgeRepo: getKnowledgeRepo() });
    return { core, assets };
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
        if (command?.type === 'timeline') {
            if (!Array.isArray(command.commands) || command.commands.some(item => item?.type !== 'append' || item.beforeMessageId !== undefined)) {
                throw new TypeError('Native runtime Timeline commands are append-only');
            }
            for (const item of command.commands) {
                for (const attachment of item.draft?.metadata?.attachments ?? []) {
                    assertNativeId(attachment.assetId, 'asset');
                    if (!await assets.getRef(handle, attachment.assetId)) throw new TypeError('Missing Native attachment');
                }
            }
            res.json(await core.applyTimelineCommands(handle, sessionId, command.commands, { expectedRevisionId }));
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
