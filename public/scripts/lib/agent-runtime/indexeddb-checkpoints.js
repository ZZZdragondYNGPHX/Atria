import { requireId, TERMINAL } from './contracts.js';

/** Account-scoped execution data in the host's existing browser IndexedDB boundary.
 * Visible to the browser-storage inspector; no provider credentials or Memory OS corpus.
 * IDB readwrite transactions serialize CAS across tabs without Web Locks/HTTPS requirements.
 */
export async function openIndexedDBCheckpoints({ scope, indexedDB = globalThis.indexedDB }) {
    requireId(scope, 'checkpoint account scope');
    if (!indexedDB) throw new Error('IndexedDB checkpoint storage unavailable');
    const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(`Atria_AgentRuntime_${encodeURIComponent(scope)}`, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('runs', { keyPath: 'runId' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => {
            request.onsuccess = () => request.result.close();
            reject(new Error('Checkpoint database upgrade blocked'));
        };
    });
    db.onversionchange = () => db.close();
    const transaction = (mode, operation) => new Promise((resolve, reject) => {
        let result, failure;
        const tx = db.transaction('runs', mode, { durability: mode === 'readwrite' ? 'strict' : 'default' });
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(failure || tx.error || new Error('Checkpoint transaction aborted'));
        tx.onerror = () => {}; // onabort owns rejection.
        if (mode === 'readwrite' && tx.durability !== 'strict') {
            failure = new Error('Strict checkpoint transaction durability unavailable');
            tx.abort();
            return;
        }
        try { operation(tx.objectStore('runs'), value => { result = value; }, error => { failure = error; tx.abort(); }); } catch (error) { failure = error; tx.abort(); }
    });
    return {
        load: runId => transaction('readonly', (store, done) => {
            store.get(runId).onsuccess = event => done(event.target.result || null);
        }),
        compareAndSet: (state, expectedVersion) => transaction('readwrite', (store, done, fail) => {
            store.get(state.runId).onsuccess = event => {
                if ((event.target.result?.checkpointVersion ?? 0) !== expectedVersion
                    || state.checkpointVersion !== expectedVersion + 1) {
                    fail(new Error('Checkpoint conflict'));
                    return;
                }
                store.put(state);
            };
        }),
        list: () => transaction('readonly', (store, done) => {
            store.getAll().onsuccess = event => done(event.target.result.map(state => ({
                runId: state.runId, status: state.status, checkpointVersion: state.checkpointVersion,
                updatedAt: state.updatedAt, legacyPolicy: state.legacyPolicy,
            })));
        }),
        // Only terminal execution snapshots expire; never silently discard interrupted writes.
        prune: before => transaction('readwrite', store => {
            store.openCursor().onsuccess = event => {
                const cursor = event.target.result;
                if (!cursor) return;
                if (!TERMINAL.includes(cursor.value.status) || cursor.value.updatedAt >= before) { cursor.continue(); return; }
                const parentRunId = cursor.value.parentRunId;
                if (!parentRunId) { cursor.delete(); cursor.continue(); return; }
                // A finished child is still a required receipt while its parent can recover.
                store.get(parentRunId).onsuccess = parentEvent => {
                    const parent = parentEvent.target.result;
                    if (!parent || TERMINAL.includes(parent.status)) cursor.delete();
                    cursor.continue();
                };
            };
        }),
        close: () => db.close(),
    };
}
