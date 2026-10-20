import { COMPUTE_ADMISSION_CODES } from '../../../public/shared/native-compute-budget.js';
// Request-owned values only: never freeze a caller's mutable configuration in place.
export function immutable(value) {
    const copy = structuredClone(value);
    const freeze = item => {
        if (item && typeof item === 'object') {
            for (const child of Object.values(item)) freeze(child);
            Object.freeze(item);
        }
        return item;
    };
    return freeze(copy);
}

// Check only the current send's resolved secret, including its JSON-escaped form.
// Keep the value in the request frame; diagnostics must never carry the input.
export function containsSecret(value, secret) {
    if (typeof secret !== 'string' || !secret) return false;
    const encoded = JSON.stringify(value);
    return Boolean(encoded?.includes(secret) || encoded?.includes(JSON.stringify(secret).slice(1, -1)));
}

const ERROR_CODES = new Set([...COMPUTE_ADMISSION_CODES, 'native_generation_budget_unavailable',
    'native_generation_review_stale', 'native_orchestration_send_replayed', 'native_orchestration_budget_reconcile_required',
    'native_orchestration_review_limit_exhausted', 'native_orchestration_review_rerun_budget_unavailable',
    'generation_program_authority_required', 'generation_draft_preview_only', 'generation_source_stale', 'native_generation_source_stale',
    'native_generation_draft_conflict', 'native_generation_resource_owner',
    'native_generation_preview_disclosure_denied', 'generation_provider_content_blocked',
    'native_credential_network_denied', 'native_credential_target_invalid', 'native_credential_insecure_target',
    'generation_continuation_reset_required',
    'generation_target_policy_denied', 'generation_path_evidence_unavailable', 'generation_continuation_unavailable', 'generation_semantic_authority_changed',
    'native_generation_budget_exhausted', 'native_generation_background_not_due', 'native_generation_budget_lane_denied', 'native_generation_task_stopped', 'native_generation_revision_conflict',
    'generation_provider_endpoint_not_found', 'generation_provider_request_rejected', 'generation_provider_authentication_failed', 'generation_provider_timeout',
    'generation_cancelled', 'generation_execution_failed', 'generation_provider_unavailable',
    'generation_route_mismatch', 'generation_profile_mismatch', 'generation_resource_cycle',
    'generation_resource_limit', 'generation_resource_origin_mismatch', 'generation_exact_resource_mismatch',
    'generation_capability_unsupported', 'generation_capability_unknown', 'generation_endpoint_credentials_disallowed',
    'generation_invalid_fallback_mode', 'generation_request_identity_mismatch', 'generation_missing_output_requirement',
    'generation_invalid_token_count', 'generation_context_budget_exceeded', 'generation_fallback_confirmation_required',
    'generation_provider_failed', 'generation_provider_submission_unknown', 'generation_fallback_exhausted', 'generation_secret_unavailable',
    'generation_fallback_route_unpinned', 'generation_fallback_route_stale',
    'generation_response_invalid', 'generation_response_contains_secret', 'generation_config_contains_secret',
    'generation_adapter_control_unsupported', 'generation_adapter_prompt_unsupported', 'generation_adapter_output_budget',
    'generation_adapter_sampling_invalid', 'generation_adapter_stop_invalid', 'generation_adapter_stream_invalid',
    'generation_adapter_message_invalid',
    'generation_output_authority_changed',
]);

export class GenerationError extends Error {
    constructor(code) {
        code = ERROR_CODES.has(code) ? code : 'generation_execution_failed';
        super(code);
        this.name = 'GenerationError';
        this.code = code;
    }
}

export function effectiveOutputReserve(resolved, fallback = resolved.model.limits.outputTokens) {
    const reserve = resolved.generation.output.maxTokens ?? fallback;
    if (!Number.isSafeInteger(reserve) || reserve < 1 || reserve > resolved.model.limits.outputTokens) throw new GenerationError('generation_adapter_output_budget');
    return reserve;
}

// Only adapters may classify a failed send as eligible for route fallback.
export class ProviderFailure extends Error {
    constructor(kind) {
        super('Provider send failed');
        this.kind = ['transport', 'provider', 'timeout'].includes(kind) ? kind : 'application';
    }
}

// Classify only the HTTP status. Never retain provider response bodies or credentials.
const httpFailures = new WeakMap();
export function providerHttpFailure(status) {
    const failure = status === 401 || status === 403 ? new GenerationError('generation_provider_authentication_failed')
        : status === 404 ? new GenerationError('generation_provider_endpoint_not_found')
            : status === 400 || status === 422 ? new GenerationError('generation_provider_request_rejected')
                : new ProviderFailure(status === 429 || status >= 500 ? 'provider' : 'application');
    if (Number.isInteger(status) && status >= 400 && status <= 599) httpFailures.set(failure, Object.freeze({ status }));
    return failure;
}
/** Numeric original HTTP observation, never inferred from an error code. */
export function inspectProviderHttpFailure(error) { return httpFailures.get(error) ?? null; }
/** Called by an original HTTP adapter after numeric usage normalization. */
export function observeProviderHttpUsage(error, usage) {
    const event = httpFailures.get(error);
    if (!event) return;
    const numeric = Object.fromEntries(['inputTokens', 'outputTokens', 'totalTokens']
        .filter(field => Number.isSafeInteger(usage?.[field]) && usage[field] >= 0).map(field => [field, usage[field]]));
    if (!Object.keys(numeric).length) return;
    const observed = Object.freeze(numeric);
    httpFailures.set(error, Object.freeze({ status: event.status, usage: observed }));
    error.usage = observed;
}

export function checkCancellation(signal) {
    if (signal?.aborted) throw new GenerationError('generation_cancelled');
}

export async function cancellable(operation, signal) {
    checkCancellation(signal);
    let onAbort;
    const aborted = new Promise((resolve, reject) => {
        onAbort = () => reject(new GenerationError('generation_cancelled'));
        signal?.addEventListener('abort', onAbort, { once: true });
    });
    try {
        return await Promise.race([Promise.resolve().then(() => {
            checkCancellation(signal);
            return operation();
        }), aborted]);
    } finally {
        signal?.removeEventListener('abort', onAbort);
    }
}
