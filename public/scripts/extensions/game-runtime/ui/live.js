import { loadGameSelectorDefinitions } from './declarative.js';
import { createAtriaSurfaceAdapter } from './host-surfaces.js';
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

    const selectorDefinitions = await loadGameSelectorDefinitions(packageState, {
        fetchImpl: options.fetchImpl,
        headers: options.headers || {},
    });

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
    const componentRuntime = createComponentUiRuntime({
        surfaceHost,
        selectors,
        dispatchCommand: async (commandId, args) => {
            if (!worldSession?.dispatchCommandInternal) {
                throw new Error('Game UI cannot dispatch commands without an active World/Logic session');
            }
            return await worldSession.dispatchCommandInternal(commandId, args);
        },
        simulateCommand: async (commandId, args) => {
            if (!worldSession?.simulateCommandInternal) {
                throw new Error('Game UI cannot simulate commands without an active World/Logic session');
            }
            return await worldSession.simulateCommandInternal(commandId, args);
        },
    });

    let mounted = null;
    try {
        const definition = await loadGameComponentDefinition(packageState, {
            document: documentRef,
            fetchImpl: options.fetchImpl,
            headers: options.headers || {},
        });
        if (!definition) return null;
        mounted = await componentRuntime.mountComponent(definition);
    } catch (error) {
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
        refresh() {
            return componentRuntime.refreshSelectors();
        },
        async dispose() {
            if (disposed) return;
            disposed = true;
            await componentRuntime.unmountAll();
            surfaceHost.unmountAll();
            adapter.destroy();
            mounted = null;
        },
    });
}
