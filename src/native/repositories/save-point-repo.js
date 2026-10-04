import { SessionRepo, withSessionWrite } from './session-repo.js';
import { assertRunAccess } from '../run-control.js';
import { NATIVE_RESOURCE_KINDS, assertSavePoint } from '../contracts.js';
import { NotFoundError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { getNativeDocument, listNativeDocuments, putImmutable } from './common.js';

export class SavePointRepo {
    constructor({ engine }) {
        if (!engine) throw new TypeError('SavePointRepo requires { engine }');
        this._engine = engine;
    }

    _key(handle, sessionId, saveId) {
        return { kind: NATIVE_RESOURCE_KINDS.savePoint, handle, sessionId, saveId };
    }

    async get(handle, sessionId, saveId) {
        return this._engine.withTransaction(handle, tx => getNativeDocument(
            tx,
            this._key(handle, sessionId, saveId),
        ));
    }

    async countBySession(handle) {
        const saves = await this._engine.withTransaction(handle, tx => listNativeDocuments(tx, {
            kind: NATIVE_RESOURCE_KINDS.savePoint, handle,
        }));
        const counts = new Map();
        for (const save of saves) counts.set(save.sessionId, (counts.get(save.sessionId) || 0) + 1);
        return counts;
    }

    async list(handle, sessionId) {
        return this._engine.withTransaction(handle, tx => listNativeDocuments(tx, {
            kind: NATIVE_RESOURCE_KINDS.savePoint,
            handle,
            sessionId,
            orderBy: 'createdAt',
        }));
    }

    async create(handle, value) {
        assertWritable();
        const savePoint = assertSavePoint(value);
        if (!await new SessionRepo({ engine: this._engine }).isCommittedRevision(handle, savePoint.sessionId, savePoint.revisionId)) {
            throw new NotFoundError('committed native session revision', { revisionId: savePoint.revisionId });
        }
        return withSessionWrite(handle, savePoint.sessionId, () => this._engine.withTransaction(handle, async (tx) => {
            const control = await assertRunAccess(tx, handle, savePoint.sessionId, 'save', savePoint.revisionId);
            const revision = await getNativeDocument(tx, {
                kind: NATIVE_RESOURCE_KINDS.sessionRevision,
                handle,
                sessionId: savePoint.sessionId,
                revisionId: savePoint.revisionId,
            });
            if (!revision || revision.branchId !== savePoint.branchId) {
                throw new NotFoundError('native session revision', {
                    sessionId: savePoint.sessionId,
                    revisionId: savePoint.revisionId,
                });
            }
            const created = await putImmutable(tx, this._key(handle, savePoint.sessionId, savePoint.saveId), savePoint);
            if (control?.mode === 'ironman') {
                for (const old of await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.savePoint, handle, sessionId: savePoint.sessionId })) {
                    if (old.doc.saveId !== savePoint.saveId) await tx.deleteResource(old.key);
                }
            }
            return created;
        }));
    }

    async delete(handle, sessionId, saveId) {
        assertWritable();
        return this._engine.withTransaction(handle, tx => tx.deleteResource(
            this._key(handle, sessionId, saveId),
        ));
    }
}
