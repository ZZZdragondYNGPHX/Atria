import { getAllUserHandles } from '../users.js';
import { getResourceCenter } from './center-instance.js';
import { NATIVE_RESOURCE_KINDS as K } from '../native/contracts.js';

/** Local boot recovery is distinct from imported, paused historical intent. */
export async function reconcileStorageManagement() {
    const center = getResourceCenter();
    for (const handle of await getAllUserHandles()) {
        try {
            await center.recovery.repair(handle);
            const records = await center.engine.withTransaction(handle, tx => tx.listResources({ kind: K.maintenance, handle }));
            for (const row of records) {
                if (row.doc?.protocol !== 'atria.storage-center.v1') continue;
                if (row.doc.type === 'file-publication' && row.doc.status !== 'paused-review') await center.recovery.projects.recoverHistory(handle, row.doc.projectId);
                if (row.doc.type === 'recovery' && row.doc.state === 'retained' && row.doc.expiresAt <= Date.now()) {
                    await center.recovery.purge(handle, row.doc.id, null, { expiredOnly: true });
                }
            }
            for (const task of await center.tasks(handle)) if (['queued', 'running'].includes(task.status)) await center.execute(handle, task.id);
        } catch (error) { console.error('Storage management reconciliation requires review:', { handle, reason: error.code || error.message }); }
    }
}
let timer;
export async function startStorageManagementMaintenance() {
    await reconcileStorageManagement();
    if (!timer) { timer = setInterval(() => void reconcileStorageManagement(), 5 * 60 * 1000); timer.unref(); }
}
