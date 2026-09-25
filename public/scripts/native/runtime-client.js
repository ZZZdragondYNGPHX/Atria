import { formatShellText as fmt, translateShellText as tl } from '../atria-shell/localization.js';
export async function runtimeRequest(path = '/configuration', { method = 'GET', body, signal } = {}) {
    const headers = globalThis.Atria?.getContext?.()?.getRequestHeaders?.() || {};
    const response = await fetch('/api/native/generation' + path, {
        method, signal, headers: { ...headers, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json();
    if (!response.ok) throw Object.assign(new Error(payload.error || 'Runtime request failed'), { code: payload.error, details: payload.details });
    return payload;
}

// Request evidence is ephemeral presentation state, never a second configuration store.
let latestEvidence = null;
export function rememberRuntimeEvidence(value) { latestEvidence = value; }
export function getRuntimeEvidence() { return latestEvidence; }

export function runtimeRemediation(code) {
    const actions = {
        prompt_parameter_option: ['Saved Prompt choices are invalid. Open Prompt choices and restore defaults or choose valid values.', 'diagnostics'],
        prompt_parameter_unknown: ['Saved Prompt choices are invalid. Open Prompt choices and restore defaults or choose valid values.', 'diagnostics'],
        prompt_parameter_type: ['Saved Prompt choices are invalid. Open Prompt choices and restore defaults or choose valid values.', 'diagnostics'],
        prompt_parameter_required: ['A required Prompt choice is missing. Open Prompt choices and select a value.', 'diagnostics'],
        native_retrieval_unavailable: ['This exact retrieval revision is unavailable. Select another revision in Memory or create one in Runtime Retrieval.', 'retrieval'],
        native_retrieval_secret_unavailable: ['The retrieval Secret is unavailable. Create a retrieval revision with an existing stored Secret.', 'retrieval'],
        native_retrieval_invalid: ['Check the retrieval task, model, endpoint, stored Secret and provider options.', 'retrieval'],
        native_retrieval_execution_failed: ['Retrieval failed. Check the selected provider endpoint and model, then retry.', 'retrieval'],
        native_retrieval_browser_unavailable: ['This browser does not support WebGPU. Select another Native Retrieval provider.', 'retrieval'],
        native_retrieval_browser_model_invalid: ['Select a supported WebLLM embedding model in Runtime Retrieval.', 'retrieval'],
        native_runtime_fallback_role: ['This role conflicts with a fallback relationship. Remove the incompatible fallback reference before changing the role.', null],
        native_runtime_referenced: ['This item is still in use. Update its references before deleting it.', null],
        native_runtime_delete_failed: ['Could not delete this item. Reload and try again.', null],
        native_resource_archive_failed: ['Could not change the archive state. Reload and try again.', null],
        native_resource_delete_failed: ['Could not delete this item. Reload and try again.', null],
        native_provider_probe_unsupported: ['This endpoint does not offer a supported model-list check. You can enter a model ID manually.', null],
        native_provider_endpoint_invalid: ['Use an HTTP or HTTPS endpoint without embedded credentials, query parameters or fragments.', null],
        native_provider_authentication_failed: ['The provider rejected this Secret. Select another Secret or check its access permissions.', null],
        native_provider_unreachable: ['Could not reach the provider. Check the endpoint and network, then retry.', null],
        native_provider_unavailable: ['The provider is temporarily unavailable. Try again.', null],
        native_provider_probe_cancelled: ['The connection check timed out or was cancelled. Try again.', null],
        native_provider_response_invalid: ['The provider returned an invalid model list. You can enter a model ID manually.', null],
        native_provider_probe_invalid: ['Check the connection name, endpoint, transport and Secret selection.', null],
        native_secret_selection_required: ['Finish creating or select a stored Secret before saving the connection.', null],
        native_generation_context_ambiguous: ['Choose either a Session or a Project context, not both.', 'diagnostics'],
        native_generation_route_ref_invalid: ['Choose an exact player Runtime route. Session-scoped routes are not provisioned by this host.', 'routes'],
        native_generation_route_missing: ['No route is configured for this role. Create a route with an exact Model, Generation and Prompt.', 'routes'],
        native_generation_route_ambiguous: ['Several primary routes match this role. Assign distinct roles or link alternatives as fallbacks.', 'routes'],
        native_generation_configuration_invalid: ['Save failed. Check required fields, references and revision uniqueness. Your edits are still here.', null],
        native_generation_context_required: ['Open a Native game, or select a Build Project and its exact revision, then preview again.', null],
        native_generation_revision_conflict: ['The context changed. Reopen the current Session or Project and preview again.', null],
        generation_secret_unavailable: ['The exact Secret reference is unavailable. Update the connection reference.', 'connections'],
        generation_context_budget_exceeded: ['The full request exceeds the model budget. Review model limits and selected context.', 'models'],
        generation_adapter_control_unsupported: ['This transport does not support one of the configured controls. Review the profile and model.', 'profiles'],
    };
    const [message, target] = actions[code] || [fmt('Runtime could not complete this request (${0}). Review the route and its exact dependencies.', [code]), 'routes'];
    return [tl(message), target];
}

export function runtimeGenerationError(code, status) {
    const [message, target] = runtimeRemediation(code);
    if (target && globalThis.document && typeof CustomEvent === 'function') {
        document.dispatchEvent(new CustomEvent('atria-native-runtime-error', { detail: { message, target } }));
    }
    return Object.assign(new Error(message), { code, status });
}
