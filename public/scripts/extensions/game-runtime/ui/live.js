import { loadGameSelectorDefinitions } from './declarative.js';
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
    if (ui.mode === 'full') {
        return Object.freeze({
            mode: ui.mode,
            status: 'deferred',
            refresh() {
                return [];
            },
            async dispose() {},
        });
    }
    if (!['component', 'hybrid'].includes(ui.mode)) {
        throw new Error(`Unsupported Game UI mode '${String(ui.mode)}'`);
    }

    const documentRef = options.document || globalThis.document;
    if (!documentRef) {
        throw new Error('Game UI activation requires a document');
    }

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

    const adapter = createAtriaSurfaceAdapter(documentRef);
    const surfaceHost = createSurfaceHost({
        resolveSurface: surfaceId => adapter.resolveSurface(surfaceId),
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
        });
        if (!definition) return null;
        mounted = await componentRuntime.mountComponent(definition);

        immersiveSession = await activateGameImmersiveProvider({
            definition: immersiveDefinition,
            selectors,
            actions,
            packageId: packageState?.manifest?.id,
            immersiveApi: options.immersiveApi || globalThis.Atria?.immersive,
        });
    } catch (error) {
        immersiveSession?.dispose?.();
        await componentRuntime.unmountAll();
        surfaceHost.unmountAll();
        adapter.destroy();
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
            adapter.destroy();
            mounted = null;
        },
    });
}
