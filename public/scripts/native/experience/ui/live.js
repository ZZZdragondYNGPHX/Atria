import { createHeadlessConversation } from '../../frontend/conversation.js';
import { frontendHttpTransport } from '../../frontend/bridge.js';
import { mountConversationPresentation } from '../../message-presentation.js';
import { loadGameSelectorDefinitions } from './declarative.js';
import { createPackageRuntimeContributionRegistry } from './plugin-contributions.js';
import { createFullGameHost } from './full-host.js';
import { createAtriaSurfaceAdapter } from './host-surfaces.js';
import { loadGameComponentDefinition } from './package.js';
import { createComponentUiRuntime } from './runtime.js';
import { createSelectorRuntime } from './selectors.js';
import { createSurfaceHost } from './surfaces.js';
import { loadGamePackageJsonResource, loadExperienceData } from '../package-loader.js';
import { compileUiDocument } from './v2-document.js';
import { mountUiDocument } from './v2-runtime.js';
import { json } from './v2-values.js';
import { mountNativeFrontend } from '../../frontend/runtime.js';
import { loadFrontendBytes } from '../package-loader.js';

const EXPERIENCE_MODES = new Set(['text', 'component', 'hybrid', 'full']);

function createTextExperienceSession(contributions) {
    let disposed = false;
    return Object.freeze({
        mode: 'text',
        status: 'active',
        mountId: null,
        recoveryActive: false,
        getContributions(query = {}) {
            return contributions.list(query);
        },
        refresh() {
            return [];
        },
        async dispose() {
            if (disposed) return;
            disposed = true;
        },
    });
}

export async function activateNativeExperienceRuntime(packageState, worldSession, options = {}) {
    const experience = packageState?.runtime?.experience;
    const mode = String(experience?.mode || '').trim();
    if (!EXPERIENCE_MODES.has(mode)) {
        throw new Error(`Unsupported Native Experience mode '${mode}'`);
    }

    options.assertCurrent?.();
    const contributions = createPackageRuntimeContributionRegistry(packageState?.runtime?.plugins || []);

    // Text remains the A3 host ABI. It participates in the same Experience
    // dispatcher, but A4 does not replace Native Conversation / Composer.
    if (mode === 'text') return createTextExperienceSession(contributions);

    const documentRef = options.document || globalThis.document;
    if (!documentRef) {
        throw new Error('Native Experience UI activation requires a document');
    }

    const shellFoundation = options.shell || globalThis.Atria?.shell || null;
    const nativePlayHost = options.nativePlayHost || shellFoundation?.getPlayHost?.() || null;
    if (experience.frontend?.version === 3) {
        const adapter = createAtriaSurfaceAdapter(documentRef, { mode, shell: shellFoundation, nativePlayHost });
        let runtime;
        const fullHost = mode === 'full' ? createFullGameHost(documentRef, {
            shell: shellFoundation, nativePlayHost,
            onExit: options.hostActions?.exitExperience,
            onStopGeneration: options.hostActions?.stopGeneration,
            onSave: options.hostActions?.save,
            onDiagnostics: options.hostActions?.openDiagnostics,
            onRecover: () => runtime?.recover(),
            onBeforeEscape: () => runtime?.closeOverlay(),
        }) : null;
        const surfaceHost = createSurfaceHost({
            resolveSurface: id => fullHost && id === 'app.root' ? fullHost.root : adapter.resolveSurface(id),
            createElement: tag => documentRef.createElement(tag),
        });
        const cleanup = () => { runtime?.dispose(); surfaceHost.unmountAll(); fullHost?.dispose(); adapter.destroy(); };
        try {
            runtime = await mountNativeFrontend({ ...options, document: documentRef, window: options.window ?? documentRef.defaultView,
                mode, surfaceHost, entry: experience.frontend.entry,
                hostServices: options.hostServices ?? createHeadlessConversation({ runtime: () => globalThis.Atria?.nativeSessionRuntime, composer: options.composer ?? nativePlayHost?.product?.composerApi, generate: type => globalThis.Atria?.getContext?.()?.generate?.(type), stop: options.hostActions?.stopGeneration, actions: options.hostActions }),
                bridgeTransport: options.bridgeTransport ?? frontendHttpTransport({ sessionId: packageState.sessionId, fetchImpl: options.fetchImpl, headers: options.headers }),
                stateStorage: options.createStateStorage?.({ stateVersion: 3 }, packageState),
                loadBytes: (path, signal) => loadFrontendBytes(packageState, path, { ...options, signal }),
            });
            options.assertCurrent?.(); fullHost?.activate();
            return Object.freeze({ ...runtime, getContributions: query => contributions.list(query),
                get recoveryActive() { return fullHost?.isActive() ?? false; }, dispose: cleanup });
        } catch (error) { cleanup(); throw error; }
    }
    const selectorDefinitions = [
        ...await loadGameSelectorDefinitions(packageState, {
            fetchImpl: options.fetchImpl,
            headers: options.headers || {},
        }),
        ...contributions.selectorDefinitions(),
    ];

    options.assertCurrent?.();
    const isFull = mode === 'full';
    const adapter = createAtriaSurfaceAdapter(documentRef, {
        mode,
        shell: shellFoundation,
        nativePlayHost,
    });
    const fullHost = isFull
        ? createFullGameHost(documentRef, {
            shell: shellFoundation,
            nativePlayHost,
            onExit: options.hostActions?.exitExperience,
            onStopGeneration: options.hostActions?.stopGeneration,
            onSave: options.hostActions?.save,
            onDiagnostics: options.hostActions?.openDiagnostics,
        })
        : null;

    const surfaceHost = createSurfaceHost({
        resolveSurface(surfaceId) {
            if (isFull && surfaceId === 'app.root') return fullHost.root;
            return adapter.resolveSurface(surfaceId);
        },
        createElement: tag => documentRef.createElement(tag),
    });
    const selectors = createSelectorRuntime({
        getWorldState: () => worldSession?.getState?.() ?? {},
        definitions: [
            ...selectorDefinitions,
            ...(options.selectors || []),
        ],
    });

    const actions = Object.freeze({
        async dispatch(commandId, args) {
            if (typeof options.dispatchCommand === 'function') {
                const result = await options.dispatchCommand(commandId, args);
                selectors.refresh();
                return result;
            }
            if (!worldSession?.dispatchCommandInternal) {
                throw new Error('Experience Runtime cannot dispatch without an active Native World/Logic session');
            }
            const result = await worldSession.dispatchCommandInternal(commandId, args);
            selectors.refresh();
            return result;
        },
        async simulate(commandId, args) {
            if (!worldSession?.simulateCommandInternal) {
                throw new Error('Experience Runtime cannot simulate without an active Native World/Logic session');
            }
            return await worldSession.simulateCommandInternal(commandId, args);
        },
    });

    const componentRuntime = createComponentUiRuntime({
        surfaceHost,
        selectors,
        dispatchCommand: actions.dispatch,
        simulateCommand: actions.simulate,
    });

    let mounted = null;
    let documentRuntime = null;
    let conversationRuntime = null;
    try {
        if (experience.componentModelVersion === 2) {
            const definition = compileUiDocument(await loadGamePackageJsonResource(packageState, experience.component, options), { mode });
            const data = json(await loadExperienceData(packageState, options));
            options.assertCurrent?.();
            documentRuntime = mountUiDocument(definition, {
                ...options, document: documentRef, window: options.window || globalThis.window, surfaceHost, selectors, worldSession, data, nativePlayHost,
                composer: options.composer || nativePlayHost?.product?.composerApi,
                stateStorage: options.createStateStorage?.(definition, packageState),
            });
            conversationRuntime = mountConversationPresentation(definition, {
                ...options, document: documentRef, window: options.window || globalThis.window, data, worldSession,
                composer: options.composer || nativePlayHost?.product?.composerApi,
                createMessageStateStorage: (messageDocument, type) => options.createStateStorage?.(messageDocument, packageState, type),
            });
        } else {
            const definition = await loadGameComponentDefinition(packageState, {
                document: documentRef,
                window: options.window || globalThis.window,
                fetchImpl: options.fetchImpl,
                headers: options.headers || {},
                nativePlayHost,
            });
            options.assertCurrent?.();
            if (!definition) throw new Error(mode + ' Experience did not resolve a Component Model');
            mounted = await componentRuntime.mountComponent(definition);
        }
        options.assertCurrent?.();
        fullHost?.activate();
    } catch (error) {
        conversationRuntime?.dispose();
        documentRuntime?.dispose();
        await componentRuntime.unmountAll();
        surfaceHost.unmountAll();
        fullHost?.dispose();
        adapter?.destroy();
        throw error;
    }

    let disposed = false;
    return Object.freeze({
        mode,
        status: 'active',
        get mountId() {
            return mounted?.id || null;
        },
        get recoveryActive() {
            return fullHost?.isActive?.() || false;
        },
        getContributions(query = {}) {
            return contributions.list(query);
        },
        getRenderReceipts: () => conversationRuntime?.getRenderReceipts() ?? [],
        executeMessageAction: (...args) => conversationRuntime?.execute(...args),
        refresh() {
            const changed = componentRuntime.refreshSelectors();
            documentRuntime?.refresh();
            conversationRuntime?.refresh();
            return changed;
        },
        async dispose() {
            if (disposed) return;
            disposed = true;
            conversationRuntime?.dispose();
            documentRuntime?.dispose();
            await componentRuntime.unmountAll();
            surfaceHost.unmountAll();
            fullHost?.dispose();
            adapter?.destroy();
            mounted = null;
        },
    });
}
