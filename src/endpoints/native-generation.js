import { getVersionedModelPromptResourceIdentity, VERSIONED_MODEL_PROMPT_RESOURCE_TYPES } from '../native/model-prompt-runtime/resources.js';
import { RouteResolver } from '../native/model-prompt-runtime/route-resolver.js';
import express from 'express';
import { getStorageEngine } from '../storage/index.js';
import { getUserDirectories } from '../users.js';
import { readSecret, SECRET_KEYS, SecretManager } from './secrets.js';
import { assertWritable } from '../storage/read-only-mode.js';
import { getNativeSessionServices } from './native-session.js';
import { getNativeStudioServices } from './native-studio.js';
import { NativeModelPromptPersistence, VersionedJsonResourceHandler } from '../native/model-prompt-runtime/persistence.js';
import { NativeGenerationHost } from '../native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../native/adapters/http-generation-provider.js';
import { createNativeMessagesProvider } from '../native/adapters/native-messages-provider.js';
import { assertConnectionProfile } from '../native/model-prompt-runtime/contracts.js';
import { prepareProviderDiscovery, discoverProviderModels } from '../native/adapters/provider-discovery.js';

function services() {
    const { core, packageInstaller } = getNativeSessionServices();
    const { studio, agent } = getNativeStudioServices();
    return new NativeGenerationHost({
        persistence: new NativeModelPromptPersistence({ engine: getStorageEngine() }),
        library: new VersionedJsonResourceHandler({ engine: getStorageEngine() }),
        sessionCore: core, packageInstaller, studio, agent,
        providers: {
            'provider.openai-compatible': createHttpGenerationProvider(),
            'provider.raw-text': createHttpGenerationProvider({ format: 'raw-text' }),
            'provider.anthropic': createNativeMessagesProvider({ format: 'anthropic' }),
            'provider.gemini': createNativeMessagesProvider({ format: 'gemini' }),
        },
        secretPort: { resolveSecret: async (ref, { handle }) => {
            // Native refs identify one exact Secret ID. Never resolve the active key.
            for (const key of Object.values(SECRET_KEYS)) {
                const value = readSecret(getUserDirectories(handle), key, ref.secretId);
                if (value) return value;
            }
            return '';
        } },
    });
}

export function createNativeGenerationRouter(getHost = services) {
    const router = express.Router();
    router.post('/connections/probe', async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        const controller = new AbortController();
        const abort = () => { if (!response.writableEnded) controller.abort(); };
        response.on('close', abort);
        try {
            const host = getHost();
            const connection = assertConnectionProfile(request.body);
            prepareProviderDiscovery(connection);
            const secret = await host.secretPort.resolveSecret(connection.secretRef, { handle });
            if (!secret) throw Object.assign(new Error('Missing Secret'), { code: 'generation_secret_unavailable' });
            response.json(await discoverProviderModels(connection, { secret, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) }));
        } catch (error) {
            const code = error.code;
            response.status(400).json({ error: typeof code === 'string' && (code.startsWith('native_provider_') || code === 'generation_secret_unavailable') ? code : 'native_provider_probe_invalid' });
        } finally { response.off('close', abort); }
    });
    router.get('/secrets', (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        try {
            response.json(new SecretManager(getUserDirectories(handle)).listReferences());
        } catch { response.status(500).json({ error: 'native_secret_inventory_unavailable' }); }
    });
    router.post('/secrets', (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        try {
            assertWritable();
            const { label, value } = request.body;
            if (typeof label !== 'string' || !label.trim() || label.length > 120
                || typeof value !== 'string' || !value.trim() || value.length > 16384
                || Object.keys(request.body).some(key => !['label', 'value'].includes(key))) throw new Error('Invalid Secret');
            const secretId = new SecretManager(getUserDirectories(handle)).writeSecret(SECRET_KEYS.ATRIA_RUNTIME, value, label.trim(), { activate: false });
            response.status(201).json({ secretId, label: label.trim() });
        } catch { response.status(400).json({ error: 'native_secret_create_failed' }); }
    });
    router.get('/configuration', async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        try {
            const host = getHost();
            const [connections, models, routes, resources] = await Promise.all([
                host.persistence.listConnectionProfiles(handle), host.persistence.listModelProfiles(handle),
                host.persistence.listRuntimeRoutes(handle), host.library.listWithRevisions(handle),
            ]);
            const profiles = await Promise.all(resources.filter(item => item.resourceType === 'core.generation-profile')
                .map(item => host.library.getCurrent(handle, item.resourceType, item.resourceId)));
            response.json({ connections, models, routes, resources, profiles: profiles.map(item => item.snapshot) });
        } catch { response.status(500).json({ error: 'native_generation_configuration_unavailable' }); }
    });
    // Read-through catalog: exact P1 Library, Project source and installed Package authority.
    router.get('/resources', async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        try {
            const host = getHost();
            const entries = [];
            const append = (resourceType, resource, scope) => {
                const identity = getVersionedModelPromptResourceIdentity(resourceType, resource);
                entries.push({ ref: { resourceType, resourceId: identity.resourceId, revision: identity.revision, ...scope }, resource });
            };
            for (const item of await host.library.listWithRevisions(handle)) {
                for (const revision of item.revisions) {
                    const exact = await host.library.getExact(handle, { ...item, revision });
                    append(item.resourceType, exact.snapshot, { scope: 'library' });
                }
            }
            for (const item of await host.studio.listProjects(handle)) {
                const project = await host.studio.getProject(handle, item.project.projectId);
                for (const entry of project.source.resources || []) append(entry.resourceType, entry.resource, { scope: 'project', projectId: item.project.projectId });
            }
            for (const item of await host.studio.listLibraryResources(handle, { resourceType: 'core.package' })) {
                for (const version of item.revisions) {
                    const opened = await host.packageInstaller.open(handle, item.resourceId, version);
                    for (const entry of opened.manifest.resources || []) append(entry.resourceType, entry.resource, { scope: 'package', packageId: item.resourceId, packageVersionId: version });
                }
            }
            response.json(entries);
        } catch { response.status(500).json({ error: 'native_generation_resources_unavailable' }); }
    });
    router.post('/resources', async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        try {
            const { resourceType, resource } = request.body;
            if (!VERSIONED_MODEL_PROMPT_RESOURCE_TYPES.includes(resourceType)) throw new TypeError('Unsupported resource');
            response.json(await getHost().library.commit(handle, resourceType, resource));
        } catch { response.status(400).json({ error: 'native_generation_resource_invalid' }); }
    });
    router.put('/configuration/:kind', async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        try {
            const host = getHost();
            const methods = { connections: 'saveConnectionProfile', models: 'saveModelProfile', routes: 'saveRuntimeRoute' };
            const method = methods[request.params.kind];
            if (request.params.kind === 'connections') {
                const endpoint = new URL(request.body.endpoint);
                if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Endpoint must not contain credentials');
            }
            if (request.params.kind === 'routes') {
                const candidate = request.body;
                // Validate against exact P1 resources before mutating the player route.
                const persistence = Object.create(host.persistence);
                persistence.getRuntimeRoute = async (owner, id) => id === candidate.runtimeRouteId ? candidate : host.persistence.getRuntimeRoute(owner, id);
                const resolver = new RouteResolver({ persistence, library: host.library, providers: host.providers });
                // Project/Package refs require their host context at preview/execute time.
                if (candidate.generationProfileRef?.scope === 'library' && candidate.promptProgramRef?.scope === 'library') {
                    await resolver.resolve({ handle, routeRef: { scope: 'player', runtimeRouteId: candidate.runtimeRouteId }, role: candidate.role });
                }
                const visited = new Set();
                const visit = async (route, active = new Set()) => {
                    if (active.has(route.runtimeRouteId)) throw new Error('Fallback cycle');
                    if (visited.has(route.runtimeRouteId)) return;
                    if (visited.size >= 128) throw new Error('Fallback graph too large');
                    visited.add(route.runtimeRouteId);
                    const next = new Set(active).add(route.runtimeRouteId);
                    for (const ref of route.fallbackRouteRefs || []) {
                        const fallback = await persistence.getRuntimeRoute(handle, ref.runtimeRouteId);
                        if (!fallback || fallback.role !== candidate.role) throw new Error('Fallback role mismatch');
                        await visit(fallback, next);
                    }
                };
                await visit(candidate);
            }
            if (method) return response.json(await host.persistence[method](handle, request.body));
            if (request.params.kind === 'profiles') return response.json(await host.library.commit(handle, 'core.generation-profile', request.body));
            return response.sendStatus(404);
        } catch { response.status(400).json({ error: 'native_generation_configuration_invalid' }); }
    });
    router.post(['/execute', '/preview'], async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        const controller = new AbortController();
        const streaming = request.headers.accept === 'text/event-stream';
        const emit = value => {
            if (!response.headersSent) response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
            response.write('data: ' + JSON.stringify(value) + '\n\n');
        };
        const abort = () => { if (!response.writableEnded) controller.abort(); };
        response.on('close', abort);
        try {
            const result = await getHost().execute(handle, request.body, controller.signal, streaming ? chunk => emit({ chunk }) : undefined, { preview: request.path === '/preview' });
            if (!controller.signal.aborted) {
                if (streaming) { emit({ result }); response.end(); } else response.json(result);
            }
        } catch (error) {
            const code = /^(native_generation_|generation_)[a-z_]+$/.test(error.code || '') ? error.code : 'native_generation_failed';
            if (!controller.signal.aborted) {
                if (response.headersSent) { emit({ error: code }); response.end(); } else response.status(code.includes('conflict') ? 409 : 400).json({ error: code });
            }
        } finally { response.off('close', abort); }
    });
    return router;
}

export const router = createNativeGenerationRouter();
