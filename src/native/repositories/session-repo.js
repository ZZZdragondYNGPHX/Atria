import { illustrationManifest, materializeIllustrations, IMAGE_VERSION_NAMESPACE } from '../../../public/shared/native-illustration-storage.js';
import { illustrationAssetIds } from '../../../public/shared/native-media-contract.js';
import { maintainSession, cancelSessionMaintenance } from '../session-maintenance.js';
import { PERSONA_NAMESPACE, personaAvatars } from '../persona-contract.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { RunControl, assertRunAccess, readRunControl, writeRunControl, validRunPublication, runFailure, retireRunOperations } from '../run-control.js';
import { RUN_NAMESPACE, assertRunState, assertRunContinuation } from '../../../public/shared/native-run-contract.js';
import { normalizeSessionTitle } from '../../../public/scripts/native/session-title-contract.js';
import { ILLUSTRATION_NAMESPACE, assertIllustrationState, illustrationAnchorMatches } from '../../../public/shared/native-illustration-contract.js';
import { readIllustrationState, validateIllustrationDependencies, illustrationContentHash } from '../session-illustrations.js';
import { ContinuityRepo } from './continuity-repo.js';
import { appendTimelineIndex, readTimelineIndex } from '../timeline-index.js';
import { putWorldState } from '../state-delta.js';
import {
    NATIVE_RESOURCE_KINDS,
    assertBranch,
    assertSession,
    assertSessionRevision,
    assertSavePoint,
    assertAtriaSave, ATRIA_SAVE_FORMAT,
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
    withNativeResourceWrites,
} from './common.js';

import {
    SESSION_CORE_NAMESPACE, TIMELINE_NAMESPACE, readCheckedDocument, readSessionSnapshot,
} from '../session-snapshot.js';

// Serialize domain publication before entering the engine's durable transaction.
// across repo/engine instances in the server process, then perform HEAD CAS. SQL
// also retains its native transaction/CAS protection. Multi-process FS writers are
// not supported by the storage engine.
const sessionWrites = new Map();
const heldSessionWrites = new AsyncLocalStorage();
export async function withSessionWrite(handle, sessionId, operation) {
    const key = JSON.stringify([handle, sessionId]);
    if (heldSessionWrites.getStore()?.get(key)?.open) return operation();
    const previous = sessionWrites.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => {
        const scope = { open: true }, owners = new Map(heldSessionWrites.getStore() ?? []); owners.set(key, scope);
        return heldSessionWrites.run(owners, async () => { try { return await operation(); } finally { scope.open = false; } });
    });
    sessionWrites.set(key, next);
    try { return await next; } finally {
        if (sessionWrites.get(key) === next) sessionWrites.delete(key);
    }
}

export class SessionRepo {
    constructor({ engine }) {
        if (!engine) throw new TypeError('SessionRepo requires { engine }');
        this._engine = engine;
        this.continuity = new ContinuityRepo({ engine });
        this.realm = new ContinuityRepo({ engine, rootKind: NATIVE_RESOURCE_KINDS.realm, revisionKind: NATIVE_RESOURCE_KINDS.realmRevision });
        this.sharedAccess = new ContinuityRepo({ engine, rootKind: NATIVE_RESOURCE_KINDS.sharedAccess, revisionKind: NATIVE_RESOURCE_KINDS.sharedAccessRevision, lockPrefix: 'shared-access:', keyField: 'sessionId' });
    }

    withRunLock(handle, sessionId, operation) { return withSessionWrite(handle, sessionId, operation); }
    withoutRunLockContext(operation) { return heldSessionWrites.exit(operation); }

    async prepareTimelineIndex(handle, sessionId, root, additions) {
        assertWritable();
        return this._engine.withTransaction(handle, tx => appendTimelineIndex(tx, handle, sessionId, root, additions));
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
        return withSessionWrite(handle, value.sessionId, async () => {
            await new RunControl(this).assert(handle, value.sessionId, 'write');
            assertWritable();
            const session = assertSession(value);
            return this._engine.withTransaction(handle, tx => putMutable(
                tx,
                this._sessionKey(handle, session.sessionId),
                session,
                { expectedIntegrity: null },
            ));
        });
    }

    async save(handle, value, options = {}) {
        return withSessionWrite(handle, value.sessionId, async () => {
            await new RunControl(this).assert(handle, value.sessionId, 'write');
            assertWritable();
            const session = assertSession(value);
            return this._engine.withTransaction(handle, async tx => {
                if (await this._isCoreSession(tx, handle, session.sessionId)) {
                    throw new ConflictError('native_session_requires_snapshot');
                }
                return putMutable(tx, this._sessionKey(handle, session.sessionId), session, options);
            });
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

    async setExperienceMetadata(handle, sessionId, { expectedRevisionId, autoSavePolicy, branchId, displayName, archived }) {
        return withSessionWrite(handle, sessionId, () => this._engine.withTransaction(handle, async tx => {
            assertWritable(); await assertRunAccess(tx, handle, sessionId, 'inspect');
            const key = this._sessionKey(handle, sessionId), record = await tx.getResource(key);
            if (!record || record.doc.headRevisionId !== expectedRevisionId) throw new ConflictError('native_session_head_conflict');
            const next = { ...record.doc };
            if (autoSavePolicy !== undefined) next.autoSavePolicy = autoSavePolicy;
            if (branchId) {
                if (!await tx.getResource(this._branchKey(handle, sessionId, branchId))) throw new NotFoundError('native branch');
                if (displayName !== undefined && (typeof displayName !== 'string' || !displayName.trim() || displayName.length > 256)) throw new TypeError('Invalid Branch name');
                if (archived !== undefined && typeof archived !== 'boolean') throw new TypeError('Invalid Branch archive state');
                next.branchMetadata = { ...next.branchMetadata, [branchId]: { ...next.branchMetadata?.[branchId],
                    ...(displayName === undefined ? {} : { displayName: displayName.trim() }), ...(archived === undefined ? {} : { archived }) } };
            }
            return putMutable(tx, key, assertSession(next), { expectedIntegrity: record.integrity });
        }));
    }

    async getIllustrations(handle, sessionId, { branchId } = {}) {
        return this._engine.withTransaction(handle, async tx => {
            await assertRunAccess(tx, handle, sessionId, 'inspect');
            const session = await getNativeDocument(tx, this._sessionKey(handle, sessionId));
            if (!session) throw new NotFoundError('native session', { sessionId });
            if (branchId !== undefined && !await tx.getResource(this._branchKey(handle, sessionId, branchId))) throw new NotFoundError('native branch', { branchId });
            const head = branchId && branchId !== session.activeBranchId ? session.illustrationHeads?.[branchId] : session.illustrationHead;
            return { head: head ?? null, state: await readIllustrationState(tx, handle, sessionId, head) };
        });
    }

    async updateIllustrations(handle, sessionId, update, { expectedHead, branchId } = {}) {
        assertWritable();
        return withSessionWrite(handle, sessionId, async () => {
            const key = this._sessionKey(handle, sessionId);
            const { existing, targetBranch, state } = await this._engine.withTransaction(handle, async tx => {
                await assertRunAccess(tx, handle, sessionId, 'write');
                const existing = await tx.getResource(key);
                if (!existing) throw new NotFoundError('native session', { sessionId });
                const targetBranch = branchId ?? existing.doc.activeBranchId;
                if (!await tx.getResource(this._branchKey(handle, sessionId, targetBranch))) throw new NotFoundError('native branch', { branchId: targetBranch });
                const revision = await getNativeDocument(tx, this._revisionKey(handle, sessionId, existing.doc.headRevisionId));
                const core = revision && await getNativeDocument(tx, this._stateKey(handle, sessionId, SESSION_CORE_NAMESPACE, revision.stateHeads[SESSION_CORE_NAMESPACE]));
                if (!core?.branches.some(item => item.branchId === targetBranch)) throw new NotFoundError('reachable native branch', { branchId: targetBranch });
                const currentHead = targetBranch === existing.doc.activeBranchId ? existing.doc.illustrationHead : existing.doc.illustrationHeads?.[targetBranch];
                if (expectedHead !== undefined && (currentHead ?? null) !== expectedHead) throw new ConflictError('native_illustration_head_conflict');
                const current = await readIllustrationState(tx, handle, sessionId, currentHead);
                return { existing, targetBranch, state: assertIllustrationState(await update(current)) };
            });
            // Acquire asset locks before entering a storage transaction. The
            // deletion path uses the same order, including on SQLite.
            return withNativeResourceWrites(handle, illustrationAssetIds(state).map(assetId => 'asset:' + assetId), () => this._engine.withTransaction(handle, async tx => {
                await assertRunAccess(tx, handle, sessionId, 'write');
                await validateIllustrationDependencies(tx, handle, sessionId, state);
                const manifest = illustrationManifest(state);
                for (const image of state.images) await putImmutable(tx, this._stateKey(handle, sessionId, IMAGE_VERSION_NAMESPACE, hashNativeDocument(image)), image);
                const head = hashNativeDocument(manifest);
                await putImmutable(tx, this._stateKey(handle, sessionId, ILLUSTRATION_NAMESPACE, head), manifest);
                await putMutable(tx, key, assertSession({ ...existing.doc,
                    ...(targetBranch === existing.doc.activeBranchId ? { illustrationHead: head } : {}),
                    illustrationHeads: { ...existing.doc.illustrationHeads, [targetBranch]: head },
                    updatedAt: Math.max(Date.now(), existing.doc.updatedAt) }), { expectedIntegrity: existing.integrity });
                return { head, state };
            }));
        });
    }

    async getIllustrationsAtHead(handle, sessionId, head) {
        return this._engine.withTransaction(handle, tx => readIllustrationState(tx, handle, sessionId, head));
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
        return withSessionWrite(handle, value.sessionId, async () => {
            await new RunControl(this).assert(handle, value.sessionId, 'write');
            assertWritable();
            const branch = assertBranch(value);
            return this._engine.withTransaction(handle, async tx => {
                if (await this._isCoreSession(tx, handle, branch.sessionId)) {
                    return putImmutable(tx, this._branchKey(handle, branch.sessionId, branch.branchId), branch);
                }
                return putMutable(tx, this._branchKey(handle, branch.sessionId, branch.branchId), branch, options);
            });
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
        await assertRunAccess(tx, handle, sessionId, 'inspect', revisionId || undefined);
        const session = assertSession(await readCheckedDocument(tx, this._sessionKey(handle, sessionId)));
        if (session.sessionId !== sessionId) throw new TypeError('Session resource identity mismatch');
        const target = revisionId || session.headRevisionId;
        if (!target) throw new NotFoundError('committed native session revision', { sessionId });
        if (revisionId && revisionId !== session.headRevisionId && !(await this._reachableRevisions(tx, handle, sessionId)).has(revisionId)) {
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
        if (hashNativeDocument(selections) !== timelineHead || selections.schemaVersion !== 2) {
            throw new Error('Timeline state head integrity mismatch');
        }
        return { session, revision, selections };
    }

    async _materializeTimelineSelections(tx, handle, sessionId, selections, variants = []) {
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
            variants.push(variant);
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
            const selected = (await readTimelineIndex(tx, handle, sessionId, selections, start, stop)).map((item, index) => ({ ...item, sequence: start + index }));
            const variants = [], entries = await this._materializeTimelineSelections(tx, handle, sessionId, selected, variants);
            return {
                sessionId,
                revisionId: revision.revisionId,
                branchId: revision.branchId,
                totalEntries: selections.length,
                fromSequence: start,
                toSequence: stop,
                entries, variants,
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
            const selected = (await readTimelineIndex(tx, handle, sessionId, selections)).map((item, sequence) => ({ ...item, sequence }))
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
        return withSessionWrite(handle, value.sessionId, async () => {
            await new RunControl(this).assert(handle, value.sessionId, 'write');
            assertWritable();
            const entry = assertTimelineEntry(value);
            return this._engine.withTransaction(handle, async tx => {
                if (await this._isCoreSession(tx, handle, entry.sessionId)) {
                    return putImmutable(tx, this._timelineKey(handle, entry.sessionId, entry.branchId, entry.messageId), entry);
                }
                return putMutable(tx, this._timelineKey(handle, entry.sessionId, entry.branchId, entry.messageId), entry, options);
            });
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
        return withSessionWrite(handle, value.sessionId, async () => {
            await new RunControl(this).assert(handle, value.sessionId, 'write');
            assertWritable();
            const variant = assertVariant(value);
            return this._engine.withTransaction(handle, tx => putImmutable(
                tx,
                this._variantKey(handle, variant.sessionId, variant.messageId, variant.variantId),
                variant,
            ));
        });
    }

    async getState(handle, sessionId, namespace, head) {
        return this._engine.withTransaction(handle, tx => getNativeDocument(
            tx,
            this._stateKey(handle, sessionId, namespace, head),
        ));
    }

    async putState(handle, sessionId, namespace, head, value) {
        return withSessionWrite(handle, sessionId, async () => {
            await new RunControl(this).assert(handle, sessionId, 'write');
            assertWritable();
            const doc = cloneNativeDocument(value, 'SessionState');
            return this._engine.withTransaction(handle, tx => namespace === 'atri_world_state'
                ? putWorldState(tx, this._stateKey(handle, sessionId, namespace, head), doc)
                : putImmutable(tx, this._stateKey(handle, sessionId, namespace, head), doc));
        });
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
        return withSessionWrite(handle, value.sessionId, async () => {
            await new RunControl(this).assert(handle, value.sessionId, 'write');
            assertWritable();
            const revision = assertSessionRevision(value);
            return this._engine.withTransaction(handle, tx => putImmutable(
                tx,
                this._revisionKey(handle, revision.sessionId, revision.revisionId),
                revision,
            ));
        });
    }

    async commitRevision(handle, value) {
        return withSessionWrite(handle, value.sessionId, async () => {
            await new RunControl(this).assert(handle, value.sessionId, 'write');
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
        });
    }

    // N3 coherent publication. Every dependency is immutable and checked before
    // publishing the revision manifest; the Session record is the final commit marker.
    async commitSnapshot(handle, { session: sessionValue, revision: revisionValue,
        branches = [], entries = [], variants = [], states, expectedRevisionId, historyCheckpoint = false, runProof = null, runAction = 'write', illustrationHead = undefined,
        commitId = revisionValue.revisionId, requestFingerprint = null }) {
        assertWritable();
        const session = assertSession(sessionValue);
        const revision = assertSessionRevision(revisionValue);
        if (session.headRevisionId !== revision.revisionId || session.activeBranchId !== revision.branchId) {
            throw new TypeError('Session HEAD must match committed Revision');
        }
        const avatars = personaAvatars(states[PERSONA_NAMESPACE]);
        return withSessionWrite(handle, session.sessionId, () => withNativeResourceWrites(handle, avatars.map(ref => 'asset:' + ref.assetId), () => this._engine.withTransaction(handle, async tx => {
            const receiptKey = { kind: NATIVE_RESOURCE_KINDS.commitReceipt, handle, sessionId: session.sessionId, commitId };
            const fingerprint = requestFingerprint ?? hashNativeDocument({ session, revision, states, branches, entries, variants, expectedRevisionId });
            const prior = await getNativeDocument(tx, receiptKey);
            if (prior) {
                if (prior.fingerprint !== fingerprint) throw new ConflictError('native_commit_id_conflict');
                await assertRunAccess(tx, handle, session.sessionId, 'inspect', prior.revisionId);
                const root = await readCheckedDocument(tx, this._sessionKey(handle, session.sessionId));
                return readSessionSnapshot(tx, handle, root, await readCheckedDocument(tx, this._revisionKey(handle, session.sessionId, prior.revisionId)));
            }
            for (const avatar of avatars) {
                const ref = await getNativeDocument(tx, { kind: NATIVE_RESOURCE_KINDS.assetRef, handle, assetId: avatar.assetId });
                if (!ref || hashNativeDocument(ref) !== hashNativeDocument(avatar)) throw new TypeError('Missing Persona avatar');
            }
            const key = this._sessionKey(handle, session.sessionId);
            const existing = await tx.getResource(key);
            const control = await assertRunAccess(tx, handle, session.sessionId, runAction);
            const run = states[RUN_NAMESPACE];
            if ((control?.mode || run) && !validRunPublication(runProof)) throw runFailure('native_run_publication_proof_required');
            if (control?.mode && !run) throw runFailure('native_run_state_required');
            if (run) {
                assertRunState(run);
                if (control && run.sequence <= control.sequence) throw runFailure('native_run_sequence_conflict');
                if (control?.mode && control.mode !== 'pending' && control.mode !== run.mode) throw runFailure('native_run_mode_conflict');
                if (control?.mode === 'ironman' && (session.activeBranchId !== existing?.doc.activeBranchId || branches.length)) throw runFailure('native_run_rewind_denied');
            }
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
                const stateKey = this._stateKey(handle, session.sessionId, namespace, hashNativeDocument(value));
                if (namespace === 'atri_world_state') {
                    const previousRevision = existing?.doc.headRevisionId && await getNativeDocument(tx, this._revisionKey(handle, session.sessionId, existing.doc.headRevisionId));
                    await putWorldState(tx, stateKey, value, previousRevision?.stateHeads.atri_world_state);
                } else await putImmutable(tx, stateKey, value);
            }
            // Mutable presentation metadata belongs to the current Session root,
            // not the generation/restore draft captured before a concurrent rename.
            const published = { ...session, updatedAt: Math.max(session.updatedAt, existing?.doc.updatedAt || 0) };
            for (const field of ['autoSavePolicy', 'branchMetadata']) if (existing?.doc[field] !== undefined) published[field] = existing.doc[field];
            if (existing) { if (existing.doc.displayTitle == null) delete published.displayTitle; else published.displayTitle = existing.doc.displayTitle; }
            const branchHeads = { ...existing?.doc.illustrationHeads };
            if (existing?.doc.illustrationHead) branchHeads[existing.doc.activeBranchId] = existing.doc.illustrationHead;
            const presentationHead = illustrationHead === undefined
                ? (session.activeBranchId === existing?.doc.activeBranchId ? existing.doc.illustrationHead : branchHeads[session.activeBranchId] ?? existing?.doc.illustrationHead ?? session.illustrationHead)
                : illustrationHead;
            if (presentationHead) published.illustrationHead = presentationHead; else delete published.illustrationHead;
            if (presentationHead) branchHeads[session.activeBranchId] = presentationHead; else delete branchHeads[session.activeBranchId];
            const knownBranches = new Set(states[SESSION_CORE_NAMESPACE].branches.map(item => item.branchId));
            published.illustrationHeads = Object.fromEntries(Object.entries(branchHeads).filter(([id]) => knownBranches.has(id)));
            if (!Object.keys(published.illustrationHeads).length) delete published.illustrationHeads;
            const snapshot = await readSessionSnapshot(tx, handle, assertSession(published), revision);
            if (historyCheckpoint) {
                const history = snapshot.states.atri_lifecycle?.history;
                const previousRevision = (await tx.getResource(this._revisionKey(handle, session.sessionId, expectedRevisionId)))?.doc;
                const previous = previousRevision && (await tx.getResource(this._stateKey(handle, session.sessionId, 'atri_lifecycle', previousRevision.stateHeads.atri_lifecycle)))?.doc;
                if (!existing || snapshot.core.parentRevisionId !== expectedRevisionId || !history
                    || history.checkpoint !== history.transactions || history.checkpoint <= (previous?.history?.checkpoint ?? 0)) throw new TypeError('Invalid History checkpoint');
            } else if (snapshot.core.parentRevisionId !== expectedRevisionId) throw new TypeError('Revision parent must match expected HEAD');
            await putImmutable(tx, this._revisionKey(handle, session.sessionId, revision.revisionId), revision);
            await putMutable(tx, key, published, { expectedIntegrity: existing?.integrity ?? null });
            await putImmutable(tx, receiptKey, { schemaVersion: 1, commitId, fingerprint, sessionId: session.sessionId,
                revisionId: revision.revisionId, branchId: revision.branchId, expectedRevisionId, status: 'committed' });
            // Non-narrative durable discovery marker. Consumers prove the
            // revision reachable from a committed Branch before using it.
            await putImmutable(tx, { kind: NATIVE_RESOURCE_KINDS.versionedJsonResource, handle, resourceType: 'atri.visual.commit', resourceId: revision.revisionId },
                { sessionId: session.sessionId, branchId: revision.branchId, revisionId: revision.revisionId, createdAt: revision.createdAt });
            const updated = await readRunControl(tx, handle, session.sessionId);
            if (updated) {
                await writeRunControl(tx, handle, session.sessionId, updated);
            }
            return snapshot;
        })));
    }

    async getCommitReceipt(handle, sessionId, commitId) {
        return this._engine.withTransaction(handle, async tx => {
            await assertRunAccess(tx, handle, sessionId, 'inspect');
            const key = { kind: NATIVE_RESOURCE_KINDS.commitReceipt, handle, sessionId, commitId };
            const record = await tx.getResource(key);
            if (!record) return null;

            return record.doc;
        });
    }

    async importClosure(handle, closure, { resume = null, runContinuation = null } = {}) {
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

        const illustrationAssets = [...stateRecords.filter(item => item.namespace === PERSONA_NAMESPACE).flatMap(item => personaAvatars(item.data).map(avatar => 'asset:' + avatar.assetId)), ...stateRecords.filter(item => item.namespace === ILLUSTRATION_NAMESPACE)
            .flatMap(item => illustrationAssetIds(materializeIllustrations(item.data, head => stateRecords.find(record => record.namespace === IMAGE_VERSION_NAMESPACE && record.head === head)?.data)).map(assetId => 'asset:' + assetId))];
        return withSessionWrite(handle, sessionId, () => withNativeResourceWrites(handle, illustrationAssets, () => this._engine.withTransaction(handle, async (tx) => {
            const sessionKey = this._sessionKey(handle, sessionId);
            const control = await assertRunAccess(tx, handle, sessionId, 'import');
            if (runContinuation) {
                assertRunContinuation(runContinuation);
                if (resume) throw runFailure('native_run_continuation_conflict');
                // An archive must not overwrite independently spent local work.
                // A clean store restores the original ledger; same-store import
                // keeps the existing authority only when its canonical costs agree.
                if (control) {
                    const local = retireRunOperations(structuredClone(control));
                    const incoming = retireRunOperations(structuredClone(runContinuation));
                    if (hashNativeDocument({ operations: local.operations, retiredCompute: local.retiredCompute ?? null })
                        !== hashNativeDocument({ operations: incoming.operations, retiredCompute: incoming.retiredCompute ?? null })) throw runFailure('native_run_continuation_conflict');
                }
            }
            const rootRevision = revisions.find(item => item.revisionId === session.headRevisionId);
            const run = stateRecords.find(item => item.namespace === RUN_NAMESPACE && item.head === rootRevision.stateHeads[RUN_NAMESPACE])?.data;
            if (run) assertRunState(run);
            if (control?.mode && control.mode !== run?.mode) throw runFailure('native_run_mode_conflict');
            if (run?.mode === 'ironman') {
                if (resume) assertRunContinuation(resume.control);
                if (!resume || resume.mode !== 'ironman' || resume.sequence !== run.sequence || revisions.length !== 1 || branches.length !== 1 || savePoints.length
                    || run.status !== 'active') throw runFailure('native_run_resume_required');
                assertAtriaSave({ format: ATRIA_SAVE_FORMAT, schemaVersion: stateRecords.some(item => item.namespace === PERSONA_NAMESPACE) ? 3 : 2, nativeSchemaVersion: 1, scope: 'resume', exportedAt: session.updatedAt, resume,
                    package: { packageId: session.packageId, packageVersionId: session.packageVersionId, packageVersion: session.packageVersion, packageContentHash: session.packageContentHash, entryPointId: session.entryPointId },
                    root: { sessionId, revisionId: session.headRevisionId, saveId: null }, closure });
                if (control && (resume.sequence !== control.sequence || resume.sourceRevisionId !== (control.resumeSourceRevisionId ?? control.headRevisionId))) throw runFailure('native_run_resume_stale');
            } else if (resume) throw runFailure('native_run_resume_invalid');
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
                const stateKey = this._stateKey(handle, sessionId, namespace, head);
                if (namespace === 'atri_world_state') await putWorldState(tx, stateKey, record.data);
                else await putImmutable(tx, stateKey, record.data);
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
            for (const head of new Set([session.illustrationHead, ...Object.values(session.illustrationHeads ?? {}), ...savePoints.map(item => item.illustrationHead)].filter(Boolean))) {
                await validateIllustrationDependencies(tx, handle, sessionId, await readIllustrationState(tx, handle, sessionId, head));
            }
            const head = revisions.find(item => item.revisionId === session.headRevisionId);
            const snapshot = await readSessionSnapshot(tx, handle, session, head);

            // FS has no transactional rollback. Costs must be durable before
            // the mutable Session marker exposes the imported playable state.
            // An interrupted import can retry against the retained control.
            if (control || run || runContinuation) await writeRunControl(tx, handle, sessionId, {
                ...(control ?? { schemaVersion: 1, operations: {}, background: {}, highWaterTurn: 0 }),
                ...(!control && runContinuation ? runContinuation : {}),
                ...(run ? { mode: run.mode, status: run.status === 'dead' && run.mode === 'ironman' ? 'terminal' : run.status, sequence: Math.max(control?.sequence ?? 0, run.sequence),
                    ...(run.mode === 'ironman' && run.status === 'dead' ? { deathRevisionId: session.headRevisionId, cleanup: 'archived' } : {}),
                    origin: { packageId: session.packageId, packageVersionId: session.packageVersionId, entryPointId: session.entryPointId, packageContentHash: session.packageContentHash } } : {}),
                headRevisionId: session.headRevisionId,
                ...(resume ? { ...resume.control, resumeSourceRevisionId: resume.sourceRevisionId } : {}),
            });
            await putMutable(tx, sessionKey, session, { expectedIntegrity: null });
            return snapshot;
        })));
    }

    async _reachableRevisions(tx, handle, sessionId, retainRevisionIds = []) {
        const session = await getNativeDocument(tx, this._sessionKey(handle, sessionId));
        const pending = [...retainRevisionIds, ...(session?.headRevisionId ? [session.headRevisionId] : [])];
        const presentationHeads = new Set([session?.illustrationHead, ...Object.values(session?.illustrationHeads ?? {})].filter(Boolean));
        for (const save of await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.savePoint, handle, sessionId })) {
            pending.push(save.doc.revisionId);
            if (save.doc.illustrationHead) presentationHeads.add(save.doc.illustrationHead);
        }
        for (const head of presentationHeads) for (const item of (await readIllustrationState(tx, handle, sessionId, head)).annotations) pending.push(item.anchor.revisionId);
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
                branches.push({ ...branch, ...session.branchMetadata?.[node.branchId], headRevisionId: node.headRevisionId, forkRevisionId: node.forkRevisionId });
            }
            return { sessionId, activeBranchId: session.activeBranchId, headRevisionId: session.headRevisionId, branches, revisions };
        }));
    }

    async reachabilitySnapshot(handle, sessionId, { retainRevisionIds = [], shouldPause = () => false } = {}) {
        let reads = 0;
        const tx = { getResource: async key => {
            if (++reads % 32 === 0) await new Promise(resolve => setImmediate(resolve));
            if (shouldPause()) throw Object.assign(new Error('Native maintenance paused'), { code: 'native_maintenance_paused' });
            return this._engine.withTransaction(handle, tx => tx.getResource(key));
        },
        listResources: filter => this._engine.withTransaction(handle, tx => tx.listResources(filter)) };
        return (async () => {
            const sessionKey = this._sessionKey(handle, sessionId), session = await tx.getResource(sessionKey);
            if (!session) throw new NotFoundError('native session');
            const saves = await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.savePoint, handle, sessionId });
            const revisions = await this._reachableRevisions(tx, handle, sessionId, retainRevisionIds);
            const keys = new Map(), assets = new Set();
            const id = key => JSON.stringify(Object.keys(key).sort().map(field => [field, key[field]]));
            const findAssets = value => {
                if (!value || typeof value !== 'object') return;
                if (typeof value.assetId === 'string') assets.add(value.assetId);
                for (const child of Object.values(value)) findAssets(child);
            };
            const mark = async key => {
                if (keys.has(id(key))) return;
                const record = await tx.getResource(key);
                if (!record) throw new Error('Reachable Native dependency missing or corrupt');
                keys.set(id(key), key); findAssets(record.doc);
                if (key.kind === NATIVE_RESOURCE_KINDS.sessionState) {
                    if (key.namespace === 'atri_timeline_index' && record.doc.level) for (const child of record.doc.children) await mark({ ...key, head: child.head });
                    if (key.namespace === TIMELINE_NAMESPACE && record.doc.tree) await mark({ ...key, namespace: 'atri_timeline_index', head: record.doc.tree.head });
                    if (key.namespace === ILLUSTRATION_NAMESPACE) for (const ref of record.doc.imageRefs ?? []) await mark({ ...key, namespace: IMAGE_VERSION_NAMESPACE, head: ref.head });
                    if (key.namespace === 'atri_world_state' && record.doc.kind === 'delta') await mark({ ...key, head: record.doc.baseHead });
                }
            };
            await mark(sessionKey);
            const controlKey = { kind: NATIVE_RESOURCE_KINDS.runControl, handle, sessionId };
            if (await tx.getResource(controlKey)) await mark(controlKey);
            for (const save of saves) await mark(save.key);
            for (const revisionId of revisions) {
                await mark(this._revisionKey(handle, sessionId, revisionId));
                const revision = await getNativeDocument(tx, this._revisionKey(handle, sessionId, revisionId));
                if (!revision.stateHeads[SESSION_CORE_NAMESPACE]) {
                    const branchKey = this._branchKey(handle, sessionId, revision.branchId);
                    if (await tx.getResource(branchKey)) await mark(branchKey);
                    continue; // Low-level storage fixtures have no Core dependency closure.
                }
                for (const [namespace, head] of Object.entries({ ...revision.stateHeads, ['atri_knowledge']: revision.knowledgeHead })) await mark(this._stateKey(handle, sessionId, namespace, head));
                const core = await getNativeDocument(tx, this._stateKey(handle, sessionId, SESSION_CORE_NAMESPACE, revision.stateHeads[SESSION_CORE_NAMESPACE]));
                for (const node of core.branches) await mark(this._branchKey(handle, sessionId, node.branchId));
                const root = await getNativeDocument(tx, this._stateKey(handle, sessionId, TIMELINE_NAMESPACE, revision.stateHeads[TIMELINE_NAMESPACE]));
                for (const selection of await readTimelineIndex(tx, handle, sessionId, root)) {
                    await mark(this._timelineKey(handle, sessionId, selection.branchId, selection.messageId));
                    for (const variantId of selection.variantIds) await mark(this._variantKey(handle, sessionId, selection.messageId, variantId));
                }
            }
            for (const head of new Set([session.doc.illustrationHead, ...Object.values(session.doc.illustrationHeads ?? {}), ...saves.map(item => item.doc.illustrationHead)].filter(Boolean))) await mark(this._stateKey(handle, sessionId, 'atri_illustrations', head));
            return { schemaVersion: 1, sessionId, generation: hashNativeDocument({ root: session.integrity, saves: saves.map(item => item.integrity).sort() }),
                revisionIds: [...revisions], keys: [...keys.values()], assetIds: [...assets], terminal: session.doc.headRevisionId === (await readRunControl(tx, handle, sessionId))?.deathRevisionId };
        })();
    }

    async isCommittedRevision(handle, sessionId, revisionId) {
        return this._engine.withTransaction(handle, async tx => {
            const target = await getNativeDocument(tx, this._revisionKey(handle, sessionId, revisionId));
            if (!target?.stateHeads?.[SESSION_CORE_NAMESPACE] && !await this._isCoreSession(tx, handle, sessionId)) return true;
            return (await this._reachableRevisions(tx, handle, sessionId)).has(revisionId);
        });
    }

    async loadSnapshot(handle, sessionId, { revisionId = null, illustrationAnchor } = {}) {
        return this._engine.withTransaction(handle, async tx => {
            // Host-only presentation reads do not restore or publish history.
            // They are constrained to the exact source variant's ancestry below.
            await assertRunAccess(tx, handle, sessionId, 'inspect', illustrationAnchor ? undefined : revisionId);
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
            const snapshot = await readSessionSnapshot(tx, handle, session, revision);
            if (illustrationAnchor) {
                let cursor = illustrationAnchor.revisionId;
                const visited = new Set();
                while (cursor && cursor !== target) {
                    if (visited.has(cursor)) throw new TypeError('Illustration ancestry cycle');
                    visited.add(cursor);
                    const ancestor = await readCheckedDocument(tx, this._revisionKey(handle, sessionId, cursor));
                    const core = await getNativeDocument(tx, this._stateKey(handle, sessionId, SESSION_CORE_NAMESPACE, ancestor.stateHeads[SESSION_CORE_NAMESPACE]));
                    cursor = core?.parentRevisionId;
                }
                const entry = snapshot.timeline.find(item => item.messageId === illustrationAnchor.messageId && item.activeVariantId === illustrationAnchor.variantId);
                if (cursor !== target) throw new TypeError('Invalid illustration source ancestry');
                if (!entry || !illustrationAnchorMatches(illustrationAnchor, entry.content) || illustrationContentHash(entry.content) !== illustrationAnchor.contentHash) throw Object.assign(new TypeError('native_illustration_source_boundary'), { code: 'native_illustration_source_boundary' });
            }
            return snapshot;
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

    async gcRevisions(handle, sessionId, options = {}) {
        assertWritable();
        const result = await maintainSession(this, handle, sessionId, options);
        return result.deleted.filter(key => key.kind === NATIVE_RESOURCE_KINDS.sessionRevision).map(key => key.revisionId);
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

    async delete(handle, sessionId, { expectedRevisionId } = {}) {
        assertWritable();
        cancelSessionMaintenance(this, handle, sessionId);
        const session = await this.get(handle, sessionId);
        if (!session) return withSessionWrite(handle, sessionId, () => this._engine.withTransaction(handle, async tx => {
            const control = await readRunControl(tx, handle, sessionId);
            if (control?.status === 'terminal') await writeRunControl(tx, handle, sessionId, { ...retireRunOperations(control), cleanup: 'complete', background: {} });
            return false;
        }));
        return this.continuity.lock(handle, session.packageId, () => withSessionWrite(handle, sessionId, () => this._engine.withTransaction(handle, async (tx) => {
            const current = await getNativeDocument(tx, this._sessionKey(handle, sessionId));
            if (expectedRevisionId !== undefined && current?.headRevisionId !== expectedRevisionId) throw new ConflictError('native_session_delete_conflict');
            const control = await readRunControl(tx, handle, sessionId);
            if (control?.mode === 'ironman') await writeRunControl(tx, handle, sessionId, { ...control, status: 'terminal', cleanup: 'pending' });
            const root = await getNativeDocument(tx, { kind: NATIVE_RESOURCE_KINDS.playerContinuity, handle, packageId: session.packageId });
            const continuity = root && await getNativeDocument(tx, { kind: NATIVE_RESOURCE_KINDS.playerContinuityRevision, handle, packageId: session.packageId, revisionId: root.revisionId });
            const realmRoot = await getNativeDocument(tx, { kind: NATIVE_RESOURCE_KINDS.realm, handle, packageId: session.packageId });
            const realm = realmRoot && await getNativeDocument(tx, { kind: NATIVE_RESOURCE_KINDS.realmRevision, handle, packageId: session.packageId, revisionId: realmRoot.revisionId });
            if (realm?.state.intents.some(intent => intent.sessionId === sessionId && intent.status === 'prepared')) throw new ConflictError('native_transfer_pending');
            if (continuity?.state.intents.some(intent => intent.sessionId === sessionId && intent.status === 'prepared')) throw new ConflictError('native_transfer_pending');
            for (const kind of [
                NATIVE_RESOURCE_KINDS.savePoint,
                NATIVE_RESOURCE_KINDS.commitReceipt,
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
            await tx.deleteResource({ kind: NATIVE_RESOURCE_KINDS.maintenance, handle, scope: 'session:' + sessionId });
            const removed = await tx.deleteResource(this._sessionKey(handle, sessionId));
            if (control?.mode === 'ironman') await writeRunControl(tx, handle, sessionId, { ...retireRunOperations(control), status: 'terminal', cleanup: 'complete', background: {} });
            return removed;
        })));
    }
}
