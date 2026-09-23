export async function runtimeRequest(path = '/configuration', { method = 'GET', body, signal } = {}) {
    const headers = globalThis.Atria?.getContext?.()?.getRequestHeaders?.() || {};
    const response = await fetch('/api/native/generation' + path, {
        method, signal, headers: { ...headers, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json();
    if (!response.ok) throw Object.assign(new Error(payload.error || 'Runtime request failed'), { code: payload.error });
    return payload;
}

// Request evidence is ephemeral presentation state, never a second configuration store.
let latestEvidence = null;
export function rememberRuntimeEvidence(value) { latestEvidence = value; }
export function getRuntimeEvidence() { return latestEvidence; }

export function runtimeRemediation(code) {
    const actions = {
        native_generation_route_missing: ['No route is configured for this role. Create a route with an exact Model, Generation and Prompt.', 'routes'],
        native_generation_route_ambiguous: ['Several primary routes match this role. Assign distinct roles or link alternatives as fallbacks.', 'routes'],
        native_generation_configuration_invalid: ['Save failed. Check required fields, references and revision uniqueness. Your edits are still here.', null],
        native_generation_context_required: ['Open a Native game, or enter a Project ID and its exact revision, then preview again.', null],
        native_generation_revision_conflict: ['The context changed. Reopen the current Session or Project and preview again.', null],
        generation_secret_unavailable: ['The exact Secret reference is unavailable. Update the connection reference.', 'connections'],
        generation_context_budget_exceeded: ['The full request exceeds the model budget. Review model limits and selected context.', 'models'],
        generation_adapter_control_unsupported: ['This transport does not support one of the configured controls. Review the profile and model.', 'profiles'],
    };
    return actions[code] || ['Runtime could not complete this request (' + code + '). Review the route and its exact dependencies.', 'routes'];
}

export function runtimeGenerationError(code, status) {
    const [message, target] = runtimeRemediation(code);
    if (target && globalThis.document && typeof CustomEvent === 'function') {
        document.dispatchEvent(new CustomEvent('atria-native-runtime-error', { detail: { message, target } }));
    }
    return Object.assign(new Error(message), { code, status });
}
