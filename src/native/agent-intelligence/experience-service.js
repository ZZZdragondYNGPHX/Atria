import { randomUUID } from 'node:crypto';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { ProjectTaskRepository } from './project-task-repository.js';
import { isReadOnly, assertWritable } from '../../storage/read-only-mode.js';
import { ConflictError } from '../../storage/errors.js';
import { hashNativeDocument, cloneNativeDocument } from '../repositories/common.js';
import { AgentEvidenceRepository } from './evidence-repository.js';
import { AgentExperienceRepository, DAY, assertFeedbackInput, pruneExperience, removeFeedback, experienceIdentity } from './experience-repository.js';
import { AgentEvidenceService } from './evidence-service.js';
import { assertEvidenceScope, fields, text } from './contracts.js';
import { AgentEvolutionRepository } from './evolution-repository.js';
import { assertAssessment, assertAttribution, legacyAttribution, qualityProfile } from './evaluation/quality.js';

const budget = { maxSources: 32, maxBytes: 131072, maxScanMessages: 8192 };
const same = (a, b) => hashNativeDocument(a) === hashNativeDocument(b);
const refs = items => items.map(item => ({ id: item.id, revision: item.revision, integrity: hashNativeDocument(item) })).sort((a, b) => a.id.localeCompare(b.id));
const sourceStatus = result => result?.status === 'current' ? 'current'
    : result?.checks?.some(check => check.status === 'missing') ? 'missing'
        : result?.checks?.some(check => ['stale', 'denied'].includes(check.status)) ? 'stale' : 'unavailable';
const sequence = value => { if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new TypeError('Expected sequence required'); };
export const supportsDirection = item => item.kind === 'explicit' || item.kind === 'technical' && ['failed', 'validation_failed'].includes(item.signal)
    || item.kind === 'assessment' && item.origin === 'host_check' && item.signal === 'verified_failure';

/** Public hypotheses and preferences only; source/config authorities stay upstream. */
export class AgentExperienceService {
    constructor({ engine, chatRepo, sessionCore, studio, agent, now = () => Date.now() }) {
        this.repository = new AgentExperienceRepository({ engine });
        this.evidence = new AgentEvidenceRepository({ engine });
        this.sources = new AgentEvidenceService({ chatRepo, sessionCore, studio, agent });
        Object.assign(this, { sessionCore, studio, agent, now });
    }
    async _target(handle, value) {
        fields(value, ['kind', 'id', 'integrity', 'scope'], 'Feedback target');
        const scope = assertEvidenceScope(value.scope);
        text(value.id, 'Target identity');
        let document, sources, subject, signal = 'unknown', current = false;
        if (value.kind === 'project_task' && scope.domain === 'project') {
            document = await this.agent.getTask(handle, scope.projectId, value.id);
            subject = scope.projectId;
            try { sources = await this.sources.capture(handle, scope, [{ kind: 'task', taskId: value.id }], budget); current = true; } catch { sources = null; }
            if (sources && sources.references[0].anchor.taskHash !== hashNativeDocument(document)) throw new ConflictError('agent_feedback_target_changed');
            if (document.status === 'completed' && document.changeSets.at(-1)?.resultingRevision) signal = 'committed';
            else if (document.validation?.status === 'failed') signal = 'validation_failed';
            else if (document.validation?.status === 'passed') signal = 'validated';
            else if (document.status === 'cancelled') signal = 'cancelled';
        } else if (value.kind === 'evidence' && scope.domain !== 'project') {
            const inspected = await this.evidence.inspect(handle, value.id, this.sources, budget);
            if (!inspected || !same(inspected.record.scope, scope)) throw new TypeError('Evidence target missing');
            document = inspected.record; sources = document.sources;
            current = inspected.captureStatus === 'captured' || document.origin === 'host' && ['failed', 'cancelled'].includes(document.status) && inspected.validity?.status === 'current';
            if (scope.domain === 'rp_chat') {
                subject = scope.isGroup ? 'message:' + (document.outputRef?.selector.messageId ?? document.rootRunId) : scope.charDir;
            } else {
                const snapshot = await this.sessionCore.load(handle, scope.sessionId);
                const message = snapshot.timeline.find(item => item.messageId === document.outputRef?.selector.messageId || item.messageId === document.outcome?.messageId);
                const reference = sources?.references.find(ref => ref.selector.messageId === message?.messageId);
                if (!current || message && (!reference || reference.contentHash !== hashNativeDocument({ role: message.role, actorId: message.actorId ?? null, content: message.content })
                    || reference.anchor.branchId !== snapshot.revision.branchId || reference.anchor.revisionId !== snapshot.revision.revisionId || reference.anchor.variantId !== message.activeVariantId)
                    || document.outcome && (document.outcome.branchId !== snapshot.revision.branchId || document.outcome.revisionId !== snapshot.revision.revisionId)) throw new ConflictError('agent_feedback_target_changed');
                subject = message?.actorId ?? 'entryPoint:' + snapshot.session.entryPointId;
            }
            if (document.origin === 'host') {
                if (document.status === 'failed') signal = 'failed';
                else if (document.status === 'cancelled') signal = 'cancelled';
                else if (document.outcome) signal = 'committed';
            }
        } else throw new TypeError('Target domain mismatch');
        if (!document || hashNativeDocument(document) !== value.integrity) throw new ConflictError('agent_feedback_target_changed');
        return { scope, subject, current, signal, source: { kind: value.kind, id: value.id, integrity: value.integrity, sources }, document };
    }
    async _valid(handle, scope, source) {
        try {
            if (source.sources && source.sources.owner !== handle) return 'stale';
            if (source.kind === 'evidence') {
                const inspection = await this.evidence.inspect(handle, source.id, this.sources, budget);
                if (!inspection) return 'missing';
                if (!same(scope, inspection.record.scope) || hashNativeDocument(inspection.record) !== source.integrity) return 'stale';
                if (inspection.captureStatus === 'captured') return 'current';
                return sourceStatus(inspection.validity);
            }
            // Always re-read the original Project authority, including human edits.
            const task = await this.agent.getTask(handle, scope.projectId, source.id);
            if (hashNativeDocument(task) !== source.integrity) return 'stale';
            if (!source.sources) return 'stale';
            return sourceStatus(await this.sources.evaluate(handle, scope, source.sources, budget));
        } catch (error) { return error?.name === 'NotFoundError' ? 'missing' : 'unavailable'; }
    }
    async _reconcile(handle, doc) {
        const result = pruneExperience(cloneNativeDocument(doc), this.now());
        const validity = new Map();
        // Bounded ledger, deduplicated exact source checks, no content expansion.
        for (const item of result.feedback) {
            const identity = hashNativeDocument(item.source);
            if (!validity.has(identity)) validity.set(identity, await this._valid(handle, doc.scope, item.source));
        }
        removeFeedback(result, new Set(result.feedback.filter(item => validity.get(hashNativeDocument(item.source)) === 'missing').map(item => item.id)));
        for (const item of result.feedback) {
            const status = validity.get(hashNativeDocument(item.source));
            if (item.status === 'active' && status === 'stale') item.status = 'stale';
            if (item.status === 'active' && item.kind === 'assessment' && item.origin === 'host_check' && status === 'current') {
                const current = await this._target(handle, { kind: item.source.kind, id: item.source.id, integrity: item.source.integrity, scope: doc.scope });
                const state = current.document.validation?.status, expected = state === 'failed' ? 'verified_failure' : state === 'passed' ? 'no_failure' : 'unknown';
                if (item.signal !== expected) item.status = 'stale';
            }
        }
        const usable = item => item.status === 'active' && validity.get(hashNativeDocument(item.source)) === 'current';
        for (const diagnosis of result.diagnoses) {
            if (diagnosis.feedbackRefs.some(ref => {
                const item = result.feedback.find(item => item.id === ref.id);
                return !item || item.status !== 'active' || ref.revision !== item.revision || ref.integrity !== hashNativeDocument(item);
            })) diagnosis.status = 'stale';
        }
        let persisted = result;
        if (!isReadOnly() && !same(doc, result)) {
            persisted = await this.repository.mutate(handle, doc.scope, doc.subject, doc.sequence, next => Object.assign(next, result));
        }
        return { ...persisted, feedback: persisted.feedback.map(item => ({ ...item, applicability: usable(item) ? 'current' : 'incomplete' })),
            diagnoses: persisted.diagnoses.map(item => ({ ...item, applicability: item.status === 'active' && item.feedbackRefs.every(ref => {
                const feedback = persisted.feedback.find(value => value.id === ref.id); return feedback && usable(feedback);
            }) ? 'current' : 'incomplete' })) };
    }
    async target(handle, input) {
        fields(input, ['kind', 'id', 'scope'], 'Target selection');
        const scope = assertEvidenceScope(input.scope);
        const document = input.kind === 'evidence' && scope.domain !== 'project'
            ? await this.evidence.get(handle, input.id)
            : input.kind === 'project_task' && scope.domain === 'project' ? await this.agent.getTask(handle, scope.projectId, input.id) : null;
        if (!document) throw new TypeError('Feedback target missing');
        const target = { ...input, integrity: hashNativeDocument(document) };
        const resolved = await this._target(handle, target);
        return { target, subject: resolved.subject, current: resolved.current, technicalSignal: resolved.signal };
    }
    async inspect(handle, input) {
        fields(input, ['scope', 'subject'], 'Experience scope');
        const doc = await this.repository.get(handle, input.scope, input.subject);
        return doc ? this._reconcile(handle, doc) : null;
    }
    async submit(handle, input) {
        fields(input, ['target', 'feedback', 'expectedSequence'], 'Feedback submit'); sequence(input.expectedSequence); assertWritable();
        assertFeedbackInput(input.feedback);
        if (input.feedback.kind === 'technical') throw new TypeError('Host outcome required');
        const target = await this._target(handle, input.target);
        if (target.scope.domain !== 'project' && !target.document.outputRef && target.document.outcome?.kind !== 'turn') throw new TypeError('Saved output required for user feedback');
        return this._append(handle, input.expectedSequence, target, input.feedback);
    }
    async outcome(handle, input) {
        fields(input, ['target', 'expectedSequence'], 'Outcome collection'); sequence(input.expectedSequence); assertWritable();
        const target = await this._target(handle, input.target);
        if (target.source.kind === 'evidence' && target.document.origin !== 'host') throw new TypeError('Host outcome required');
        return this._append(handle, input.expectedSequence, target, { kind: 'technical', signal: target.signal, dimension: 'correctness', note: '' });
    }
    // Explicit exact-source reconcile and normal terminal hooks share this port.
    // No signals, origins, conclusions or model instructions come from clients.
    async collect(handle, input) {
        const selected = await this.target(handle, input), target = await this._target(handle, selected.target);
        if (isReadOnly()) return { status: 'read_only', modelCalls: 0 };
        if (!target.current) return { status: 'collection_unavailable', modelCalls: 0 };
        const client = target.source.kind === 'evidence' && target.document.origin === 'client_observation';
        if (client && (target.document.status !== 'completed' || !target.document.outputRef)
            || !client && target.signal === 'unknown') return { status: 'not_ready', modelCalls: 0 };
        const signal = client ? 'completed' : target.signal;
        const sourceHash = hashNativeDocument(target.source.sources?.references ?? target.source);
        const identity = { kind: target.source.kind, sourceId: target.source.id, sourceHash, signal }, id = hashNativeDocument(identity);
        const previous = await this.repository.get(handle, target.scope, target.subject);
        if (previous?.collections?.some(m => m.id === id)) return { status: 'already_collected', modelCalls: 0 };
        // Even a first v2 collection must not re-create a withdrawn v1 event.
        if (previous?.feedback.some(f => f.source.kind === identity.kind && f.source.id === identity.sourceId && f.signal === signal
            && hashNativeDocument(f.source.sources?.references ?? f.source) === sourceHash)) return { status: 'already_collected', modelCalls: 0 };
        const now = this.now();
        await this.repository.mutate(handle, target.scope, target.subject, previous?.sequence ?? null, async doc => {
            if (await this._valid(handle, target.scope, target.source) !== 'current') throw new ConflictError('agent_collection_source_changed');
            doc.schemaVersion = 2; doc.collections ??= [];
            for (const diagnosis of doc.diagnoses) diagnosis.attribution ??= legacyAttribution(diagnosis.direction);
            if (doc.collections.some(m => m.id === id)) return;
            doc.collections.push({ id, ...identity, createdAt: now });
            doc.feedback.push({ id: 'feedback_' + randomUUID(), revision: 0, kind: client ? 'observation' : 'technical', signal,
                dimension: client ? 'general' : 'correctness', note: '', origin: client ? 'client_observation' : 'host', status: 'active',
                source: target.source, createdAt: now, expiresAt: now + doc.retentionDays * DAY });
        });
        return { status: 'collected', scope: target.scope, subject: target.subject, modelCalls: 0 };
    }
    // Server-only model port. The public submit router never exposes it.
    async assessModel(handle, input, producer) {
        fields(input, ['target', 'expectedSequence', 'profile', 'purpose', 'signal', 'claims', 'rationale'], 'Model assessment');
        sequence(input.expectedSequence); assertWritable();
        const target = await this._target(handle, input.target);
        const assessment = { profile: input.profile, purpose: input.purpose, claims: input.claims, producer };
        assertAssessment(assessment, target.scope.domain === 'project' ? 'project' : 'rp', 'model_assessment', input.signal);
        const paid = (await new AgentEvolutionRepository({ engine: this.repository.engine }).owner(handle))?.attempts.find(a => a.id === producer.chargeId);
        if (!paid || paid.scopeId !== experienceIdentity(target.scope, target.subject) || paid.status === 'reserved' || !['judge', 'extraction'].includes(paid.kind) || paid.requestHash !== producer.requestHash
            || paid.snapshotHash !== producer.snapshotHash) throw new TypeError('Assessment execution is not durably funded');
        await this._checkClaims(handle, target, assessment);
        return this._append(handle, input.expectedSequence, target, { kind: 'assessment', signal: input.signal, dimension: 'general', note: input.rationale,
            origin: 'model_assessment', assessment });
    }
    async _checkClaims(handle, target, assessment) {
        if (!target.current || !target.source.sources) throw new TypeError('Current assessment source required');
        const expanded = await this.sources.evaluate(handle, target.scope, target.source.sources, budget, { expand: true });
        if (expanded.status !== 'current') throw new TypeError('Assessment source changed');
        for (const claim of assessment.claims) {
            const index = target.source.sources.references.findIndex(ref => ref.contentHash === claim.sourceHash);
            const contains = value => typeof value === 'string' ? value.includes(claim.quote) : value && typeof value === 'object' && Object.values(value).some(contains);
            if (index < 0 || !JSON.stringify(expanded.content[index]).includes(claim.quote) && !contains(expanded.content[index])) throw new TypeError('Assessment evidence quote missing');
        }
    }
    async checkQuality(handle, input) {
        fields(input, ['target', 'expectedSequence', 'profile', 'checkerId'], 'Fixed quality check');
        sequence(input.expectedSequence); assertWritable();
        const target = await this._target(handle, input.target);
        const profile = qualityProfile(input.profile, target.scope.domain === 'project' ? 'project' : 'rp');
        if (input.checkerId !== 'project.validation' || target.scope.domain !== 'project' || !profile.dimensions.includes('repair_quality')) throw new TypeError('Unknown fixed quality checker');
        const status = target.document.validation?.status;
        const signal = status === 'failed' ? 'verified_failure' : status === 'passed' ? 'no_failure' : 'unknown';
        const assessment = { profile: input.profile, purpose: 'ordinary', claims: signal === 'unknown' ? [] : [{ dimension: 'repair_quality',
            sourceHash: target.source.sources?.references[0]?.contentHash, quote: '"status":"' + status + '"' }],
        producer: { checkerId: 'project.validation', revision: hashNativeDocument('project.validation:failed/passed:v1') } };
        assertAssessment(assessment, 'project', 'host_check', signal); await this._checkClaims(handle, target, assessment);
        return this._append(handle, input.expectedSequence, target, { kind: 'assessment', signal, dimension: 'general', note: 'Fixed validation-state check; not a user preference or root-cause proof.', origin: 'host_check', assessment });
    }
    async _append(handle, expectedSequence, target, feedback) {
        const now = this.now();
        const sourceCurrent = target.current && await this._valid(handle, target.scope, target.source) === 'current';
        return this.repository.mutate(handle, target.scope, target.subject, expectedSequence, doc => {
            pruneExperience(doc, now);
            if (feedback.kind === 'technical' && doc.feedback.some(item => item.kind === 'technical' && same(item.source, target.source))) return;
            doc.feedback.push({ id: 'feedback_' + randomUUID(), revision: 0, ...feedback,
                origin: feedback.kind === 'assessment' ? feedback.origin : feedback.kind === 'technical' ? 'host' : feedback.kind === 'explicit' ? 'user' : 'client_observation',
                status: sourceCurrent ? 'active' : 'stale', source: target.source, createdAt: now, expiresAt: now + doc.retentionDays * DAY });
        });
    }
    async _change(handle, input, action) {
        const expected = action === 'correct' ? ['scope', 'subject', 'id', 'expectedSequence', 'feedback'] : ['scope', 'subject', 'id', 'expectedSequence'];
        fields(input, expected, 'Feedback change'); sequence(input.expectedSequence);
        if (action === 'correct') {
            assertFeedbackInput(input.feedback);
            if (input.feedback.kind !== 'explicit') throw new TypeError('Only explicit feedback is correctable');
        }
        return this.repository.mutate(handle, input.scope, input.subject, input.expectedSequence, doc => {
            pruneExperience(doc, this.now());
            const item = doc.feedback.find(item => item.id === input.id);
            if (!item) throw new TypeError('Feedback missing');
            if (action === 'delete') { removeFeedback(doc, new Set([item.id])); return; }
            if (action === 'correct') {
                if (item.kind !== 'explicit' || item.status !== 'active') throw new TypeError('Active explicit feedback required');
                Object.assign(item, input.feedback); item.revision++;
            } else item.status = 'withdrawn';
            for (const diagnosis of doc.diagnoses) if (diagnosis.feedbackRefs.some(ref => ref.id === item.id)) diagnosis.status = 'stale';
        });
    }
    correct(handle, input) { return this._change(handle, input, 'correct'); }
    withdraw(handle, input) { return this._change(handle, input, 'withdraw'); }
    delete(handle, input) { return this._change(handle, input, 'delete'); }
    _batch(view) {
        const items = view?.feedback.filter(item => item.applicability === 'current') ?? [];
        const selected = items.slice(-32).map(({ applicability: _applicability, ...item }) => item);
        const event = selected.some(supportsDirection);
        const weakSources = new Set(selected.filter(item => item.kind === 'observation' && item.signal !== 'completed').map(item => hashNativeDocument(item.source)));
        const assessments = new Map();
        for (const item of selected.filter(item => item.kind === 'assessment' && item.origin === 'model_assessment' && item.signal === 'suspected_failure')) {
            const source = hashNativeDocument(item.source.sources?.references ?? item.source);
            for (const claim of item.assessment.claims) {
                const group = hashNativeDocument({ profile: item.assessment.profile, dimension: claim.dimension });
                if (!assessments.has(group)) assessments.set(group, new Set());
                assessments.get(group).add(source);
            }
        }
        const dependencies = refs(selected);
        const batchHash = hashNativeDocument({ scopeId: view?.scopeId ?? null, feedbackRefs: dependencies });
        const used = view?.diagnoses.some(item => item.batchHash === batchHash && item.applicability === 'current');
        return { status: selected.length && (event || weakSources.size >= 3 || [...assessments.values()].some(sources => sources.size >= 3)) && !used ? 'ready' : 'idle',
            reason: used ? 'batch_diagnosed' : event ? 'explicit_or_failure_event' : weakSources.size >= 3 ? 'observation_aggregate' : 'insufficient_trigger',
            batchHash, feedbackRefs: dependencies, modelCalls: 0 };
    }
    async reflection(handle, input) { return this._batch(await this.inspect(handle, input)); }
    async diagnose(handle, input, { origin = 'user_hypothesis' } = {}) {
        fields(input, ['scope', 'subject', 'expectedSequence', 'batchHash', 'rationale', 'conditions', 'counterexamples', 'direction', ...(input.attribution ? ['attribution'] : [])], 'Diagnosis submit');
        sequence(input.expectedSequence); assertWritable();
        const view = await this.inspect(handle, { scope: input.scope, subject: input.subject });
        const batch = this._batch(view);
        if (batch.status !== 'ready' || batch.batchHash !== input.batchHash || view.sequence !== input.expectedSequence) throw new ConflictError('agent_diagnosis_batch_changed');
        const evidence = view.feedback.filter(item => batch.feedbackRefs.some(ref => ref.id === item.id));
        if (input.direction !== 'undetermined' && !evidence.some(supportsDirection)) throw new TypeError('Weak observation cannot establish improvement direction');
        if (!input.attribution && input.direction !== 'undetermined') throw new TypeError('Root attribution required for a local intervention');
        const attribution = input.attribution ? { ...input.attribution, support: 'unverified', legacy: false }
            : { loci: ['unknown'], support: 'unverified', intervention: 'none', legacy: false };
        if (input.attribution) fields(input.attribution, ['loci', 'intervention'], 'Proposed attribution');
        assertAttribution(attribution, input.direction);
        const now = this.now();
        return this.repository.mutate(handle, input.scope, input.subject, input.expectedSequence, doc => {
            doc.diagnoses.push({ id: 'diagnosis_' + randomUUID(), batchHash: batch.batchHash, feedbackRefs: batch.feedbackRefs,
                origin, status: 'active', rationale: input.rationale, conditions: input.conditions, counterexamples: input.counterexamples, direction: input.direction, attribution,
                createdAt: now, expiresAt: Math.min(now + doc.retentionDays * DAY, ...evidence.map(item => item.expiresAt)) });
        });
    }
    async _changeDiagnosis(handle, input, remove) {
        fields(input, ['scope', 'subject', 'id', 'expectedSequence'], 'Diagnosis change'); sequence(input.expectedSequence);
        return this.repository.mutate(handle, input.scope, input.subject, input.expectedSequence, doc => {
            const item = doc.diagnoses.find(value => value.id === input.id);
            if (!item) throw new TypeError('Diagnosis missing');
            if (remove) doc.diagnoses = doc.diagnoses.filter(value => value.id !== input.id);
            else item.status = 'stale';
        });
    }
    withdrawDiagnosis(handle, input) { return this._changeDiagnosis(handle, input, false); }
    deleteDiagnosis(handle, input) { return this._changeDiagnosis(handle, input, true); }
    async retention(handle, input) {
        fields(input, ['scope', 'subject', 'expectedSequence', 'days'], 'Retention policy'); sequence(input.expectedSequence);
        if (!Number.isSafeInteger(input.days) || input.days < 1 || input.days > 365) throw new TypeError('Retention must be 1–365 days');
        return this.repository.mutate(handle, input.scope, input.subject, input.expectedSequence, doc => {
            doc.retentionDays = input.days;
            for (const item of [...doc.feedback, ...doc.diagnoses]) item.expiresAt = Math.min(item.expiresAt, item.createdAt + input.days * DAY);
            pruneExperience(doc, this.now());
        });
    }
    async purge(handle, input) {
        fields(input, ['scope', 'subject', 'expectedSequence'], 'Experience purge'); sequence(input.expectedSequence); assertWritable();
        const doc = await this.repository.get(handle, input.scope, input.subject);
        if (!doc || doc.sequence !== input.expectedSequence) throw new ConflictError('agent_experience_sequence_conflict');
        return this._reconcile(handle, doc);
    }
    async purgeSources(handle, input) {
        fields(input, ['scope', 'days', 'limit'], 'Source retention');
        const scope = assertEvidenceScope(input.scope); assertWritable();
        if (!Number.isSafeInteger(input.days) || input.days < 1 || input.days > 365 || !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 128) throw new TypeError('Invalid source retention limits');
        const kind = scope.domain === 'project' ? K.projectAgentTask : K.agentEvidence;
        const records = await this.repository.engine.withTransaction(handle, tx => tx.listResources({ kind, handle, ...(scope.domain === 'project' ? { projectId: scope.projectId } : {}) }));
        const cutoff = this.now() - input.days * DAY;
        const candidates = records.filter(record => scope.domain === 'project'
            ? ['completed', 'cancelled', 'taken_over'].includes(record.doc.status) && record.doc.updatedAt <= cutoff
            : same(record.doc.scope, scope) && record.updatedAt <= cutoff);
        let deleted = 0, conflicts = 0;
        for (const record of candidates.slice(0, input.limit)) {
            try {
                if (scope.domain === 'project') {
                    const repository = new ProjectTaskRepository({ engine: this.repository.engine });
                    const task = await repository.get(handle, scope.projectId, record.key.taskId);
                    if (!task || hashNativeDocument(task) !== record.integrity) throw new ConflictError('source_retention_changed');
                    await this.agent.deleteTask(handle, scope.projectId, task.taskId, record.integrity);
                } else {
                    await this.evidence.delete(handle, record.key.evidenceId, record.integrity);
                }
                deleted++;
            } catch (error) {
                if (error?.name !== 'ConflictError') throw error;
                conflicts++;
            }
        }
        return { deleted, conflicts, remaining: Math.max(0, candidates.length - input.limit), modelCalls: 0 };
    }
    async deleteScope(handle, input) {
        fields(input, ['scope', 'subject', 'expectedSequence'], 'Scope deletion'); sequence(input.expectedSequence);
        return { deleted: await this.repository.deleteScope(handle, input.scope, input.subject, input.expectedSequence) };
    }
    async export(handle, input) {
        const view = await this.inspect(handle, input);
        return { format: 'atria-agent-experience', schemaVersion: view?.schemaVersion ?? 1, exportedAt: this.now(), experience: view };
    }
}
