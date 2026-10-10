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

const ERROR_CODES = new Set([
    'generation_target_policy_denied', 'generation_path_evidence_unavailable', 'generation_continuation_unavailable',
    'native_generation_budget_exhausted', 'native_generation_background_not_due', 'native_generation_budget_lane_denied',
    'generation_provider_endpoint_not_found', 'generation_provider_request_rejected', 'generation_provider_authentication_failed', 'generation_provider_timeout',
    'generation_cancelled', 'generation_execution_failed', 'generation_provider_unavailable',
    'generation_route_mismatch', 'generation_profile_mismatch', 'generation_resource_cycle',
    'generation_resource_limit', 'generation_resource_origin_mismatch', 'generation_exact_resource_mismatch',
    'generation_capability_unsupported', 'generation_capability_unknown', 'generation_endpoint_credentials_disallowed',
    'generation_invalid_fallback_mode', 'generation_request_identity_mismatch', 'generation_missing_output_requirement',
    'generation_invalid_token_count', 'generation_context_budget_exceeded', 'generation_fallback_confirmation_required',
    'generation_provider_failed', 'generation_fallback_exhausted', 'generation_secret_unavailable',
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
    const floor = resolved.connection?.providerAdapter === 'provider.openai-compatible'
        ? resolved.connection.options?.minimumOutputTokens ?? 0 : 0;
    if (!Number.isSafeInteger(floor) || floor < 0) throw new GenerationError('generation_adapter_control_unsupported');
    const reserve = Math.max(resolved.generation.output.maxTokens ?? fallback, floor);
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
export function providerHttpFailure(status) {
    if (status === 401 || status === 403) return new GenerationError('generation_provider_authentication_failed');
    if (status === 404) return new GenerationError('generation_provider_endpoint_not_found');
    if (status === 400 || status === 422) return new GenerationError('generation_provider_request_rejected');
    return new ProviderFailure(status === 429 || status >= 500 ? 'provider' : 'application');
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
