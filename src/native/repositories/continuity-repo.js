import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { createNativeId } from '../identity.js';
import { ConflictError, NotFoundError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { getNativeDocument, putImmutable, putMutable, hashNativeDocument, withNativeResourceWrite } from './common.js';

// Same Native resource engine and commit-last discipline as Session/World.
// The account handle is supplied by the authenticated Host, never a Package.
export class ContinuityRepo {
    constructor({ engine }) { this._engine = engine; }
    lock(handle, packageId, operation) { return withNativeResourceWrite(handle, 'continuity:' + packageId, operation); }
    async load(handle, packageId, revisionId = null) {
        return this._engine.withTransaction(handle, async tx => {
            const root = await getNativeDocument(tx, { kind: K.playerContinuity, handle, packageId });
            if (!root) {
                if (revisionId) throw new NotFoundError('Continuity Revision');
                return null;
            }
            const record = await tx.getResource({ kind: K.playerContinuityRevision, handle, packageId, revisionId: revisionId ?? root.revisionId });
            if (!record || hashNativeDocument(record.doc) !== record.integrity) throw new Error('Continuity Revision integrity mismatch');
            return record.doc;
        });
    }
    // Caller holds the family lock across a Saga's Session and Continuity steps.
    async commit(handle, packageId, prior, state, event) {
        assertWritable();
        const revision = { schemaVersion: 1, packageId, revisionId: createNativeId('revision'), parentRevisionId: prior?.revisionId ?? null,
            sequence: (prior?.sequence ?? 0) + 1, state: structuredClone(state), event: structuredClone(event), createdAt: Date.now() };
        if (Buffer.byteLength(JSON.stringify(revision)) > 8 * 1024 * 1024) throw new TypeError('Continuity revision byte limit');
        return this._engine.withTransaction(handle, async tx => {
            const key = { kind: K.playerContinuity, handle, packageId };
            const root = await tx.getResource(key);
            if ((root?.doc.revisionId ?? null) !== (prior?.revisionId ?? null)) throw new ConflictError('native_continuity_head_conflict');
            await putImmutable(tx, { kind: K.playerContinuityRevision, handle, packageId, revisionId: revision.revisionId }, revision);
            await putMutable(tx, key, { packageId, revisionId: revision.revisionId }, { expectedIntegrity: root?.integrity ?? null });
            return revision;
        });
    }
    async graph(handle, packageId, limit = 128) {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 256) throw new TypeError('Continuity graph limit');
        let current = await this.load(handle, packageId); const nodes = [];
        while (current && nodes.length < limit) {
            nodes.push({ revisionId: current.revisionId, parentRevisionId: current.parentRevisionId, sequence: current.sequence, event: current.event, createdAt: current.createdAt });
            current = current.parentRevisionId ? await this.load(handle, packageId, current.parentRevisionId) : null;
        }
        return { nodes, cursor: current?.revisionId ?? null };
    }
}
