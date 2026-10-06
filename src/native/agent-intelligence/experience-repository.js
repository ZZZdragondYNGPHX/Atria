import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { ConflictError } from '../../storage/errors.js';
import { cloneNativeDocument, hashNativeDocument, putMutable, withNativeResourceWrite } from '../repositories/common.js';
import { assertEvidenceScope, assertEvidenceSet, fields, text } from './contracts.js';
import { AgentEvolutionRepository } from './evolution-repository.js';

export const DAY = 86400000;
export const experienceIdentity = (scope, subject) => hashNativeDocument({ scope: assertEvidenceScope(scope), subject: text(subject, 'Subject') });
const key = (handle, scopeId) => ({ kind: K.agentExperience, handle, scopeId });
const digest = value => { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new TypeError('Invalid experience hash'); };
const time = value => { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Invalid experience timestamp'); };
export function publicNote(value) {
    if (typeof value !== 'string' || value.length > 4096) throw new TypeError('Invalid public note');
    return value;
}
export function assertFeedbackInput(value) {
    fields(value, ['kind', 'signal', 'dimension', 'note'], 'Feedback input');
    const signals = { explicit: ['correction', 'prefer', 'avoid'], observation: ['regenerate', 'edit', 'abandon', 'accept', 'review_reject'],
        technical: ['validation_failed', 'validated', 'committed', 'failed', 'cancelled', 'unknown'] };
    if (!signals[value.kind]?.includes(value.signal) || !['behavior', 'style', 'correctness', 'workflow', 'general'].includes(value.dimension)) throw new TypeError('Invalid feedback classification');
    publicNote(value.note);
    if (value.kind === 'observation' && value.note !== '') throw new TypeError('Weak observation cannot carry preference text');
    return value;
}
export function assertExperience(value) {
    const doc = cloneNativeDocument(value);
    fields(doc, ['schemaVersion', 'scopeId', 'scope', 'subject', 'sequence', 'retentionDays', 'feedback', 'diagnoses'], 'Experience');
    if (doc.schemaVersion !== 1 || doc.scopeId !== experienceIdentity(doc.scope, doc.subject)
        || !Number.isSafeInteger(doc.sequence) || doc.sequence < 0 || !Number.isSafeInteger(doc.retentionDays) || doc.retentionDays < 1 || doc.retentionDays > 365) throw new TypeError('Invalid experience schema');
    if (!Array.isArray(doc.feedback) || doc.feedback.length > 256 || !Array.isArray(doc.diagnoses) || doc.diagnoses.length > 64
        || Buffer.byteLength(JSON.stringify(doc)) > 512 * 1024) throw new TypeError('Experience capacity exceeded');
    const ids = new Set();
    for (const item of doc.feedback) {
        fields(item, ['id', 'revision', 'kind', 'signal', 'dimension', 'note', 'origin', 'status', 'source', 'createdAt', 'expiresAt'], 'Feedback');
        text(item.id, 'Feedback identity');
        if (ids.has(item.id) || !Number.isSafeInteger(item.revision) || item.revision < 0 || !['active', 'withdrawn', 'stale'].includes(item.status)) throw new TypeError('Invalid feedback identity/state');
        ids.add(item.id);
        assertFeedbackInput({ kind: item.kind, signal: item.signal, dimension: item.dimension, note: item.note });
        if (item.origin !== (item.kind === 'technical' ? 'host' : item.kind === 'explicit' ? 'user' : 'client_observation')) throw new TypeError('Feedback origin mismatch');
        fields(item.source, ['kind', 'id', 'integrity', 'sources'], 'Feedback source');
        if (!['evidence', 'project_task'].includes(item.source.kind) || (doc.scope.domain === 'project') !== (item.source.kind === 'project_task')) throw new TypeError('Source domain mismatch');
        text(item.source.id, 'Source identity'); digest(item.source.integrity);
        if (item.source.kind === 'evidence') digest(item.source.id);
        if (item.source.sources !== null) {
            const sources = assertEvidenceSet(item.source.sources);
            if (hashNativeDocument(sources.scope) !== hashNativeDocument(doc.scope)) throw new TypeError('Source scope mismatch');
        }
        time(item.createdAt); time(item.expiresAt);
        if (item.expiresAt < item.createdAt || item.expiresAt > item.createdAt + 365 * DAY) throw new TypeError('Invalid retention');
    }
    const diagnoses = new Set();
    for (const item of doc.diagnoses) {
        fields(item, ['id', 'batchHash', 'feedbackRefs', 'origin', 'status', 'rationale', 'conditions', 'counterexamples', 'direction', 'createdAt', 'expiresAt'], 'Diagnosis');
        text(item.id, 'Diagnosis identity'); digest(item.batchHash); publicNote(item.rationale);
        if (diagnoses.has(item.id) || !['user_hypothesis', 'model_hypothesis'].includes(item.origin) || !['active', 'stale'].includes(item.status)
            || !['skill', 'prompt', 'orchestration', 'undetermined'].includes(item.direction)) throw new TypeError('Invalid diagnosis');
        diagnoses.add(item.id);
        for (const list of [item.conditions, item.counterexamples]) {
            if (!Array.isArray(list) || list.length > 16) throw new TypeError('Invalid diagnosis conditions');
            list.forEach(publicNote);
        }
        if (!Array.isArray(item.feedbackRefs) || !item.feedbackRefs.length || item.feedbackRefs.length > 32 || new Set(item.feedbackRefs.map(ref => ref.id)).size !== item.feedbackRefs.length) throw new TypeError('Invalid diagnosis dependencies');
        for (const ref of item.feedbackRefs) {
            fields(ref, ['id', 'revision', 'integrity'], 'Diagnosis dependency'); text(ref.id, 'Feedback identity'); digest(ref.integrity);
            if (!Number.isSafeInteger(ref.revision) || ref.revision < 0 || !ids.has(ref.id)) throw new TypeError('Missing diagnosis dependency');
        }
        if (item.batchHash !== hashNativeDocument({ scopeId: doc.scopeId, feedbackRefs: item.feedbackRefs })) throw new TypeError('Diagnosis batch mismatch');
        time(item.createdAt); time(item.expiresAt);
        if (item.expiresAt < item.createdAt || item.expiresAt > item.createdAt + 365 * DAY) throw new TypeError('Invalid diagnosis retention');
    }
    return doc;
}
export function removeFeedback(doc, ids) {
    doc.feedback = doc.feedback.filter(item => !ids.has(item.id));
    doc.diagnoses = doc.diagnoses.filter(item => !item.feedbackRefs.some(ref => ids.has(ref.id)));
}
export function pruneExperience(doc, now) {
    removeFeedback(doc, new Set(doc.feedback.filter(item => item.expiresAt <= now).map(item => item.id)));
    doc.diagnoses = doc.diagnoses.filter(item => item.expiresAt > now);
    return doc;
}

export class AgentExperienceRepository {
    constructor({ engine }) { if (!engine) throw new TypeError('Experience requires StorageEngine'); this.engine = engine; }
    _document(record) {
        if (record.integrity !== hashNativeDocument(record.doc)) throw new TypeError('Experience integrity mismatch');
        const doc = assertExperience(record.doc);
        if (doc.scopeId !== record.key.scopeId) throw new TypeError('Experience key mismatch');
        return doc;
    }
    async get(handle, scope, subject) {
        text(handle, 'Authenticated owner');
        const record = await this.engine.withTransaction(handle, tx => tx.getResource(key(handle, experienceIdentity(scope, subject))));
        return record ? this._document({ ...record, key: key(handle, experienceIdentity(scope, subject)) }) : null;
    }
    async mutate(handle, scope, subject, expectedSequence, operation) {
        text(handle, 'Authenticated owner');
        const scopeId = experienceIdentity(scope, subject);
        return withNativeResourceWrite(handle, 'experience:' + scopeId, async () => {
            assertWritable();
            const previous = await this.get(handle, scope, subject);
            if (expectedSequence !== undefined && expectedSequence !== (previous?.sequence ?? null)) throw new ConflictError('agent_experience_sequence_conflict');
            const doc = previous ? cloneNativeDocument(previous) : { schemaVersion: 1, scopeId, scope, subject, sequence: 0, retentionDays: 30, feedback: [], diagnoses: [] };
            await operation(doc);
            if (previous && hashNativeDocument(doc) === hashNativeDocument(previous)) return previous;
            doc.sequence = previous ? previous.sequence + 1 : 0;
            assertExperience(doc);
            if (previous && (previous.feedback.some(old => {
                const next = doc.feedback.find(item => item.id === old.id); return !next || hashNativeDocument(next) !== hashNativeDocument(old);
            }) || previous.diagnoses.some(old => {
                const next = doc.diagnoses.find(item => item.id === old.id); return !next || hashNativeDocument(next) !== hashNativeDocument(old);
            }))) await new AgentEvolutionRepository({ engine: this.engine }).invalidate(handle, scope, subject, 'experience_changed');
            return this.engine.withTransaction(handle, tx => putMutable(tx, key(handle, scopeId), doc, { expectedIntegrity: previous ? hashNativeDocument(previous) : null }));
        });
    }
    async list(handle) {
        text(handle, 'Authenticated owner');
        const records = await this.engine.withTransaction(handle, tx => tx.listResources({ kind: K.agentExperience, handle }));
        return records.map(record => this._document(record));
    }
    async deleteScope(handle, scope, subject, expectedSequence) {
        const scopeId = experienceIdentity(scope, subject);
        return withNativeResourceWrite(handle, 'experience:' + scopeId, async () => {
            assertWritable();
            const doc = await this.get(handle, scope, subject);
            if (expectedSequence !== (doc?.sequence ?? null)) throw new ConflictError('agent_experience_sequence_conflict');
            await new AgentEvolutionRepository({ engine: this.engine }).invalidate(handle, scope, subject, 'experience_deleted');
            return this.engine.withTransaction(handle, tx => tx.deleteResource(key(handle, scopeId)));
        });
    }
    // Purge content before the original source is deleted. No cross-resource
    // transaction is claimed; consumers also revalidate source existence.
    async purgeSource(handle, kind, id, scope = null) {
        assertWritable();
        for (const ledger of await this.list(handle)) {
            if (scope && hashNativeDocument(ledger.scope) !== hashNativeDocument(scope)) continue;
            await this.mutate(handle, ledger.scope, ledger.subject, undefined, doc => {
                removeFeedback(doc, new Set(doc.feedback.filter(item => item.source.kind === kind && item.source.id === id).map(item => item.id)));
            });
        }
    }
    async purgeProject(handle, projectId) {
        assertWritable();
        for (const doc of await this.list(handle)) {
            if (doc.scope.domain === 'project' && doc.scope.projectId === projectId) await this.deleteScope(handle, doc.scope, doc.subject, doc.sequence);
        }
    }
}
