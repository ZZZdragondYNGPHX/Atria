import { scriptMatches } from '../../shared/extension-contract.js';
import { extensionFileUrl } from './extensions-client.js';
import { createExtensionSdk } from './extension-sdk.js';

export function createExtensionRuntime({ document: doc, parent = doc.body, importModule = url => import(url),
    nativeApi = () => null, illustrationApi, subscribe = () => () => {}, onStatus = () => {}, isContextCurrent = () => true } = {}) {
    const runs = new Map();
    const retirements = new Map();
    const statuses = new Map();
    let disposed = false;
    const status = (plugin, state, error) => {
        const value = { id: plugin.id, revision: plugin.revision, state, ...(error ? { error: String(error.message || error) } : {}) };
        statuses.set(plugin.id, value);
        try { onStatus({ ...value }); } catch { /* Observer only. */ }
    };
    function stop(run) {
        if (!run.stopping) {
            run.live = false;
            run.stopping = Promise.allSettled([retirements.get(run.plugin.id), run.owner.dispose()]);
            retirements.set(run.plugin.id, run.stopping);
            void run.stopping.then(() => { if (retirements.get(run.plugin.id) === run.stopping) retirements.delete(run.plugin.id); });
            status(run.plugin, 'disposed');
        }
        return run.stopping;
    }
    async function launch(run, previous) {
        try {
            await previous;
            if (!run.live) return;
            const module = await importModule(extensionFileUrl(run.plugin));
            if (!run.live) return;
            if (typeof module.activate !== 'function') throw new TypeError('Extension must export activate(sdk)');
            const cleanup = await module.activate(run.owner.sdk);
            if (cleanup !== undefined && typeof cleanup !== 'function') throw new TypeError('activate must return a cleanup function or undefined');
            if (!run.live) { if (cleanup) await cleanup(); return; }
            if (cleanup) run.owner.sdk.onDispose(cleanup);
            status(run.plugin, 'active');
        } catch (error) {
            if (run.live) { await stop(run); status(run.plugin, 'error', error); }
            // Late failures belong to the old instance, never overwrite its successor.
        }
    }
    return Object.freeze({
        reconcile(plugins, context) {
            if (disposed) return Promise.resolve();
            const identity = JSON.stringify(context);
            const desired = new Map(plugins.filter(plugin => scriptMatches(plugin, context)).map(plugin => [plugin.id, plugin]));
            for (const [id, run] of runs) {
                const next = desired.get(id);
                if (!next || next.revision !== run.plugin.revision || run.identity !== identity) {
                    void stop(run); runs.delete(id);
                }
            }
            const pending = [];
            for (const [id, plugin] of desired) {
                if (runs.has(id)) continue;
                const root = doc.createElement('div'); root.dataset.atriExtension = id; parent.append(root);
                const run = { plugin, identity, live: true };
                run.owner = createExtensionSdk({ plugin, context, document: doc, root, isCurrent: () => run.live && !disposed && isContextCurrent(context),
                    nativeApi, illustrationApi, subscribe, report: error => { if (run.live) status(plugin, 'error', error); } });
                runs.set(id, run); status(plugin, 'loading');
                pending.push(launch(run, retirements.get(id)));
            }
            return Promise.allSettled(pending);
        },
        suspend() { for (const run of runs.values()) void stop(run); runs.clear(); },
        getStatus: () => [...statuses.values()].map(value => ({ ...value })),
        dispose() {
            disposed = true;
            const pending = [...runs.values()].map(stop); runs.clear();
            return Promise.allSettled(pending);
        },
    });
}
