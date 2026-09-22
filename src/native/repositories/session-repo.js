import {
    NATIVE_RESOURCE_KINDS,
    assertBranch,
    assertSession,
    assertSessionRevision,
    assertTimelineEntry,
    assertVariant,
} from '../contracts.js';
import { NotFoundError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import {
    cloneNativeDocument,
    getNativeDocument,
    listNativeDocuments,
    putImmutable,
    putMutable,
} from './common.js';

export class SessionRepo {
    constructor({ engine }) {
        if (!engine) throw new TypeError('SessionRepo requires { engine }');
        this._engine = engine;
    }

    _sessionKey(handle, sessionId) {
        return { kind: NATIVE_RESOURCE_KINDS.session, handle, sessionId };
    }

    _branchKey(handle, sessionId, branchId) {
        return { kind: NATIVE_RESOURCE_KINDS.branch, handle, sessionId, branchId };
    }

    _timelineKey(handle, sessionId, branchId, messageId) {
        return { kind: NATIVE_RESOURCE_KINDS.timelineEntry, handle, sessionId, branchId, messageId };
    }

    _variantKey(handle, sessionId, messageId, variantId) {
        return { kind: NATIVE_RESOURCE_KINDS.timelineVariant, handle, sessionId, messageId, variantId };
    }

    _stateKey(handle, sessionId, namespace, head) {
        return { kind: NATIVE_RESOURCE_KINDS.sessionState, handle, sessionId, namespace, head };
    }

    _revisionKey(handle, sessionId, revisionId) {
        return { kind: NATIVE_RESOURCE_KINDS.sessionRevision, handle, sessionId, revisionId };
    }

    async get(handle, sessionId) {
        return this._engine.withTransaction(handle, tx => getNativeDocument(tx, this._sessionKey(handle, sessionId)));
    }

    async list(handle) {
        return this._engine.withTransaction(handle, tx => listNativeDocuments(tx, {
            kind: NATIVE_RESOURCE_KINDS.session,
            handle,
            orderBy: 'updatedAt',
        }));
    }

    async create(handle, value) {
        assertWritable();
        const session = assertSession(value);
        return this._engine.withTransaction(handle, tx => putMutable(
            tx,
            this._sessionKey(handle, session.sessionId),
            session,
            { expectedIntegrity: null },
        ));
    }

    async save(handle, value, options = {}) {
        assertWritable();
        const session = assertSession(value);
        return this._engine.withTransaction(handle, tx => putMutable(
            tx,
            this._sessionKey(handle, session.sessionId),
            session,
            options,
        ));
    }

    async getBranch(handle, sessionId, branchId) {
        return this._engine.withTransaction(handle, tx => getNativeDocument(
            tx,
            this._branchKey(handle, sessionId, branchId),
        ));
    }

    async listBranches(handle, sessionId) {
        return this._engine.withTransaction(handle, tx => listNativeDocuments(tx, {
            kind: NATIVE_RESOURCE_KINDS.branch,
            handle,
            sessionId,
            orderBy: 'createdAt',
        }));
    }

    async saveBranch(handle, value, options = {}) {
        assertWritable();
        const branch = assertBranch(value);
        return this._engine.withTransaction(handle, tx => putMutable(
            tx,
            this._branchKey(handle, branch.sessionId, branch.branchId),
            branch,
            options,
        ));
    }

    async getTimelineEntry(handle, sessionId, branchId, messageId) {
        return this._engine.withTransaction(handle, tx => getNativeDocument(
            tx,
            this._timelineKey(handle, sessionId, branchId, messageId),
        ));
    }

    async listTimeline(handle, sessionId, branchId) {
        return this._engine.withTransaction(handle, async (tx) => {
            const records = await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.timelineEntry,
                handle,
                sessionId,
                branchId,
            });
            return records.map(record => record.doc).sort((a, b) => a.sequence - b.sequence);
        });
    }

    async saveTimelineEntry(handle, value, options = {}) {
        assertWritable();
        const entry = assertTimelineEntry(value);
        return this._engine.withTransaction(handle, tx => putMutable(
            tx,
            this._timelineKey(handle, entry.sessionId, entry.branchId, entry.messageId),
            entry,
            options,
        ));
    }

    async getVariant(handle, sessionId, messageId, variantId) {
        return this._engine.withTransaction(handle, tx => getNativeDocument(
            tx,
            this._variantKey(handle, sessionId, messageId, variantId),
        ));
    }

    async listVariants(handle, sessionId, messageId) {
        return this._engine.withTransaction(handle, tx => listNativeDocuments(tx, {
            kind: NATIVE_RESOURCE_KINDS.timelineVariant,
            handle,
            sessionId,
            messageId,
            orderBy: 'createdAt',
        }));
    }

    async putVariant(handle, value) {
        assertWritable();
        const variant = assertVariant(value);
        return this._engine.withTransaction(handle, tx => putImmutable(
            tx,
            this._variantKey(handle, variant.sessionId, variant.messageId, variant.variantId),
            variant,
        ));
    }

    async getState(handle, sessionId, namespace, head) {
        return this._engine.withTransaction(handle, tx => getNativeDocument(
            tx,
            this._stateKey(handle, sessionId, namespace, head),
        ));
    }

    async putState(handle, sessionId, namespace, head, value) {
        assertWritable();
        const doc = cloneNativeDocument(value, 'SessionState');
        return this._engine.withTransaction(handle, tx => putImmutable(
            tx,
            this._stateKey(handle, sessionId, namespace, head),
            doc,
        ));
    }

    async getRevision(handle, sessionId, revisionId) {
        return this._engine.withTransaction(handle, tx => getNativeDocument(
            tx,
            this._revisionKey(handle, sessionId, revisionId),
        ));
    }

    async listRevisions(handle, sessionId) {
        return this._engine.withTransaction(handle, tx => listNativeDocuments(tx, {
            kind: NATIVE_RESOURCE_KINDS.sessionRevision,
            handle,
            sessionId,
            orderBy: 'createdAt',
        }));
    }

    async putRevision(handle, value) {
        assertWritable();
        const revision = assertSessionRevision(value);
        return this._engine.withTransaction(handle, tx => putImmutable(
            tx,
            this._revisionKey(handle, revision.sessionId, revision.revisionId),
            revision,
        ));
    }

    async commitRevision(handle, value) {
        assertWritable();
        const revision = assertSessionRevision(value);
        return this._engine.withTransaction(handle, async (tx) => {
            const sessionKey = this._sessionKey(handle, revision.sessionId);
            const session = await getNativeDocument(tx, sessionKey);
            if (!session) throw new NotFoundError('native session', { sessionId: revision.sessionId });
            const branch = await getNativeDocument(
                tx,
                this._branchKey(handle, revision.sessionId, revision.branchId),
            );
            if (!branch) throw new NotFoundError('native session branch', {
                sessionId: revision.sessionId,
                branchId: revision.branchId,
            });

            // Publish immutable revision first; Session HEAD is the commit marker.
            await putImmutable(
                tx,
                this._revisionKey(handle, revision.sessionId, revision.revisionId),
                revision,
            );
            const next = assertSession({
                ...session,
                activeBranchId: revision.branchId,
                headRevisionId: revision.revisionId,
                updatedAt: Math.max(Date.now(), Number(session.updatedAt || 0)),
            });
            await putMutable(tx, sessionKey, next);
            return revision;
        });
    }

    async deleteBranch(handle, sessionId, branchId) {
        assertWritable();
        return this._engine.withTransaction(handle, async (tx) => {
            for (const record of await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.timelineEntry,
                handle,
                sessionId,
                branchId,
            })) {
                await tx.deleteResource(record.key);
            }
            return tx.deleteResource(this._branchKey(handle, sessionId, branchId));
        });
    }

    async delete(handle, sessionId) {
        assertWritable();
        return this._engine.withTransaction(handle, async (tx) => {
            for (const kind of [
                NATIVE_RESOURCE_KINDS.savePoint,
                NATIVE_RESOURCE_KINDS.sessionRevision,
                NATIVE_RESOURCE_KINDS.sessionState,
                NATIVE_RESOURCE_KINDS.timelineVariant,
                NATIVE_RESOURCE_KINDS.timelineEntry,
                NATIVE_RESOURCE_KINDS.branch,
            ]) {
                for (const record of await tx.listResources({ kind, handle, sessionId })) {
                    await tx.deleteResource(record.key);
                }
            }
            return tx.deleteResource(this._sessionKey(handle, sessionId));
        });
    }
}
