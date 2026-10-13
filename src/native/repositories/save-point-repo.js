import { SessionRepo, withSessionWrite } from './session-repo.js';
import { assertRunAccess } from '../run-control.js';
import { NATIVE_RESOURCE_KINDS, assertSavePoint, assertAutoSavePolicy } from '../contracts.js';
import { createNativeId } from '../identity.js';
import { NotFoundError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { getNativeDocument, listNativeDocuments, putImmutable } from './common.js';
import { readIllustrationState, validateIllustrationDependencies } from '../session-illustrations.js';

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

    async maybeAutomatic(handle, snapshot, { now = Date.now() } = {}) {
        const policy = assertAutoSavePolicy(snapshot.session.autoSavePolicy ?? { enabled: true, intervalMs: 300000, retain: 12 });
        if (!policy.enabled || snapshot.states.atri_run?.status === 'dead' || snapshot.states.atri_run?.mode === 'pending') return null;
        const saves = await this.list(handle, snapshot.session.sessionId);
        const automatic = saves.filter(item => item.kind === 'auto');
        if (automatic.some(item => now - item.createdAt < policy.intervalMs)) return null;
        const save = await this.create(handle, { sessionId: snapshot.session.sessionId, saveId: createNativeId('savePoint'),
            branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId, kind: 'auto', createdAt: now });
        // Only expire automatic anchors. Revision ancestry preserves the raw history.
        for (const item of automatic.slice(policy.retain - 1)) await this.delete(handle, snapshot.session.sessionId, item.saveId);
        return save;
    }

    async create(handle, value) {
        assertWritable();
        const savePoint = assertSavePoint(value);
        if (!await new SessionRepo({ engine: this._engine }).isCommittedRevision(handle, savePoint.sessionId, savePoint.revisionId)) {
            throw new NotFoundError('committed native session revision', { revisionId: savePoint.revisionId });
        }
        return withSessionWrite(handle, savePoint.sessionId, () => this._engine.withTransaction(handle, async (tx) => {
            await assertRunAccess(tx, handle, savePoint.sessionId, 'save', savePoint.revisionId);
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
            if (savePoint.illustrationHead) await validateIllustrationDependencies(tx, handle, savePoint.sessionId,
                await readIllustrationState(tx, handle, savePoint.sessionId, savePoint.illustrationHead));
            const created = await putImmutable(tx, this._key(handle, savePoint.sessionId, savePoint.saveId), savePoint);
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
