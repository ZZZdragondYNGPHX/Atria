// Browser transport for the Native orchestration namespace. It keeps only the
// Host boot identity learned from real responses; Plans, Runs, approvals,
// budgets and receipts stay with the Native Host. Unknown mutation outcomes
// are never resent automatically, and never under a new command identity.

const BASE = '/api/native/orchestration';
const SCHEMA_VERSION = 1;

export class OrchestrationRequestError extends Error {
    constructor(code, { status = 0, hostBootId = null, commandId = null, unknownOutcome = false } = {}) {
        super(code);
        this.name = 'OrchestrationRequestError';
        this.code = code;
        this.status = status;
        this.hostBootId = hostBootId;
        this.commandId = commandId;
        this.unknownOutcome = unknownOutcome;
    }
}

export const newCommandId = () => 'ocmd_' + crypto.randomUUID().replaceAll('-', '');

const defaultHeaders = () => globalThis.Atria?.getContext?.()?.getRequestHeaders?.() ?? {};

/** Error classes the UI must present differently; never a retry policy. */
export function classifyOrchestrationError(error) {
    const code = error?.code ?? '';
    if (error?.unknownOutcome || code === 'storage_commit_unknown') return 'unknown';
    if (code === 'native_orchestration_host_changed') return 'host_changed';
    if (code === 'native_orchestration_projection_resync_required') return 'resync';
    if (/_conflict$|_stale$|_changed$|_exists$/.test(code)) return 'conflict';
    if (error?.status === 503 || code.endsWith('_unavailable')) return 'unavailable';
    if (error?.status === 404) return 'missing';
    if (error?.status === 401 || error?.status === 403) return 'denied';
    if (error?.status === 400) return 'invalid';
    return 'failed';
}

export function createOrchestrationClient({ fetchImpl = (...args) => fetch(...args), headers = defaultHeaders, base = BASE } = {}) {
    let hostBootId = null;
    const listeners = new Set();
    const remember = value => {
        if (typeof value !== 'string' || !value || value === hostBootId) return;
        const previous = hostBootId;
        hostBootId = value;
        if (previous) for (const listener of listeners) listener({ previous, current: value });
    };

    async function send(path, envelope, { signal, mutation = false } = {}) {
        let response;
        const extra = mutation ? { 'X-Atria-Host-Boot-Id': envelope.expectedHostBootId } : {};
        try {
            response = await fetchImpl(base + path, { method: 'POST', signal, credentials: 'same-origin',
                headers: { ...headers(), ...extra, 'Content-Type': 'application/json' }, body: JSON.stringify(envelope) });
        } catch (error) {
            if (signal?.aborted) throw error;
            // The request may have reached the Host. A mutation must be treated
            // as unknown until the same command is observed again.
            throw new OrchestrationRequestError(mutation ? 'request_outcome_unknown' : 'native_orchestration_unreachable',
                { commandId: envelope.commandId ?? null, unknownOutcome: mutation });
        }
        let payload = null;
        try { payload = await response.json(); } catch {
            if (mutation && response.status >= 500) throw new OrchestrationRequestError('request_outcome_unknown', { status: response.status, commandId: envelope.commandId, unknownOutcome: true });
        }
        if (payload?.hostBootId) remember(payload.hostBootId);
        if (!response.ok) {
            const code = typeof payload?.error === 'string' ? payload.error : response.status === 401 ? 'native_orchestration_unauthenticated' : 'native_orchestration_failed';
            throw new OrchestrationRequestError(code, { status: response.status, hostBootId: payload?.hostBootId ?? null,
                commandId: envelope.commandId ?? null, unknownOutcome: mutation && (code === 'storage_commit_unknown' || response.status >= 500 && code === 'native_orchestration_failed') });
        }
        if (payload?.schemaVersion !== SCHEMA_VERSION) throw new OrchestrationRequestError('native_orchestration_schema_unsupported', { status: response.status });
        return { outcome: payload.outcome, response, commandId: payload.commandId ?? null };
    }

    async function read(path, body, options = {}) {
        return send(path, { schemaVersion: SCHEMA_VERSION, body }, options);
    }

    async function ensureBoot(signal) {
        if (!hostBootId) await read('/plans/list', { cursor: null, limit: 1 }, { signal });
        if (!hostBootId) throw new OrchestrationRequestError('native_orchestration_host_unavailable', { status: 503 });
        return hostBootId;
    }

    /**
     * A mutation carries an explicit commandId. Replaying the identical
     * command (same id and body) is the only lawful way to learn an unknown
     * outcome; the caller decides when, the client never does it implicitly.
     */
    async function mutate(path, body, { commandId = newCommandId(), signal } = {}) {
        const expectedHostBootId = await ensureBoot(signal);
        return send(path, { schemaVersion: SCHEMA_VERSION, commandId, expectedHostBootId, body }, { signal, mutation: true });
    }

    return Object.freeze({
        read, mutate, ensureBoot,
        getHostBootId: () => hostBootId,
        onHostChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },

        listPlans: (cursor = null, limit = 50, signal, { archived = false } = {}) => read('/plans/list', { cursor, limit, ...(archived ? { archived } : {}) }, { signal }).then(r => r.outcome),
        getPlan: (planId, signal) => read('/plans/get', { planId }, { signal }).then(r => r.outcome),
        listRevisions: (planId, cursor = null, limit = 50, signal) => read('/plans/revisions', { planId, cursor, limit }, { signal }).then(r => r.outcome),
        getRevision: (planRef, signal) => read('/plans/revision', { planRef }, { signal }).then(r => r.outcome),
        async validatePlan(body, signal) {
            const { outcome, response } = await read('/plans/validate', body, { signal });
            return { report: outcome, validationDigest: response.headers.get('X-Atria-Validation-Digest') };
        },
        inspectDependency: (body, signal) => read('/dependencies/inspect', body, { signal }).then(r => r.outcome),
        createPlan: (body, options) => mutate('/plans/create', body, options),
        forkPlan: (body, options) => mutate('/plans/fork', body, options),
        archivePlan: (body, options) => mutate('/plans/archive', body, options),
        deletePlan: (body, options) => mutate('/plans/delete', body, options),
        savePlan: (body, options) => mutate('/plans/save', body, options),
        publishPlan: (body, options) => mutate('/plans/publish', body, options),
        getBinding: (sourceSelector, signal) => read('/bindings/get', { sourceSelector }, { signal }).then(r => r.outcome),
        saveBinding: (body, options) => mutate('/bindings/save', body, options),

        listRuns: (sourceSelector, cursor = null, limit = 25, signal) => read('/runs/list', { sourceSelector, cursor, limit }, { signal }).then(r => r.outcome),
        observeRun: (runId, cursor, limit, signal) => read('/runs/observe', { runId, cursor, limit }, { signal }).then(r => r.outcome),
        runDetails: (body, signal) => read('/runs/details', body, { signal }).then(r => r.outcome),
        runDiagnostics: (runId, signal) => read('/runs/diagnostics', { runId }, { signal }).then(r => r.outcome),
        cancelRun: (body, options) => mutate('/runs/cancel', body, options),
        recoverRun: (body, options) => mutate('/runs/recover', body, options),
        reconcileRun: (body, options) => mutate('/runs/reconcile', body, options),
        launchApproval: (body, options) => mutate('/approvals/launch', body, options),
    });
}

/** RP chat Source identity through the original RpRunControl; never guessed. */
export async function bindRpChatSource(client, locator, { fetchImpl = (...args) => fetch(...args), headers = defaultHeaders } = {}) {
    const expectedHostBootId = await client.ensureBoot();
    const response = await fetchImpl('/api/native/generation/rp/source', { method: 'POST', credentials: 'same-origin',
        headers: { ...headers(), 'X-Atria-Host-Boot-Id': expectedHostBootId, 'Content-Type': 'application/json' },
        body: JSON.stringify({ locator, expectedHostBootId }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new OrchestrationRequestError(payload.error ?? 'native_orchestration_rp_source_failed', { status: response.status, hostBootId: payload.hostBootId ?? null });
    return payload;
}

async function generationPost(path, body, { fetchImpl = (...args) => fetch(...args), headers = defaultHeaders, bootId = null } = {}) {
    const response = await fetchImpl('/api/native/generation' + path, { method: 'POST', credentials: 'same-origin',
        headers: { ...headers(), ...(bootId ? { 'X-Atria-Host-Boot-Id': bootId } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new OrchestrationRequestError(payload.error ?? 'native_orchestration_failed', { status: response.status, hostBootId: payload.hostBootId ?? null });
    return { payload, response };
}

/** Read-only review of an RP Run: no Provider call, no fee. */
export async function preflightRpRun(input, options) {
    const { payload, response } = await generationPost('/rp/preflight', input, options);
    return { review: payload, fingerprint: response.headers.get('X-Atria-Preflight-Fingerprint') };
}

/** Explicit paid start bound to the exact reviewed fingerprint and Host boot. */
export async function startRpRun(client, review, fingerprint, options = {}) {
    const bootId = await client.ensureBoot();
    const { payload } = await generationPost('/rp/start', { input: review.input, expectedPreflightFingerprint: fingerprint, expectedHostBootId: bootId }, { ...options, bootId });
    return payload;
}

export async function readNativeOperation(operationId, { headers = defaultHeaders } = {}) {
    const response = await fetch('/api/native/generation/operations/' + encodeURIComponent(operationId), { credentials: 'same-origin', headers: headers() });
    if (!response.ok) throw new OrchestrationRequestError('native_orchestration_operation_unavailable', { status: response.status });
    return response.json();
}

/** Prepare only: approval and dispatch remain separate Host operations. */
export async function prepareProjectCommit(source, body, { fetchImpl = (...args) => fetch(...args), headers = defaultHeaders } = {}) {
    const path = '/api/native/studio/projects/' + encodeURIComponent(source.projectId) + '/agent/tasks/' + encodeURIComponent(source.taskId) + '/commit/prepare';
    let response;
    try {
        response = await fetchImpl(path, { method: 'POST', credentials: 'same-origin', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
        throw new OrchestrationRequestError('request_outcome_unknown', { commandId: body.commandId, unknownOutcome: true });
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) throw new OrchestrationRequestError(payload?.error ?? 'request_outcome_unknown', {
        status: response.status, commandId: body.commandId, unknownOutcome: !payload || response.status >= 500 || payload.error === 'storage_commit_unknown',
    });
    return payload;
}
