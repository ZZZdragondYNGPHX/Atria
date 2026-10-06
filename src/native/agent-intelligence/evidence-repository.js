import { NATIVE_RESOURCE_KINDS } from '../contracts.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { ConflictError } from '../../storage/errors.js';
import { cloneNativeDocument, hashNativeDocument, putImmutable, putMutable, withNativeResourceWrite } from '../repositories/common.js';
import { assertEvidenceScope, assertEvidenceSet, fields, text } from './contracts.js';
import { assertEvidenceTrace } from '../../../public/shared/agent-evidence-trace.js';
import { assertNativeId } from '../identity.js';

const key = (handle, evidenceId) => ({ kind: NATIVE_RESOURCE_KINDS.agentEvidence, handle, evidenceId });
export const evidenceIdentity = (scope, rootRunId) => hashNativeDocument({ scope: assertEvidenceScope(scope), rootRunId: text(rootRunId, 'Root run') });
const hash = value => { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new TypeError('Invalid evidence identity'); };

export function assertEvidenceRecord(value) {
    const doc = cloneNativeDocument(value);
    fields(doc, ['schemaVersion', 'evidenceId', 'scope', 'rootRunId', 'origin', 'sequence', 'status', 'trace', 'sources', 'outcome', 'outputRef'], 'Evidence record');
    if (doc.schemaVersion !== 1 || !['host', 'client_observation'].includes(doc.origin)
        || !['capturing', 'completed', 'cancelled', 'failed'].includes(doc.status)
        || !Number.isSafeInteger(doc.sequence) || doc.sequence < 0) throw new TypeError('Invalid evidence record');
    if (doc.evidenceId !== evidenceIdentity(doc.scope, doc.rootRunId)) throw new TypeError('Evidence identity mismatch');
    assertEvidenceTrace(doc.trace);
    if (doc.sources !== null) {
        const set = assertEvidenceSet(doc.sources);
        if (hashNativeDocument(set.scope) !== hashNativeDocument(doc.scope)) throw new TypeError('Evidence source scope mismatch');
    }
    if (doc.outcome !== null) {
        fields(doc.outcome, ['kind', 'invocationId', 'branchId', 'revisionId', 'messageId', 'variantId', 'receiptHash'], 'Evidence outcome');
        if (doc.origin !== 'host' || doc.scope.domain !== 'rp_session') throw new TypeError('Host outcome required');
        if (!['turn', 'task'].includes(doc.outcome.kind)) throw new TypeError('Invalid outcome kind');
        text(doc.outcome.invocationId, 'Invocation');
        assertNativeId(doc.outcome.branchId, 'branch'); assertNativeId(doc.outcome.revisionId, 'revision');
        if (doc.outcome.kind === 'turn') { assertNativeId(doc.outcome.messageId, 'message'); assertNativeId(doc.outcome.variantId, 'variant'); } else if (doc.outcome.messageId !== null || doc.outcome.variantId !== null) throw new TypeError('Task receipt cannot imply message authority');
        hash(doc.outcome.receiptHash);
    }
    if (doc.outputRef !== null && (!doc.sources || !doc.sources.references.some(ref => hashNativeDocument(ref) === hashNativeDocument(doc.outputRef)))) throw new TypeError('Output source mismatch');
    return doc;
}

// One CAS resource. FS writes are serialized in this Host, never a global transaction.
export class AgentEvidenceRepository {
    constructor({ engine }) { if (!engine) throw new TypeError('Evidence repository requires engine'); this.engine = engine; }
    async get(handle, evidenceId) {
        text(handle, 'Authenticated owner'); hash(evidenceId);
        const record = await this.engine.withTransaction(handle, tx => tx.getResource(key(handle, evidenceId)));
        if (!record) return null;
        if (record.integrity !== hashNativeDocument(record.doc)) throw new TypeError('Evidence integrity mismatch');
        const doc = assertEvidenceRecord(record.doc);
        if (doc.evidenceId !== evidenceId) throw new TypeError('Evidence key mismatch');
        return doc;
    }
    async begin(handle, { scope, rootRunId, origin, sources = null }) {
        text(handle, 'Authenticated owner');
        const evidenceId = evidenceIdentity(scope, rootRunId);
        const doc = assertEvidenceRecord({ schemaVersion: 1, evidenceId, scope, rootRunId, origin, sources,
            sequence: 0, status: 'capturing', trace: { schemaVersion: 1, events: [], missing: 1, reasons: ['events_missing'] }, outcome: null, outputRef: null });
        return withNativeResourceWrite(handle, 'evidence:' + evidenceId, () => {
            assertWritable();
            return this.engine.withTransaction(handle, tx => putImmutable(tx, key(handle, evidenceId), doc));
        });
    }
    async update(handle, evidenceId, { sequence, status, trace, sources, outcome = null, outputRef = null }, origin) {
        return withNativeResourceWrite(handle, 'evidence:' + evidenceId, async () => {
            assertWritable();
            const previous = await this.get(handle, evidenceId);
            if (!previous || previous.origin !== origin) throw new TypeError('Evidence origin mismatch');
            const doc = assertEvidenceRecord({ ...previous, sequence, status, trace, sources: sources === undefined ? previous.sources : sources, outcome, outputRef });
            if (sequence === previous.sequence && hashNativeDocument(doc) === hashNativeDocument(previous)) return previous;
            if (sequence <= previous.sequence || trace.events.length < previous.trace.events.length
                || hashNativeDocument(trace.events.slice(0, previous.trace.events.length)) !== hashNativeDocument(previous.trace.events)
                || trace.missing < previous.trace.missing - (previous.trace.events.length ? 0 : 1)) throw new ConflictError('agent_evidence_sequence_conflict');
            return this.engine.withTransaction(handle, tx => putMutable(tx, key(handle, evidenceId), doc, { expectedIntegrity: hashNativeDocument(previous) }));
        });
    }
    async inspect(handle, evidenceId, service, budget) {
        const record = await this.get(handle, evidenceId);
        if (!record) return null;
        let validity = record.sources ? await service.evaluate(handle, record.scope, record.sources, budget) : null;
        if (record.origin === 'host' && record.outcome?.kind === 'task') {
            // Receipt metadata only. This never expands an artifact or changes a grant.
            try {
                const snapshot = await service.rp.sessionCore.load(handle, record.scope.sessionId);
                const receipt = snapshot.states.atri_task_results?.records.find(item => item.invocationId === record.outcome.invocationId);
                validity = { status: snapshot.revision.branchId === record.outcome.branchId && snapshot.revision.revisionId === record.outcome.revisionId
                    && receipt && hashNativeDocument(receipt) === record.outcome.receiptHash ? 'current' : 'incomplete', kind: 'task_receipt' };
            } catch { validity = { status: 'incomplete', kind: 'task_receipt' }; }
        }
        return { record, captureStatus: record.status === 'capturing' || record.trace.missing || !validity || validity.status !== 'current'
            || (record.origin === 'client_observation' ? !record.outputRef : !record.outcome) ? 'incomplete' : 'captured', validity };
    }
    async delete(handle, evidenceId) {
        text(handle, 'Authenticated owner'); hash(evidenceId); assertWritable();
        return withNativeResourceWrite(handle, 'evidence:' + evidenceId, () => this.engine.withTransaction(handle, tx => tx.deleteResource(key(handle, evidenceId))));
    }
}
