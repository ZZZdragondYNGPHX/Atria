import { NATIVE_RESOURCE_KINDS } from '../contracts.js';
import { hashNativeDocument, nativeRecord } from '../repositories/common.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { withRuntimeWrite } from './persistence.js';
import { GenerationError, immutable } from './execution-utils.js';

export const runtimeCheckpointLimits = Object.freeze({ count: 128, totalBytes: 16 * 1024 * 1024, entryBytes: 2 * 1024 * 1024, ttlMs: 600000 });
const unavailable = () => { throw new GenerationError('generation_continuation_unavailable'); };
const sameScope = (a, b) => hashNativeDocument(a.executionScope) === hashNativeDocument(b.executionScope);
const authentic = (doc, state) => state?.schemaVersion === 1 && state.bindingFingerprint === doc.bindingFingerprint
    && state.text === doc.text && hashNativeDocument(state.calls) === hashNativeDocument(doc.calls);

// Private Runtime storage. Only the server adapter obtains this port; no domain
// resource, public endpoint or caller JSON can supply its engine/owner binding.
export class RuntimeCheckpointStore {
    constructor({ engine, handle, now = Date.now, publicConversation = null }) {
        if (!engine || !handle) throw new TypeError('Runtime checkpoint requires engine and owner');
        this.engine = engine; this.handle = handle; this.now = now;
        this.ownerFingerprint = hashNativeDocument(handle);
        this.publicConversation = publicConversation;
    }
    key(checkpointId) { return { kind: NATIVE_RESOURCE_KINDS.runtimeCheckpoint, handle: this.handle, checkpointId }; }
    async authority(tx, binding) {
        const refs = binding.runtimeResourceRefs;
        if (!refs) return null;
        const rows = [];
        for (const [field, kind] of [['runtimeRouteId', NATIVE_RESOURCE_KINDS.runtimeRoute], ['modelProfileId', NATIVE_RESOURCE_KINDS.modelProfile], ['connectionProfileId', NATIVE_RESOURCE_KINDS.connectionProfile]]) {
            const key = { kind, handle: this.handle, [field]: refs[field] }; const row = await tx.getResource(key);
            if (!row || row.integrity !== hashNativeDocument(row.doc)) unavailable();
            rows.push({ key, integrity: row.integrity, updatedAt: row.updatedAt });
        }
        return hashNativeDocument(rows);
    }
    async prepare(binding) {
        if (binding.ownerFingerprint !== this.ownerFingerprint) unavailable();
        await this._operate(async tx => {
            const authority = await this.authority(tx, binding);
            if (this.authorityFingerprint !== undefined && this.authorityFingerprint !== authority) unavailable();
            this.authorityFingerprint = authority;
        });
    }
    async _operate(operation) {
        try {
            assertWritable();
            return await withRuntimeWrite(this.handle, () => this.engine.withTransaction(this.handle, operation));
        } catch { return unavailable(); }
    }
    valid(record) {
        try {
            const doc = record?.doc;
            return doc?.schemaVersion === 1 && /^[a-f0-9]{64}$/.test(doc.checkpointId)
                && doc.binding?.ownerFingerprint === this.ownerFingerprint
                && doc.bindingFingerprint === hashNativeDocument(doc.binding)
                && record.integrity === hashNativeDocument(doc)
                && Number.isSafeInteger(doc.createdAt) && Number.isSafeInteger(doc.expiresAt)
                && doc.createdAt <= this.now() && doc.expiresAt > this.now()
                && doc.expiresAt - doc.createdAt === runtimeCheckpointLimits.ttlMs
                && Array.isArray(doc.sequence) && Array.isArray(doc.calls) && typeof doc.text === 'string'
                && Buffer.byteLength(JSON.stringify(doc)) <= runtimeCheckpointLimits.entryBytes;
        } catch { return false; }
    }
    async save(state, entry) {
        const createdAt = this.now();
        const doc = immutable({ ...entry, schemaVersion: 1, checkpointId: state.checkpointId,
            createdAt, expiresAt: createdAt + runtimeCheckpointLimits.ttlMs });
        const record = nativeRecord(doc, { createdAt });
        if (!this.valid(record) || !authentic(doc, state)) unavailable();
        return this._operate(async tx => {
            const authority = await this.authority(tx, entry.binding);
            if (this.authorityFingerprint !== undefined && this.authorityFingerprint !== authority) unavailable();
            const stored = nativeRecord({ ...doc, authorityFingerprint: authority }, { createdAt });
            if (!this.valid(stored)) unavailable();
            const rows = await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.runtimeCheckpoint, handle: this.handle });
            const live = [];
            for (const row of rows) {
                if (!this.valid(row)) await tx.deleteResource(row.key);
                else live.push(row);
            }
            live.sort((a, b) => a.doc.createdAt - b.doc.createdAt || a.doc.checkpointId.localeCompare(b.doc.checkpointId));
            let bytes = live.reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify(row.doc)), 0);
            const added = Buffer.byteLength(JSON.stringify(stored.doc));
            while (live.length >= runtimeCheckpointLimits.count || bytes + added > runtimeCheckpointLimits.totalBytes) {
                const oldest = live.shift(); if (!oldest) unavailable();
                bytes -= Buffer.byteLength(JSON.stringify(oldest.doc)); await tx.deleteResource(oldest.key);
            }
            const inserted = await tx.putResourceIfMatch(this.key(state.checkpointId), null, stored);
            if (!inserted.updated) unavailable();
        });
    }
    async read(state, binding, sequence, index) {
        if (!/^[a-f0-9]{64}$/.test(state?.checkpointId) || binding.ownerFingerprint !== this.ownerFingerprint) unavailable();
        let accepted;
        await this._operate(async tx => {
            const key = this.key(state.checkpointId); const row = await tx.getResource(key);
            if (!row) return;
            if (!this.valid(row) || row.doc.checkpointId !== state.checkpointId) { await tx.deleteResource(key); return; }
            const doc = row.doc;
            if (!authentic(doc, state)) return; // Forged handles never evict authentic state.
            const authority = await this.authority(tx, binding);
            const match = doc.authorityFingerprint === authority && (this.authorityFingerprint === undefined || this.authorityFingerprint === authority)
                && doc.bindingFingerprint === hashNativeDocument(binding) && sequence[index]?.content === doc.text
                && hashNativeDocument(sequence[index]?.tool_calls || []) === hashNativeDocument(doc.calls)
                && hashNativeDocument(sequence.slice(0, index).map(({ providerState: _state, ...message }) => message)) === hashNativeDocument(doc.sequence);
            if (match) accepted = doc;
            else if (sameScope(binding, doc.binding)) await tx.deleteResource(key);
        });
        if (!accepted) unavailable();
        return immutable(accepted);
    }
    async restore(binding, sequence) {
        if (binding.ownerFingerprint !== this.ownerFingerprint) unavailable();
        const publicSequence = sequence.filter(message => message.role !== 'system').map(({ providerState: _state, ...message }) => message);
        // Automatic selection uses the current original Task's saved, complete
        // public conversation, not arbitrary matching caller history or TaskId.
        if (!this.publicConversation || hashNativeDocument(publicSequence) !== hashNativeDocument(this.publicConversation)) return sequence;
        const restored = [...sequence];
        await this._operate(async tx => {
            for (const row of await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.runtimeCheckpoint, handle: this.handle })) {
                if (!this.valid(row)) { await tx.deleteResource(row.key); continue; }
                const doc = row.doc;
                if (!sameScope(binding, doc.binding)) continue;
                if (doc.bindingFingerprint !== hashNativeDocument(binding) || doc.authorityFingerprint !== await this.authority(tx, binding)) { await tx.deleteResource(row.key); continue; }
                const index = doc.sequence.length; const message = restored[index];
                if (message?.role !== 'assistant' || message.providerState || message.content !== doc.text
                    || hashNativeDocument(message.tool_calls || []) !== hashNativeDocument(doc.calls)
                    || hashNativeDocument(sequence.slice(0, index).map(({ providerState: _state, ...item }) => item)) !== hashNativeDocument(doc.sequence)) continue;
                restored[index] = { ...message, providerState: { schemaVersion: 1, checkpointId: doc.checkpointId,
                    bindingFingerprint: doc.bindingFingerprint, text: doc.text, calls: doc.calls } };
            }
        });
        return immutable(restored);
    }
    async discard(binding) {
        if (binding.ownerFingerprint !== this.ownerFingerprint) unavailable();
        return this._operate(async tx => {
            for (const row of await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.runtimeCheckpoint, handle: this.handle })) {
                if (!this.valid(row) || sameScope(binding, row.doc.binding)) await tx.deleteResource(row.key);
            }
        });
    }
}
