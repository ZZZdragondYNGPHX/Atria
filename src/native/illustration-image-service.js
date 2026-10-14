import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';
import { composeIllustrationPrompt } from '../../public/shared/illustration-plugin-contract.js';
import { VisualContinuity } from './visual-continuity.js';
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
                if (!state.images.some(image => image.imageVersionId === job.imageVersionId)) await this.illustrations.addImageVersion(handle, source.sessionId, { annotationId: source.annotationId, branchId: source.branchId,
                    imageVersionId: job.imageVersionId, assetId: result.ref.assetId, width: result.width, height: result.height,
                    alt: source.anchor.quote.slice(0, 2048), prompt: evidence.ir.prompt, negativePrompt: evidence.ir.negativePrompt,
                    parameters: evidence.target.executionParameters, requestSnapshot: evidence, mediaOperation: job.mediaOperation });
                if (job.compiled.preserveOutsideMask && !state.images.some(image => image.imageVersionId === job.compositeImageVersionId)) {
                    const preservation = job.compiled.preserveOutsideMask;
                    const base = await this.assets.read(handle, preservation.base.assetId), mask = await this.assets.read(handle, preservation.mask.assetId), output = await this.assets.read(handle, result.ref.assetId);
                    const original = PNG.sync.read(base.bytes, { checkCRC: true }), generated = PNG.sync.read(output.bytes, { checkCRC: true });
                    if (original.width !== generated.width || original.height !== generated.height || mask.bytes.length !== original.width * original.height) visualError('composite_geometry_mismatch');
                    const data = Buffer.from(original.data);
                    for (let pixel = 0; pixel < mask.bytes.length; pixel++) for (let channel = 0; channel < 4; channel++) {
                        const weight = mask.bytes[pixel] / 255, offset = pixel * 4 + channel;
                        data[offset] = Math.round(original.data[offset] * (1 - weight) + generated.data[offset] * weight);
                    }
                    const bytes = PNG.sync.write({ width: original.width, height: original.height, data }), ref = { assetId: job.compositeAssetId, contentHash: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, mediaType: 'image/png' };
                    await this.assets.put(handle, ref, bytes);
                    const operation = { ...job.mediaOperation, mediaOperationId: createNativeId('mediaOperation'), kind: 'composite', parentImageVersionIds: [...job.mediaOperation.parentImageVersionIds, job.imageVersionId] };
                    await this.illustrations.addImageVersion(handle, source.sessionId, { annotationId: source.annotationId, branchId: source.branchId,
                        imageVersionId: job.compositeImageVersionId, assetId: ref.assetId, width: original.width, height: original.height, alt: 'Mask composite: ' + source.anchor.quote.slice(0, 2000),
                        prompt: evidence.ir.prompt, negativePrompt: evidence.ir.negativePrompt, parameters: { method: 'canonical-gray8-alpha-composite', providerResultVersion: job.imageVersionId }, mediaOperation: operation });
                }
            } });
    }
    async prepare(handle, input, { media = null } = {}) {
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
        const source = { kind: 'session', sessionId, branchId, revisionId: (annotation.originalAnchor ?? annotation.anchor).revisionId, annotationId, anchor: annotation.originalAnchor ?? annotation.anchor, timeKind: annotation.timeKind ?? 'present',
            ...(annotation.sceneId ? { sceneId: annotation.sceneId, shotId: annotation.shotId } : {}) };
        await resolveVisualSource(this.host.sessionCore, handle, source);
        const draft = annotation.draft;
        const projection = await new VisualContinuity({ host: this.host }).project(handle, source, draft);
        if (projection.conflicts.length) visualError('state_conflict');
        const ir = { schemaVersion: 2, source, operation: input.operation ?? 'txt2img', authoring: draft.prompt === composeIllustrationPrompt(draft) ? 'structured' : 'raw', prompt: media?.prompt ?? draft.prompt,
            negativePrompt: rendering?.negativePrompt ?? draft.preset.negativePrompt, scene: draft.scene, style: rendering ? [rendering.style, rendering.quality].filter(Boolean).join(', ') : [draft.preset.style, draft.preset.quality].filter(Boolean).join(', '),
            participants: projection.participants, references: media?.references ?? input.references ?? [], constraints: [...(rendering?.constraints ?? [])] };
        // Editing and references are validated by the Media/Visual authority;
        // an unsupported operation cannot leak through the generation route.
        if (!media && (ir.references.length || input.mask || input.parentImageVersionIds?.length || !['txt2img', 'regenerate'].includes(ir.operation))) visualError('media_prepare_required');
        for (const ref of ir.references) if (!['base', 'mask'].includes(ref.purpose) && !ir.constraints.some(c => c.capability === ref.purpose)) ir.constraints.push({ capability: ref.purpose, tier: 'required' });
        if (media) ir.authoring = 'raw';
        const probeSecret = connection.secretRef && ['provider.sd-webui-image', 'provider.forge-image', 'provider.comfyui-image'].includes(connection.providerAdapter)
            ? await this.host.secretPort.resolveSecret(connection.secretRef, { handle }) : null;
        const plan = await this.registry.prepare({ ir, target, rendering, connection, secret: probeSecret, approval: { omittedPreferred: input.omittedPreferred ?? [] } });
        let inputBytes = 0;
        for (const input of plan.compiled.inputAssetRefs) { const ref = await this.assets.getRef(handle, input.assetId); if (!ref || ref.contentHash !== input.contentHash) visualError('input_integrity_invalid'); inputBytes += ref.size; }
        if (inputBytes > (connection.providerAdapter === 'provider.gemini-image' ? 14 : 24) * 1024 * 1024) visualError('input_limit');
        if (media?.mediaOperation.mask) plan.compiled.maskGeometry = { width: media.mediaOperation.mask.width, height: media.mediaOperation.mask.height };
        if (media?.preserveOutsideMask) plan.compiled.preserveOutsideMask = { base: media.references.find(r => r.purpose === 'base'), mask: media.references.find(r => r.purpose === 'mask'), width: media.mediaOperation.mask?.width, height: media.mediaOperation.mask?.height };
        const imageVersionId = createNativeId('imageVersion'), executionParameters = plan.compiled.body.parameters ?? plan.compiled.body;
        const evidence = assertCompilationEvidence({ schemaVersion: 2, requestId: imageVersionId, source,
            connection: { connectionProfileId: connection.connectionProfileId, displayName: connection.displayName, providerAdapter: connection.providerAdapter, fingerprint: hashNativeDocument(connection) },
            target: { ...target, executionParameters }, ir, capabilities: plan.manifest, constraints: plan.constraints,
            request: plan.compiled.body, requestHash: visualFingerprint(plan.compiled.body), irHash: visualFingerprint(ir), transforms: plan.compiled.transforms ?? [] });
        const prepareId = createNativeId('visualIntent');
        const prepared = { prepareId, source, selection, connection, target, rendering, compiled: plan.compiled, evidence,
            targetFingerprint: plan.fingerprint, mediaOperation: media?.mediaOperation ?? null, expectedHead: presentation.head, expiresAt: Date.now() + 300000 };
        await this.store.write(handle, 'prepared', prepareId, prepared, null);
        return { prepareId, targetFingerprint: plan.fingerprint, requestHash: evidence.requestHash, source, selection, target: { id: targetId, model: target.model, name: target.displayName },
            capabilities: plan.manifest, constraints: plan.constraints, cost: plan.manifest.cost, externalAssetIds: plan.effectiveReferences.map(ref => ref.assetId), prompt: ir.prompt, expiresAt: prepared.expiresAt };
    }
    authorize(prepared, approval, mode) {
        visualObject(approval, ['targetFingerprint', 'requestHash', 'maxCost', 'currency', 'allowUnknownCost', 'externalAssetIds', 'omittedPreferred']);
        if (approval.targetFingerprint !== prepared.targetFingerprint || approval.requestHash !== prepared.evidence.requestHash) visualError('approval_conflict');
        if (!Number.isFinite(approval.maxCost) || approval.maxCost < 0 || typeof approval.currency !== 'string' || typeof approval.allowUnknownCost !== 'boolean'
            || !Array.isArray(approval.externalAssetIds) || !Array.isArray(approval.omittedPreferred)) visualError('approval_invalid');
        for (const ref of prepared.compiled.inputAssetRefs ?? prepared.evidence.ir.references) if (!approval.externalAssetIds.includes(ref.assetId)) visualError('external_transfer_unauthorized');
        const cost = prepared.evidence.capabilities.cost;
        if (mode === 'automatic' && prepared.connection.providerAdapter.startsWith('provider.novelai-image')) visualError('human_initiation_required');
        if (cost.kind === 'unknown' && (mode === 'automatic' || !approval.allowUnknownCost || approval.maxCost <= 0)) visualError('cost_unauthorized');
        if (cost.kind !== 'free' && (approval.maxCost <= 0 || cost.currency && approval.currency !== cost.currency || cost.upperBound !== null && cost.upperBound > approval.maxCost)) visualError('cost_unauthorized');
        for (const omission of prepared.evidence.constraints.omitted) if (omission.tier === 'preferred' && !approval.omittedPreferred.includes(omission.capability)) visualError('degradation_unauthorized');
        return { amount: cost.kind === 'free' ? 0 : cost.upperBound ?? approval.maxCost, currency: cost.kind === 'free' ? '' : approval.currency };
    }
    start(handle, input) { return this._submit(handle, input, 'manual'); }
    async _submit(handle, input, mode) {
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
        if (mode === 'automatic') {
            const config = (await this.host.extensions.illustrationSettings(handle)).value.director;
            if (config.mode !== 'automatic' || !config.autoApproval || config.autoApproval.targetFingerprint !== prepared.targetFingerprint) visualError('automatic_unauthorized');
        }
        const { amount, currency } = this.authorize(prepared, input.approval, mode);
        const mediaOperation = prepared.mediaOperation ?? { schemaVersion: 2, mediaOperationId: createNativeId('mediaOperation'), kind: prepared.evidence.ir.operation,
            source: prepared.source, parentImageVersionIds: [], inputAssets: [], mask: null, geometry: null };
        const job = await this.store.reserve(handle, newImageJob({ source: prepared.source, intentKey: mode === 'automatic' ? 'auto:' + visualFingerprint({ sessionId: prepared.source.sessionId, variantId: prepared.source.anchor.variantId, start: prepared.source.anchor.start, end: prepared.source.anchor.end }) : input.prepareId, fingerprint: prepared.evidence.requestHash,
            mode, connection: prepared.connection, target: prepared.target, compiled: prepared.compiled, evidence: prepared.evidence,
            approval: { ...input.approval, authorizedAt: Date.now() }, amount, currency, mediaOperation }));
        this.worker.dispatch(handle, job); return { operationId: job.jobId, head: prepared.expectedHead };
    }
    async status(handle, { operationId }) {
        assertNativeId(operationId, 'imageJob');
        let job = (await this.store.read(handle, 'job', operationId)).value;
        if (!job) visualError('job_missing');
        await this.host.sessionCore.runs.assert(handle, job.source.sessionId, 'inspect');
        await this.worker.recover(handle, operationId);
        job = (await this.store.read(handle, 'job', operationId)).value;
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
