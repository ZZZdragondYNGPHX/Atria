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

// Only adapters may classify a failed send as eligible for route fallback.
export class ProviderFailure extends Error {
    constructor(kind) {
        super('Provider send failed');
        this.kind = ['transport', 'provider', 'timeout'].includes(kind) ? kind : 'application';
    }
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
