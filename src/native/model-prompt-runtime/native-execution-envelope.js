import { createHash, randomBytes } from 'node:crypto';
import { hashNativeDocument } from '../repositories/common.js';
import { immutable, GenerationError } from './execution-utils.js';

// Current execution only. Opaque native state is never a Prompt/Task/Memory
// resource and cannot be published by caller JSON. A process restart discards it.
const checkpoints = new Map();
const leases = new Map();
const wireHash = wire => createHash('sha256').update(wire).digest('hex');
const ttlMs = 10 * 60 * 1000;
const limit = 128;
const denied = () => { throw new GenerationError('generation_continuation_unavailable'); };
function prune() {
    for (const [id, entry] of checkpoints) if (entry.expiresAt <= Date.now()) checkpoints.delete(id);
}
export function nativeEnvelopeBinding(resolved, snapshot, protocol) {
    if (!resolved.pathFingerprint) denied();
    const { promptIr: ir, contextPlan: plan } = snapshot;
    return immutable({ schemaVersion: 1, protocol, pathFingerprint: resolved.pathFingerprint,
        executionScope: plan.source.kind === 'task' ? { kind: 'task', projectId: plan.source.projectId, taskId: plan.source.taskId }
            : { kind: 'request', requestId: snapshot.requestId },
        targetFingerprint: hashNativeDocument({ model: resolved.model.remoteModelId, connectionId: resolved.connection.connectionProfileId, endpoint: resolved.connection.endpoint }),
        sourceFingerprint: hashNativeDocument({ source: plan.source, provenance: plan.provenance,
            facts: plan.items.filter(item => !['context.history', 'context.input'].includes(item.kind)),
            nativeSelection: plan.nativeSelection ?? null, personaEvidence: plan.personaEvidence ?? null }),
        prefixFingerprint: hashNativeDocument({ directives: ir.directives, contextSlots: ir.contextSlots }),
        toolsFingerprint: hashNativeDocument(ir.tools), outputFingerprint: hashNativeDocument(ir.outputContract),
        generationFingerprint: hashNativeDocument(resolved.generation),
        policyFingerprint: hashNativeDocument(resolved.route.executionPolicy ?? null) });
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
    if (!entry || state.schemaVersion !== 1 || entry.bindingFingerprint !== hashNativeDocument(binding)
        || state.bindingFingerprint !== entry.bindingFingerprint || state.text !== entry.text
        || hashNativeDocument(state.calls) !== hashNativeDocument(entry.calls)
        || sequence[index].content !== entry.text || hashNativeDocument(sequence[index].tool_calls || []) !== hashNativeDocument(entry.calls)
        || hashNativeDocument(visibleMessages(sequence.slice(0, index))) !== hashNativeDocument(entry.sequence)) denied();
    return entry.content;
}
export function discardNativeEnvelopes(binding) {
    for (const [id, entry] of checkpoints) if (entry.binding.pathFingerprint === binding.pathFingerprint
        && hashNativeDocument(entry.binding.executionScope) === hashNativeDocument(binding.executionScope)) checkpoints.delete(id);
}
// Called only after successful native lowering and response normalization. This
// describes local protocol transfer, not upstream reuse or durable task policy.
export function nativeExecutionObservation(binding, sequence, providerState) {
    const transferredCheckpoints = sequence.filter(message => message.providerState).length;
    return { protocol: binding.protocol, lifecycle: 'mandatory_tool_exchange',
        scope: binding.executionScope.kind, retention: 'process_only', transferredCheckpoints,
        requestAction: transferredCheckpoints ? 'continue_tool_protocol' : 'fresh_protocol_request',
        responseAction: providerState ? 'capture_tool_checkpoint' : 'discard_finished_execution',
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
        wireFingerprint: wireHash(request.wire), leaseId });
}
export function consumeNativeRequest(rendered, lower) {
    const lease = leases.get(rendered.leaseId); leases.delete(rendered.leaseId);
    if (!lease || lease.expiresAt <= Date.now()) denied();
    const request = lower(lease.request);
    if (wireHash(request.wire) !== rendered.wireFingerprint || request.endpoint !== rendered.endpoint) denied();
    return request;
}
