import crypto from 'node:crypto';

export const BACKUP_SYNC_JOB_STATES = Object.freeze({
    QUEUED: 'queued',
    RUNNING: 'running',
    SUCCEEDED: 'succeeded',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
});

function nowIso() {
    return new Date().toISOString();
}

function cloneJob(job) {
    return structuredClone(job);
}

export class BackupSyncJobManager {
    #jobs = new Map();
    #maxJobs;

    constructor({ maxJobs = 100 } = {}) {
        this.#maxJobs = Math.max(10, Math.min(1000, Number(maxJobs) || 100));
    }

    create({ providerId, operation, metadata = {} }) {
        const id = crypto.randomUUID();
        const job = {
            id,
            providerId: String(providerId || ''),
            operation: String(operation || ''),
            state: BACKUP_SYNC_JOB_STATES.QUEUED,
            progress: {
                phase: 'queued',
                current: 0,
                total: null,
                message: '',
            },
            metadata: structuredClone(metadata),
            error: null,
            result: null,
            createdAt: nowIso(),
            startedAt: null,
            finishedAt: null,
            updatedAt: nowIso(),
        };
        this.#jobs.set(id, job);
        this.#trim();
        return cloneJob(job);
    }

    start(id, { phase = 'running', total = null, message = '' } = {}) {
        const job = this.#require(id);
        if (job.state !== BACKUP_SYNC_JOB_STATES.QUEUED) {
            throw new Error(`Cannot start job in state ${job.state}`);
        }
        job.state = BACKUP_SYNC_JOB_STATES.RUNNING;
        job.startedAt = nowIso();
        job.updatedAt = job.startedAt;
        job.progress = { phase, current: 0, total, message };
        return cloneJob(job);
    }

    progress(id, { phase, current, total, message = '' }) {
        const job = this.#require(id);
        if (job.state !== BACKUP_SYNC_JOB_STATES.RUNNING) {
            throw new Error(`Cannot update progress for job in state ${job.state}`);
        }
        job.progress = {
            phase: String(phase || job.progress.phase || 'running'),
            current: Number.isFinite(Number(current)) ? Number(current) : job.progress.current,
            total: total == null ? job.progress.total : Number(total),
            message: String(message || ''),
        };
        job.updatedAt = nowIso();
        return cloneJob(job);
    }

    succeed(id, result = null) {
        return this.#finish(id, BACKUP_SYNC_JOB_STATES.SUCCEEDED, {
            result: structuredClone(result),
            error: null,
        });
    }

    fail(id, error) {
        const normalized = error instanceof Error
            ? { name: error.name, message: error.message, code: error.code || null }
            : { name: 'Error', message: String(error || 'Unknown error'), code: null };
        return this.#finish(id, BACKUP_SYNC_JOB_STATES.FAILED, {
            result: null,
            error: normalized,
        });
    }

    cancel(id, message = 'Cancelled') {
        return this.#finish(id, BACKUP_SYNC_JOB_STATES.CANCELLED, {
            result: null,
            error: { name: 'AbortError', message: String(message), code: 'ABORTED' },
        });
    }

    get(id) {
        const job = this.#jobs.get(String(id || ''));
        return job ? cloneJob(job) : null;
    }

    list({ providerId = null, state = null, limit = 50 } = {}) {
        return [...this.#jobs.values()]
            .filter(job => !providerId || job.providerId === providerId)
            .filter(job => !state || job.state === state)
            .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
            .slice(0, Math.max(1, Math.min(this.#maxJobs, Number(limit) || 50)))
            .map(cloneJob);
    }

    #finish(id, state, patch) {
        const job = this.#require(id);
        if (![BACKUP_SYNC_JOB_STATES.RUNNING, BACKUP_SYNC_JOB_STATES.QUEUED].includes(job.state)) {
            throw new Error(`Cannot finish job in state ${job.state}`);
        }
        Object.assign(job, patch);
        job.state = state;
        job.finishedAt = nowIso();
        job.updatedAt = job.finishedAt;
        job.progress = {
            ...job.progress,
            phase: state,
            current: job.progress.total ?? job.progress.current,
            message: patch.error?.message || job.progress.message || '',
        };
        return cloneJob(job);
    }

    #require(id) {
        const job = this.#jobs.get(String(id || ''));
        if (!job) throw new Error(`Unknown backup/sync job: ${id}`);
        return job;
    }

    #trim() {
        if (this.#jobs.size <= this.#maxJobs) return;
        const sorted = [...this.#jobs.values()]
            .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        for (const job of sorted.slice(0, this.#jobs.size - this.#maxJobs)) {
            this.#jobs.delete(job.id);
        }
    }
}
