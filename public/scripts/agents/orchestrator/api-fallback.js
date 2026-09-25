// Orchestrator API-route fallback policy.
//
// A per-agent route may fail because the provider is temporarily unavailable.
// In that case Atria may retry the same logical request through the Workspace
// Default API profile. Deterministic request/profile/tool errors do not switch
// providers.

const ELIGIBLE_CODES = new Set(['network', 'rate_limit', 'no_response']);
const BLOCKED_CODES = new Set([
    'aborted',
    'context_budget',
    'invalid_input',
    'auth_missing',
    'tool_call_parse',
    'json_schema_violation',
    'agenda_planner_validation',
]);

function normalizeName(value) {
    return String(value || '').trim();
}

function errorChain(error) {
    const out = [];
    const seen = new Set();
    let current = error;
    while (current && typeof current === 'object' && !seen.has(current) && out.length < 6) {
        out.push(current);
        seen.add(current);
        current = current.cause;
    }
    return out;
}

export function getOrchestrationFallbackApiPresetName(settings, primaryApiPresetName = '') {
    const fallback = normalizeName(settings?.llmNodeApiPresetName);
    const primary = normalizeName(primaryApiPresetName);
    return fallback && fallback !== primary ? fallback : '';
}

export function isOrchestrationApiFallbackEligible(error, { abortSignal = null } = {}) {
    if (abortSignal?.aborted) return false;

    const chain = errorChain(error);
    for (const item of chain) {
        const code = normalizeName(item?.code).toLowerCase();
        if (BLOCKED_CODES.has(code)) return false;
        if (ELIGIBLE_CODES.has(code)) return true;

        const status = Number(item?.status ?? item?.details?.status ?? item?.cause?.status);
        if (status === 429 || status >= 500) return true;
    }

    const message = chain
        .map(item => String(item?.message || ''))
        .join(' ')
        .toLowerCase();

    if (!message) return false;
    if (/context.{0,12}(budget|length|window)|token.{0,12}(limit|maximum)|invalid (argument|schema|tool)|tool.{0,8}(schema|argument)/i.test(message)) {
        return false;
    }

    return /\b429\b|\b5\d\d\b|rate.?limit|overload|temporar(?:y|ily) unavailable|service unavailable|gateway|timeout|timed out|network|fetch failed|econn|enotfound|eai_again|connection (?:reset|refused|closed)/i.test(message);
}

function attachFallbackMetadata(result, metadata) {
    if (!result || typeof result !== 'object') return result;
    try {
        Object.defineProperty(result, 'orchestrationApiFallback', {
            value: Object.freeze({ ...metadata }),
            enumerable: false,
            configurable: true,
        });
    } catch {
        // Frozen/provider-owned return objects are still valid results.
    }
    return result;
}

export async function runWithOrchestrationApiFallback({
    primaryApiPresetName = '',
    fallbackApiPresetName = '',
    abortSignal = null,
    execute,
    onEvent = null,
} = {}) {
    if (typeof execute !== 'function') {
        throw new TypeError('runWithOrchestrationApiFallback requires execute(apiPresetName).');
    }

    const primary = normalizeName(primaryApiPresetName);
    const fallback = normalizeName(fallbackApiPresetName);

    try {
        return await execute(primary, { fallback: false });
    } catch (primaryError) {
        if (!fallback || fallback === primary || !isOrchestrationApiFallbackEligible(primaryError, { abortSignal })) {
            throw primaryError;
        }

        try {
            onEvent?.({ type: 'api_fallback.started', primaryApiPresetName: primary, fallbackApiPresetName: fallback, error: String(primaryError?.message || primaryError) });
        } catch { /* observer only */ }

        console.warn('[orchestrator] Primary API route failed; trying Workspace Default API profile.', {
            primaryApiPresetName: primary,
            fallbackApiPresetName: fallback,
            error: String(primaryError?.message || primaryError),
        });

        try {
            const result = await execute(fallback, { fallback: true, primaryError });
            try {
                onEvent?.({ type: 'api_fallback.succeeded', primaryApiPresetName: primary, fallbackApiPresetName: fallback });
            } catch { /* observer only */ }
            return attachFallbackMetadata(result, {
                used: true,
                primaryApiPresetName: primary,
                fallbackApiPresetName: fallback,
            });
        } catch (fallbackError) {
            try {
                onEvent?.({ type: 'api_fallback.failed', primaryApiPresetName: primary, fallbackApiPresetName: fallback, error: String(fallbackError?.message || fallbackError) });
            } catch { /* observer only */ }
            if (fallbackError && typeof fallbackError === 'object' && fallbackError.cause == null) {
                try { fallbackError.cause = primaryError; } catch { /* read-only error */ }
            }
            throw fallbackError;
        }
    }
}
