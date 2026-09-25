import { DurableCheckpointStore } from '../../lib/agent-runtime/durable-checkpoint-store.js';
import { openIndexedDBCheckpoints } from '../../lib/agent-runtime/indexeddb-checkpoints.js';
import { transition } from '../../lib/agent-runtime/state.js';
import { TERMINAL } from '../../lib/agent-runtime/contracts.js';

let configuration;
const liveStores = new Map();
const storeKey = (scope, runId) => JSON.stringify([scope, runId]);

/** Configured by the host entry point. Standalone/headless adapters keep injectable test stores. */
export function configureRuntimeCheckpoints(options) {
    configuration = options;
}

export function hasRuntimeCheckpoints() { return Boolean(configuration); }

async function openBackend() {
    if (!configuration) return null;
    return openIndexedDBCheckpoints({ scope: configuration.getScope(), indexedDB: configuration.indexedDB });
}

export function openRuntimeCheckpointStore(runId) {
    if (!configuration) return undefined;
    return openStore(runId);
}

async function openStore(runId) {
    const scope = configuration.getScope();
    const key = storeKey(scope, runId);
    const backend = await openIndexedDBCheckpoints({ scope, indexedDB: configuration.indexedDB });
    try {
        await backend.prune(Date.now() - 24 * 60 * 60 * 1000);
        const store = await DurableCheckpointStore.open({ backend, runId });
        if (liveStores.has(key)) throw new Error('Runtime checkpoint already open in this page');
        liveStores.set(key, store);
        store.bindCancel = cancel => { store.cancel = cancel; };
        store.close = () => {
            if (liveStores.get(key) === store) liveStores.delete(key);
            backend.close();
        };
        return store;
    } catch (error) { backend.close(); throw error; }
}

export async function listRuntimeCheckpoints() {
    const backend = await openBackend();
    if (!backend) return [];
    try { return await backend.list(); } finally { backend.close(); }
}

/** Close an interrupted execution explicitly; never replay an old policy to clean it up. */
export async function cancelRuntimeCheckpoint(runId) {
    const live = configuration && liveStores.get(storeKey(configuration.getScope(), runId));
    if (live) {
        if (!live.cancel) throw new Error('Runtime cancellation is not bound yet');
        live.cancel();
        await live.flush();
        return live.load(runId);
    }
    const store = await openRuntimeCheckpointStore(runId);
    if (!store) throw new Error('Durable checkpoints not configured');
    try {
        const current = store.load(runId);
        if (!current) throw new Error('Unknown run');
        if (TERMINAL.includes(current.status)) return current;
        let state = transition(current, { type: 'cancelRun' });
        state = transition(state, { type: 'run.cancelled' });
        store.save({ ...state, checkpointVersion: current.checkpointVersion + 1 }, current.checkpointVersion);
        await store.flush();
        return store.load(runId);
    } finally { store.close(); }
}
