export const GAME_SURFACES = Object.freeze([
    'app.root',
    'chat.header',
    'chat.footer',
    'composer.before',
    'composer.after',
    'sidebar.left',
    'sidebar.right',
    'drawer',
    'modal',
]);

const SURFACE_SET = new Set(GAME_SURFACES);
const MOUNT_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;

function assertSurfaceId(surfaceId) {
    const id = String(surfaceId || '').trim();
    if (!SURFACE_SET.has(id)) {
        throw new Error(`Unknown Game UI surface '${id}'`);
    }
    return id;
}

function assertMountId(mountId) {
    const id = String(mountId || '').trim();
    if (!MOUNT_ID_PATTERN.test(id)) {
        throw new Error('Game UI mount id must match /^[a-z][a-z0-9._-]{0,63}$/');
    }
    return id;
}

export function createSurfaceHost(options = {}) {
    const resolveSurface = options.resolveSurface;
    const createElement = options.createElement || (tag => document.createElement(tag));
    if (typeof resolveSurface !== 'function') {
        throw new Error('Surface Host requires resolveSurface(surfaceId)');
    }
    if (typeof createElement !== 'function') {
        throw new Error('Surface Host requires createElement(tag)');
    }

    const mounts = new Map();

    function mount(surfaceId, mountId, options = {}) {
        const surface = assertSurfaceId(surfaceId);
        const id = assertMountId(mountId);
        if (mounts.has(id)) {
            throw new Error(`Game UI mount '${id}' is already active`);
        }

        const host = resolveSurface(surface);
        if (!host || typeof host.appendChild !== 'function') {
            throw new Error(`Game UI surface '${surface}' is unavailable`);
        }

        const container = createElement('div');
        if (!container || typeof container !== 'object') {
            throw new Error('Surface Host createElement() returned an invalid container');
        }

        container.dataset ??= {};
        container.dataset.atriaGameSurface = surface;
        container.dataset.atriaGameMount = id;
        if (typeof options.className === 'string' && options.className.trim()) {
            container.className = options.className.trim();
        }

        host.appendChild(container);

        let active = true;
        const handle = Object.freeze({
            id,
            surface,
            container,
            unmount() {
                if (!active) return false;
                active = false;
                mounts.delete(id);
                if (typeof container.remove === 'function') {
                    container.remove();
                } else if (container.parentNode && typeof container.parentNode.removeChild === 'function') {
                    container.parentNode.removeChild(container);
                }
                return true;
            },
        });

        mounts.set(id, handle);
        return handle;
    }

    function unmountAll() {
        for (const handle of [...mounts.values()]) {
            handle.unmount();
        }
    }

    return Object.freeze({
        mount,
        unmountAll,
        getActiveMounts() {
            return [...mounts.values()].map(handle => ({
                id: handle.id,
                surface: handle.surface,
            }));
        },
    });
}
