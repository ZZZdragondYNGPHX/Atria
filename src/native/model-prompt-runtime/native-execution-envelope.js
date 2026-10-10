import { randomBytes } from 'node:crypto';
import { hashNativeDocument } from '../repositories/common.js';
import { immutable, GenerationError } from './execution-utils.js';

// Current execution only. Opaque native state is never a Prompt/Task/Memory
// resource and cannot be published by caller JSON. A process restart discards it.
const checkpoints = new Map();
const ttlMs = 10 * 60 * 1000;
const limit = 128;
const denied = () => { throw new GenerationError('generation_continuation_unavailable'); };
function prune() {
    for (const [id, entry] of checkpoints) if (entry.expiresAt <= Date.now()) checkpoints.delete(id);
}
export function nativeEnvelopeBinding(resolved, snapshot, protocol) {
    if (!resolved.pathFingerprint) denied();
    const { promptIr: ir, contextPlan: plan } = snapshot;
    return immutable({ schemaVersion: 1, protocol, pathFingerprint: resolved.pathFingerprint, requestId: snapshot.requestId,
        sourceFingerprint: hashNativeDocument({ source: plan.source,
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
    for (const [id, entry] of checkpoints) if (entry.binding.pathFingerprint === binding.pathFingerprint && entry.binding.requestId === binding.requestId) checkpoints.delete(id);
}
export function assertNativeEnvelopeSafe(state, secret) {
    const entry = checkpoints.get(state?.checkpointId);
    if (entry && JSON.stringify(entry.content).includes(secret)) {
        checkpoints.delete(state.checkpointId);
        throw new GenerationError('generation_response_contains_secret');
    }
}
