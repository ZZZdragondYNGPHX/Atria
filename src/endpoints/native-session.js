import { frontendBridgeService } from '../native/frontend/host-bridge.js';
import { bridgeReceipt, publicBridgeError } from '../../public/shared/native-frontend-bridge.js';
import { fields } from '../../public/shared/native-frontend-contract.js';
import { SharedAuthority } from '../native/shared-authority.js';
import { inspectExperienceHealth, previewExperienceRepair, applyExperienceRepair } from '../native/experience-health.js';
import { deliverNativeAsset } from '../native/asset-delivery.js';
import express from 'express';
import { createHash } from 'node:crypto';
import { SessionCore } from '../native/session-core.js';
import { PackageInstaller } from '../native/package-composition.js';
import { createNativeId, assertNativeId } from '../native/identity.js';
import { resolveNativeRuntimePackage, readFrontendRuntimeResource } from '../native/runtime-descriptor.js';
import { getSessionRepo, getSavePointRepo, getPackageRepo, getAssetStore, getKnowledgeRepo, getSettingsRepo } from '../storage/index.js';

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
            if (response.headersSent) { response.destroy(); return; }
            const status = error.name === 'ConflictError' || error.code?.includes('conflict') ? 409
                : error instanceof TypeError ? 400 : error.name === 'NotFoundError' ? 404 : 500;
            response.status(status).json({ error: error.code || (status === 400 ? 'native_invalid_command' : 'native_session_failed') });
        }
    };
    const frontendRoute = operation => route(async (req, res, services, handle) => {
        res.set('Cache-Control', 'private, no-store');
        try { await operation(req, res, services, handle); } catch (error) { res.json(bridgeReceipt({ status: 'failed', error: publicBridgeError(error) })); }
    });
    router.post('/frontend/open', frontendRoute(async (req, res, services, handle) => {
        fields(req.body, ['sessionId', 'previous']);
        res.json(await frontendBridgeService.open(services, handle, req.body.sessionId, req.body.previous));
    }));
    router.post('/frontend/close', frontendRoute(async (req, res, _services, handle) => {
        fields(req.body, ['epoch']); frontendBridgeService.close(handle, req.body.epoch);
        res.json(bridgeReceipt());
    }));
    router.post('/frontend/request', frontendRoute(async (req, res, services, handle) => {
        services = { ...services,
            getGenerationHost: services.getGenerationHost ?? (async () => (await import('./native-generation.js')).getNativeGenerationHost()),
            taskBindings: services.taskBindings ?? (async (owner, packageId) => {
                const settings = await getSettingsRepo().get(owner);
                return (settings?.atri_capabilities ?? settings?.extension_settings)?.atri_task_bindings?.[packageId] ?? {};
            }),
        };
        res.json(await frontendBridgeService.request(services, handle, req.body));
    }));
    router.post('/health', route(async (req, res, { core }, handle) => {
        res.set('Cache-Control', 'private, no-store').json(await inspectExperienceHealth(core, handle, req.body.sessionId));
    }));
    router.post('/health/preview', route(async (req, res, { core }, handle) => {
        res.set('Cache-Control', 'private, no-store').json(await previewExperienceRepair(core, handle, req.body.sessionId, req.body.request));
    }));
    router.post('/health/apply', route(async (req, res, { core }, handle) => {
        res.json(await applyExperienceRepair(core, handle, req.body.sessionId, req.body.repair));
    }));
    router.post('/shared/enable', route(async (req, res, { core }, handle) => {
        res.json(await new SharedAuthority(core).enable(handle, req.body.sessionId, req.body.expectedRevisionId));
    }));
    for (const method of ['snapshot', 'membership', 'heartbeat', 'command']) router.post('/shared/' + method, route(async (req, res, { core }, handle) => {
        const { owner, sessionId, action, cursor } = req.body;
        if (typeof owner !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(owner)) throw new TypeError('Shared owner handle required');
        res.set('Cache-Control', 'private, no-store').json(await new SharedAuthority(core)[method](owner, sessionId, handle, method === 'snapshot' ? cursor : action));
    }));
    router.post('/shared/realm', route(async (req, res, { core }, handle) => {
        res.json(await new SharedAuthority(core).realm(req.body.owner, req.body.sessionId, handle, req.body.command, req.body.expectedRevisionId, req.body.expectedAccessRevisionId));
    }));
    router.post('/realm/graph', route(async (req, res, { core }, handle) => {
        const base = await core.load(handle, req.body.sessionId);
        if (!base.manifest.runtime?.experienceContract?.sharedRuntime?.realm) throw new TypeError('Realm contract required');
        res.json(await core._sessions.realm.graph(handle, base.session.packageId, req.body.limit));
    }));
    router.post('/realm/projection', route(async (req, res, { core }, handle) => {
        const base = await core.load(handle, req.body.sessionId);
        const view = base.realmViews?.[req.body.viewId];
        if (!view) throw new TypeError('Declared Realm view required');
        res.json(view);
    }));
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
                    actionRequest: command.actionRequest ?? null,
                    commands,
                    statePatch: command.statePatch ?? {},
                    deleteNamespaces: command.deleteNamespaces ?? [],
                }, { expectedRevisionId }));
            } else {
                res.json(await core.applyTimelineCommands(handle, sessionId, commands, { expectedRevisionId }));
            }
        } else if (command?.type === 'lifecycle') {
            res.json(await core.applyLifecycleCommand(handle, sessionId, command, { expectedRevisionId }));
        } else if (command?.type === 'realm') {
            res.json(await core.applyRealmCommand(handle, sessionId, { ...command, type: 'continuity' }, { expectedRevisionId }));
        } else if (command?.type === 'continuity') {
            res.json(await core.applyContinuityCommand(handle, sessionId, command, { expectedRevisionId }));
        } else if (command?.type === 'turn.finalize') {
            res.json(await core.finalizeTurn(handle, sessionId, { envelope: command.envelope, invocationId: command.invocationId }, { expectedRevisionId }));
        } else if (command?.type === 'proposal.resolve') {
            res.json(await core.resolveTaskProposal(handle, sessionId, command, { expectedRevisionId }));
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
    router.post('/continuity/projection', route(async (req, res, { core }, handle) => {
        res.json(await core.getContinuityProjection(handle, req.body.sessionId, req.body.viewId, { revisionId: req.body.revisionId }));
    }));
    router.post('/continuity/graph', route(async (req, res, { core }, handle) => {
        res.json(await core.getContinuityGraph(handle, req.body.sessionId, req.body.limit));
    }));
    async function resourceOwner(req, core, handle) {
        const owner = req.body?.sharedOwner ?? req.query?.sharedOwner;
        if (owner === undefined) return handle;
        if (typeof owner !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(owner)) throw new TypeError('Shared owner handle required');
        await new SharedAuthority(core).access(owner, req.body?.sessionId ?? req.query?.sessionId, handle);
        return owner;
    }
    router.post('/runtime/resolve', route(async (req, res, { core, packageInstaller }, handle) => {
        handle = await resourceOwner(req, core, handle);
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
        handle = await resourceOwner(req, core, handle);
        const snapshot = await core.load(handle, req.body?.sessionId);
        const opened = await packageInstaller.open(
            handle,
            snapshot.session.packageId,
            snapshot.session.packageVersionId,
        );
        if (!opened || opened.packageVersion.packageContentHash !== snapshot.session.packageContentHash) {
            throw new TypeError('Native Runtime PackageVersion content mismatch');
        }
        // Exact Package Data remains separate from the compiled Frontend graph.
        if (req.body?.resourceId !== undefined || req.body?.resourceIds !== undefined) {
            const resolved = resolveNativeRuntimePackage(opened, snapshot.session.entryPointId);
            const refs = resolved.descriptor.experienceContract?.dataResources ?? [];
            const batch = req.body.resourceIds !== undefined;
            const ids = batch ? req.body.resourceIds : [req.body.resourceId];
            if (!Array.isArray(ids) || !ids.length || ids.length > refs.length || new Set(ids).size !== ids.length
                || req.body.path !== undefined || (batch && req.body.resourceId !== undefined)) throw new TypeError('Unknown Package Data reference');
            // One exact Session/Package snapshot per load, never a cross-request
            // cache. Each requested resource still passes declaration and hash checks.
            const resources = ids.map(resourceId => {
                const ref = refs.find(item => item.resourceId === resourceId);
                if (!ref) throw new TypeError('Unknown Package Data reference');
                const bytes = opened.assets.get(ref.assetId);
                if (!bytes || bytes.length > 2 * 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== ref.contentHash) throw new TypeError('Invalid exact Package Data resource');
                return { resourceId, value: JSON.parse(bytes.toString('utf8')) };
            });
            res.set('Cache-Control', 'private, no-store').json(batch ? { resources } : resources[0].value);
            return;
        }
        const path = String(req.body?.path || '').trim();
        const resolved = resolveNativeRuntimePackage(opened, snapshot.session.entryPointId);
        if (resolved.frontendGraph) {
            const { bytes, mediaType } = readFrontendRuntimeResource(opened, resolved, path);
            res.set({ 'Content-Type': mediaType, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' }).send(bytes);
            return;
        }
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
        if (![resolved.runtime.game.logic, resolved.runtime.game.observations].filter(Boolean).includes(path)) throw new TypeError('Undeclared Text Runtime resource');
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
    router.get('/asset/:assetId', route(async (req, res, { assets, core }, handle) => {
        const owner = await resourceOwner(req, core, handle);
        if (owner !== handle) {
            const base = await core.load(owner, req.query.sessionId, { skipPackageEdits: true });
            if (!base.manifest.assets.some(ref => ref.assetId === req.params.assetId)) throw new TypeError('Shared asset must belong to exact Package closure');
        }
        handle = owner;
        assertNativeId(req.params.assetId, 'asset');
        await deliverNativeAsset(req, res, assets, handle);
    }));
    return router;
}

export const router = createNativeSessionRouter();
export { services as getNativeSessionServices };
