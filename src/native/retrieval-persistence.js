import { NATIVE_RESOURCE_KINDS } from './contracts.js';
import { assertWritable } from '../storage/read-only-mode.js';
import { getNativeDocument, listNativeDocuments, putImmutable } from './repositories/common.js';
import { assertRetrievalProfile, assertRetrievalRef } from '../../public/scripts/native/retrieval-contracts.js';
import { withRuntimeWrite } from './model-prompt-runtime/persistence.js';

export class NativeRetrievalPersistence {
    constructor({ engine }) { this.engine = engine; }
    key(handle, value) {
        const { retrievalProfileId, revision } = assertRetrievalRef(value);
        return { kind: NATIVE_RESOURCE_KINDS.retrievalProfile, handle, retrievalProfileId, revision };
    }
    async commit(handle, value) {
        assertWritable();
        const profile = assertRetrievalProfile(value);
        return withRuntimeWrite(handle, () => this.engine.withTransaction(handle, async tx => {
            assertWritable();
            return putImmutable(tx, this.key(handle, { scope: 'player', retrievalProfileId: profile.retrievalProfileId, revision: profile.revision }), profile);
        }));
    }
    async getExact(handle, ref) {
        const key = this.key(handle, ref);
        const value = await this.engine.withTransaction(handle, tx => getNativeDocument(tx, key));
        if (!value) throw Object.assign(new Error('Retrieval revision unavailable'), { code: 'native_retrieval_unavailable' });
        const profile = assertRetrievalProfile(value);
        if (profile.retrievalProfileId !== ref.retrievalProfileId || profile.revision !== ref.revision) throw new Error('Retrieval identity mismatch');
        return profile;
    }
    /** Removes every revision of one resource. Callers clear selections that named it. */
    async delete(handle, retrievalProfileId, mode = null) {
        assertWritable();
        if (!/^retr_[a-f0-9]{32}$/.test(retrievalProfileId) || ![null, 'embed', 'rerank'].includes(mode)) throw new TypeError('Invalid retrieval resource');
        return withRuntimeWrite(handle, () => this.engine.withTransaction(handle, async tx => {
            assertWritable();
            let removed = 0;
            for (const row of await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.retrievalProfile, handle })) {
                if (row.doc?.retrievalProfileId !== retrievalProfileId || mode && row.doc.mode !== mode) continue;
                await tx.deleteResource(row.key); removed++;
            }
            if (!removed) throw Object.assign(new Error('Retrieval resource unavailable'), { code: 'native_retrieval_unavailable' });
            return { retrievalProfileId, deleted: true };
        }));
    }
    async list(handle) {
        return this.engine.withTransaction(handle, tx => listNativeDocuments(tx, { kind: NATIVE_RESOURCE_KINDS.retrievalProfile, handle, orderBy: 'updatedAt' }));
    }
}
