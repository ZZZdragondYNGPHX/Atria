import { projectNativeSession, timelineIntents, projectKnowledgeEntries, nativeAssetUrl } from './session-projection.js';

/** One active downstream projection. Generation/rendering remain owned by the existing ST host. */
export class NativeSessionRuntime {
    constructor() { this.snapshot = null; this.host = null; this.queue = Promise.resolve(); this.failed = false; this.history = false; }
    get active() { return this.snapshot !== null; }
    configure(host) { this.host = host; }
    async request(path, body) {
        const response = await fetch(`/api/native/session/${path}`, { method: 'POST', headers: this.host.headers(), body: JSON.stringify(body) });
        if (!response.ok) {
            const error = new Error(`Native Session ${path} failed (${response.status}); reload required`);
            error.status = response.status;
            throw error;
        }
        return response.json();
    }
    assertWritable() {
        if (!this.active || this.history || this.failed) throw new Error('Native Session is not writable; open/reload current HEAD first');
    }
    async open(sessionId, { revisionId } = {}) {
        if (this.host.isGenerating()) throw new Error('Stop generation before switching Native Session');
        await this.queue.catch(() => {});
        const snapshot = await this.request('load', { sessionId, revisionId });
        this.queue = Promise.resolve();
        this.snapshot = snapshot;
        this.history = revisionId !== undefined;
        this.failed = false;
        await this.host.install(projectNativeSession(snapshot));
        return snapshot;
    }
    async reload() {
        return this.open(this.snapshot.session.sessionId, this.history ? { revisionId: this.snapshot.revision.revisionId } : {});
    }
    async close() {
        if (this.host.isGenerating()) throw new Error('Stop generation before closing Native Session');
        await this.queue;
        this.snapshot = null;
        this.failed = false;
        this.history = false;
        await this.host.clear();
    }
    persist() {
        this.assertWritable();
        const sessionId = this.snapshot.session.sessionId;
        const operation = async () => {
            this.assertWritable();
            if (this.snapshot.session.sessionId !== sessionId) throw new Error('Native Session changed during a write');
            const references = [...this.host.messages()];
            const messages = JSON.parse(JSON.stringify(references));
            const commands = timelineIntents(this.snapshot, messages);
            if (!commands.length) return true;
            try {
                const next = await this.request('command', { sessionId, expectedRevisionId: this.snapshot.revision.revisionId,
                    command: { type: 'timeline', commands } });
                this.snapshot = next;
                const projection = projectNativeSession(next);
                // Bind returned opaque IDs to the same runtime objects, never replace streaming/edit-owned buffers.
                references.forEach((message, index) => { message.atri_native = projection.chat[index].atri_native; });
                this.host.revision(projection);
                return true;
            } catch (error) {
                this.failed = true;
                this.host.error(error);
                throw error; // Never fall through to JSONL full-save recovery.
            }
        };
        this.queue = this.queue.then(operation);
        return this.queue;
    }
    async fork(index, { swipeId = null } = {}) {
        if (!this.history) await this.persist();
        if (this.failed) throw new Error('Reload required before branching');
        const message = this.snapshot.timeline[index];
        if (!message) throw new Error('Invalid Native fork message');
        const variantId = swipeId === null ? message.activeVariantId : message.variantIds[swipeId];
        if (!variantId) throw new Error('Invalid Native fork Variant');
        const next = await this.request('command', { sessionId: this.snapshot.session.sessionId,
            expectedRevisionId: this.snapshot.session.headRevisionId,
            command: { type: 'fork', revisionId: this.snapshot.revision.revisionId, messageId: message.messageId, variantId } });
        this.snapshot = next;
        this.history = false;
        await this.host.install(projectNativeSession(next));
        return next.revision.branchId;
    }
    async switchBranch(branchId) {
        if (!this.history) await this.persist();
        const next = await this.request('command', { sessionId: this.snapshot.session.sessionId,
            expectedRevisionId: this.snapshot.session.headRevisionId, command: { type: 'switch', branchId } });
        this.snapshot = next;
        this.history = false;
        await this.host.install(projectNativeSession(next));
    }
    knowledgeEntries() { return this.active ? projectKnowledgeEntries(this.snapshot) : null; }
    regexScripts() { return this.active ? this.snapshot.manifest.processors?.regex ?? [] : []; }
    async upload(base64, { displayName, mediaType }) {
        this.assertWritable();
        const ref = await this.request('attachment', { sessionId: this.snapshot.session.sessionId, data: base64, displayName, mediaType });
        return { ...ref, url: nativeAssetUrl(ref.assetId) };
    }
    removeSwipe(index, swipeIndex) {
        this.assertWritable();
        this.host.messages()[index]?.atri_native?.variantIds.splice(swipeIndex, 1);
    }
}
export const nativeSessionRuntime = new NativeSessionRuntime();
