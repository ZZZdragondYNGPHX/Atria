import { VersionedJsonResourceHandler } from './model-prompt-runtime/persistence.js';
import { assertImageTarget, assertImageRendering } from './visual-contracts.js';
import { VisualStore } from './visual-store.js';
import { visualError, visualObject } from '../../public/shared/native-visual-contract.js';

export class VisualConfiguration {
    constructor({ host }) { this.host = host; this.resources = new VersionedJsonResourceHandler({ engine: host.persistence._engine }); this.store = new VisualStore({ engine: host.persistence._engine }); }
    async read(handle) {
        const all = await this.resources.list(handle);
        const images = await Promise.all(all.filter(row => ['core.image-target', 'core.image-rendering'].includes(row.resourceType)).map(row => this.resources.getCurrent(handle, row.resourceType, row.resourceId)));
        return { targets: images.filter(row => row.ref.resourceType === 'core.image-target').map(row => row.snapshot),
            renderings: images.filter(row => row.ref.resourceType === 'core.image-rendering').map(row => row.snapshot), budget: await this.store.budget(handle) };
    }
    async save(handle, input) {
        visualObject(input, ['resourceType', 'value', 'expectedRevision']);
        if (input.expectedRevision !== null && typeof input.expectedRevision !== 'string') visualError('conflict');
        if (input.resourceType === 'core.image-target') {
            const target = assertImageTarget(input.value);
            await this.host.persistence.getConnectionProfile(handle, target.connectionProfileId);
            // Verification/price authority comes from the adapter's evidence,
            // never an editable JSON claiming live support or free cloud cost.
            if (target.capabilities !== null) visualError('capability_publication_unauthorized');
        } else if (input.resourceType === 'core.image-rendering') {
            const rendering = assertImageRendering(input.value);
            if (rendering.defaultTargetId && !await this.resources.getCurrent(handle, 'core.image-target', rendering.defaultTargetId)) visualError('target_missing');
        } else visualError('resource_invalid');
        return this.resources.commit(handle, input.resourceType, input.value, { expectedCurrentRevision: input.expectedRevision });
    }
}
