import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';
import { nativeRecord, getNativeDocument, listNativeDocuments, withNativeResourceWrite } from './repositories/common.js';
import { assertWritable } from '../storage/read-only-mode.js';
import { visualError, visualInteger } from '../../public/shared/native-visual-contract.js';

export const visualKey = (handle, type, id) => ({ kind: K.versionedJsonResource, handle, resourceType: 'atri.visual.' + type, resourceId: id });
const sessionTypes = new Set(['prepared', 'job', 'commit', 'scene', 'shot', 'state-change', 'director-scan', 'draft', 'mask', 'gallery']);
export function visualSessionOwner(record, records = []) {
    if (![K.versionedJsonResource, K.versionedJsonResourceRevision].includes(record?.key?.kind)) return null;
    const type = record.key.resourceType?.replace(/^atri\.visual\./, '');
    if (!sessionTypes.has(type)) return null;
    const doc = record.doc, owner = doc?.source?.sessionId || doc?.sessionId;
    if (owner) return owner;
    // Older receipts resolve their exact revision through the existing keys.
    if (type === 'director-scan') return records.find(row => row.key.kind === K.sessionRevision
        && row.key.revisionId === doc?.revisionId && row.doc.branchId === doc?.branchId)?.key.sessionId ?? null;
    return null;
}
export const defaultVisualBudget = () => ({ schemaVersion: 2, imageHour: 2, imageDay: 8, autoConcurrency: 1,
    plannerHour: 8, plannerDay: 24, plannerTokensDay: 30000, currency: 'USD', moneyDay: 0, autoMoneyDay: 0, requestQuotas: [] });
// Some services sell a number of requests per model per day (or per minute) instead of charging per image.
// Each quota belongs to one connection and one model actually sent (V5 Full Medium is its own model), so
// presets on different services or models are counted independently. Model '*' is a limit the provider
// shares across every model of that connection. No quota applies unless the reader sets one.
export const imageQuotaModel = (compiled, target) => String(compiled?.body?.model ?? target.model).replace(/-inpainting$/, '');
export const requestQuotasFor = (budget, connectionProfileId, model) => (budget.requestQuotas ?? [])
    .filter(item => item.connectionProfileId === connectionProfileId && (item.model === model || item.model === '*'));
const QUOTA_ACTIVE = new Set(['queued', 'submitting', 'submitted', 'running', 'result_received', 'uncertain_submission']);
/** Requests a quota has counted: sent or pending jobs whose reservation was not released, within the window. */
function quotaCount(jobs, quota, now, windowMs) {
    return jobs.filter(item => !item.reservation.released && item.connection.connectionProfileId === quota.connectionProfileId
        && (quota.model === '*' || imageQuotaModel(item.compiled, item.target) === quota.model)
        && (now - item.createdAt < windowMs || windowMs >= 86400000 && QUOTA_ACTIVE.has(item.status))).length;
}
export function quotaUsage(jobs, quota, now) {
    return { ...(quota.perDay ? { day: quotaCount(jobs, quota, now, 86400000) } : {}), ...(quota.perMinute ? { minute: quotaCount(jobs, quota, now, 60000) } : {}) };
}
export class VisualStore {
    constructor({ engine, now = Date.now }) { this.engine = engine; this.now = now; }
    async read(handle, type, id) {
        return this.engine.withTransaction(handle, async tx => {
            const record = await tx.getResource(visualKey(handle, type, id));
            return record ? { value: record.doc, revision: record.integrity } : { value: null, revision: null };
        });
    }
    async list(handle, type) {
        return this.engine.withTransaction(handle, tx => listNativeDocuments(tx, { kind: K.versionedJsonResource, handle, resourceType: 'atri.visual.' + type }));
    }
    async write(handle, type, id, value, expectedHash) {
        assertWritable();
        return withNativeResourceWrite(handle, 'visual-ledger', () => this.engine.withTransaction(handle, async tx => {
            const record = nativeRecord(value), result = await tx.putResourceIfMatch(visualKey(handle, type, id), expectedHash, record);
            if (!result.updated) visualError('conflict');
            return { value: record.doc, revision: record.integrity };
        }));
    }
    /** Applicable quotas for a connection and model, each with its current usage. */
    async quotaState(handle, budget, connectionProfileId, model) {
        const quotas = requestQuotasFor(budget, connectionProfileId, model);
        if (!quotas.length) return [];
        const jobs = await this.list(handle, 'job'), now = this.now();
        return quotas.map(quota => ({ ...quota, used: quotaUsage(jobs, quota, now) }));
    }
    async budget(handle) {
        const row = await this.read(handle, 'budget', 'account');
        return { value: { ...defaultVisualBudget(), ...row.value }, revision: row.revision };
    }
    async configureBudget(handle, value, expectedHash) {
        if (!value || Object.keys(value).sort().join(',') !== Object.keys(defaultVisualBudget()).sort().join(',') || value.schemaVersion !== 2
            || typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency)) visualError('budget_invalid');
        for (const field of ['imageHour', 'imageDay', 'autoConcurrency', 'plannerHour', 'plannerDay', 'plannerTokensDay']) visualInteger(value[field]);
        for (const field of ['moneyDay', 'autoMoneyDay']) if (!Number.isFinite(value[field]) || value[field] < 0) visualError('budget_invalid');
        const quotaKeys = new Set(), limit = value => value === undefined || Number.isSafeInteger(value) && value >= 1 && value <= 100000;
        if (!Array.isArray(value.requestQuotas) || value.requestQuotas.length > 64) visualError('budget_invalid');
        for (const quota of value.requestQuotas) {
            const key = quota && quota.connectionProfileId + '\n' + quota.model;
            if (!quota || Object.keys(quota).some(field => !['connectionProfileId', 'model', 'perDay', 'perMinute'].includes(field))
                || typeof quota.connectionProfileId !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(quota.connectionProfileId)
                || typeof quota.model !== 'string' || !/^(?:\*|[A-Za-z0-9_.:/-]{1,128})$/.test(quota.model)
                || !limit(quota.perDay) || !limit(quota.perMinute) || quota.perDay === undefined && quota.perMinute === undefined || quotaKeys.has(key)) visualError('budget_invalid');
            quotaKeys.add(key);
        }
        return this.write(handle, 'budget', 'account', value, expectedHash);
    }
    async reserve(handle, job) {
        assertWritable();
        return withNativeResourceWrite(handle, 'visual-ledger', () => this.engine.withTransaction(handle, async tx => {
            const key = visualKey(handle, 'job', job.jobId), existing = await getNativeDocument(tx, key);
            if (existing) {
                if (existing.fingerprint !== job.fingerprint) visualError('intent_conflict');
                return existing;
            }
            const jobs = await listNativeDocuments(tx, { kind: K.versionedJsonResource, handle, resourceType: 'atri.visual.job' });
            const duplicate = jobs.find(item => item.intentKey === job.intentKey);
            if (duplicate) return duplicate;
            const budget = { ...defaultVisualBudget(), ...await getNativeDocument(tx, visualKey(handle, 'budget', 'account')) };
            const occupied = jobs.filter(item => !item.reservation.released && (['queued', 'submitting', 'submitted', 'running', 'result_received', 'uncertain_submission'].includes(item.status) || this.now() - item.createdAt < 86400000));
            const automatic = occupied.filter(item => item.mode === 'automatic');
            if (job.mode === 'automatic' && (automatic.length >= budget.imageDay || automatic.filter(item => this.now() - item.createdAt < 3600000).length >= budget.imageHour
                || jobs.filter(item => item.mode === 'automatic' && ['queued', 'submitting', 'submitted', 'running', 'uncertain_submission'].includes(item.status)).length >= budget.autoConcurrency)) visualError('budget_exceeded');
            // Requests still holding their reservation within the rolling day count; definite rejections were released.
            for (const quota of requestQuotasFor(budget, job.connection.connectionProfileId, imageQuotaModel(job.compiled, job.target))) {
                const used = quotaUsage(jobs, quota, this.now());
                if (quota.perDay && used.day >= quota.perDay) visualError('request_quota_exceeded');
                if (quota.perMinute && used.minute >= quota.perMinute) visualError('request_rate_limited');
            }
            const amount = job.reservation.amount;
            // A daily money limit of 0 means "not set": the player already confirmed this manual draw.
            if (amount > 0 && (budget.moneyDay > 0 && budget.currency !== job.reservation.currency
                || budget.moneyDay > 0 && occupied.reduce((sum, item) => sum + item.reservation.amount, 0) + amount > budget.moneyDay
                || job.mode === 'automatic' && automatic.reduce((sum, item) => sum + item.reservation.amount, 0) + amount > budget.autoMoneyDay)) visualError('budget_exceeded');
            await tx.putResourceIfMatch(key, null, nativeRecord(job));
            return job;
        }));
    }
    async updateJob(handle, jobId, update) {
        assertWritable();
        return withNativeResourceWrite(handle, 'visual-ledger', () => this.engine.withTransaction(handle, async tx => {
            const key = visualKey(handle, 'job', jobId), record = await tx.getResource(key);
            if (!record) visualError('job_missing');
            const next = await update(structuredClone(record.doc));
            if (next.fingerprint !== record.doc.fingerprint || next.jobId !== jobId || next.intentKey !== record.doc.intentKey) visualError('immutable_conflict');
            const result = await tx.putResourceIfMatch(key, record.integrity, nativeRecord(next));
            if (!result.updated) visualError('conflict');
            return next;
        }));
    }
    async claim(handle, jobId, workerId, leaseMs = 60000) {
        return this.updateJob(handle, jobId, job => {
            if (job.status !== 'queued' || job.lease?.until > this.now()) visualError('lease_conflict');
            job.fence += 1; job.status = 'submitting'; job.lease = { workerId, until: this.now() + leaseMs };
            job.attempts.push({ attemptId: job.nextAttemptId, fence: job.fence, startedAt: this.now(), status: 'submitting' });
            return job;
        });
    }
    async publishJob(handle, jobId, fence, publish) {
        // Keep cancellation serialized, without holding a SQLite transaction
        // across SessionRepo/AssetStore transactions (which would deadlock).
        return withNativeResourceWrite(handle, 'visual-ledger', async () => {
            assertWritable();
            const row = await this.read(handle, 'job', jobId), job = row.value;
            if (job?.status === 'published') return job;
            if (!job || job.fence !== fence || job.status !== 'result_received' || job.lease?.until < this.now()) visualError('lease_conflict');
            await publish(job);
            const next = { ...job, status: 'published', publishedAt: this.now(), lease: null };
            await this.engine.withTransaction(handle, async tx => {
                const result = await tx.putResourceIfMatch(visualKey(handle, 'job', jobId), row.revision, nativeRecord(next));
                if (!result.updated) visualError('conflict');
            });
            return next;
        });
    }
    async fenced(handle, jobId, fence, update) {
        return this.updateJob(handle, jobId, job => {
            if (job.fence !== fence || job.lease?.until < this.now()) visualError('lease_conflict');
            return update(job);
        });
    }
    async reservePlanner(handle, { reservationId, tokens }) {
        visualInteger(tokens);
        return withNativeResourceWrite(handle, 'visual-ledger', () => this.engine.withTransaction(handle, async tx => {
            assertWritable(); const key = visualKey(handle, 'planner', reservationId);
            if (await getNativeDocument(tx, key)) return;
            const budget = await getNativeDocument(tx, visualKey(handle, 'budget', 'account')) ?? defaultVisualBudget();
            const entries = (await listNativeDocuments(tx, { kind: K.versionedJsonResource, handle, resourceType: 'atri.visual.planner' })).filter(row => this.now() - row.createdAt < 86400000);
            if (entries.length >= budget.plannerDay || entries.filter(row => this.now() - row.createdAt < 3600000).length >= budget.plannerHour
                || entries.reduce((sum, row) => sum + row.tokens, 0) + tokens > budget.plannerTokensDay) visualError('planner_budget_exceeded');
            await tx.putResourceIfMatch(key, null, nativeRecord({ reservationId, tokens, createdAt: this.now() }));
        }));
    }
}
