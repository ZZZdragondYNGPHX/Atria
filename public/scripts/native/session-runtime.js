import {
    assertCommittedProjection,
    committedTimelineMutation,
    nativeAssetUrl,
    projectKnowledgeEntries,
    projectNativeSession,
    runtimeMetadata,
    timelineIntents,
} from './session-projection.js';

function copy(value) {
    return JSON.parse(JSON.stringify(value));
}

function isEmptyGenerationDraft(command) {
    const content = String(command?.draft?.content ?? '');
    const attachments = command?.draft?.metadata?.attachments ?? [];
    const reasoning = String(command?.draft?.metadata?.runtime?.extra?.reasoning ?? '');
    return ['', '...'].includes(content.trim()) && attachments.length === 0 && reasoning.trim() === '';
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
    }

    get active() { return this.snapshot !== null; }

    configure(host) { this.host = host; }

    async request(path, body) {
        const response = await fetch(`/api/native/session/${path}`, {
            method: 'POST',
            headers: this.host.headers(),
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            let payload = null;
            try { payload = await response.json(); } catch { /* response body is optional */ }
            const error = new Error(`Native Session ${path} failed (${response.status}); reload required`);
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
        const error = committedTimelineMutation(`Native committed Timeline does not allow ${action}`);
        error.nonFatal = true;
        this._report(error, { fatal: false });
        return true;
    }

    async _loadProjection(sessionId, { revisionId } = {}) {
        const snapshot = await this.request('load', { sessionId, revisionId });
        this.queue = Promise.resolve();
        this.snapshot = snapshot;
        this.history = revisionId !== undefined;
        this.failed = false;
        this.generation = null;
        await this.host.install(projectNativeSession(snapshot));
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
        await this.host.clear();
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
                this.snapshot = next;
                this.history = false;
                await this.host.install(projectNativeSession(next));
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

    async _persistContinuation(references, messages) {
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
            this.generation = null;
            await this.host.install(projectNativeSession(this.snapshot));
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
            const next = await this.request('command', {
                sessionId: this.snapshot.session.sessionId,
                expectedRevisionId: this.snapshot.revision.revisionId,
                command: { type: 'timeline', commands: [command] },
            });
            this.snapshot = next;
            this.generation = null;
            await this.host.install(projectNativeSession(next));
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
                return this._persistContinuation(references, messages);
            }

            let commands;
            try {
                commands = timelineIntents(this.snapshot, messages);
            } catch (error) {
                this._failBarrier(error);
            }

            // Generation placeholders are Draft-only. If Stop/abort produced
            // no useful assistant content, discard the Draft and keep HEAD at
            // the already-committed post-user revision.
            if (this.generation && commands.length > 0 && commands.every(isEmptyGenerationDraft)) {
                this.generation = null;
                await this.host.install(projectNativeSession(this.snapshot));
                return true;
            }

            if (!commands.length) {
                if (this.generation) this.generation = null;
                return true;
            }

            try {
                const next = await this.request('command', {
                    sessionId,
                    expectedRevisionId: this.snapshot.revision.revisionId,
                    command: { type: 'timeline', commands },
                });
                this.snapshot = next;
                const projection = projectNativeSession(next);
                // Ordinary append keeps the generator-owned runtime objects
                // alive; bind only the returned opaque IDs.
                references.forEach((message, index) => {
                    if (projection.chat[index]?.atri_native) {
                        message.atri_native = projection.chat[index].atri_native;
                    }
                });
                this.host.revision(projection);
                this.generation = null;
                return true;
            } catch (error) {
                throw this._report(error, { fatal: true });
            }
        };
        this.queue = this.queue.then(operation);
        return this.queue;
    }

    async fork(index, { swipeId = null } = {}) {
        if (!this.history) await this.persist();
        else this._assertBarrier();
        if (this.failed) throw new Error('Reload required before branching');
        const message = this.snapshot.timeline[index];
        if (!message) throw new Error('Invalid Native fork message');
        const activeIndex = message.variantIds.indexOf(message.activeVariantId);
        if (swipeId !== null && Number(swipeId) !== activeIndex) {
            throw this._report(committedTimelineMutation('Native Branch cannot switch a committed Variant'));
        }
        const next = await this.request('command', {
            sessionId: this.snapshot.session.sessionId,
            expectedRevisionId: this.snapshot.session.headRevisionId,
            command: {
                type: 'fork',
                revisionId: this.snapshot.revision.revisionId,
                messageId: message.messageId,
                variantId: message.activeVariantId,
            },
        });
        this.snapshot = next;
        this.history = false;
        this.generation = null;
        await this.host.install(projectNativeSession(next));
        return next.revision.branchId;
    }

    async switchBranch(branchId) {
        if (!this.history) await this.persist();
        else this._assertBarrier();
        const next = await this.request('command', {
            sessionId: this.snapshot.session.sessionId,
            expectedRevisionId: this.snapshot.session.headRevisionId,
            command: { type: 'switch', branchId },
        });
        this.snapshot = next;
        this.history = false;
        this.generation = null;
        await this.host.install(projectNativeSession(next));
    }

    knowledgeEntries() { return this.active ? projectKnowledgeEntries(this.snapshot) : null; }

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
