import { formatShellText as formatProductText } from '../atria-shell/localization.js';
import {
    assertCommittedProjection,
    committedTimelineMutation,
    nativeAssetUrl,
    projectNativeSession,
    runtimeMetadata,
    timelineIntents,
} from './session-projection.js';
import {
    NATIVE_SESSION_LIFECYCLE,
    emitNativeSessionLifecycle,
} from './session-lifecycle.js';
import { compileNativeKnowledgePlan } from './knowledge-runtime.js';
import { evaluateNativeKnowledge, KNOWLEDGE_RUNTIME_NAMESPACE } from './knowledge-selection.js';
import {
    CONTEXT_DERIVED_NAMESPACE,
    appendNarrativeArtifact,
    appendTurnDigest,
    normalizeContextDerivedState,
    openCommitment as openDerivedCommitment,
    transitionCommitment as transitionDerivedCommitment,
} from './context-derived.js';
import {
    compileNativeContextPlan,
    filterNativeCoreChatForContext,
    getContextLaneBudget,
    replaceContextLaneReservation,
} from './context-compiler.js';

function copy(value) {
    return JSON.parse(JSON.stringify(value));
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
    }
    return value;
}

function equalJson(left, right) {
    return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

export function normalizeNativeStateNamespace(value) {
    let namespace = String(value || '').trim().toLowerCase();
    if (namespace.startsWith('atria_')) namespace = 'atri_' + namespace.slice('atria_'.length);
    if (!/^atri_[a-z0-9][a-z0-9_.-]*$/.test(namespace)) {
        throw new TypeError('Native runtime state namespace must be Atria-owned atri_*');
    }
    return namespace;
}

function isEmptyGenerationDraft(command) {
    const content = String(command?.draft?.content ?? '');
    const attachments = command?.draft?.metadata?.attachments ?? [];
    const reasoning = String(command?.draft?.metadata?.runtime?.extra?.reasoning ?? '');
    return ['', '...'].includes(content.trim()) && attachments.length === 0 && reasoning.trim() === '';
}

function bindCommittedRuntimeObject(target, canonical) {
    // Preserve object identity owned by the generation/editor host while
    // normalizing every authority-bearing compatibility field to the exact
    // projection returned by Native commit.
    for (const key of [
        'name', 'is_user', 'is_system', 'mes', 'send_date', 'gen_started',
        'gen_finished', 'gen_id', 'is_name', 'force_avatar', 'swipes',
        'swipe_id', 'swipe_info', 'extra',
    ]) {
        if (canonical[key] === undefined) delete target[key];
        else target[key] = copy(canonical[key]);
    }
    target.atri_native = copy(canonical.atri_native);
}

/** One active downstream projection. Generation/rendering remain owned by the existing ST host. */
export class NativeSessionRuntime {
    constructor() {
        this.snapshot = null;
        this.host = null;
        this.queue = Promise.resolve();
        this.failed = false;
        this.history = false;
        this.generation = null;
        this.stagedStates = {};
        this.lastContextPlan = null;
    }

    get active() { return this.snapshot !== null; }

    configure(host) { this.host = host; }

    async applySessionMetadata(session) {
        if (this.snapshot?.session.sessionId !== session.sessionId) return;
        const previous = this.snapshot;
        const nextSession = { ...previous.session };
        if (session.displayTitle == null) delete nextSession.displayTitle; else nextSession.displayTitle = session.displayTitle;
        this.snapshot = { ...previous, session: nextSession };
        await this._emit(NATIVE_SESSION_LIFECYCLE.SESSION_METADATA_CHANGED, this.snapshot, previous);
    }

    readState(namespace) {
        if (!this.active) return null;
        const key = normalizeNativeStateNamespace(namespace);
        if (Object.prototype.hasOwnProperty.call(this.stagedStates, key)) {
            return copy(this.stagedStates[key]);
        }
        const value = this.snapshot?.states?.[key];
        return value === undefined ? null : copy(value);
    }

    /**
     * Stage Draft-local SessionState so it is committed atomically with the
     * accepted Native generation. Stop/abort clears this buffer and therefore
     * cannot publish a state-only Revision from generation-local work.
     */
    stageState(namespace, value) {
        this.assertWritable();
        const key = normalizeNativeStateNamespace(namespace);
        if (value === undefined || value === null) throw new TypeError('Staged Native state must be non-null');
        const next = copy(value);
        const current = this.readState(key);
        if (equalJson(current, next)) return { ok: true, state: current, updated: false };
        this.stagedStates[key] = next;
        return { ok: true, state: copy(next), updated: true };
    }

    _clearStagedStates(namespaces = null) {
        if (Array.isArray(namespaces)) {
            for (const namespace of namespaces) delete this.stagedStates[normalizeNativeStateNamespace(namespace)];
            return;
        }
        this.stagedStates = {};
    }

    _runtimeStatePatch() {
        const source = this.host?.runtimeState?.();
        const hostState = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
        const merged = { ...hostState, ...this.stagedStates };
        const patch = {};
        for (const [rawNamespace, rawValue] of Object.entries(merged)) {
            if (rawValue === undefined) continue;
            const namespace = normalizeNativeStateNamespace(rawNamespace);
            const value = copy(rawValue);
            if (!equalJson(this.snapshot?.states?.[namespace] ?? null, value)) patch[namespace] = value;
        }
        return patch;
    }

    _lifecyclePayload(next = this.snapshot, previous = null, extra = {}) {
        return {
            sessionId: next?.session?.sessionId ?? previous?.session?.sessionId ?? null,
            revisionId: next?.revision?.revisionId ?? null,
            branchId: next?.revision?.branchId ?? null,
            previousRevisionId: previous?.revision?.revisionId ?? null,
            ...extra,
        };
    }

    async _emit(type, next = this.snapshot, previous = null, extra = {}) {
        await emitNativeSessionLifecycle(type, this._lifecyclePayload(next, previous, extra));
    }

    _queue(run) {
        this.queue = this.queue.then(run);
        return this.queue;
    }

    updateState(namespace, updater) {
        this.assertWritable();
        const key = normalizeNativeStateNamespace(namespace);
        if (typeof updater !== 'function') throw new TypeError('Native state updater must be a function');
        const sessionId = this.snapshot.session.sessionId;
        return this._queue(async () => {
            this.assertWritable();
            if (this.snapshot.session.sessionId !== sessionId) {
                this._failBarrier(committedTimelineMutation('Native Session changed during a queued state write'));
            }
            const current = this.readState(key) ?? {};
            const nextValue = await updater(copy(current), {
                sessionId,
                revisionId: this.snapshot.revision.revisionId,
                branchId: this.snapshot.revision.branchId,
                namespace: key,
            });
            if (nextValue === undefined || nextValue === null || equalJson(current, nextValue)) {
                return { ok: true, state: copy(current), updated: false };
            }
            const previous = this.snapshot;
            try {
                const next = await this.request('command', {
                    sessionId,
                    expectedRevisionId: previous.revision.revisionId,
                    command: { type: 'runtime', statePatch: { [key]: copy(nextValue) } },
                });
                this.snapshot = next;
                this._clearStagedStates([key]);
                this.host?.revision?.(projectNativeSession(next));
                await this._emit(NATIVE_SESSION_LIFECYCLE.REVISION_COMMITTED, next, previous, {
                    stateNamespaces: [key],
                });
                return { ok: true, state: copy(next.states?.[key] ?? nextValue), updated: true };
            } catch (error) {
                throw this._report(error, { fatal: true });
            }
        });
    }

    commitStatePatch(statePatch = {}, { deleteNamespaces = [] } = {}) {
        this.assertWritable();
        if (!statePatch || typeof statePatch !== 'object' || Array.isArray(statePatch)) {
            throw new TypeError('Native runtime state patch must be an object');
        }
        if (!Array.isArray(deleteNamespaces)) {
            throw new TypeError('Native runtime deleteNamespaces must be an array');
        }
        const patch = Object.fromEntries(
            Object.entries(statePatch).map(([namespace, value]) => [
                normalizeNativeStateNamespace(namespace),
                copy(value),
            ]),
        );
        const deletes = deleteNamespaces.map(normalizeNativeStateNamespace);
        const sessionId = this.snapshot.session.sessionId;
        return this._queue(async () => {
            this.assertWritable();
            if (this.snapshot.session.sessionId !== sessionId) {
                this._failBarrier(committedTimelineMutation('Native Session changed during a queued state write'));
            }
            if (Object.keys(patch).length === 0 && deletes.length === 0) return this.snapshot;
            const previous = this.snapshot;
            try {
                const next = await this.request('command', {
                    sessionId,
                    expectedRevisionId: previous.revision.revisionId,
                    command: {
                        type: 'runtime',
                        statePatch: patch,
                        deleteNamespaces: deletes,
                    },
                });
                this.snapshot = next;
                this._clearStagedStates([...Object.keys(patch), ...deletes]);
                this.host?.revision?.(projectNativeSession(next));
                await this._emit(NATIVE_SESSION_LIFECYCLE.REVISION_COMMITTED, next, previous, {
                    stateNamespaces: Object.keys(patch),
                    deletedStateNamespaces: deletes,
                });
                return next;
            } catch (error) {
                throw this._report(error, { fatal: true });
            }
        });
    }

    deleteState(namespace) {
        this.assertWritable();
        const key = normalizeNativeStateNamespace(namespace);
        const sessionId = this.snapshot.session.sessionId;
        return this._queue(async () => {
            this.assertWritable();
            if (!Object.prototype.hasOwnProperty.call(this.snapshot.states ?? {}, key)) {
                return { ok: true, updated: false };
            }
            const previous = this.snapshot;
            try {
                const next = await this.request('command', {
                    sessionId,
                    expectedRevisionId: previous.revision.revisionId,
                    command: { type: 'runtime', deleteNamespaces: [key] },
                });
                this.snapshot = next;
                this._clearStagedStates([key]);
                this.host?.revision?.(projectNativeSession(next));
                await this._emit(NATIVE_SESSION_LIFECYCLE.REVISION_COMMITTED, next, previous, {
                    deletedStateNamespaces: [key],
                });
                return { ok: true, updated: true };
            } catch (error) {
                throw this._report(error, { fatal: true });
            }
        });
    }

    async request(path, body) {
        const response = await fetch(`/api/native/session/${path}`, {
            method: 'POST',
            headers: this.host.headers(),
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            let payload = null;
            try { payload = await response.json(); } catch { /* response body is optional */ }
            const error = new Error(formatProductText('Native Session ${0} failed (${1}); reload required', [path, response.status]));
            error.status = response.status;
            error.code = payload?.error || 'native_session_request_failed';
            throw error;
        }
        return response.json();
    }

    assertWritable() {
        if (!this.active || this.history || this.failed) {
            throw new Error('Native Session is not writable; open/reload current HEAD first');
        }
    }

    _report(error, { fatal = false } = {}) {
        if (fatal) this.failed = true;
        this.host?.error?.(error, { fatal });
        return error;
    }

    _failBarrier(error) {
        throw this._report(error, { fatal: true });
    }

    _assertBarrier(options = {}) {
        if (!this.active) return;
        try {
            assertCommittedProjection(this.snapshot, this.host.messages(), options);
        } catch (error) {
            this._failBarrier(error);
        }
    }

    isCommittedMessage(index) {
        const message = this.host?.messages?.()?.[index];
        const expected = this.snapshot?.timeline?.[index];
        return Boolean(message?.atri_native?.messageId && expected?.messageId === message.atri_native.messageId);
    }

    denyCommittedAction(action, index = null) {
        if (!this.active) return false;
        if (index !== null && !this.isCommittedMessage(Number(index))) return false;
        const error = committedTimelineMutation(formatProductText('Native committed Timeline does not allow ${0}', [action]));
        error.nonFatal = true;
        this._report(error, { fatal: false });
        return true;
    }

    async _loadProjection(sessionId, { revisionId } = {}) {
        const snapshot = await this.request('load', { sessionId, revisionId });
        this.queue = Promise.resolve();
        this.snapshot = snapshot;
        this._clearStagedStates();
        this.history = revisionId !== undefined;
        this.failed = false;
        this.generation = null;
        this.lastContextPlan = null;
        await this.host.install(projectNativeSession(snapshot));
        await this._emit(NATIVE_SESSION_LIFECYCLE.SESSION_LOADED, snapshot, null, {
            historical: revisionId !== undefined,
        });
        return snapshot;
    }

    async open(sessionId, { revisionId } = {}) {
        if (this.host.isGenerating()) throw new Error('Stop generation before switching Native Session');
        if (this.active) {
            if (this.failed) throw new Error('Reload the current Native Session before switching');
            if (this.history) this._assertBarrier();
            else await this.persist();
        }
        await this.queue.catch(() => {});
        return this._loadProjection(sessionId, { revisionId });
    }

    async reload() {
        if (!this.active) throw new Error('No Native Session is open');
        if (this.host.isGenerating()) throw new Error('Stop generation before reloading Native Session');
        const sessionId = this.snapshot.session.sessionId;
        const revisionId = this.history ? this.snapshot.revision.revisionId : undefined;
        await this.queue.catch(() => {});
        return this._loadProjection(sessionId, { revisionId });
    }

    async close() {
        if (this.host.isGenerating()) throw new Error('Stop generation before closing Native Session');
        if (!this.history) await this.persist();
        else this._assertBarrier();
        await this.queue;
        this.snapshot = null;
        this.failed = false;
        this.history = false;
        this.generation = null;
        this.lastContextPlan = null;
        this._clearStagedStates();
        await this.host.clear();
        await this._emit(NATIVE_SESSION_LIFECYCLE.SESSION_CLOSED, null, null);
    }

    async prepareGeneration(type) {
        if (!this.active) return type;
        this.assertWritable();

        // Recursive auto-continue belongs to the same uncommitted generation
        // Draft. Do not mint a second Native lifecycle operation.
        if (this.generation) return type;

        // A user turn is a committed boundary before assistant generation.
        // This guarantees Retry can later locate an exact post-user Revision.
        await this.persist();
        this._assertBarrier();

        if (type === 'regenerate') {
            const target = this.snapshot.timeline.at(-1);
            if (!target || target.role !== 'assistant') {
                throw this._report(committedTimelineMutation('Native Retry Reply requires a committed assistant reply'));
            }
            try {
                const next = await this.request('command', {
                    sessionId: this.snapshot.session.sessionId,
                    expectedRevisionId: this.snapshot.revision.revisionId,
                    command: { type: 'retry', messageId: target.messageId },
                });
                const previous = this.snapshot;
                this.snapshot = next;
                this.history = false;
                await this.host.install(projectNativeSession(next));
                await this._emit(NATIVE_SESSION_LIFECYCLE.BRANCH_ACTIVATED, next, previous, { reason: 'retry' });
                await this._emit(NATIVE_SESSION_LIFECYCLE.REVISION_COMMITTED, next, previous, { reason: 'retry' });
                this.generation = { kind: 'retry', sourceMessageId: target.messageId };
                // The retry branch ends at the post-user revision, so the
                // existing generator can run its ordinary append path.
                return 'normal';
            } catch (error) {
                throw this._report(error, { fatal: true });
            }
        }

        if (type === 'continue') {
            const sourceIndex = this.snapshot.timeline.length - 1;
            const source = this.snapshot.timeline[sourceIndex];
            if (!source || source.role !== 'assistant') {
                throw this._report(committedTimelineMutation('Native Continue requires a committed assistant reply'));
            }
            this.generation = {
                kind: 'continue',
                sourceIndex,
                sourceMessageId: source.messageId,
                sourceActorId: source.actorId ?? null,
                sourceContent: source.content,
            };
            return type;
        }

        if (type === 'swipe') {
            throw this._report(committedTimelineMutation('Native manual Swipe is not a committed Timeline capability'));
        }

        if (!['quiet', 'impersonate'].includes(type)) {
            this.generation = { kind: 'append', originalType: type };
        }
        return type;
    }

    async _persistContinuation(messages) {
        const draft = this.generation;
        const projected = projectNativeSession(this.snapshot).chat;
        if (
            messages.length !== projected.length
            || draft.sourceIndex !== projected.length - 1
        ) {
            this._failBarrier(committedTimelineMutation('Native Continue may only extend the current committed assistant as a Draft'));
        }

        try {
            assertCommittedProjection(this.snapshot, messages, { allowMessageIds: [draft.sourceMessageId] });
        } catch (error) {
            this._failBarrier(error);
        }

        const expected = projected[draft.sourceIndex];
        const actual = messages[draft.sourceIndex];
        if (
            actual?.atri_native?.messageId !== draft.sourceMessageId
            || actual?.is_user !== expected.is_user
            || actual?.is_system !== expected.is_system
            || actual?.atri_native?.actorId !== expected.atri_native.actorId
            || JSON.stringify(actual?.atri_native?.variantIds ?? []) !== JSON.stringify(expected.atri_native.variantIds)
            || Number(actual?.swipe_id ?? 0) !== Number(expected.swipe_id ?? 0)
            || !String(actual?.mes ?? '').startsWith(draft.sourceContent)
        ) {
            this._failBarrier(committedTimelineMutation('Native Continue Draft changed committed identity or prefix'));
        }

        const continuation = String(actual.mes ?? '').slice(draft.sourceContent.length);
        if (['', '...'].includes(continuation.trim())) {
            const aborted = this.generation;
            this.generation = null;
            this._clearStagedStates();
            await this.host.install(projectNativeSession(this.snapshot));
            await this._emit(NATIVE_SESSION_LIFECYCLE.DRAFT_ABORTED, this.snapshot, this.snapshot, {
                kind: aborted?.kind ?? 'continue',
                sourceMessageId: aborted?.sourceMessageId ?? null,
            });
            return true;
        }

        const metadata = runtimeMetadata(actual);
        metadata.provenance = {
            ...(metadata.provenance ?? {}),
            continuationOf: draft.sourceMessageId,
            kind: 'continuation',
        };
        const command = {
            type: 'append',
            draft: {
                role: 'assistant',
                ...(draft.sourceActorId ? { actorId: draft.sourceActorId } : {}),
                content: continuation,
                metadata,
            },
        };

        try {
            const previous = this.snapshot;
            const next = await this.request('command', {
                sessionId: previous.session.sessionId,
                expectedRevisionId: previous.revision.revisionId,
                command: { type: 'runtime', commands: [command], statePatch: this._runtimeStatePatch() },
            });
            this.snapshot = next;
            this.generation = null;
            this._clearStagedStates();
            await this.host.install(projectNativeSession(next));
            const appended = next.timeline.slice(previous.timeline.length).map(item => item.messageId);
            await this._emit(NATIVE_SESSION_LIFECYCLE.TIMELINE_APPENDED, next, previous, { messageIds: appended });
            await this._emit(NATIVE_SESSION_LIFECYCLE.REVISION_COMMITTED, next, previous, { messageIds: appended });
            return true;
        } catch (error) {
            throw this._report(error, { fatal: true });
        }
    }

    persist() {
        this.assertWritable();
        const sessionId = this.snapshot.session.sessionId;
        const operation = async () => {
            this.assertWritable();
            if (this.snapshot.session.sessionId !== sessionId) {
                this._failBarrier(committedTimelineMutation('Native Session changed during a queued write'));
            }

            const references = [...this.host.messages()];
            const messages = copy(references);

            if (this.generation?.kind === 'continue') {
                return this._persistContinuation(messages);
            }

            let commands;
            try {
                commands = timelineIntents(this.snapshot, messages);
            } catch (error) {
                this._failBarrier(error);
            }
            const statePatch = this._runtimeStatePatch();

            // Generation placeholders are Draft-only. If Stop/abort produced
            // no useful assistant content, discard the Draft and keep HEAD at
            // the already-committed post-user revision.
            if (this.generation && commands.length > 0 && commands.every(isEmptyGenerationDraft)) {
                const aborted = this.generation;
                // Draft-local runtime mutations are not a committed boundary.
                // Stop/empty output must leave HEAD at the exact post-user
                // Revision, so discard the draft and reinstall canonical
                // SessionState instead of publishing a state-only Revision.
                this.generation = null;
                this._clearStagedStates();
                await this.host.install(projectNativeSession(this.snapshot));
                await this._emit(NATIVE_SESSION_LIFECYCLE.DRAFT_ABORTED, this.snapshot, this.snapshot, {
                    kind: aborted?.kind ?? 'append',
                });
                return true;
            }

            if (!commands.length && this.generation) {
                // A generation with no assistant Draft object is still
                // uncommitted. Ignore host-side runtime-state drift here;
                // finalizeStoppedGeneration() will discard the Draft and
                // reinstall the canonical post-user Revision.
                return true;
            }

            if (!commands.length && Object.keys(statePatch).length === 0) {
                return true;
            }

            try {
                const generationAtCommit = this.generation;
                const keepAssistantDraftOpen = generationAtCommit?.kind === 'append'
                    && commands.every(command => command?.type === 'append' && command?.draft?.role !== 'assistant');
                const previous = this.snapshot;
                const committedLength = previous.timeline.length;
                const next = await this.request('command', {
                    sessionId,
                    expectedRevisionId: previous.revision.revisionId,
                    command: { type: 'runtime', commands, statePatch },
                });
                this.snapshot = next;
                this._clearStagedStates();
                const projection = projectNativeSession(next);
                // Existing committed objects already passed the barrier. Newly
                // committed Draft objects keep their JS identity but are
                // normalized in place to the exact canonical projection.
                references.forEach((message, index) => {
                    const canonical = projection.chat[index];
                    if (!canonical?.atri_native) return;
                    if (index >= committedLength) bindCommittedRuntimeObject(message, canonical);
                    else message.atri_native = copy(canonical.atri_native);
                });
                this.host.revision(projection);
                this.generation = keepAssistantDraftOpen ? generationAtCommit : null;
                const appended = next.timeline.slice(committedLength).map(item => item.messageId);
                if (appended.length) {
                    await this._emit(NATIVE_SESSION_LIFECYCLE.TIMELINE_APPENDED, next, previous, { messageIds: appended });
                }
                await this._emit(NATIVE_SESSION_LIFECYCLE.REVISION_COMMITTED, next, previous, {
                    messageIds: appended,
                    stateNamespaces: Object.keys(statePatch),
                });
                return true;
            } catch (error) {
                throw this._report(error, { fatal: true });
            }
        };
        this.queue = this.queue.then(operation);
        return this.queue;
    }

    /**
     * Finalize a user-driven Stop at the Native Draft boundary.
     * Existing partial/empty Drafts flow through persist(); if the provider
     * aborted before an assistant Draft object existed, clear the lifecycle
     * latch and restore the canonical committed projection explicitly.
     */
    async finalizeStoppedGeneration() {
        if (!this.active || !this.generation) return true;
        const sessionId = this.snapshot.session.sessionId;
        await this.persist();
        if (!this.active || this.snapshot.session.sessionId !== sessionId) return true;
        if (this.generation) {
            const aborted = this.generation;
            this.generation = null;
            this._clearStagedStates();
            await this.host.install(projectNativeSession(this.snapshot));
            await this._emit(NATIVE_SESSION_LIFECYCLE.DRAFT_ABORTED, this.snapshot, this.snapshot, {
                kind: aborted?.kind ?? 'append',
                sourceMessageId: aborted?.sourceMessageId ?? null,
            });
        }
        return true;
    }

    async forkRevision(revisionId = this.snapshot?.revision?.revisionId, { displayName } = {}) {
        this.assertWritable();
        await this.persist();
        const previous = this.snapshot;
        const next = await this.request('command', {
            sessionId: previous.session.sessionId,
            expectedRevisionId: previous.revision.revisionId,
            command: {
                type: 'fork',
                revisionId,
                ...(displayName === undefined ? {} : { displayName }),
            },
        });
        this.snapshot = next;
        this.history = false;
        this.generation = null;
        await this.host.install(projectNativeSession(next));
        await this._emit(NATIVE_SESSION_LIFECYCLE.BRANCH_ACTIVATED, next, previous, { reason: 'runtime-attempt' });
        await this._emit(NATIVE_SESSION_LIFECYCLE.REVISION_COMMITTED, next, previous, { reason: 'runtime-attempt' });
        return next;
    }

    async fork(index, { swipeId = null } = {}) {
        if (swipeId !== null) {
            throw this._report(committedTimelineMutation('Native Branch cannot select a committed Swipe/Variant'));
        }
        if (!this.history) await this.persist();
        else this._assertBarrier();
        if (this.failed) throw new Error('Reload required before branching');
        const message = this.snapshot.timeline[index];
        if (!message) throw new Error('Invalid Native fork message');
        const previous = this.snapshot;
        const next = await this.request('command', {
            sessionId: previous.session.sessionId,
            expectedRevisionId: previous.session.headRevisionId,
            command: {
                type: 'fork',
                revisionId: previous.revision.revisionId,
                messageId: message.messageId,
            },
        });
        this.snapshot = next;
        this.history = false;
        this.generation = null;
        await this.host.install(projectNativeSession(next));
        await this._emit(NATIVE_SESSION_LIFECYCLE.BRANCH_ACTIVATED, next, previous, { reason: 'fork' });
        await this._emit(NATIVE_SESSION_LIFECYCLE.REVISION_COMMITTED, next, previous, { reason: 'fork' });
        return next.revision.branchId;
    }

    async reenterTurn(index) {
        this.assertWritable();
        const targetIndex = Number(index);
        const target = this.snapshot.timeline[targetIndex];
        if (!Number.isInteger(targetIndex) || !target || target.role !== 'user') {
            throw new Error('Native Re-enter Turn requires a committed user Timeline entry');
        }
        if (targetIndex <= 0) {
            throw new Error('Native Re-enter Turn requires a predecessor Timeline boundary');
        }
        const draft = {
            content: String(target.content ?? ''),
            metadata: copy(target.metadata ?? {}),
            sourceMessageId: target.messageId,
        };
        await this.fork(targetIndex - 1);
        return draft;
    }

    async restartFrom(index) {
        const targetIndex = Number(index);
        if (!Number.isInteger(targetIndex) || !this.snapshot?.timeline?.[targetIndex]) {
            throw new Error('Native Restart From Here requires a committed Timeline entry');
        }
        await this.fork(targetIndex);
        return this.snapshot;
    }

    async switchBranch(branchId) {
        if (!this.history) await this.persist();
        else this._assertBarrier();
        const previous = this.snapshot;
        const next = await this.request('command', {
            sessionId: previous.session.sessionId,
            expectedRevisionId: previous.session.headRevisionId,
            command: { type: 'switch', branchId },
        });
        this.snapshot = next;
        this.history = false;
        this.generation = null;
        await this.host.install(projectNativeSession(next));
        await this._emit(NATIVE_SESSION_LIFECYCLE.BRANCH_ACTIVATED, next, previous, { reason: 'switch' });
        await this._emit(NATIVE_SESSION_LIFECYCLE.REVISION_COMMITTED, next, previous, { reason: 'switch' });
    }

    async restoreSavePoint(saveId) {
        this.assertWritable();
        await this.persist();
        const previous = this.snapshot;
        const next = await this.request('command', {
            sessionId: previous.session.sessionId,
            expectedRevisionId: previous.revision.revisionId,
            command: { type: 'restore', saveId },
        });
        this.snapshot = next;
        this.history = false;
        this.generation = null;
        await this.host.install(projectNativeSession(next));
        await this._emit(NATIVE_SESSION_LIFECYCLE.REVISION_RESTORED, next, previous, { saveId });
        await this._emit(NATIVE_SESSION_LIFECYCLE.BRANCH_ACTIVATED, next, previous, { reason: 'restore', saveId });
        await this._emit(NATIVE_SESSION_LIFECYCLE.REVISION_COMMITTED, next, previous, { reason: 'restore', saveId });
        return next;
    }

    knowledgePlan(options = {}) {
        return this.active ? compileNativeKnowledgePlan(this.snapshot, options) : null;
    }

    async evaluateKnowledge(options = {}) {
        if (!this.active) throw new Error('No active Native Session');
        let knowledge = this.knowledgePlan(options);
        const sessionId = this.snapshot.session.sessionId;
        const context = this.lastContextPlan;
        const sameContext = context && context.revisionId === knowledge.revisionId
            && context.target?.kind === knowledge.target?.kind
            && String(context.target?.id || '') === String(knowledge.target?.id || '');
        if (sameContext) {
            const allowed = new Set(context.sourceSelection?.selectedKnowledgeIdentities ?? []);
            knowledge = { ...knowledge, included: knowledge.included.filter(item => allowed.has(item.identity)) };
        }
        const state = this.readState(KNOWLEDGE_RUNTIME_NAMESPACE);
        const targetKey = JSON.stringify([knowledge.target.kind, knowledge.target.id ?? '']);
        const evaluation = await evaluateNativeKnowledge(knowledge, {
            ...options, state: state?.targets?.[targetKey], turn: this.snapshot.timeline?.length ?? 0,
            budget: sameContext ? Math.min(options.budget ?? Infinity,
                this.contextLaneBudget('knowledge')?.cap ?? Infinity) : options.budget,
        });
        return { ...evaluation, sessionId,
            pendingState: { schemaVersion: 1, targets: { ...state?.targets, [targetKey]: evaluation.pendingState } },
            stateFingerprint: JSON.stringify(state), committed: false };
    }

    async commitKnowledge(evaluation) {
        if (evaluation?.committed) return { committed: false, reason: 'already_committed' };
        if (!evaluation || !this.active || evaluation.sessionId !== this.snapshot.session.sessionId
            || evaluation.revisionId !== this.snapshot.revision.revisionId
            || evaluation.branchId !== this.snapshot.revision.branchId) {
            return { committed: false, reason: 'scope_changed' };
        }
        if (evaluation.stateFingerprint !== JSON.stringify(this.readState(KNOWLEDGE_RUNTIME_NAMESPACE))) {
            return { committed: false, reason: 'state_changed' };
        }
        try {
            const result = this.generation
                ? this.stageState(KNOWLEDGE_RUNTIME_NAMESPACE, evaluation.pendingState)
                : await this.updateState(KNOWLEDGE_RUNTIME_NAMESPACE, () => evaluation.pendingState);
            if (!result?.ok) return { committed: false, reason: 'state_commit_failed' };
            evaluation.committed = true;
            return { committed: true, activatedEntries: evaluation.entries.length };
        } catch {
            return { committed: false, reason: 'state_commit_failed' };
        }
    }

    contextDerivedState() {
        if (!this.active) return null;
        return normalizeContextDerivedState(this.readState(CONTEXT_DERIVED_NAMESPACE));
    }

    async _publishDerivedTransform(sourceRevisionId, transform) {
        if (!this.active || this.history || this.failed) {
            return { ok: false, published: false, reason: 'session_not_writable' };
        }
        const sessionId = this.snapshot.session.sessionId;
        if (this.snapshot.revision.revisionId !== sourceRevisionId) {
            return { ok: false, published: false, reason: 'stale_revision' };
        }

        if (this.generation) {
            try {
                const current = normalizeContextDerivedState(this.readState(CONTEXT_DERIVED_NAMESPACE));
                const nextValue = transform(current);
                const staged = this.stageState(CONTEXT_DERIVED_NAMESPACE, nextValue);
                return {
                    ok: true,
                    published: false,
                    staged: true,
                    updated: staged.updated,
                    state: staged.state,
                };
            } catch (error) {
                return {
                    ok: false,
                    published: false,
                    reason: 'derived_stage_failed',
                    error: String(error?.message || error),
                };
            }
        }

        return this._queue(async () => {
            if (!this.active || this.history || this.failed
                || this.snapshot.session.sessionId !== sessionId
                || this.snapshot.revision.revisionId !== sourceRevisionId) {
                return { ok: false, published: false, reason: 'stale_revision' };
            }
            const current = normalizeContextDerivedState(this.readState(CONTEXT_DERIVED_NAMESPACE));
            let nextValue;
            try {
                nextValue = transform(current);
            } catch (error) {
                return {
                    ok: false,
                    published: false,
                    reason: 'derived_transform_failed',
                    error: String(error?.message || error),
                };
            }
            if (equalJson(current, nextValue)) {
                return { ok: true, published: false, updated: false, state: copy(current) };
            }
            const previous = this.snapshot;
            try {
                const next = await this.request('command', {
                    sessionId,
                    expectedRevisionId: sourceRevisionId,
                    command: {
                        type: 'runtime',
                        statePatch: { [CONTEXT_DERIVED_NAMESPACE]: copy(nextValue) },
                    },
                });
                this.snapshot = next;
                this._clearStagedStates([CONTEXT_DERIVED_NAMESPACE]);
                this.lastContextPlan = null;
                this.host?.revision?.(projectNativeSession(next));
                await this._emit(NATIVE_SESSION_LIFECYCLE.REVISION_COMMITTED, next, previous, {
                    stateNamespaces: [CONTEXT_DERIVED_NAMESPACE],
                    derived: true,
                });
                return {
                    ok: true,
                    published: true,
                    updated: true,
                    state: copy(next.states?.[CONTEXT_DERIVED_NAMESPACE] ?? nextValue),
                };
            } catch (error) {
                if (error?.status === 409 || error?.code === 'native_session_head_conflict') {
                    return { ok: false, published: false, reason: 'stale_revision' };
                }
                console.warn('[native-session] derived Context publication failed gracefully', error);
                return {
                    ok: false,
                    published: false,
                    reason: 'derived_publish_failed',
                    error: String(error?.message || error),
                };
            }
        });
    }

    async appendNarrativeArtifact(artifact) {
        if (!this.active) return { ok: false, published: false, reason: 'session_not_writable' };
        const revisionId = artifact?.revisionId || this.snapshot.revision.revisionId;
        const branchId = artifact?.branchId || this.snapshot.revision.branchId;
        return this._publishDerivedTransform(revisionId, current => appendNarrativeArtifact(current, {
            ...artifact,
            branchId,
            revisionId,
            fromRevisionId: artifact?.fromRevisionId || revisionId,
            toRevisionId: artifact?.toRevisionId || revisionId,
        }));
    }

    async openCommitment(commitment) {
        if (!this.active) return { ok: false, published: false, reason: 'session_not_writable' };
        const revisionId = commitment?.revisionId || this.snapshot.revision.revisionId;
        const branchId = commitment?.branchId || this.snapshot.revision.branchId;
        return this._publishDerivedTransform(revisionId, current => openDerivedCommitment(current, {
            ...commitment,
            branchId,
            revisionId,
        }));
    }

    async transitionCommitment(commitmentId, transition) {
        if (!this.active) return { ok: false, published: false, reason: 'session_not_writable' };
        const revisionId = transition?.revisionId || this.snapshot.revision.revisionId;
        return this._publishDerivedTransform(revisionId, current => transitionDerivedCommitment(
            current,
            commitmentId,
            { ...transition, revisionId },
        ));
    }

    async appendTurnDigest(digest) {
        if (!this.active) return { ok: false, published: false, reason: 'session_not_writable' };
        const revisionId = digest?.revisionId || this.snapshot.revision.revisionId;
        const branchId = digest?.branchId || this.snapshot.revision.branchId;
        return this._publishDerivedTransform(revisionId, current => appendTurnDigest(current, {
            ...digest,
            branchId,
            revisionId,
        }));
    }

    async prepareContext(options = {}) {
        if (!this.active) return null;
        const plan = await compileNativeContextPlan(this.snapshot, options);
        this.lastContextPlan = plan;
        return plan;
    }

    currentContextPlan() {
        return this.lastContextPlan ? copy(this.lastContextPlan) : null;
    }

    contextLaneBudget(lane) {
        return getContextLaneBudget(this.lastContextPlan, lane);
    }

    recordContextLane(lane, items = []) {
        if (!this.lastContextPlan) return null;
        this.lastContextPlan = replaceContextLaneReservation(this.lastContextPlan, lane, items);
        return copy(this.lastContextPlan);
    }

    filterCoreChatForContext(coreChat, plan = this.lastContextPlan) {
        return filterNativeCoreChatForContext(coreChat, plan);
    }

    async readTimelineRange(options = {}) {
        if (!this.active) throw new Error('No Native Session is open');
        return this.request('timeline', {
            sessionId: this.snapshot.session.sessionId,
            revisionId: options.revisionId ?? this.snapshot.revision.revisionId,
            fromSequence: options.fromSequence ?? 0,
            toSequence: options.toSequence ?? null,
            limit: options.limit ?? 256,
        });
    }

    async readContextSources(sourceRefs = []) {
        if (!this.active) throw new Error('No Native Session is open');
        const timelineRefs = (Array.isArray(sourceRefs) ? sourceRefs : [])
            .filter(ref => ref?.kind === 'timeline' && typeof ref.messageId === 'string' && ref.messageId);
        const groups = new Map();
        for (const ref of timelineRefs) {
            const revisionId = String(ref.revisionId || this.snapshot.revision.revisionId);
            const ids = groups.get(revisionId) ?? new Set();
            ids.add(ref.messageId);
            groups.set(revisionId, ids);
        }
        const resolved = [];
        for (const [revisionId, ids] of groups) {
            const response = await this.request('timeline', {
                sessionId: this.snapshot.session.sessionId,
                revisionId,
                messageIds: [...ids],
            });
            resolved.push(response);
        }
        return resolved;
    }

    regexScripts() { return this.active ? this.snapshot.manifest.processors?.regex ?? [] : []; }

    async upload(base64, { displayName, mediaType }) {
        this.assertWritable();
        this._assertBarrier();
        const ref = await this.request('attachment', {
            sessionId: this.snapshot.session.sessionId,
            data: base64,
            displayName,
            mediaType,
        });
        return { ...ref, url: nativeAssetUrl(ref.assetId) };
    }
}

export const nativeSessionRuntime = new NativeSessionRuntime();
