import { cloneGameUiValue } from './clone.js';

function clone(value) {
    return cloneGameUiValue(value);
}

function assertRuntimeContract(options) {
    if (!options.surfaceHost || typeof options.surfaceHost.mount !== 'function') {
        throw new Error('Component UI Runtime requires a Surface Host');
    }
    if (!options.selectors || typeof options.selectors.get !== 'function' || typeof options.selectors.subscribe !== 'function') {
        throw new Error('Component UI Runtime requires a Selector Runtime');
    }
    if (typeof options.dispatchCommand !== 'function') {
        throw new Error('Component UI Runtime requires dispatchCommand()');
    }
    if (typeof options.simulateCommand !== 'function') {
        throw new Error('Component UI Runtime requires simulateCommand()');
    }
}

export function createComponentUiRuntime(options = {}) {
    assertRuntimeContract(options);
    const components = new Map();

    async function mountComponent(definition) {
        if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
            throw new Error('Component definition must be an object');
        }

        const id = String(definition.id || '').trim();
        if (!id) throw new Error('Component definition requires id');
        if (components.has(id)) throw new Error(`Component '${id}' is already mounted`);
        if (typeof definition.mount !== 'function') {
            throw new Error(`Component '${id}' requires mount()`);
        }

        const surfaceMount = options.surfaceHost.mount(
            definition.surface || 'app.root',
            id,
            { className: definition.className || '' },
        );

        const disposeCallbacks = [];
        let disposed = false;
        const componentContext = Object.freeze({
            container: surfaceMount.container,
            selectors: Object.freeze({
                get: selectorId => options.selectors.get(selectorId),
                subscribe(selectorId, listener) {
                    const unsubscribe = options.selectors.subscribe(selectorId, listener);
                    disposeCallbacks.push(unsubscribe);
                    return unsubscribe;
                },
            }),
            actions: Object.freeze({
                async dispatch(commandId, args = {}) {
                    const result = await options.dispatchCommand(commandId, clone(args));
                    options.selectors.refresh();
                    return clone(result);
                },
                async simulate(commandId, args = {}) {
                    return clone(await options.simulateCommand(commandId, clone(args)));
                },
            }),
            onDispose(callback) {
                if (typeof callback !== 'function') throw new Error('onDispose requires a function');
                disposeCallbacks.push(callback);
            },
        });

        let mountCleanup = null;
        try {
            const result = await definition.mount(componentContext);
            if (typeof result === 'function') mountCleanup = result;
        } catch (error) {
            surfaceMount.unmount();
            throw error;
        }

        const handle = Object.freeze({
            id,
            surface: surfaceMount.surface,
            async unmount() {
                if (disposed) return false;
                disposed = true;
                components.delete(id);
                if (mountCleanup) await mountCleanup();
                for (const callback of disposeCallbacks.splice(0).reverse()) {
                    await callback();
                }
                surfaceMount.unmount();
                return true;
            },
        });

        components.set(id, handle);
        options.selectors.refresh();
        return handle;
    }

    async function unmountAll() {
        for (const handle of [...components.values()].reverse()) {
            await handle.unmount();
        }
    }

    return Object.freeze({
        mountComponent,
        unmountAll,
        refreshSelectors: () => options.selectors.refresh(),
        getMountedComponents() {
            return [...components.values()].map(handle => ({
                id: handle.id,
                surface: handle.surface,
            }));
        },
    });
}
