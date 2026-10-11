import { createHash, randomBytes } from 'node:crypto';
import { hashNativeDocument } from '../repositories/common.js';
import { immutable, GenerationError } from './execution-utils.js';

// Current execution only. Opaque native state is never a Prompt/Task/Memory
// resource and cannot be published by caller JSON. Task retention additionally
// revalidates the private StorageEngine record on every lowering/send.
const checkpoints = new Map();
const leases = new Map();
const wireHash = wire => createHash('sha256').update(wire).digest('hex');
const ttlMs = 10 * 60 * 1000;
const limit = 128;
export const isDurableNativeContinuity = binding => ['task', 'adaptive'].includes(binding.continuity);
const denied = () => { throw new GenerationError('generation_continuation_unavailable'); };
function prune() {
    for (const [id, entry] of checkpoints) if (entry.expiresAt <= Date.now()) checkpoints.delete(id);
}
export function nativeEnvelopeBinding(resolved, snapshot, protocol) {
    if (!resolved.pathFingerprint) denied();
    const { promptIr: ir, contextPlan: plan } = snapshot;
    const sessionTask = plan.source.kind === 'session' && plan.provenance.find(item => item.source === 'native.session-task'
        && typeof item.ref === 'string' && /^[a-zA-Z0-9._:-]{1,128}:[a-f0-9]{64}$/.test(item.ref));
    return immutable({ schemaVersion: 1, protocol, ownerFingerprint: resolved.ownerFingerprint ?? null, pathFingerprint: resolved.pathFingerprint,
        executionScope: plan.source.kind === 'task' ? { kind: 'task', projectId: plan.source.projectId, taskId: plan.source.taskId }
            : sessionTask ? { kind: 'session_task', invocationId: snapshot.requestId, source: plan.source, role: resolved.route.role,
                taskFingerprint: sessionTask.ref.slice(-64) }
                : { kind: 'request', requestId: snapshot.requestId, source: plan.source, role: resolved.route.role },
        targetFingerprint: hashNativeDocument({ model: resolved.model.remoteModelId, connectionId: resolved.connection.connectionProfileId, endpoint: resolved.connection.endpoint }),
        sourceFingerprint: hashNativeDocument({ source: plan.source, provenance: plan.provenance,
            facts: plan.items.filter(item => !['context.history', 'context.input'].includes(item.kind)),
            nativeSelection: plan.nativeSelection ?? null, personaEvidence: plan.personaEvidence ?? null }),
        prefixFingerprint: hashNativeDocument({ directives: ir.directives, contextSlots: ir.contextSlots }),
        toolsFingerprint: hashNativeDocument(ir.tools), outputFingerprint: hashNativeDocument(ir.outputContract),
        generationFingerprint: hashNativeDocument(resolved.generation),
        ...(['task', 'adaptive'].includes(resolved.effectiveExecutionPolicy?.continuity) ? { continuity: resolved.effectiveExecutionPolicy.continuity, runtimeResourceRefs: {
            runtimeRouteId: resolved.route.runtimeRouteId, modelProfileId: resolved.model.modelProfileId,
            connectionProfileId: resolved.connection.connectionProfileId,
        } } : {}),
        policyFingerprint: hashNativeDocument(resolved.effectiveExecutionPolicy ?? resolved.route.executionPolicy ?? null) });
}
const visibleMessages = sequence => sequence.map(message => {
    const visible = { ...message }; delete visible.providerState; return visible;
});
export function captureNativeEnvelope({ binding, sequence, content, text, calls }) {
    prune();
    const bytes = Buffer.byteLength(JSON.stringify(content));
    if (bytes > 2 * 1024 * 1024) denied();
    while (checkpoints.size >= limit) checkpoints.delete(checkpoints.keys().next().value);
    const checkpointId = randomBytes(32).toString('hex');
    const bindingFingerprint = hashNativeDocument(binding);
    checkpoints.set(checkpointId, immutable({ binding, bindingFingerprint, sequence: visibleMessages(sequence), content, text, calls,
        expiresAt: Date.now() + ttlMs }));
    return immutable({ schemaVersion: 1, checkpointId, bindingFingerprint, text, calls });
}
export function readNativeEnvelope(state, binding, sequence, index) {
    prune();
    const entry = checkpoints.get(state?.checkpointId);
    const authenticReference = entry && state.schemaVersion === 1 && state.bindingFingerprint === entry.bindingFingerprint
        && state.text === entry.text && hashNativeDocument(state.calls) === hashNativeDocument(entry.calls);
    if (!authenticReference || entry.bindingFingerprint !== hashNativeDocument(binding)
        || sequence[index].content !== entry.text || hashNativeDocument(sequence[index].tool_calls || []) !== hashNativeDocument(entry.calls)
        || hashNativeDocument(visibleMessages(sequence.slice(0, index))) !== hashNativeDocument(entry.sequence)) {
        // An observed invalidation is terminal in this owner's execution scope.
        // A forged reference or another owner/task cannot evict a live handle.
        const sameOwner = binding.ownerFingerprint && binding.ownerFingerprint === entry?.binding.ownerFingerprint;
        if (authenticReference && (sameOwner || binding.pathFingerprint === entry.binding.pathFingerprint)
            && hashNativeDocument(binding.executionScope) === hashNativeDocument(entry.binding.executionScope)) checkpoints.delete(state.checkpointId);
        denied();
    }
    return entry.content;
}
export function discardNativeEnvelopes(binding) {
    for (const [id, entry] of checkpoints) if (entry.binding.pathFingerprint === binding.pathFingerprint
        && hashNativeDocument(entry.binding.executionScope) === hashNativeDocument(binding.executionScope)) checkpoints.delete(id);
}
export async function hydrateNativeEnvelopes({ binding, sequence, store }) {
    if (!isDurableNativeContinuity(binding)) return;
    if (!store) denied();
    for (const [index, message] of sequence.entries()) if (message.providerState) {
        // Never let an earlier process cache bypass deletion or owner recovery.
        checkpoints.delete(message.providerState.checkpointId);
        const entry = await store.read(message.providerState, binding, sequence, index);
        while (checkpoints.size >= limit) checkpoints.delete(checkpoints.keys().next().value);
        checkpoints.set(message.providerState.checkpointId, entry);
    }
}
export async function publishNativeEnvelope(state, store) {
    const entry = checkpoints.get(state?.checkpointId);
    if (!entry || !isDurableNativeContinuity(entry.binding)) return;
    if (!store) denied();
    await store.save(state, entry);
}
export async function discardStoredNativeEnvelopes(binding, store) {
    discardNativeEnvelopes(binding);
    if (isDurableNativeContinuity(binding)) {
        if (!store) denied();
        await store.discard(binding);
    }
}
// Called only after successful native lowering and response normalization. This
// describes local protocol transfer/retention, never measured upstream reuse.
export function nativeExecutionObservation(binding, sequence, providerState, decision) {
    const transferredCheckpoints = sequence.filter(message => message.providerState).length;
    return { protocol: binding.protocol, lifecycle: isDurableNativeContinuity(binding) ? 'task_continuation' : 'mandatory_tool_exchange',
        scope: binding.executionScope.kind, retention: isDurableNativeContinuity(binding) ? 'owner_runtime_store' : 'process_only', transferredCheckpoints,
        requestAction: transferredCheckpoints ? (isDurableNativeContinuity(binding) ? 'continue_task_protocol' : 'continue_tool_protocol') : 'fresh_protocol_request',
        responseAction: providerState ? (isDurableNativeContinuity(binding) ? 'capture_task_checkpoint' : 'capture_tool_checkpoint') : 'discard_finished_execution',
        ...(decision ? { decision } : {}),
        upstreamReuse: 'unknown' };
}
export function assertNativeEnvelopeSafe(state, secret) {
    const entry = checkpoints.get(state?.checkpointId);
    if (entry && JSON.stringify(entry.content).includes(secret)) {
        checkpoints.delete(state.checkpointId);
        throw new GenerationError('generation_response_contains_secret');
    }
}

export function leaseNativeRequest(request) {
    for (const [id, lease] of leases) if (lease.expiresAt <= Date.now()) leases.delete(id);
    while (leases.size >= limit) leases.delete(leases.keys().next().value);
    const leaseId = randomBytes(32).toString('hex');
    leases.set(leaseId, { request, expiresAt: Date.now() + 60000 });
    return immutable({ endpoint: request.endpoint, body: request.publicBody, binding: request.binding,
        ...(request.continuityDecision ? { continuityDecision: request.continuityDecision } : {}),
        wireFingerprint: wireHash(request.wire), leaseId });
}
export function inspectNativeRequest(rendered, lower) {
    const lease = leases.get(rendered.leaseId);
    if (!lease || lease.expiresAt <= Date.now()) denied();
    const request = lower(lease.request);
    if (wireHash(request.wire) !== rendered.wireFingerprint || request.endpoint !== rendered.endpoint) denied();
    return request;
}
export function consumeNativeRequest(rendered, lower) {
    try { return inspectNativeRequest(rendered, lower); } finally { leases.delete(rendered.leaseId); }
}
