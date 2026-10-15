import { getStorageEngine, getSessionRepo, getPackageRepo, getWorldRepo, getKnowledgeRepo, getPersonaRepo, getAssetStore } from './index.js';
import { getUserDirectories, getAccountQuotaBytes } from '../users.js';
import { getNativeStudioServices } from '../endpoints/native-studio.js';
import { ResourceCenterService } from './resource-center.js';

const centers = new WeakMap();
export function getResourceCenter() {
    const engine = getStorageEngine();
    if (!centers.has(engine)) {
        const { studio } = getNativeStudioServices();
        centers.set(engine, new ResourceCenterService({ engine, directoriesByHandle: getUserDirectories, quotaLimit: getAccountQuotaBytes,
            sessions: getSessionRepo(), packages: getPackageRepo(), worlds: getWorldRepo(), knowledge: getKnowledgeRepo(),
            personas: getPersonaRepo(), assets: getAssetStore(), projects: studio._projects, graph: studio._resourceGraph, studio }));
        studio.storageCenterLifecycle = recycleNativeResource;
    }
    return centers.get(engine);
}

export async function recycleNativeResource(handle, target, expected = {}) {
    const center = getResourceCenter();
    const checked = { ...target };
    for (const field of ['expectedRevisionId', 'baseVersionId', 'expectedIntegrity', 'expectedFingerprint', 'baseRevision', 'expectedRevision']) {
        if (expected?.[field] !== undefined) checked[field] = expected[field];
    }
    const preview = await center.preview(handle, 'trash', [checked]);
    const result = await center.run(handle, preview.id);
    const item = result.items[0];
    if (item.status !== 'succeeded') {
        if (['storage_quota_exceeded', 'storage_usage_unavailable'].includes(item.reason)) {
            const { AccountQuotaError } = await import('./account-quota.js');
            throw new AccountQuotaError(item.reason);
        }
        const { ConflictError } = await import('./errors.js');
        throw new ConflictError(item.reason || 'native_delete_failed');
    }
    return true;
}
