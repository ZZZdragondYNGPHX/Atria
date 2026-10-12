import { assertJsonDeclaration, fields } from '../../public/shared/native-values.js';
import { assertTaskValue } from '../../public/shared/native-task-contract.js';
import { compileDataSchema } from '../../public/shared/native-data-schema.js';
import { projectInformation } from '../../public/shared/native-information-runtime.js';
import { prepareHypothetical, hypotheticalCurrent } from './hypothetical-authority.js';
import { hashNativeDocument } from './repositories/common.js';
import { immutable, checkCancellation } from './model-prompt-runtime/execution-utils.js';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const closed = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const text = maxLength => ({ type: 'string', maxLength });
const texts = (maxItems, maxLength) => ({ type: 'array', maxItems, items: text(maxLength) });
export const PREDICTION_INPUT_SCHEMA = immutable(closed({ observation: text(32768), action: text(8192) }));
export const PREDICTION_OUTPUT_SCHEMA = immutable(closed({ prediction: text(4096), assumptions: texts(16, 512),
    supportRefs: texts(64, 256), uncertainty: closed({ confidence: { type: 'number', minimum: 0, maximum: 1 }, limitations: texts(16, 512) }) }));
const captures = new WeakMap();
const fail = code => { throw Object.assign(new TypeError(code), { code }); };

// Only this consumer can issue the server capture accepted by GenerationHost.
// A copied object or client JSON never acquires its captured authority.
export function assertPredictionCapture(capture, { host, handle } = {}) {
    const authority = captures.get(capture);
    if (!authority || (host !== undefined && host !== authority.host) || (handle !== undefined && handle !== authority.handle)) fail('native_prediction_capture_invalid');
    return authority.data;
}
export async function assertPredictionCaptureCurrent(capture, principal) {
    assertPredictionCapture(capture, principal);
    const authority = captures.get(capture);
    if (!authority) fail('native_prediction_capture_invalid');
    const { host, handle, artifact, data } = authority;
    const current = await host.sessionCore.load(handle, data.snapshot.session.sessionId);
    const installed = await host.sessionCore._openPackage(handle, current.session.packageId, current.session.packageVersionId, current.session.entryPointId);
    if (!hypotheticalCurrent(current, installed, artifact)) fail('native_prediction_revision_conflict');
    return data;
}

export class PredictionService {
    constructor({ host }) { this.host = host; }

    async _capture(handle, raw, signal, { preview = false } = {}) {
        checkCancellation(signal);
        const input = assertJsonDeclaration(raw, 'Prediction request', 65536);
        fields(input, ['sessionId', 'revisionId', 'request'], 'Prediction request');
        const request = input.request;
        fields(request, ['viewId', 'anchor', 'action', 'taskId', 'variantId', 'slotBindings', 'invocationId'], 'Prediction operation');
        if (typeof request.invocationId !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(request.invocationId)
            || request.invocationId.startsWith('lc:')) fail('native_prediction_invocation_invalid');
        const snapshot = await this.host.sessionCore.load(handle, input.sessionId);
        if (snapshot.revision.revisionId !== input.revisionId) fail('native_prediction_revision_conflict');
        const runtime = snapshot.manifest.runtime.experienceContract.taskRuntime;
        const task = runtime?.tasks.find(item => item.id === request.taskId), variant = task?.variants.find(item => item.id === request.variantId);
        const slot = runtime?.slots.find(item => item.id === task?.bindingSlotId);
        if (!task || !variant || !slot || task.executionClass !== 'interactive' || task.resultPolicy.resultClass !== 'advisory'
            || task.resultPolicy.sink !== 'proposal' || task.resultPolicy.applyCommand !== undefined || task.resultPolicy.uses !== undefined
            || task.interpretation !== undefined || variant.resultBinding !== undefined || hashNativeDocument(task.context) !== hashNativeDocument(['input'])
            || hashNativeDocument(compileDataSchema(task.inputSchema)) !== hashNativeDocument(compileDataSchema(PREDICTION_INPUT_SCHEMA))
            || hashNativeDocument(compileDataSchema(variant.outputSchema)) !== hashNativeDocument(compileDataSchema(PREDICTION_OUTPUT_SCHEMA))) fail('native_prediction_task_unsupported');
        const routeRef = request.slotBindings?.[task.bindingSlotId];
        if (!routeRef || routeRef.scope !== 'player' || typeof routeRef.runtimeRouteId !== 'string'
            || Object.keys(routeRef).some(key => !['scope', 'runtimeRouteId'].includes(key))) fail('native_prediction_binding_invalid');
        const action = assertJsonDeclaration(request.action, 'Prediction action', 8192);
        fields(action, action.kind === 'transaction' ? ['kind', 'transactionId', 'input'] : ['kind', 'commandId', 'ticks'], 'Prediction action');
        fields(request.slotBindings, [task.bindingSlotId], 'Prediction bindings');
        const route = this.host.persistence ? await this.host.persistence.getRuntimeRoute(handle, routeRef.runtimeRouteId) : null;
        if (this.host.persistence && (!route || route.scope !== 'player')) fail('native_prediction_binding_invalid');
        const installed = await this.host.sessionCore._openPackage(handle, snapshot.session.packageId, snapshot.session.packageVersionId, snapshot.session.entryPointId);
        const sourceBytes = [...installed.sourceFiles.values(), ...installed.assets.values()].reduce((total, bytes) => total + bytes.length, 0);
        const anchor = { branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId };
        const attempt = { attemptId: randomUUID(), requestId: request.invocationId, kind: 'context_build',
            estimatedItems: 1 + installed.sourceFiles.size + installed.assets.size + snapshot.timeline.length
                + Object.values(snapshot.states.atri_lifecycle.domains).reduce((count, domain) => count + domain.records.length, 0),
            estimatedInputBytes: sourceBytes + Buffer.byteLength(JSON.stringify({ snapshot, request }), 'utf8'),
            targetFingerprint: hashNativeDocument({ task, variant, anchor, viewId: request.viewId, action }) };
        const receipt = preview || !this.host.sessionCore.runs ? null : await this.host.sessionCore.runs.chargeLocalWork(handle, snapshot, anchor,
            route?.executionPolicy?.computeBudget, attempt);
        const started = performance.now(), cpu = process.cpuUsage(), preparationWork = [];
        let outcome = 'failed';
        try {
            checkCancellation(signal);
            const rehearsal = await prepareHypothetical(snapshot, installed, { ...action, viewId: request.viewId, anchor: request.anchor });
            const observation = projectInformation(snapshot, request.viewId, { purpose: 'display', includeRollups: false });
            const payload = assertTaskValue({ observation: JSON.stringify(observation), action: JSON.stringify(action) }, compileDataSchema(task.inputSchema));
            const data = immutable({ snapshot, observation, action, payload, task, variant, slot, taskId: task.id, variantId: variant.id,
                baseAnchor: rehearsal.baseAnchor, snapshotHash: rehearsal.snapshotHash, declarationHash: rehearsal.declarationHash,
                sourceHash: rehearsal.sourceHash, scopeHash: rehearsal.scopeHash, inputHash: hashNativeDocument({ observation, action, task, variant }) });
            const capture = Object.freeze({});
            captures.set(capture, { host: this.host, handle, artifact: rehearsal, data });
            await assertPredictionCaptureCurrent(capture); checkCancellation(signal); outcome = 'completed';
            return { capture, preparationWork, input: { sessionId: input.sessionId, revisionId: input.revisionId, requestId: request.invocationId, routeRef } };
        } finally {
            if (receipt) {
                const used = process.cpuUsage(cpu);
                const settled = await this.host.sessionCore.runs.settleLocalWork(handle, input.sessionId, receipt.operation, attempt.attemptId,
                    { wallMs: performance.now() - started, cpuUserMicros: used.user, cpuSystemMicros: used.system, cpuScope: 'process',
                        outcome: signal?.aborted ? 'cancelled' : outcome });
                preparationWork.push(settled);
            }
        }
    }

    async preflight(handle, raw, signal) {
        const { capture, input } = await this._capture(handle, raw, signal, { preview: true });
        const result = await this.host.previewPrediction(handle, input, capture, signal);
        checkCancellation(signal); await assertPredictionCaptureCurrent(capture);
        return result;
    }

    async prepare(handle, raw, signal) {
        const { capture, input, preparationWork } = await this._capture(handle, raw, signal);
        const data = assertPredictionCapture(capture), { observation, action, task, variant } = data;
        const result = await this.host.executePrediction(handle, input, capture, signal);
        checkCancellation(signal); await assertPredictionCaptureCurrent(capture);
        const prediction = assertTaskValue(result.record.payload, compileDataSchema(PREDICTION_OUTPUT_SCHEMA));
        const refs = new Set(observation.items.map(item => item.id));
        if (prediction.supportRefs.some(ref => !refs.has(ref)) || new Set(prediction.supportRefs).size !== prediction.supportRefs.length) fail('native_prediction_support_invalid');
        const effective = result.record.execution;
        const optional = value => value ?? null;
        return immutable(assertJsonDeclaration({ schemaVersion: 1, kind: 'hypothetical', mode: 'model_prediction', viewId: observation.viewId,
            operation: action.kind, baseAnchor: data.baseAnchor, snapshotHash: data.snapshotHash, declarationHash: data.declarationHash,
            sourceHash: data.sourceHash, scopeHash: data.scopeHash, inputHash: data.inputHash,
            ...prediction, uncertainty: { ...prediction.uncertainty, realOutcome: 'not_observed', truncated: observation.truncated },
            execution: { requestId: input.requestId, taskId: task.id, variantId: variant.id,
                requestSnapshotHash: result.record.requestSnapshotHash, rawResultHash: result.record.rawResultHash,
                normalizedResultHash: hashNativeDocument(prediction), promptProgramRef: result.record.promptProgramRef,
                generationProfileRef: result.record.generationProfileRef, runtimeRouteId: result.record.runtimeRouteId,
                effective: effective ? { providerAdapter: optional(effective.connection?.providerAdapter),
                    connectionProfileId: optional(effective.connection?.connectionProfileId), modelProfileId: optional(effective.model?.modelProfileId),
                    remoteModelId: optional(effective.model?.remoteModelId), generationProfileId: optional(effective.generation?.generationProfileId),
                    generationRevision: optional(effective.generation?.revision) } : null,
                compute: result.routing?.compute ? { ...result.routing.compute,
                    localWork: [...preparationWork, ...(result.routing.compute.localWork ?? [])] } : preparationWork.length ? { localWork: preparationWork } : null } }, 'Prediction artifact', 65536));
    }

    async current(handle, raw) {
        const input = assertJsonDeclaration(raw, 'Prediction current request', 65536);
        fields(input, ['sessionId', 'artifact'], 'Prediction current request');
        const artifact = input.artifact;
        if (artifact?.kind !== 'hypothetical' || artifact.mode !== 'model_prediction' || artifact.baseAnchor?.sessionId !== input.sessionId) return { current: false };
        const snapshot = await this.host.sessionCore.load(handle, input.sessionId);
        const installed = await this.host.sessionCore._openPackage(handle, snapshot.session.packageId, snapshot.session.packageVersionId, snapshot.session.entryPointId);
        // This endpoint proves source freshness only; it never grants publication.
        return { current: hypotheticalCurrent(snapshot, installed, { ...artifact, mode: 'deterministic' }) };
    }
}
