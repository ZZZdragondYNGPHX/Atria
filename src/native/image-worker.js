import { normalizeImage } from './adapters/image-transport.js';
import { randomUUID, createHash } from 'node:crypto';
import { createNativeId } from './identity.js';
import { nativeTaskScheduler } from './task-scheduler.js';
import { visualError } from '../../public/shared/native-visual-contract.js';

const active = new Map();
const terminal = new Set(['published', 'failed', 'cancelled', 'stale', 'uncertain_submission']);
const activeKey = (handle, id) => JSON.stringify([handle, id]);
// Scheduler remains the execution/concurrency port; the Native store owns all
// authoritative lifecycle, receipts, fences and reservations across restarts.
export class ImageJobWorker {
    constructor({ store, assets, registry, secretPort, fresh, publish, scheduler = nativeTaskScheduler }) {
        Object.assign(this, { store, assets, registry, secretPort, fresh, publish, scheduler }); this.workerId = randomUUID();
    }
    dispatch(handle, job) {
        const key = activeKey(handle, job.jobId);
        if (active.has(key) || terminal.has(job.status)) return active.get(key)?.promise;
        const operation = this.scheduler.submit({ owner: handle, kind: 'auxiliary_task', executionClass: job.mode === 'automatic' ? 'background' : 'interactive', retry: false,
            key: 'image-job:' + job.jobId, fingerprint: job.fingerprint, anchor: { ...job.source, illustrationStep: 'image' },
            resources: ['connection:' + handle + ':' + job.connection.connectionProfileId], fresh: async () => true,
            run: ({ signal }) => this.run(handle, job.jobId, signal), finalize: async value => value });
        const promise = operation.result.finally(() => active.delete(key)); promise.catch(() => {});
        active.set(key, { operationId: operation.operationId, promise }); return promise;
    }
    async wait(handle, jobId) { return active.get(activeKey(handle, jobId))?.promise; }
    async run(handle, jobId, signal) {
        let job = (await this.store.read(handle, 'job', jobId)).value, fence, heartbeat;
        try {
            await this.fresh(handle, job);
            const secret = job.connection.secretRef ? await this.secretPort.resolveSecret(job.connection.secretRef, { handle }) : null;
            if (job.connection.secretRef && !secret) visualError('secret_unavailable');
            if (signal.aborted) visualError('cancelled');
            job = await this.store.claim(handle, jobId, this.workerId); fence = job.fence;
            heartbeat = setInterval(() => { void this.store.fenced(handle, jobId, fence, j => { j.lease.until = this.store.now() + 60000; return j; }).catch(() => {}); }, 15000);
            heartbeat.unref?.();
            const adapter = this.registry.get(job.connection.providerAdapter);
            const result = await adapter.generate(job.compiled, { secret, signal, jobId, readAsset: assetId => { if (!job.compiled.inputAssetRefs.some(ref => ref.assetId === assetId)) visualError('input_unauthorized'); return this.assets.read(handle, assetId); },
                onRemote: async receipt => {
                    job = await this.store.fenced(handle, jobId, fence, j => { if (j.status !== 'cancelled') j.status = 'submitted'; j.remote = receipt; return j; });
                    if (job.status === 'cancelled') { await this.cancelRemote(handle, job, secret); visualError('cancelled'); }
                } });
            if (signal.aborted) visualError('cancelled');
            job = (await this.store.read(handle, 'job', jobId)).value;
            if (job.status === 'cancelled') visualError('cancelled');
            const normalized = await normalizeImage(result.bytes);
            if (normalized.width !== result.width || normalized.height !== result.height) visualError('result_geometry_invalid');
            result.bytes = normalized.bytes;
            const ref = { assetId: job.outputAssetId, contentHash: createHash('sha256').update(result.bytes).digest('hex'), size: result.bytes.length, mediaType: 'image/png' };
            await this.assets.put(handle, ref, result.bytes);
            job = await this.store.fenced(handle, jobId, fence, j => { if (j.status === 'cancelled') visualError('cancelled'); j.status = 'result_received'; j.result = { ref, width: result.width, height: result.height }; return j; });
            await this.complete(handle, job, fence);
        } catch (error) {
            await this.store.updateJob(handle, jobId, j => {
                if (j.fence !== (fence ?? j.fence) || j.status === 'published' || j.status === 'cancelled' || j.status === 'result_received') return j;
                const sent = j.attempts.length > 0;
                j.status = error.code === 'native_visual_remote_failed' ? 'failed' : j.remote ? 'submitted' : sent ? 'uncertain_submission' : 'failed';
                j.errorCode = /^native_[a-z_]+$/.test(error.code ?? '') ? error.code : 'native_visual_request_failed';
                if (!sent) j.reservation.released = true;
                return j;
            });
            throw error;
        } finally { clearInterval(heartbeat); }
    }
    async complete(handle, job, fence) {
        return this.store.publishJob(handle, job.jobId, fence, async j => {
            await this.fresh(handle, j);
            await this.assets.getRef(handle, j.result.ref.assetId);
            // The same ledger lock serializes cancel against final publication.
            // The publisher is idempotent, so a crash after publication can
            // replay this finalization without creating another version.
            await this.publish(handle, j);
        });
    }
    async recover(handle, jobId = null) {
        const jobs = (await this.store.list(handle, 'job')).filter(job => !jobId || job.jobId === jobId);
        for (let job of jobs) {
            try {
                if (active.has(activeKey(handle, job.jobId)) || job.lease?.until > this.store.now()) continue;
                if (job.status === 'queued') { this.dispatch(handle, job); continue; }
                if (job.status === 'result_received') {
                    job = await this.store.updateJob(handle, job.jobId, j => { j.fence += 1; j.lease = { workerId: this.workerId, until: this.store.now() + 60000 }; return j; });
                    await this.complete(handle, job, job.fence); continue;
                }
                if (['submitting', 'submitted', 'running'].includes(job.status)) {
                    const adapter = this.registry.get(job.connection.providerAdapter);
                    if (job.remote && adapter.reconcile) {
                    // Reconcile the existing remote ID only. No recovery path
                    // may call submit/generate for an already sent job.
                        job = await this.store.updateJob(handle, job.jobId, j => { if (j.lease?.until > this.store.now() || j.status === 'cancelled') visualError('lease_conflict'); j.fence += 1; j.lease = { workerId: this.workerId, until: this.store.now() + 60000 }; return j; });
                        const secret = job.connection.secretRef ? await this.secretPort.resolveSecret(job.connection.secretRef, { handle }) : null;
                        const result = await adapter.reconcile(job.compiled, job.remote, { secret, signal: AbortSignal.timeout(30000), readAsset: assetId => { if (!job.compiled.inputAssetRefs.some(ref => ref.assetId === assetId)) visualError('input_unauthorized'); return this.assets.read(handle, assetId); } });
                        if (!result) { await this.store.fenced(handle, job.jobId, job.fence, j => { j.lease = null; return j; }); continue; }
                        const normalized = await normalizeImage(result.bytes);
                        if (normalized.width !== result.width || normalized.height !== result.height) visualError('result_geometry_invalid');
                        result.bytes = normalized.bytes;
                        const ref = { assetId: job.outputAssetId, contentHash: createHash('sha256').update(result.bytes).digest('hex'), size: result.bytes.length, mediaType: 'image/png' };
                        await this.assets.put(handle, ref, result.bytes);
                        job = await this.store.fenced(handle, job.jobId, job.fence, j => { if (j.status === 'cancelled') visualError('cancelled'); j.status = 'result_received'; j.result = { ref, width: result.width, height: result.height }; return j; });
                        await this.complete(handle, job, job.fence);
                    } else await this.store.updateJob(handle, job.jobId, j => { j.status = 'uncertain_submission'; return j; });
                }
            } catch (error) {
                // Read-side recovery failures preserve remote IDs and never
                // turn a transient query error into a second submission.
                if (error.code !== 'native_visual_lease_conflict') await this.store.updateJob(handle, job.jobId, j => { if (j.fence === job.fence && !terminal.has(j.status)) { j.errorCode = /^native_[a-z_]+$/.test(error.code ?? '') ? error.code : 'native_visual_reconcile_failed'; j.lease = null; } return j; });
            }
        }
    }
    async cancel(handle, jobId) {
        const job = await this.store.updateJob(handle, jobId, j => {
            if (j.status === 'published') visualError('job_already_published');
            if (j.status === 'queued') j.reservation.released = true;
            j.status = 'cancelled'; j.cancelReceipt = { local: true, remoteConfirmed: false, refund: 'unknown' }; return j;
        });
        const entry = active.get(activeKey(handle, jobId)); if (entry) this.scheduler.cancel(handle, entry.operationId);
        if (job.remote) {
            const secret = job.connection.secretRef ? await this.secretPort.resolveSecret(job.connection.secretRef, { handle }) : null;
            await this.cancelRemote(handle, job, secret);
        }
        return (await this.store.read(handle, 'job', jobId)).value;
    }
    async cancelRemote(handle, job, secret) {
        const adapter = this.registry.get(job.connection.providerAdapter);
        if (!adapter.cancel || !job.remote) return;
        try {
            const receipt = await adapter.cancel(job.compiled, job.remote, { secret, signal: AbortSignal.timeout(10000) });
            await this.store.updateJob(handle, job.jobId, j => { if (j.status === 'cancelled') j.cancelReceipt = { local: true, remoteConfirmed: receipt.remoteConfirmed === true, refund: 'unknown' }; return j; });
        } catch { /* Local cancellation remains authoritative; remote fee unknown. */ }
    }
}
export function newImageJob({ source, intentKey, fingerprint, mode, connection, target, compiled, evidence, approval, amount, currency, mediaOperation }) {
    return { schemaVersion: 2, jobId: createNativeId('imageJob'), intentId: createNativeId('visualIntent'), intentKey, fingerprint, source, mode,
        connection, target, compiled, evidence, approval, mediaOperation, imageVersionId: evidence.requestId, outputAssetId: createNativeId('asset'),
        compositeImageVersionId: compiled.preserveOutsideMask ? createNativeId('imageVersion') : null, compositeAssetId: compiled.preserveOutsideMask ? createNativeId('asset') : null,
        status: 'queued', createdAt: Date.now(), fence: 0, lease: null, nextAttemptId: createNativeId('imageAttempt'), attempts: [], remote: null,
        reservation: { amount, currency, released: false }, result: null };
}
