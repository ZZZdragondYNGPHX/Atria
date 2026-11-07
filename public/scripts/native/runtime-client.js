import { formatShellText as fmt, translateShellText as tl } from '../atria-shell/localization.js';
const configurationListeners = new Set();
export function onRuntimeConfigurationChanged(listener) { configurationListeners.add(listener); return () => configurationListeners.delete(listener); }
export async function runtimeRequest(path = '/configuration', { method = 'GET', body, signal, onCommitted, expectedFingerprint } = {}) {
    const headers = globalThis.Atria?.getContext?.()?.getRequestHeaders?.() || {};
    const response = await fetch('/api/native/generation' + path, {
        method, signal, headers: { ...headers, 'Content-Type': 'application/json', ...(expectedFingerprint ? { 'If-Match': expectedFingerprint } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json();
    if (!response.ok) throw Object.assign(new Error(payload.message || payload.error || 'Runtime request failed'), { code: payload.error, details: payload.details });
    if (method !== 'GET') await onCommitted?.(payload);
    if (method !== 'GET' && (/^\/(api-presets|presets|configuration|role-assignments)(\/|$)/.test(path) || /^\/resources(?:\/(?:revision|delete|archive))?$/.test(path))) {
        // A successful mutation can repaint its owner while dependent scopes
        // refresh. Still await all observers before resolving to the caller.
        await Promise.all([...configurationListeners].map(listener => Promise.resolve().then(listener)));
    }
    return payload;
}

// Request evidence is ephemeral presentation state, never a second configuration store.
let latestEvidence = null;
const recentEvidence = [];
const evidenceListeners = new Set();
export function rememberRuntimeEvidence(value) {
    latestEvidence = value;
    const prior = recentEvidence.indexOf(value);
    if (prior >= 0) recentEvidence.splice(prior, 1);
    recentEvidence.push(value);
    if (recentEvidence.length > 8) recentEvidence.shift();
    for (const listener of evidenceListeners) { try { listener(value); } catch { /* Observation only. */ } }
}
export function runtimeEvidenceMatches(value, { sessionId, role } = {}) {
    const snapshot = value?.snapshot ?? value?.requestInfo;
    const source = snapshot?.contextPlan?.source;
    const observedRole = snapshot?.diagnostics?.effectiveConfig?.role?.replace(/^role\./, '');
    return (!sessionId || sessionId === (value?.session?.sessionId ?? source?.sessionId))
        && (!role || observedRole === role || role === 'narrator' && value?.session && value.states?.atri_task_results?.records?.some(record => record.kind === 'turn'));
}
export function getRuntimeEvidence(filter) { return filter ? recentEvidence.findLast(value => runtimeEvidenceMatches(value, filter)) ?? null : latestEvidence; }
export function onRuntimeEvidence(listener) { evidenceListeners.add(listener); return () => evidenceListeners.delete(listener); }

export function runtimeRemediation(code) {
    const actions = {
        native_provider_unreachable: ['The provider model list could not be reached. Check the connection URL and network, or enter a model ID manually.', 'connections'],
        native_api_preset_invalid: ['Check the API preset connection, model, output budget and generation parameters.', 'routes'],
        native_generation_configuration_conflict: ['This API preset changed in another editor. Reload it before saving again.', 'routes'],
        generation_capability_unknown: ['This model has no confirmed support for a required option. Review the API preset capabilities or choose another model.', 'routes'],
        generation_capability_unsupported: ['This model does not support a required option. Change the API preset parameters or choose another model.', 'routes'],
        native_processing_failed: ['A declared Processor failed. Open Diagnostics to inspect its stage and fixed source. No candidate was adopted.', 'diagnostics'],
        generation_provider_endpoint_not_found: ['The service answered HTTP 404 (not found). If this API preset worked before, the service or its upstream is having trouble; send again in a moment. Otherwise check the service address.', 'connections'],
        generation_provider_request_rejected: ['The provider rejected the request (HTTP 400/422). Check model and tool/output schema compatibility.', 'connections'],
        generation_provider_reasoning_unsupported: ['The model rejected the reasoning setting. Select Default or none in the API preset, or use an endpoint that supports reasoning with tools.', 'routes'],
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
        native_runtime_referenced: ['This item is still in use. Update its references before deleting it.', null],
        native_runtime_delete_failed: ['Could not delete this item. Reload and try again.', null],
        native_resource_archive_failed: ['Could not change the archive state. Reload and try again.', null],
        native_resource_delete_failed: ['Could not delete this item. Reload and try again.', null],
        native_provider_probe_unsupported: ['This endpoint does not offer a supported model-list check. You can enter a model ID manually.', null],
        native_provider_endpoint_invalid: ['Use an HTTP or HTTPS endpoint without embedded credentials, query parameters or fragments.', null],
        native_provider_authentication_failed: ['The provider rejected this Secret. Select another Secret or check its access permissions.', null],
        native_provider_unavailable: ['The provider is temporarily unavailable. Try again.', null],
        native_provider_probe_cancelled: ['The connection check timed out or was cancelled. Try again.', null],
        native_provider_response_invalid: ['The provider returned an invalid model list. You can enter a model ID manually.', null],
        native_provider_probe_invalid: ['Check the connection name, endpoint, transport and Secret selection.', null],
        native_credential_network_denied: ['This credential destination is not permitted by Native network policy. Choose a supported public HTTPS endpoint or loopback service.', 'connections'],
        native_credential_insecure_target: ['Use HTTPS for a public credential destination. Plain HTTP is supported only for a loopback service.', 'connections'],
        native_secret_selection_required: ['Finish creating or select a stored Secret before saving the connection.', null],
        native_generation_context_ambiguous: ['Choose either a Session or a Project context, not both.', 'diagnostics'],
        native_generation_route_ref_invalid: ['Choose an exact player Runtime route. Session-scoped routes are not provisioned by this host.', 'routes'],
        native_generation_route_missing: ['The API preset chosen for this job no longer exists. Choose another in Model roles.', 'routes'],
        native_generation_role_unassigned: ['No model is assigned to this job yet. Choose one in Model roles.', 'routes'],
        native_generation_configuration_invalid: ['Save failed. Check required fields, references and revision uniqueness. Your edits are still here.', null],
        native_generation_context_required: ['Open a Native game, or select a Build Project and its exact revision, then preview again.', null],
        native_generation_revision_conflict: ['The context changed. Reopen the current Session or Project and preview again.', null],
        native_generation_budget_invalid: ['Set positive whole numbers for request and token limits.', 'routes'],
        native_generation_superseded: ['A newer reply has started. This earlier reply has stopped.', null],
        native_generation_turn_budget_exhausted: ['This story has reached its author-set limit for this world turn. Load a save to continue from another point.', null],
        native_authority_input_conflict: ['This unfinished choice already has a fixed outcome. Open History & saves and load a save to choose a different action.', null],
        native_generation_budget_lane_denied: ['Optional computation needs a current Run or Project Task and an explicit shared request budget. Review the route settings.', 'routes'],
        native_generation_budget_exhausted: ['This reply used all of its model requests or tokens. Your message is saved — send again for a fresh allowance, or raise "Limits per reply" in the API preset.', 'routes'],
        native_generation_local_work_exhausted: ['This reply reached the local processing limit set in its API preset. No model request was refused. Raise or reset "Local processing" in the API preset, then send again.', 'routes'],
        native_generation_required_budget_reserved: ['Optional work was skipped to keep requests for the reply.', null],
        native_generation_task_stopped: ['The Project Task changed or stopped. Reload it before computing again. The previous continuation is unavailable.', null],
        native_orchestration_turn_route_mismatch: ['An API preset used by this story\'s agent plan changed since the plan was saved. Open the plan and choose Save to library. Your message is saved.', 'plans'],
        native_orchestration_model_authority_unavailable: ['This story\'s agent plan can\'t use one of its models right now. Open the plan and choose Save to library to check it. Your message is saved.', 'plans'],
        native_orchestration_turn_plan_unavailable: ['This story\'s agent plan can\'t run here. Open it in Agents → Orchestration and choose Use in… to see why. Your message is saved.', 'plans'],
        native_orchestration_limit_exhausted: ['The agent plan reached one of its limits before finishing. Raise the limit in the plan, then send again. Your message is saved.', 'plans'],
        // Transient service failures: nothing to fix in settings; the player's turn is already saved.
        generation_provider_failed: ['The model service did not answer. Your message is saved — send again to continue.', null],
        generation_provider_timeout: ['The model service took too long to answer. Your message is saved — send again to continue.', null],
        generation_fallback_exhausted: ['The model service did not answer. Your message is saved — send again to continue.', null],
        generation_response_invalid: ['The model returned an unreadable reply. Your message is saved — send again to continue.', null],
        generation_provider_stream_closed: ['The model service dropped the connection before the reply finished, twice in a row. Your message is saved — send again to continue.', null],
        generation_provider_authentication_failed: ['The model service rejected the API key. Check the key in Runtime Services.', 'connections'],
        generation_secret_unavailable: ['The exact Secret reference is unavailable. Update the connection reference.', 'connections'],
        generation_context_budget_exceeded: ['The full request exceeds the model budget. Review model limits and selected context.', 'models'],
        generation_adapter_control_unsupported: ['This transport does not support one of the configured controls. Review the profile and model.', 'profiles'],
    };
    const [message, target] = actions[code] || [fmt('Runtime could not complete this request (${0}). Review the route and its exact dependencies.', [code]), 'routes'];
    return [tl(message), target, Boolean(actions[code])];
}

// Only the reply the player is waiting on owns the composer notice. Background
// lanes (memory, search, illustration…) report through their own surfaces.
export function runtimeGenerationError(code, status, { notify = true } = {}) {
    const [message, target, known] = runtimeRemediation(code);
    const transient = /^generation_(provider_failed|provider_timeout|fallback_exhausted|response_invalid)$/.test(code);
    if (notify && (target || transient || known) && globalThis.document && typeof CustomEvent === 'function' && code !== 'generation_continuation_reset_required') {
        document.dispatchEvent(new CustomEvent('atria-native-runtime-error', { detail: { message, target } }));
    }
    return Object.assign(new Error(message), { code, status });
}
