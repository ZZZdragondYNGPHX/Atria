import { assertNativeId, createNativeId } from './identity.js';
import { hashNativeDocument } from './repositories/common.js';
import { IllustrationService } from './illustration-service.js';
import { nativeTaskScheduler } from './task-scheduler.js';
import { VisualStore } from './visual-store.js';
import { ImageJobWorker, newImageJob } from './image-worker.js';
import { createImageRegistry, resolveImageSelection } from './image-registry.js';
import { VersionedJsonResourceHandler } from './model-prompt-runtime/persistence.js';
import { resolveVisualSource } from './visual-source.js';
import { visualFingerprint, assertCompilationEvidence, visualObject, visualError } from '../../public/shared/native-visual-contract.js';
import { assertWritable } from '../storage/read-only-mode.js';

const terminal = new Set(['published', 'failed', 'cancelled', 'stale', 'uncertain_submission']);
const publicJob = job => ({ operationId: job.jobId, jobId: job.jobId, intentId: job.intentId,
    status: job.status === 'published' ? 'completed' : job.status, anchor: { ...job.source, illustrationStep: 'image' },
    createdAt: job.createdAt, errorCode: job.errorCode ?? null, cost: { estimated: job.reservation.amount, currency: job.reservation.currency,
        actual: null, state: 'unknown', held: !job.reservation.released }, remote: job.remote, cancelReceipt: job.cancelReceipt ?? null });

export class IllustrationImageService {
    constructor({ host, scheduler = nativeTaskScheduler, registry = createImageRegistry(), provider } = {}) {
        Object.assign(this, { host, scheduler, registry });
        // Injection is a fixture transport port, never a second production path.
        if (provider) for (const name of ['provider.novelai-image', 'provider.novelai-image-compatible']) {
            const adapter = registry.get(name); registry.adapters.set(name, { ...adapter, generate: provider.generate.bind(provider) });
        }
        this.illustrations = new IllustrationService({ sessionRepo: host.sessionCore._sessions });
        this.assets = host.packageInstaller._assetStore;
        this.store = new VisualStore({ engine: host.persistence._engine });
        this.resources = new VersionedJsonResourceHandler({ engine: host.persistence._engine });
        this.worker = new ImageJobWorker({ store: this.store, assets: this.assets, registry, secretPort: host.secretPort, scheduler,
            fresh: async (handle, job) => {
                assertWritable(); await host.sessionCore.runs.assert(handle, job.source.sessionId, 'generate');
                await resolveVisualSource(host.sessionCore, handle, job.source);
            },
            publish: async (handle, job) => {
                const { source, result, evidence } = job;
                const state = (await host.sessionCore._sessions.getIllustrations(handle, source.sessionId, { branchId: source.branchId })).state;
                if (state.images.some(image => image.imageVersionId === job.imageVersionId)) return;
                await this.illustrations.addImageVersion(handle, source.sessionId, { annotationId: source.annotationId, branchId: source.branchId,
                    imageVersionId: job.imageVersionId, assetId: result.ref.assetId, width: result.width, height: result.height,
                    alt: source.anchor.quote.slice(0, 2048), prompt: evidence.ir.prompt, negativePrompt: evidence.ir.negativePrompt,
                    parameters: evidence.target.executionParameters, requestSnapshot: evidence, mediaOperation: job.mediaOperation });
            } });
    }
    async prepare(handle, input) {
        visualObject(input, ['sessionId', 'branchId', 'annotationId', 'expectedHead', 'imageTargetId', 'imageRenderingId', 'operation', 'parentImageVersionIds', 'mask', 'references', 'omittedPreferred']);
        const { sessionId, branchId, annotationId } = input;
        assertNativeId(sessionId, 'session'); assertNativeId(branchId, 'branch'); assertNativeId(annotationId, 'annotation');
        const sessions = this.host.sessionCore._sessions;
        const presentation = await sessions.getIllustrations(handle, sessionId, { branchId });
        if (input.expectedHead !== presentation.head) visualError('head_conflict');
        const annotation = presentation.state.annotations.find(item => item.annotationId === annotationId);
        if (!annotation || annotation.deletedAt !== undefined) visualError('annotation_deleted');
        if (!annotation.draft?.prompt.trim()) visualError('prompt_empty');
        const session = await sessions.get(handle, sessionId), settings = (await this.host.extensions.illustrationSettings(handle)).value;
        if (settings.schemaVersion !== 2) visualError('schema_cutover_required');
        const selection = resolveImageSelection({ task: input, annotation: annotation.imageSelection, work: settings.works[session.packageId], global: settings });
        let targetId = selection.imageTargetId;
        const rendering = selection.imageRenderingId ? (await this.resources.getCurrent(handle, 'core.image-rendering', selection.imageRenderingId))?.snapshot : null;
        targetId ||= rendering?.defaultTargetId;
        if (!targetId) visualError('target_missing');
        const target = (await this.resources.getCurrent(handle, 'core.image-target', targetId))?.snapshot;
        if (!target) visualError('target_missing');
        const connection = await this.host.persistence.getConnectionProfile(handle, target.connectionProfileId);
        const source = { kind: 'session', sessionId, branchId, revisionId: annotation.anchor.revisionId, annotationId, anchor: annotation.anchor, timeKind: 'present' };
        await resolveVisualSource(this.host.sessionCore, handle, source);
        const draft = annotation.draft;
        const ir = { schemaVersion: 2, source, operation: input.operation ?? 'txt2img', authoring: 'raw', prompt: draft.prompt,
            negativePrompt: rendering?.negativePrompt ?? draft.preset.negativePrompt, scene: draft.scene, style: rendering?.style ?? draft.preset.style,
            participants: [], references: input.references ?? [], constraints: [...(rendering?.constraints ?? [])] };
        // Editing and references are validated by the Media/Visual authority;
        // an unsupported operation cannot leak through the generation route.
        if (ir.references.length || input.mask || input.parentImageVersionIds?.length) visualError('media_prepare_required');
        const plan = await this.registry.prepare({ ir, target, rendering, connection, approval: { omittedPreferred: input.omittedPreferred ?? [] } });
        const imageVersionId = createNativeId('imageVersion'), executionParameters = plan.compiled.body.parameters ?? plan.compiled.body;
        const evidence = assertCompilationEvidence({ schemaVersion: 2, requestId: imageVersionId, source,
            connection: { connectionProfileId: connection.connectionProfileId, displayName: connection.displayName, providerAdapter: connection.providerAdapter, fingerprint: hashNativeDocument(connection) },
            target: { ...target, executionParameters }, ir, capabilities: plan.manifest, constraints: plan.constraints,
            request: plan.compiled.body, requestHash: visualFingerprint(plan.compiled.body), irHash: visualFingerprint(ir), transforms: plan.compiled.transforms ?? [] });
        const prepareId = createNativeId('visualIntent');
        const prepared = { prepareId, source, selection, connection, target, rendering, compiled: plan.compiled, evidence,
            targetFingerprint: plan.fingerprint, expectedHead: presentation.head, expiresAt: Date.now() + 300000 };
        await this.store.write(handle, 'prepared', prepareId, prepared, null);
        return { prepareId, targetFingerprint: plan.fingerprint, requestHash: evidence.requestHash, source, selection, target: { id: targetId, model: target.model, name: target.displayName },
            capabilities: plan.manifest, constraints: plan.constraints, cost: plan.manifest.cost, prompt: ir.prompt, expiresAt: prepared.expiresAt };
    }
    authorize(prepared, approval, mode) {
        visualObject(approval, ['targetFingerprint', 'requestHash', 'maxCost', 'currency', 'allowUnknownCost', 'externalAssetIds', 'omittedPreferred']);
        if (approval.targetFingerprint !== prepared.targetFingerprint || approval.requestHash !== prepared.evidence.requestHash) visualError('approval_conflict');
        if (!Number.isFinite(approval.maxCost) || approval.maxCost < 0 || typeof approval.currency !== 'string' || typeof approval.allowUnknownCost !== 'boolean'
            || !Array.isArray(approval.externalAssetIds) || !Array.isArray(approval.omittedPreferred)) visualError('approval_invalid');
        const cost = prepared.evidence.capabilities.cost;
        if (mode === 'automatic' && prepared.connection.providerAdapter.startsWith('provider.novelai-image')) visualError('human_initiation_required');
        if (cost.kind === 'unknown' && (mode === 'automatic' || !approval.allowUnknownCost || approval.maxCost <= 0)) visualError('cost_unauthorized');
        if (cost.kind !== 'free' && (approval.maxCost <= 0 || cost.currency && approval.currency !== cost.currency || cost.upperBound !== null && cost.upperBound > approval.maxCost)) visualError('cost_unauthorized');
        for (const omission of prepared.evidence.constraints.omitted) if (omission.tier === 'preferred' && !approval.omittedPreferred.includes(omission.capability)) visualError('degradation_unauthorized');
        return { amount: cost.kind === 'free' ? 0 : cost.upperBound ?? approval.maxCost, currency: cost.kind === 'free' ? '' : approval.currency };
    }
    async start(handle, input) {
        visualObject(input, ['prepareId', 'approval']); assertWritable(); assertNativeId(input.prepareId, 'visualIntent');
        const prepared = (await this.store.read(handle, 'prepared', input.prepareId)).value;
        if (!prepared) visualError('prepare_missing');
        const jobs = await this.store.list(handle, 'job'), existing = jobs.find(job => job.intentKey === input.prepareId);
        if (existing) { this.worker.dispatch(handle, existing); return { operationId: existing.jobId, head: prepared.expectedHead }; }
        if (prepared.expiresAt < Date.now()) visualError('prepare_expired');
        const presentation = await this.host.sessionCore._sessions.getIllustrations(handle, prepared.source.sessionId, { branchId: prepared.source.branchId });
        if (presentation.head !== prepared.expectedHead) visualError('head_conflict');
        await this.host.sessionCore.runs.assert(handle, prepared.source.sessionId, 'generate');
        await resolveVisualSource(this.host.sessionCore, handle, prepared.source);
        const { amount, currency } = this.authorize(prepared, input.approval, 'manual');
        const mediaOperation = { schemaVersion: 2, mediaOperationId: createNativeId('mediaOperation'), kind: prepared.evidence.ir.operation,
            source: prepared.source, parentImageVersionIds: [], inputAssets: [], mask: null, geometry: null };
        const job = await this.store.reserve(handle, newImageJob({ source: prepared.source, intentKey: input.prepareId, fingerprint: prepared.evidence.requestHash,
            mode: 'manual', connection: prepared.connection, target: prepared.target, compiled: prepared.compiled, evidence: prepared.evidence,
            approval: { ...input.approval, authorizedAt: Date.now() }, amount, currency, mediaOperation }));
        this.worker.dispatch(handle, job); return { operationId: job.jobId, head: prepared.expectedHead };
    }
    async status(handle, { operationId }) {
        assertNativeId(operationId, 'imageJob');
        const job = (await this.store.read(handle, 'job', operationId)).value;
        if (!job) visualError('job_missing');
        await this.host.sessionCore.runs.assert(handle, job.source.sessionId, 'inspect');
        return { operation: publicJob(job), ...(terminal.has(job.status) ? await this.host.sessionCore._sessions.getIllustrations(handle, job.source.sessionId, { branchId: job.source.branchId }) : {}) };
    }
    async list(handle, { sessionId, branchId }) {
        assertNativeId(sessionId, 'session'); assertNativeId(branchId, 'branch');
        await this.host.sessionCore.runs.assert(handle, sessionId, 'inspect');
        await this.worker.recover(handle);
        return (await this.store.list(handle, 'job')).filter(job => job.source.sessionId === sessionId && job.source.branchId === branchId).map(publicJob);
    }
    cancel(handle, { operationId }) { return this.worker.cancel(handle, assertNativeId(operationId, 'imageJob')).then(publicJob); }
    wait(handle, operationId) { return this.worker.wait(handle, operationId); }
}
