import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { cloneNativeDocument, hashNativeDocument, putMutable, withNativeResourceWrite, listNativeDocuments } from '../repositories/common.js';
import { experienceIdentity } from './experience-repository.js';
import { ConflictError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';

export const EVOLUTION_RULE = Object.freeze({ revision: 'atri-evolution-1', cases: 3, repetitions: 3,
    candidateWins: 6, maxTokenRatio: 1, maxCostRatio: 1, intervalMs: 86400000, candidates: 2 });
export const evolutionHash = hashNativeDocument;
const invalidationHandlers = new WeakMap();
export function onEvolutionInvalidation(engine, handler) { invalidationHandlers.set(engine, handler); }
export const sameEvolutionValue = (a, b) => evolutionHash(a) === evolutionHash(b);
export function evolutionFields(value, names) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !names.includes(k))) throw new TypeError('Invalid evolution fields');
}
export function evolutionInteger(value, min, max) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError('Finite evolution limit required');
    return value;
}
export function evolutionText(value, max = 256) {
    if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > max) throw new TypeError('Bounded evolution text required');
    return value;
}
function ownerDocument(value) {
    const d = cloneNativeDocument(value);
    evolutionFields(d, ['schemaVersion', 'sequence', 'limits', 'attempts', 'breached']);
    if (d.schemaVersion !== 1 || typeof d.breached !== 'boolean' || !Array.isArray(d.attempts) || d.attempts.length > 2048) throw new TypeError('Invalid evolution ledger');
    evolutionInteger(d.sequence, 0, Number.MAX_SAFE_INTEGER);
    if (d.limits !== null) {
        evolutionFields(d.limits, ['maxRequests', 'maxTokens', 'minIntervalMs']);
        evolutionInteger(d.limits.maxRequests, 1, 2048); evolutionInteger(d.limits.maxTokens, 1, 10000000);
        evolutionInteger(d.limits.minIntervalMs, 1000, 60000);
    }
    const ids = new Set();
    for (const a of d.attempts) {
        evolutionFields(a, ['id', 'scopeId', 'jobId', 'kind', 'upperBound', 'tokens', 'status', 'createdAt', 'trialId', 'requestHash', 'snapshotHash', 'usage', 'cost']);
        evolutionText(a.id); evolutionText(a.scopeId); evolutionText(a.jobId);
        if (ids.has(a.id) || !['extraction', 'baseline', 'candidate', 'judge', 'retry'].includes(a.kind)
            || !['reserved', 'unknown', 'reported'].includes(a.status)) throw new TypeError('Invalid evolution reservation');
        evolutionInteger(a.upperBound, 1, 10000000); evolutionInteger(a.tokens, 0, 10000000);
        if (a.status !== 'reported' && a.tokens !== a.upperBound) throw new TypeError('Unknown usage must retain reservation');
        if (a.usage !== null && a.usage?.totalTokens !== a.tokens || a.cost !== null && (!Number.isFinite(a.cost) || a.cost < 0)) throw new TypeError('Invalid settled evolution charge');
        evolutionInteger(a.createdAt, 1, Number.MAX_SAFE_INTEGER);
        if (a.trialId !== null) evolutionText(a.trialId);
        for (const k of ['requestHash', 'snapshotHash']) if (a[k] !== null && !/^[a-f0-9]{64}$/.test(a[k])) throw new TypeError('Invalid evolution send hash');
        ids.add(a.id);
    }
    if (Buffer.byteLength(JSON.stringify(d)) > 1024 * 1024) throw new TypeError('Evolution ledger capacity exceeded');
    return d;
}
function scopeDocument(value) {
    const d = cloneNativeDocument(value);
    evolutionFields(d, ['schemaVersion', 'sequence', 'scopeId', 'scope', 'subject', 'policy', 'jobs', 'publications', 'garbage', 'retired']);
    d.garbage ||= []; d.retired ||= [];
    if (!Array.isArray(d.garbage) || d.garbage.length > 16 || !Array.isArray(d.retired) || d.retired.length > 16) throw new TypeError('Invalid evolution retention journal');
    for (const item of d.garbage) { evolutionFields(item, ['jobId', 'target', 'candidateId']); evolutionText(item.jobId); evolutionText(item.candidateId); }
    for (const item of d.retired) { evolutionFields(item, ['id', 'candidateId', 'reportHash', 'exactBindingHash', 'reservationIds', 'status']); evolutionText(item.id); if (item.status !== 'source_revoked') throw new TypeError('Invalid retired publication'); }
    if (d.schemaVersion !== 1 || d.scopeId !== experienceIdentity(d.scope, d.subject)
        || !Array.isArray(d.jobs) || d.jobs.length > 8 || !Array.isArray(d.publications) || d.publications.length > 16) throw new TypeError('Invalid evolution scope');
    evolutionInteger(d.sequence, 0, Number.MAX_SAFE_INTEGER);
    if (d.policy !== null) {
        evolutionFields(d.policy, ['revision', 'mode', 'target', 'targetPin', 'routeId', 'price', 'fingerprint', 'lastJobAt', 'reason']);
        if (!['review', 'auto', 'paused', 'disabled'].includes(d.policy.mode)) throw new TypeError('Invalid evolution mode');
        const { fingerprint, mode: _mode, lastJobAt: _time, reason: _reason, ...pin } = d.policy;
        if (fingerprint !== evolutionHash(pin)) throw new TypeError('Evolution policy identity mismatch');
    }
    const jobs = new Set();
    for (const job of d.jobs) {
        evolutionFields(job, ['id', 'batchHash', 'diagnosisId', 'dependencies', 'policyFingerprint', 'target', 'targetPin', 'status', 'operationId', 'createdAt', 'candidates', 'reason']);
        evolutionText(job.id); if (jobs.has(job.id) || !Array.isArray(job.candidates) || job.candidates.length > 2) throw new TypeError('Invalid evolution job');
        if (!['queued', 'running', 'evaluating', 'awaiting_review', 'published', 'failed', 'cancelled', 'invalidated', 'superseded'].includes(job.status)) throw new TypeError('Invalid job state');
        evolutionInteger(job.createdAt, 0, Number.MAX_SAFE_INTEGER);
        for (const c of job.candidates) { evolutionFields(c, ['candidateId', 'diff', 'rationale', 'base', 'desired', 'report', 'decision']); evolutionText(c.candidateId); evolutionText(c.rationale, 1024); }
        jobs.add(job.id);
    }
    const publications = new Set();
    for (const p of d.publications) {
        evolutionFields(p, ['id', 'jobId', 'candidateId', 'policyFingerprint', 'reportHash', 'dependencyHash', 'target', 'base', 'desired', 'previous', 'reservationIds', 'status', 'createdAt', 'receipt', 'activation', 'reason']);
        evolutionText(p.id); if (publications.has(p.id) || !jobs.has(p.jobId)) throw new TypeError('Invalid evolution publication');
        if (!['intent', 'finalizing', 'published', 'invalidated', 'cancelled', 'conflict', 'rollback_intent', 'rollback_conflict', 'rolled_back'].includes(p.status) || !Array.isArray(p.reservationIds) || p.reservationIds.length > 120) throw new TypeError('Invalid publication state');
        const { id, status: _status, receipt: _receipt, activation: _activation, reason: _reason, ...intent } = p;
        if (id !== evolutionHash(intent)) throw new TypeError('Evolution intent identity mismatch');
        publications.add(id);
    }
    if (Buffer.byteLength(JSON.stringify(d)) > 4 * 1024 * 1024) throw new TypeError('Evolution scope capacity exceeded');
    return d;
}

// Journals describe work; effective versions remain in original target stores.
export class AgentEvolutionRepository {
    constructor({ engine }) { this.engine = engine; }
    ownerKey(handle) { return { kind: K.agentEvolutionOwner, handle }; }
    scopeKey(handle, scope, subject) { return { kind: K.agentEvolution, handle, scopeId: experienceIdentity(scope, subject) }; }
    async _read(key, validate) {
        const record = await this.engine.withTransaction(key.handle, tx => tx.getResource(key));
        if (!record) return null;
        if (record.integrity !== evolutionHash(record.doc)) throw new TypeError('Evolution resource integrity mismatch');
        return validate(record.doc);
    }
    owner(handle) { return this._read(this.ownerKey(handle), ownerDocument); }
    async get(handle, scope, subject) {
        const key = this.scopeKey(handle, scope, subject), doc = await this._read(key, scopeDocument);
        if (doc && doc.scopeId !== key.scopeId) throw new TypeError('Evolution key mismatch');
        return doc;
    }
    async list(handle) {
        const docs = await this.engine.withTransaction(handle, tx => listNativeDocuments(tx, { kind: K.agentEvolution, handle }));
        return docs.map(scopeDocument);
    }
    _mutate(key, validate, create, edit, expectedSequence) {
        return withNativeResourceWrite(key.handle, key.kind + ':' + (key.scopeId || 'owner'), async () => {
            assertWritable();
            const old = await this._read(key, validate);
            if (expectedSequence !== undefined && (old?.sequence || 0) !== expectedSequence) throw new ConflictError('agent_evolution_conflict');
            const next = cloneNativeDocument(old || create());
            await edit(next); next.sequence++;
            const checked = validate(next);
            await this.engine.withTransaction(key.handle, tx => putMutable(tx, key, checked, { expectedIntegrity: old ? evolutionHash(old) : null }));
            return checked;
        });
    }
    mutate(handle, scope, subject, edit, expectedSequence) {
        const key = this.scopeKey(handle, scope, subject);
        return this._mutate(key, scopeDocument, () => ({ schemaVersion: 1, sequence: 0, scopeId: key.scopeId, scope, subject, policy: null, jobs: [], publications: [], garbage: [], retired: [] }), edit, expectedSequence);
    }
    mutateOwner(handle, edit, expectedSequence) {
        return this._mutate(this.ownerKey(handle), ownerDocument, () => ({ schemaVersion: 1, sequence: 0, limits: null, attempts: [], breached: false }), edit, expectedSequence);
    }
    async limits(handle, limits, expectedSequence) {
        return this.mutateOwner(handle, d => {
            const totals = this.totals(d);
            if (limits.maxRequests < totals.requests || limits.maxTokens < totals.tokens) throw new ConflictError('Budget cannot discard previous charges');
            d.limits = limits;
        }, expectedSequence);
    }
    totals(owner) { return { requests: owner?.attempts.length || 0, tokens: owner?.attempts.reduce((n, a) => n + a.tokens, 0) || 0, breached: owner?.breached || false }; }
    async reserve(handle, attempt) {
        let reserved;
        await this.mutateOwner(handle, d => {
            if (d.attempts.some(a => a.id === attempt.id)) throw new ConflictError('Duplicate evolution send');
            const totals = this.totals(d);
            if (!d.limits || d.breached || totals.requests >= d.limits.maxRequests || totals.tokens + attempt.upperBound > d.limits.maxTokens) throw new ConflictError('agent_evolution_budget_blocked');
            const job = d.attempts.filter(a => a.jobId === attempt.jobId);
            if (job.length >= 120 || job.reduce((n, a) => n + a.tokens, 0) + attempt.upperBound > 1000000
                || attempt.trialId && attempt.kind !== 'judge' && job.filter(a => a.trialId === attempt.trialId).length >= 6) throw new ConflictError('agent_evolution_job_budget_blocked');
            reserved = { trialId: null, requestHash: null, snapshotHash: null, usage: null, cost: null, ...attempt,
                tokens: attempt.upperBound, status: 'reserved', createdAt: Math.max(Date.now(), (d.attempts.at(-1)?.createdAt || 0) + d.limits.minIntervalMs) };
            d.attempts.push(reserved);
        });
        return reserved;
    }
    async settle(handle, id, tokens = null, { usage = null, cost = null } = {}) {
        return this.mutateOwner(handle, d => {
            const a = d.attempts.find(a => a.id === id);
            if (!a || a.status !== 'reserved') throw new ConflictError('Evolution reservation already settled or missing');
            if (tokens !== null) evolutionInteger(tokens, 0, 10000000);
            a.status = tokens === null ? 'unknown' : 'reported'; a.tokens = tokens ?? a.upperBound;
            a.usage = usage; a.cost = cost;
            if (tokens !== null && tokens > a.upperBound || this.totals(d).tokens > d.limits.maxTokens) d.breached = true;
        });
    }
    async invalidate(handle, scope, subject, reason = 'source_changed') {
        if (!await this.get(handle, scope, subject)) return;
        const next = await this.mutate(handle, scope, subject, d => {
            if (d.policy) { d.policy.mode = 'paused'; d.policy.reason = reason; }
            for (const j of d.jobs) {
                for (const c of j.candidates) if (!d.garbage.some(g => g.candidateId === c.candidateId)) d.garbage.push({ jobId: j.id, target: j.target, candidateId: c.candidateId });
                j.status = 'invalidated'; j.reason = reason; j.candidates = [];
            }
            for (const p of d.publications) if (p.status === 'intent') { p.status = 'invalidated'; p.reason = reason; }
        });
        await invalidationHandlers.get(this.engine)?.(handle, next);
    }
}
