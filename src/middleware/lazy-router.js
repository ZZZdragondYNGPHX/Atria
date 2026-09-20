/**
 * Wrap an Express router behind a memoized dynamic import.
 * Failed loads clear the cache so a later request can retry.
 *
 * @param {() => Promise<any>} importer Module importer.
 * @param {{exportName?: string, label?: string}} [options] Lazy router options.
 * @returns {(req: any, res: any, next: (error?: any) => void) => Promise<any>}
 */
export function createLazyRouter(importer, { exportName = 'router', label = '' } = {}) {
    let routerPromise = null;

    return function lazyRouter(req, res, next) {
        if (!routerPromise) {
            const startedAt = Date.now();
            routerPromise = Promise.resolve()
                .then(() => importer())
                .then((module) => {
                    const router = module?.[exportName];
                    if (typeof router !== 'function') {
                        throw new TypeError(`Lazy router module did not export a callable ${exportName}`);
                    }
                    if (label) {
                        console.log(`[startup] phase lazy-router.${label} ${Date.now() - startedAt}ms`);
                    }
                    return router;
                })
                .catch((error) => {
                    routerPromise = null;
                    throw error;
                });
        }

        return routerPromise
            .then((router) => router(req, res, next))
            .catch(next);
    };
}
