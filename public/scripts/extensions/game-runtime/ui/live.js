import { loadGameSelectorDefinitions } from './declarative.js';
import { createFullGameHost } from './full-host.js';
import { createAtriaSurfaceAdapter } from './host-surfaces.js';
import {
    activateGameImmersiveProvider,
    loadGameImmersiveDefinition,
} from './immersive.js';
import { loadGameComponentDefinition } from './package.js';
import { createComponentUiRuntime } from './runtime.js';
import { createSelectorRuntime } from './selectors.js';
import { createSurfaceHost } from './surfaces.js';

export async function activateGamePackageUi(packageState, worldSession, options = {}) {
    const ui = packageState?.manifest?.ui;
    if (!ui) return null;
    if (!['component', 'hybrid', 'full'].includes(ui.mode)) {
        throw new Error(`Unsupported Game UI mode '${String(ui.mode)}'`);
    }

    const documentRef = options.document || globalThis.document;
    if (!documentRef) {
        throw new Error('Game UI activation requires a document');
    }

    const shellFoundation = options.shell || globalThis.Atria?.shell || null;
    const nativePlayHost = options.nativePlayHost || shellFoundation?.getPlayHost?.() || null;

    const [selectorDefinitions, immersiveDefinition] = await Promise.all([
        loadGameSelectorDefinitions(packageState, {
            fetchImpl: options.fetchImpl,
            headers: options.headers || {},
        }),
        loadGameImmersiveDefinition(packageState, {
            fetchImpl: options.fetchImpl,
            headers: options.headers || {},
        }),
    ]);

    const isFull = ui.mode === 'full';
    const adapter = isFull ? null : createAtriaSurfaceAdapter(documentRef, {
        mode: ui.mode,
        shell: shellFoundation,
        nativePlayHost,
    });
    const fullHost = isFull
        ? createFullGameHost(documentRef, {
            shell: shellFoundation,
            nativePlayHost,
            onExit: options.hostActions?.exitGameUi,
            onStopGeneration: options.hostActions?.stopGeneration,
            onDisablePackage: options.hostActions?.disablePackage,
            onDiagnostics: options.hostActions?.openDiagnostics,
        })
        : null;

    const surfaceHost = createSurfaceHost({
        resolveSurface(surfaceId) {
            if (isFull) {
                return surfaceId === 'app.root' ? fullHost.root : null;
            }
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
                throw new Error('Game UI cannot dispatch commands without an active World/Logic session');
            }
            const result = await worldSession.dispatchCommandInternal(commandId, args);
            selectors.refresh();
            return result;
        },
        async simulate(commandId, args) {
            if (!worldSession?.simulateCommandInternal) {
                throw new Error('Game UI cannot simulate commands without an active World/Logic session');
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
    let immersiveSession = null;
    try {
        const definition = await loadGameComponentDefinition(packageState, {
            document: documentRef,
            window: options.window || globalThis.window,
            fetchImpl: options.fetchImpl,
            headers: options.headers || {},
            nativePlayHost,
        });
        if (!definition) {
            fullHost?.dispose();
            adapter?.destroy();
            return null;
        }
        mounted = await componentRuntime.mountComponent(definition);

        immersiveSession = await activateGameImmersiveProvider({
            definition: immersiveDefinition,
            selectors,
            actions,
            packageId: packageState?.manifest?.id,
            immersiveApi: options.immersiveApi || globalThis.Atria?.immersive,
        });

        fullHost?.activate();
    } catch (error) {
        immersiveSession?.dispose?.();
        await componentRuntime.unmountAll();
        surfaceHost.unmountAll();
        fullHost?.dispose();
        adapter?.destroy();
        throw error;
    }

    let disposed = false;
    return Object.freeze({
        mode: ui.mode,
        status: 'active',
        get mountId() {
            return mounted?.id || null;
        },
        get immersiveStatus() {
            return immersiveSession?.status || null;
        },
        get recoveryActive() {
            return fullHost?.isActive?.() || false;
        },
        refresh() {
            const changed = componentRuntime.refreshSelectors();
            void immersiveSession?.refresh?.();
            return changed;
        },
        async dispose() {
            if (disposed) return;
            disposed = true;
            immersiveSession?.dispose?.();
            immersiveSession = null;
            await componentRuntime.unmountAll();
            surfaceHost.unmountAll();
            fullHost?.dispose();
            adapter?.destroy();
            mounted = null;
        },
    });
}
