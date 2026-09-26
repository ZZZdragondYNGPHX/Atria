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
    const selectorDefinitions = [
        ...await loadGameSelectorDefinitions(packageState, {
            fetchImpl: options.fetchImpl,
            headers: options.headers || {},
        }),
        ...contributions.selectorDefinitions(),
    ];

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
    try {
        if (experience.componentModelVersion === 2) {
            const definition = compileUiDocument(await loadGamePackageJsonResource(packageState, experience.component, options), { mode });
            const data = json(await loadExperienceData(packageState, options));
            documentRuntime = mountUiDocument(definition, {
                ...options, document: documentRef, window: options.window || globalThis.window, surfaceHost, selectors, worldSession, data, nativePlayHost,
                composer: options.composer || nativePlayHost?.product?.composerApi,
                stateStorage: options.createStateStorage?.(definition, packageState),
            });
        } else {
            const definition = await loadGameComponentDefinition(packageState, {
                document: documentRef,
                window: options.window || globalThis.window,
                fetchImpl: options.fetchImpl,
                headers: options.headers || {},
                nativePlayHost,
            });
            if (!definition) throw new Error(mode + ' Experience did not resolve a Component Model');
            mounted = await componentRuntime.mountComponent(definition);
        }
        fullHost?.activate();
    } catch (error) {
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
        refresh() {
            const changed = componentRuntime.refreshSelectors();
            documentRuntime?.refresh();
            return changed;
        },
        async dispose() {
            if (disposed) return;
            disposed = true;
            documentRuntime?.dispose();
            await componentRuntime.unmountAll();
            surfaceHost.unmountAll();
            fullHost?.dispose();
            adapter?.destroy();
            mounted = null;
        },
    });
}
