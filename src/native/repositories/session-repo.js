import { normalizeSessionTitle } from '../../../public/scripts/native/session-title-contract.js';
import {
    NATIVE_RESOURCE_KINDS,
    assertBranch,
    assertSession,
    assertSessionRevision,
    assertSavePoint,
    assertTimelineEntry,
    assertVariant,
} from '../contracts.js';
import { ConflictError, NotFoundError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import {
    cloneNativeDocument,
    hashNativeDocument,
    getNativeDocument,
    listNativeDocuments,
    putImmutable,
    putMutable,
} from './common.js';

import {
    SESSION_CORE_NAMESPACE, TIMELINE_NAMESPACE, readCheckedDocument, readSessionSnapshot,
} from '../session-snapshot.js';

// FS transactions are commit-last, not rollback transactions. Serialize publication
// across repo/engine instances in the server process, then perform HEAD CAS. SQL
// also retains its native transaction/CAS protection. Multi-process FS writers are
// not supported by the storage engine.
const sessionWrites = new Map();
async function withSessionWrite(handle, sessionId, operation) {
    const key = JSON.stringify([handle, sessionId]);
    const previous = sessionWrites.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    sessionWrites.set(key, next);
    try { return await next; } finally {
        if (sessionWrites.get(key) === next) sessionWrites.delete(key);
    }
}

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

    async _isCoreSession(tx, handle, sessionId) {
        const session = await getNativeDocument(tx, this._sessionKey(handle, sessionId));
        if (!session?.headRevisionId) return false;
        const revision = await getNativeDocument(tx, this._revisionKey(handle, sessionId, session.headRevisionId));
        return Boolean(revision?.stateHeads?.[SESSION_CORE_NAMESPACE]);
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
        return this._engine.withTransaction(handle, async tx => {
            if (await this._isCoreSession(tx, handle, session.sessionId)) {
                throw new ConflictError('native_session_requires_snapshot');
            }
            return putMutable(tx, this._sessionKey(handle, session.sessionId), session, options);
        });
    }

    async rename(handle, sessionId, { displayTitle, expectedDisplayTitle }) {
        assertWritable(); const title = normalizeSessionTitle(displayTitle);
        if (expectedDisplayTitle !== null && typeof expectedDisplayTitle !== 'string') throw new TypeError('Expected Session title is required');
        return withSessionWrite(handle, sessionId, () => this._engine.withTransaction(handle, async tx => {
            const key = this._sessionKey(handle, sessionId), existing = await tx.getResource(key);
            if (!existing) throw new NotFoundError('native session', { sessionId });
            if ((existing.doc.displayTitle ?? null) !== expectedDisplayTitle) throw new ConflictError('native_session_title_conflict', { sessionId });
            const next = { ...existing.doc, updatedAt: Math.max(Date.now(), existing.doc.updatedAt || 0) };
            if (title) next.displayTitle = title; else delete next.displayTitle;
            return putMutable(tx, key, assertSession(next), { expectedIntegrity: existing.integrity });
        }));
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
        return this._engine.withTransaction(handle, async tx => {
            if (await this._isCoreSession(tx, handle, branch.sessionId)) {
                return putImmutable(tx, this._branchKey(handle, branch.sessionId, branch.branchId), branch);
            }
            return putMutable(tx, this._branchKey(handle, branch.sessionId, branch.branchId), branch, options);
        });
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

    async _readTimelineProjection(tx, handle, sessionId, revisionId = null) {
        const session = assertSession(await readCheckedDocument(tx, this._sessionKey(handle, sessionId)));
        if (session.sessionId !== sessionId) throw new TypeError('Session resource identity mismatch');
        const target = revisionId || session.headRevisionId;
        if (!target) throw new NotFoundError('committed native session revision', { sessionId });
        if (revisionId && !(await this._reachableRevisions(tx, handle, sessionId)).has(revisionId)) {
            throw new NotFoundError('committed native session revision', { sessionId, revisionId });
        }
        const revision = assertSessionRevision(await readCheckedDocument(
            tx,
            this._revisionKey(handle, sessionId, target),
        ));
        if (revision.revisionId !== target) throw new TypeError('Session Revision identity mismatch');
        const timelineHead = revision.stateHeads?.[TIMELINE_NAMESPACE];
        if (!timelineHead) throw new TypeError('Revision does not contain Native Timeline state');
        const selections = await readCheckedDocument(tx, this._stateKey(
            handle,
            sessionId,
            TIMELINE_NAMESPACE,
            timelineHead,
        ));
        if (hashNativeDocument(selections) !== timelineHead || !Array.isArray(selections)) {
            throw new Error('Timeline state head integrity mismatch');
        }
        return { session, revision, selections };
    }

    async _materializeTimelineSelections(tx, handle, sessionId, selections) {
        const result = [];
        for (const selection of selections) {
            const entry = assertTimelineEntry(await readCheckedDocument(tx, this._timelineKey(
                handle,
                sessionId,
                selection.branchId,
                selection.messageId,
            )));
            if (entry.sessionId !== sessionId || entry.messageId !== selection.messageId
                || entry.branchId !== selection.branchId) {
                throw new TypeError('Timeline identity mismatch');
            }
            if (!Array.isArray(selection.variantIds) || !selection.variantIds.length) {
                throw new TypeError('Missing Timeline variants');
            }
            const variant = assertVariant(await readCheckedDocument(tx, this._variantKey(
                handle,
                sessionId,
                entry.messageId,
                selection.activeVariantId,
            )));
            if (variant.sessionId !== sessionId || variant.messageId !== entry.messageId
                || variant.variantId !== selection.activeVariantId
                || !selection.variantIds.includes(variant.variantId)) {
                throw new TypeError('Timeline active Variant mismatch');
            }
            result.push(assertTimelineEntry({
                ...entry,
                sequence: Number(selection.sequence ?? entry.sequence),
                content: variant.content,
                variantIds: [...selection.variantIds],
                activeVariantId: variant.variantId,
            }));
        }
        return result;
    }

    /**
     * Read an exact immutable Timeline slice from one committed SessionRevision.
     * Range indexes are canonical Timeline sequence indexes; toSequence is exclusive.
     */
    async readTimelineRange(handle, sessionId, {
        revisionId = null,
        fromSequence = 0,
        toSequence = null,
        limit = 256,
    } = {}) {
        const start = Number(fromSequence);
        const end = toSequence === null || toSequence === undefined ? null : Number(toSequence);
        const boundedLimit = Number(limit);
        if (!Number.isInteger(start) || start < 0
            || (end !== null && (!Number.isInteger(end) || end < start))
            || !Number.isInteger(boundedLimit) || boundedLimit < 1 || boundedLimit > 1000) {
            throw new TypeError('Invalid Native Timeline range');
        }
        return this._engine.withTransaction(handle, async tx => {
            const { revision, selections } = await this._readTimelineProjection(
                tx,
                handle,
                sessionId,
                revisionId,
            );
            const stop = Math.min(
                selections.length,
                end === null ? selections.length : end,
                start + boundedLimit,
            );
            const selected = selections.slice(start, stop).map((item, index) => ({ ...item, sequence: start + index }));
            return {
                sessionId,
                revisionId: revision.revisionId,
                branchId: revision.branchId,
                totalEntries: selections.length,
                fromSequence: start,
                toSequence: stop,
                entries: await this._materializeTimelineSelections(tx, handle, sessionId, selected),
            };
        });
    }

    /**
     * Resolve stable Timeline sourceRefs without scanning rendered prompt text.
     * Results follow canonical order in the requested committed Revision.
     */
    async readTimelineByMessageIds(handle, sessionId, messageIds, { revisionId = null } = {}) {
        if (!Array.isArray(messageIds) || messageIds.length < 1 || messageIds.length > 1000
            || messageIds.some(id => typeof id !== 'string' || !id.trim())) {
            throw new TypeError('Native Timeline source read requires 1..1000 message IDs');
        }
        const requested = new Set(messageIds);
        return this._engine.withTransaction(handle, async tx => {
            const { revision, selections } = await this._readTimelineProjection(
                tx,
                handle,
                sessionId,
                revisionId,
            );
            const selected = selections.map((item, sequence) => ({ ...item, sequence }))
                .filter(item => requested.has(item.messageId));
            const found = new Set(selected.map(item => item.messageId));
            const missingMessageIds = [...requested].filter(id => !found.has(id));
            return {
                sessionId,
                revisionId: revision.revisionId,
                branchId: revision.branchId,
                totalEntries: selections.length,
                entries: await this._materializeTimelineSelections(tx, handle, sessionId, selected),
                missingMessageIds,
            };
        });
    }

    async saveTimelineEntry(handle, value, options = {}) {
        assertWritable();
        const entry = assertTimelineEntry(value);
        return this._engine.withTransaction(handle, async tx => {
            if (await this._isCoreSession(tx, handle, entry.sessionId)) {
                return putImmutable(tx, this._timelineKey(handle, entry.sessionId, entry.branchId, entry.messageId), entry);
            }
            return putMutable(tx, this._timelineKey(handle, entry.sessionId, entry.branchId, entry.messageId), entry, options);
        });
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
            if (await this._isCoreSession(tx, handle, revision.sessionId)) {
                throw new ConflictError('native_session_requires_snapshot');
            }
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

    // N3 coherent publication. Every dependency is immutable and checked before
    // publishing the revision manifest; the Session record is the final commit marker.
    async commitSnapshot(handle, { session: sessionValue, revision: revisionValue,
        branches = [], entries = [], variants = [], states, expectedRevisionId }) {
        assertWritable();
        const session = assertSession(sessionValue);
        const revision = assertSessionRevision(revisionValue);
        if (session.headRevisionId !== revision.revisionId || session.activeBranchId !== revision.branchId) {
            throw new TypeError('Session HEAD must match committed Revision');
        }
        return withSessionWrite(handle, session.sessionId, () => this._engine.withTransaction(handle, async tx => {
            const key = this._sessionKey(handle, session.sessionId);
            const existing = await tx.getResource(key);
            if (expectedRevisionId === undefined || (existing?.doc.headRevisionId ?? null) !== expectedRevisionId
                || (!existing && expectedRevisionId !== null)) {
                throw new ConflictError('native_session_head_conflict', { sessionId: session.sessionId });
            }
            if (existing) {
                for (const field of ['sessionId', 'packageId', 'packageVersionId', 'packageVersion',
                    'packageContentHash', 'entryPointId', 'createdAt']) {
                    if (existing.doc[field] !== session[field]) throw new TypeError('Session dependency identity is immutable');
                }
            }
            for (const value of branches) {
                const branch = assertBranch(value);
                if (branch.sessionId !== session.sessionId) throw new TypeError('Branch Session mismatch');
                await putImmutable(tx, this._branchKey(handle, session.sessionId, branch.branchId), branch);
            }
            for (const value of variants) {
                const variant = assertVariant(value);
                if (variant.sessionId !== session.sessionId) throw new TypeError('Variant Session mismatch');
                await putImmutable(tx, this._variantKey(handle, session.sessionId, variant.messageId, variant.variantId), variant);
            }
            for (const value of entries) {
                const entry = assertTimelineEntry(value);
                if (entry.sessionId !== session.sessionId) throw new TypeError('Timeline Session mismatch');
                await putImmutable(tx, this._timelineKey(handle, session.sessionId, entry.branchId, entry.messageId), entry);
            }
            for (const [namespace, value] of Object.entries(states)) {
                await putImmutable(tx, this._stateKey(handle, session.sessionId, namespace, hashNativeDocument(value)), value);
            }
            // Mutable presentation metadata belongs to the current Session root,
            // not the generation/restore draft captured before a concurrent rename.
            const published = { ...session, updatedAt: Math.max(session.updatedAt, existing?.doc.updatedAt || 0) };
            if (existing) { if (existing.doc.displayTitle == null) delete published.displayTitle; else published.displayTitle = existing.doc.displayTitle; }
            const snapshot = await readSessionSnapshot(tx, handle, assertSession(published), revision);
            if (snapshot.core.parentRevisionId !== expectedRevisionId) throw new TypeError('Revision parent must match expected HEAD');
            await putImmutable(tx, this._revisionKey(handle, session.sessionId, revision.revisionId), revision);
            await putMutable(tx, key, published, { expectedIntegrity: existing?.integrity ?? null });
            return snapshot;
        }));
    }

    async importClosure(handle, closure) {
        assertWritable();
        if (!closure || typeof closure !== 'object' || Array.isArray(closure)) {
            throw new TypeError('Native Session import closure must be an object');
        }
        const session = assertSession(closure.session);
        const branches = (closure.branches || []).map(assertBranch);
        const entries = (closure.timelineEntries || []).map(assertTimelineEntry);
        const variants = (closure.variants || []).map(assertVariant);
        const revisions = (closure.revisions || []).map(assertSessionRevision);
        const savePoints = (closure.savePoints || []).map(assertSavePoint);
        const stateRecords = closure.stateRecords || [];
        if (!Array.isArray(stateRecords)) throw new TypeError('Native Session import stateRecords must be an array');

        const sessionId = session.sessionId;
        if (!revisions.some(item => item.revisionId === session.headRevisionId)) {
            throw new TypeError('Imported Session HEAD Revision is missing');
        }

        return withSessionWrite(handle, sessionId, () => this._engine.withTransaction(handle, async (tx) => {
            const sessionKey = this._sessionKey(handle, sessionId);
            if (await tx.getResource(sessionKey)) {
                throw new ConflictError('native_session_import_conflict', { sessionId });
            }

            for (const branch of branches) {
                if (branch.sessionId !== sessionId) throw new TypeError('Imported Branch Session mismatch');
                await putImmutable(tx, this._branchKey(handle, sessionId, branch.branchId), branch);
            }
            for (const variant of variants) {
                if (variant.sessionId !== sessionId) throw new TypeError('Imported Variant Session mismatch');
                await putImmutable(tx, this._variantKey(handle, sessionId, variant.messageId, variant.variantId), variant);
            }
            for (const entry of entries) {
                if (entry.sessionId !== sessionId) throw new TypeError('Imported Timeline Session mismatch');
                await putImmutable(tx, this._timelineKey(handle, sessionId, entry.branchId, entry.messageId), entry);
            }
            const seenStates = new Set();
            for (const record of stateRecords) {
                if (!record || typeof record !== 'object' || Array.isArray(record)) {
                    throw new TypeError('Imported Session state record must be an object');
                }
                const namespace = String(record.namespace || '');
                const head = String(record.head || '');
                const key = namespace + '\0' + head;
                if (seenStates.has(key)) throw new TypeError('Duplicate imported Session state record');
                seenStates.add(key);
                if (hashNativeDocument(record.data) !== head) {
                    throw new ConflictError('native_session_import_state_integrity', { namespace, head });
                }
                await putImmutable(tx, this._stateKey(handle, sessionId, namespace, head), record.data);
            }
            for (const revision of revisions) {
                if (revision.sessionId !== sessionId) throw new TypeError('Imported Revision Session mismatch');
                await putImmutable(tx, this._revisionKey(handle, sessionId, revision.revisionId), revision);
            }
            for (const savePoint of savePoints) {
                if (savePoint.sessionId !== sessionId) throw new TypeError('Imported SavePoint Session mismatch');
                await putImmutable(tx, {
                    kind: NATIVE_RESOURCE_KINDS.savePoint,
                    handle,
                    sessionId,
                    saveId: savePoint.saveId,
                }, savePoint);
            }

            // Validate every imported Revision after all immutable dependencies
            // exist, but before publishing the mutable Session commit marker.
            for (const revision of revisions) {
                await readSessionSnapshot(tx, handle, session, revision);
            }
            const head = revisions.find(item => item.revisionId === session.headRevisionId);
            const snapshot = await readSessionSnapshot(tx, handle, session, head);

            await putMutable(tx, sessionKey, session, { expectedIntegrity: null });
            return snapshot;
        }));
    }

    async _reachableRevisions(tx, handle, sessionId) {
        const session = await getNativeDocument(tx, this._sessionKey(handle, sessionId));
        const pending = session?.headRevisionId ? [session.headRevisionId] : [];
        for (const save of await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.savePoint, handle, sessionId })) {
            pending.push(save.doc.revisionId);
        }
        const reachable = new Set();
        while (pending.length) {
            const revisionId = pending.pop();
            if (reachable.has(revisionId)) continue;
            reachable.add(revisionId);
            const revision = await readCheckedDocument(tx, this._revisionKey(handle, sessionId, revisionId));
            const coreHead = revision.stateHeads?.[SESSION_CORE_NAMESPACE];
            if (!coreHead) continue; // N1 low-level storage fixtures have no N3 snapshot.
            const core = await readCheckedDocument(tx, this._stateKey(handle, sessionId, SESSION_CORE_NAMESPACE, coreHead));
            if (hashNativeDocument(core) !== coreHead) throw new Error('Session Core head integrity mismatch');
            if (core.parentRevisionId) pending.push(core.parentRevisionId);
            for (const node of core.branches) {
                pending.push(node.headRevisionId);
                if (node.forkRevisionId) pending.push(node.forkRevisionId);
            }
        }
        return reachable;
    }

    async getHistory(handle, sessionId) {
        return withSessionWrite(handle, sessionId, () => this._engine.withTransaction(handle, async tx => {
            const session = assertSession(await readCheckedDocument(tx, this._sessionKey(handle, sessionId)));
            const reachable = await this._reachableRevisions(tx, handle, sessionId), revisions = [], branchNodes = new Map();
            for (const revisionId of reachable) {
                const revision = assertSessionRevision(await readCheckedDocument(tx, this._revisionKey(handle, sessionId, revisionId)));
                const coreHead = revision.stateHeads[SESSION_CORE_NAMESPACE];
                const core = await readCheckedDocument(tx, this._stateKey(handle, sessionId, SESSION_CORE_NAMESPACE, coreHead));
                if (hashNativeDocument(core) !== coreHead || !Array.isArray(core.branches)) throw new TypeError('Invalid committed Session history');
                revisions.push({ ...revision, parentRevisionId: core.parentRevisionId });
                for (const node of core.branches) if (!branchNodes.has(node.branchId) || revisionId === session.headRevisionId) branchNodes.set(node.branchId, node);
            }
            const branches = [];
            for (const node of branchNodes.values()) {
                const branch = assertBranch(await readCheckedDocument(tx, this._branchKey(handle, sessionId, node.branchId)));
                branches.push({ ...branch, headRevisionId: node.headRevisionId, forkRevisionId: node.forkRevisionId });
            }
            return { sessionId, activeBranchId: session.activeBranchId, headRevisionId: session.headRevisionId, branches, revisions };
        }));
    }

    async isCommittedRevision(handle, sessionId, revisionId) {
        return this._engine.withTransaction(handle, async tx => {
            const target = await getNativeDocument(tx, this._revisionKey(handle, sessionId, revisionId));
            if (!target?.stateHeads?.[SESSION_CORE_NAMESPACE] && !await this._isCoreSession(tx, handle, sessionId)) return true;
            return (await this._reachableRevisions(tx, handle, sessionId)).has(revisionId);
        });
    }

    async loadSnapshot(handle, sessionId, { revisionId = null } = {}) {
        return this._engine.withTransaction(handle, async tx => {
            const session = assertSession(await readCheckedDocument(tx, this._sessionKey(handle, sessionId)));
            if (session.sessionId !== sessionId) throw new TypeError('Session resource identity mismatch');
            const target = revisionId || session.headRevisionId;
            if (!target) throw new NotFoundError('committed native session revision', { sessionId });
            if (revisionId && !(await this._reachableRevisions(tx, handle, sessionId)).has(revisionId)) {
                throw new NotFoundError('committed native session revision', { sessionId, revisionId });
            }
            const revision = await readCheckedDocument(tx, this._revisionKey(handle, sessionId, target));
            if (revision.revisionId !== target || (!revisionId && revision.branchId !== session.activeBranchId)) {
                throw new TypeError('Session HEAD identity mismatch');
            }
            return readSessionSnapshot(tx, handle, session, revision);
        });
    }

    async _revisionReferences(tx, handle, sessionId, revisionId) {
        const references = [];
        const session = await getNativeDocument(tx, this._sessionKey(handle, sessionId));
        if (session?.headRevisionId === revisionId) {
            references.push({ kind: 'session-head', sessionId });
        }
        for (const savePoint of await tx.listResources({
            kind: NATIVE_RESOURCE_KINDS.savePoint,
            handle,
            sessionId,
        })) {
            if (savePoint.doc?.revisionId === revisionId) {
                references.push({
                    kind: 'save-point',
                    saveId: savePoint.doc.saveId,
                });
            }
        }
        if (!references.length && (await this._reachableRevisions(tx, handle, sessionId)).has(revisionId)) {
            references.push({ kind: 'session-history', sessionId });
        }
        return references;
    }

    async getRevisionReferences(handle, sessionId, revisionId) {
        return this._engine.withTransaction(handle, tx => this._revisionReferences(
            tx,
            handle,
            sessionId,
            revisionId,
        ));
    }

    async deleteRevision(handle, sessionId, revisionId) {
        assertWritable();
        return withSessionWrite(handle, sessionId, () => this._engine.withTransaction(handle, async (tx) => {
            const references = await this._revisionReferences(tx, handle, sessionId, revisionId);
            if (references.length) {
                throw new ConflictError('native_session_revision_referenced', {
                    sessionId,
                    revisionId,
                    references,
                });
            }
            return tx.deleteResource(this._revisionKey(handle, sessionId, revisionId));
        }));
    }

    async gcRevisions(handle, sessionId, { retainRevisionIds = [] } = {}) {
        assertWritable();
        const retained = new Set(retainRevisionIds);
        return withSessionWrite(handle, sessionId, () => this._engine.withTransaction(handle, async (tx) => {
            const session = await getNativeDocument(tx, this._sessionKey(handle, sessionId));
            if (session?.headRevisionId) retained.add(session.headRevisionId);
            for (const savePoint of await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.savePoint,
                handle,
                sessionId,
            })) {
                if (savePoint.doc?.revisionId) retained.add(savePoint.doc.revisionId);
            }

            for (const revisionId of await this._reachableRevisions(tx, handle, sessionId)) retained.add(revisionId);
            const deleted = [];
            for (const record of await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.sessionRevision,
                handle,
                sessionId,
            })) {
                const revisionId = record.key.revisionId;
                if (retained.has(revisionId)) continue;
                if (await tx.deleteResource(record.key)) deleted.push(revisionId);
            }
            return deleted;
        }));
    }

    async deleteBranch(handle, sessionId, branchId) {
        assertWritable();
        return withSessionWrite(handle, sessionId, () => this._engine.withTransaction(handle, async (tx) => {
            for (const revisionId of await this._reachableRevisions(tx, handle, sessionId)) {
                const revision = await getNativeDocument(tx, this._revisionKey(handle, sessionId, revisionId));
                if (revision.branchId === branchId) throw new ConflictError('native_session_branch_referenced');
            }
            for (const record of await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.timelineEntry,
                handle,
                sessionId,
                branchId,
            })) {
                await tx.deleteResource(record.key);
            }
            return tx.deleteResource(this._branchKey(handle, sessionId, branchId));
        }));
    }

    async delete(handle, sessionId) {
        assertWritable();
        return withSessionWrite(handle, sessionId, () => this._engine.withTransaction(handle, async (tx) => {
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
        }));
    }
}
