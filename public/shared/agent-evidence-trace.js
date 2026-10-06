// Metadata-only capture, independent of presentation projections and checkpoints.
const STRINGS = ['type', 'eventId', 'runId', 'parentRunId', 'stepId', 'effectId', 'agentId', 'nodeId',
    'requestId', 'hostRequestId', 'attemptId', 'status', 'lane', 'runtimeRouteId', 'usageStatus', 'attemptScope', 'parentInvocationId'];
const NUMBERS = ['generation', 'version', 'attempt', 'inputTokens', 'outputTokens', 'totalTokens'];
export const EVIDENCE_TRACE_LIMIT = 512;
export const EVIDENCE_TRACE_BYTES = 262144;
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;

export function evidenceEvent(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid evidence event');
    const event = {};
    for (const field of STRINGS) {
        if (value[field] === undefined || value[field] === null) continue;
        if (typeof value[field] !== 'string' || !value[field] || value[field].length > 1024) throw new TypeError('Invalid event identity');
        event[field] = value[field];
    }
    if (!event.type || !event.eventId || !event.runId) throw new TypeError('Missing event identity');
    for (const field of NUMBERS) {
        if (value[field] === undefined || value[field] === null) continue;
        if (!Number.isSafeInteger(value[field]) || value[field] < 0) throw new TypeError('Invalid event measurement');
        event[field] = value[field];
    }
    return event;
}

export function assertEvidenceTrace(trace) {
    if (!trace || trace.schemaVersion !== 1 || Object.keys(trace).sort().join(',') !== 'events,missing,reasons,schemaVersion'
        || !Array.isArray(trace.events) || trace.events.length > EVIDENCE_TRACE_LIMIT
        || !Number.isSafeInteger(trace.missing) || trace.missing < 0 || !Array.isArray(trace.reasons)
        || trace.reasons.some(reason => !['invalid_event', 'event_conflict', 'capture_limit', 'events_missing', 'transport_failed', 'output_unbound'].includes(reason))
        || new Set(trace.reasons).size !== trace.reasons.length || bytes(trace) > EVIDENCE_TRACE_BYTES) throw new TypeError('Invalid evidence trace');
    const ids = new Set();
    for (const value of trace.events) {
        const event = evidenceEvent(value);
        if (Object.keys(value).length !== Object.keys(event).length || ids.has(event.eventId)) throw new TypeError('Invalid or duplicate event');
        ids.add(event.eventId);
    }
    return structuredClone(trace);
}

export function createEvidenceTrace() {
    const events = [], seen = new Map(), reasons = new Set();
    let missing = 0, used = 256;
    const miss = reason => { missing++; reasons.add(reason); };
    return {
        miss,
        append(value) {
            let event;
            try { event = evidenceEvent(value); } catch { miss('invalid_event'); return false; }
            const encoded = JSON.stringify(event), previous = seen.get(event.eventId);
            if (previous !== undefined) { if (previous !== encoded) miss('event_conflict'); return false; }
            const size = bytes(event) + 1;
            if (events.length >= EVIDENCE_TRACE_LIMIT || used + size > EVIDENCE_TRACE_BYTES - 256) { miss('capture_limit'); return false; }
            seen.set(event.eventId, encoded); events.push(event); used += size;
            return true;
        },
        snapshot() {
            return { schemaVersion: 1, events: structuredClone(events), missing: missing + (events.length ? 0 : 1),
                reasons: [...new Set([...reasons, ...(events.length ? [] : ['events_missing'])])] };
        },
    };
}
