export const GAME_NATIVE_COMPONENTS = Object.freeze([
    'conversation',
    'composer',
]);

const NATIVE_COMPONENT_SET = new Set(GAME_NATIVE_COMPONENTS);

function resolveNativeNode(documentRef, componentId) {
    if (componentId === 'conversation') {
        return documentRef.querySelector('[data-atria-native-product-component="conversation"]');
    }
    if (componentId === 'composer') {
        return documentRef.querySelector('[data-atria-native-product-component="composer"]');
    }
    return null;
}

export function createNativeComponentRegistry(documentRef = globalThis.document, options = {}) {
    if (!documentRef || typeof documentRef.getElementById !== 'function') {
        throw new Error('Native Component Registry requires a document');
    }

    const active = new Map();
    const nativePlayHost = options.nativePlayHost || options.playHost || null;

    function mount(componentId, slot) {
        const id = String(componentId || '').trim();
        if (!NATIVE_COMPONENT_SET.has(id)) {
            throw new Error(`Unknown native Game UI component '${id}'`);
        }
        if (!slot || typeof slot.appendChild !== 'function') {
            throw new Error(`Native component '${id}' requires a valid slot`);
        }
        if (active.has(id)) {
            throw new Error(`Native component '${id}' is already mounted`);
        }

        if (nativePlayHost && typeof nativePlayHost.mountNativeComponent === 'function') {
            const hostHandle = nativePlayHost.mountNativeComponent(id, slot);
            let mounted = true;
            const handle = Object.freeze({
                id,
                node: hostHandle.node,
                slot,
                restore() {
                    if (!mounted) return false;
                    mounted = false;
                    active.delete(id);
                    return hostHandle.restore();
                },
            });
            active.set(id, handle);
            return handle;
        }

        const node = resolveNativeNode(documentRef, id);
        if (!node?.parentNode) {
            throw new Error(`Native component '${id}' is unavailable`);
        }
        if (node.contains?.(slot)) {
            throw new Error(`Native component '${id}' cannot mount inside itself`);
        }

        const originalParent = node.parentNode;
        const originalNextSibling = node.nextSibling;
        slot.appendChild(node);

        let mounted = true;
        const handle = Object.freeze({
            id,
            node,
            slot,
            restore() {
                if (!mounted) return false;
                mounted = false;
                active.delete(id);

                if (
                    originalNextSibling
                    && originalNextSibling.parentNode === originalParent
                    && typeof originalParent.insertBefore === 'function'
                ) {
                    originalParent.insertBefore(node, originalNextSibling);
                } else {
                    originalParent.appendChild(node);
                }
                return true;
            },
        });

        active.set(id, handle);
        return handle;
    }

    function restoreAll() {
        for (const handle of [...active.values()].reverse()) {
            handle.restore();
        }
    }

    return Object.freeze({
        mount,
        restoreAll,
        list() {
            return [...GAME_NATIVE_COMPONENTS];
        },
        getActive() {
            return [...active.keys()];
        },
    });
}

export function bindNativeGameComponents(root, registry) {
    if (!root || typeof root.querySelectorAll !== 'function') {
        throw new Error('Native component binding requires a root element');
    }
    if (!registry || typeof registry.mount !== 'function') {
        throw new Error('Native component binding requires a registry');
    }

    const handles = [];
    try {
        for (const slot of root.querySelectorAll('[data-atria-native-component]')) {
            const componentId = String(
                slot.getAttribute('data-atria-native-component') || '',
            ).trim();
            handles.push(registry.mount(componentId, slot));
        }
    } catch (error) {
        for (const handle of handles.splice(0).reverse()) {
            handle.restore();
        }
        throw error;
    }

    let disposed = false;
    return () => {
        if (disposed) return;
        disposed = true;
        for (const handle of handles.splice(0).reverse()) {
            handle.restore();
        }
    };
}
