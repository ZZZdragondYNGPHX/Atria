// Ledger grammar for orchestration surfaces: every state has a shape, an icon
// and words, never colour alone. Labels describe Host facts exactly; a
// Published Plan is not a running one, and cancel requested is not cancelled.
import { createAtriaIcon } from '../../atria-shell/icons.js';
import { formatShellText as fmt, translateShellText as tl } from '../../atria-shell/localization.js';

// shape: solid | draft | history | unknown | blocked | live | pending | failed
const RUN = {
    admitted: ['Admitted', 'info', 'pending'], running: ['Running', 'info', 'live'], waiting_approval: ['Waiting for approval', 'warning', 'pending'],
    reconciling: ['Reconciling', 'unknown', 'unknown'], blocked: ['Blocked', 'unknown', 'blocked'], completed: ['Completed', 'committed', 'solid'],
    partial: ['Partial', 'warning', 'solid'], failed: ['Failed', 'danger', 'failed'], cancelled: ['Cancelled', 'history', 'history'], stale: ['Stale', 'history', 'history'],
};
const ATTEMPT = {
    reserved: ['Reserved', 'info', 'pending'], pending: ['Queued', 'info', 'pending'], running: ['Running', 'info', 'live'],
    waiting_effect: ['Waiting for effect', 'warning', 'pending'], waiting_approval: ['Waiting for approval', 'warning', 'pending'], waiting_child: ['Waiting for child run', 'warning', 'pending'],
    blocked: ['Blocked', 'unknown', 'blocked'], completed: ['Completed', 'committed', 'solid'], partial: ['Partial', 'warning', 'solid'],
    failed: ['Failed', 'danger', 'failed'], cancelled: ['Cancelled', 'history', 'history'], stale: ['Stale', 'history', 'history'],
};
const EFFECT = {
    prepared: ['Prepared', 'info', 'pending'], ready: ['Ready, not sent', 'info', 'pending'], dispatching: ['Dispatching — outcome not confirmed', 'unknown', 'unknown'],
    confirmed: ['Confirmed by receipt', 'committed', 'solid'], failed: ['Failed', 'danger', 'failed'], not_dispatched: ['Not dispatched', 'history', 'history'],
    unknown: ['Outcome unknown', 'unknown', 'unknown'],
};
const APPROVAL = {
    pending: ['Needs your review', 'warning', 'pending'], approved: ['Approved', 'committed', 'solid'], rejected: ['Rejected', 'danger', 'failed'],
    expired: ['Expired', 'history', 'history'], invalidated: ['Invalidated', 'history', 'history'], consumed: ['Approval used', 'committed', 'solid'],
};
const COSTS = {
    settled: ['Fees settled', 'committed', 'solid'], pending: ['Fees not settled', 'unknown', 'unknown'],
    unavailable: ['Fee record unavailable', 'unknown', 'blocked'], not_started: ['No fees recorded', 'neutral', 'pending'],
};
const ISSUE_SEVERITY = { blocking: ['Blocking', 'danger', 'failed'], unknown: ['Not verified', 'unknown', 'unknown'], warning: ['Warning', 'warning', 'pending'], info: ['Note', 'info', 'pending'] };
const VALIDATION = { valid: ['Valid', 'committed', 'solid'], invalid: ['Invalid', 'danger', 'failed'], unknown: ['Not fully verified', 'unknown', 'unknown'] };

const VOCABULARY = { run: RUN, attempt: ATTEMPT, effect: EFFECT, approval: APPROVAL, costs: COSTS, severity: ISSUE_SEVERITY, validation: VALIDATION };
const SHAPE_ICONS = { solid: 'check', draft: 'pencil', history: 'clock', unknown: 'info', blocked: 'lock', live: 'bolt', pending: 'clock', failed: 'error' };

export function describeState(vocabulary, status) {
    const entry = VOCABULARY[vocabulary]?.[status];
    if (!entry) return { label: tl('Unrecognized state'), tone: 'unknown', shape: 'unknown', raw: status };
    return { label: tl(entry[0]), tone: entry[1], shape: entry[2], raw: status };
}

/** A state chip: shape marker + icon + text. Motion is CSS-only and reduced-motion safe. */
export function stateChip(doc, { label, tone = 'neutral', shape = 'pending', title = '' }) {
    const chip = doc.createElement('span');
    chip.className = 'atria-orch-chip';
    chip.dataset.tone = tone;
    chip.dataset.shape = shape;
    const mark = doc.createElement('span');
    mark.className = 'atria-orch-chip__mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.append(createAtriaIcon(doc, SHAPE_ICONS[shape] ?? 'info', { size: 12 }));
    const text = doc.createElement('span');
    text.textContent = label;
    chip.append(mark, text);
    if (title) chip.title = title;
    return chip;
}

export const chipFor = (doc, vocabulary, status) => stateChip(doc, describeState(vocabulary, status));

/** A seal answers "what is this?" — Draft, Published revision, exact pin, history. */
export function seal(doc, { label, kind = 'solid', title = '' }) {
    const node = doc.createElement('span');
    node.className = 'atria-orch-seal';
    node.dataset.seal = kind;
    node.textContent = label;
    if (title) node.title = title;
    return node;
}

export const shortId = (value, length = 6) => {
    const text = String(value ?? '');
    const body = text.includes('_') ? text.slice(text.indexOf('_') + 1) : text;
    return body.length > length * 2 ? body.slice(0, length) + '…' + body.slice(-4) : body;
};

/** Monospace identifier with a full-value copy affordance; copy failure is said, never faked. */
export function idText(doc, value, { prefix = '' } = {}) {
    const wrap = doc.createElement('span');
    wrap.className = 'atria-orch-id';
    const code = doc.createElement('code');
    code.textContent = prefix + shortId(value);
    code.title = String(value);
    const copy = doc.createElement('button');
    copy.type = 'button';
    copy.className = 'atria-orch-id__copy';
    copy.setAttribute('aria-label', fmt('Copy full value ${0}', [String(value)]));
    copy.append(createAtriaIcon(doc, 'duplicate', { size: 13 }));
    copy.addEventListener('click', async () => {
        try { await doc.defaultView.navigator.clipboard.writeText(String(value)); copy.dataset.copied = 'true'; copy.setAttribute('aria-label', tl('Copied')); } catch {
            copy.dataset.copied = 'false'; code.textContent = String(value); copy.setAttribute('aria-label', tl('Clipboard unavailable; full value shown'));
        }
    });
    wrap.append(code, copy);
    return wrap;
}

export const TIMELINE_EVENTS = Object.freeze({
    admitted: 'Run admitted', attempt_prepared: 'Attempt prepared', attempt_identity_reserved: 'Attempt identity reserved', attempt_activated: 'Attempt started',
    attempt_settled: 'Attempt settled', effect_prepared: 'Effect prepared', effect_ready: 'Effect ready', effect_dispatch_claimed: 'Effect dispatch claimed',
    effect_observed: 'Effect outcome observed', approval_requested: 'Approval requested', approval_decided: 'Approval decided',
    graph_transition_admitted: 'Graph transition admitted', graph_patch_accepted: 'Graph change accepted', graph_patch_rejected: 'Graph change rejected',
    graph_review_decided: 'Review decided', graph_execution_failed: 'Graph execution failed', rp_planner_patch_applied: 'Planner change applied',
    rp_graph_review_completed: 'Review completed', rp_graph_judge_completed: 'Judge completed', fanout_group_frozen: 'Fan-out group fixed',
    join_membership_frozen: 'Join members fixed', join_settled: 'Join settled', child_delegated: 'Child run delegated', child_budget_confirmed: 'Child budget confirmed',
    control_handed_off: 'Control handed off', handoff_returned: 'Handoff returned', result_published: 'Result published', task_local_output_committed: 'Task output recorded',
    rp_narration_ready: 'Narration ready', rp_output_completed: 'Chat output recorded', session_narration_ready: 'Session narration ready',
    session_output_completed: 'Session output recorded', project_round_finished: 'Project round finished', project_review_published: 'Project review published',
    project_review_completed: 'Project review completed', project_generation_stopped: 'Project generation stopped', project_execution_failed: 'Project execution failed',
    background_task_published: 'Background task published', background_task_completed: 'Background task completed', project_commit_published: 'Project commit prepared',
    project_commit_completed: 'Project commit recorded', cancel_requested: 'Cancel requested', host_recovered: 'Host control recovered', effect_resumed: 'Effect resumed',
    reconciliation_requested: 'Receipt check requested',
});
export const eventLabel = type => tl(TIMELINE_EVENTS[type] ?? 'Unrecognized event');
const EVENT_TONES = { graph_execution_failed: 'danger', project_execution_failed: 'danger', graph_patch_rejected: 'danger', approval_requested: 'warning',
    cancel_requested: 'history', host_recovered: 'unknown', reconciliation_requested: 'unknown', effect_dispatch_claimed: 'unknown' };
export const eventTone = type => EVENT_TONES[type] ?? (/completed|settled|published|recorded|ready|observed/.test(type) ? 'committed' : 'info');

/** Diagnostic codes from the Host projection: cause plus the lawful way forward. */
const DIAGNOSTICS = {
    native_orchestration_cancel_requested: ['Cancel requested', 'The Host recorded the request. Work already sent and its fees are not undone.'],
    native_orchestration_effect_reconcile_required: ['An effect outcome is unknown', 'Check the original receipt. Do not send it again.'],
    native_orchestration_budget_unsettled: ['Fees are not settled', 'Some provider or local work has no final usage yet. Reserved upper bounds still count.'],
    native_orchestration_budget_unavailable: ['Fee record unavailable', 'The original budget authority could not be read. No amount is shown.'],
    native_orchestration_approval_pending: ['Approval pending', 'Open the trusted Review window to decide.'],
    native_orchestration_approval_channel_unavailable: ['Approval channel unavailable', 'A decision is only possible in the trusted Review window on this device.'],
    native_orchestration_host_recovery_required: ['Host restarted since this Run', 'Recover control on this Host before cancel or other actions.'],
    native_orchestration_deadline_reached: ['Deadline reached', 'The Plan deadline has passed. Unfinished work is not extended.'],
    native_orchestration_steps_limit_reached: ['Step limit reached', 'The Plan step limit is used up.'],
    native_orchestration_attempts_limit_reached: ['Attempt limit reached', 'The Plan attempt limit is used up.'],
    native_orchestration_budget_overrun: ['Budget overrun', 'Recorded usage exceeds the original allowance. Nothing is refunded.'],
};
export function describeDiagnostic(code) {
    const capacity = /^native_orchestration_capacity_(\w+)_unavailable$/.exec(code);
    if (capacity) return { title: fmt('No remaining ${0} capacity', [tl(capacity[1])]), detail: tl('The original budget has no remaining allowance in this dimension.') };
    const entry = DIAGNOSTICS[code];
    return entry ? { title: tl(entry[0]), detail: tl(entry[1]) } : { title: tl('Host diagnostic'), detail: code };
}

const VALIDATION_ISSUES = {
    native_orchestration_graph_invalid: 'The graph structure is not executable.',
    native_orchestration_dependency_stale: 'This pinned resource changed. Pin it again to use the current revision.',
    native_orchestration_dependency_invalid: 'This pinned resource is missing or not a valid exact reference.',
    native_orchestration_dependency_authority_unavailable: 'No original authority could verify this pin.',
    native_orchestration_capability_authority_unavailable: 'No original authority could verify this capability.',
    native_orchestration_project_tool_pin_required: 'Agent nodes using this capability need a matching pinned Project tool.',
    native_orchestration_native_tool_pin_required: 'Nodes using this capability need a matching pinned Session tool.',
    native_orchestration_project_commit_pin_required: 'Project commit needs an exact pinned Project commit descriptor.',
    native_orchestration_retrieval_pin_required: 'Memory retrieval needs a pinned retrieval profile on the node.',
    native_orchestration_retrieval_mode_ambiguous: 'More than one retrieval profile could apply. Pin exactly one per node.',
    native_orchestration_graph_patch_policy_required: 'Graph changes need explicit allowed operations, node kinds and limits.',
    native_orchestration_delegation_dependency_cycle: 'Delegated Plans form a cycle.',
    native_orchestration_delegation_dependency_invalid: 'A delegated Plan pin is not a valid published revision.',
    native_orchestration_child_authority_invalid: 'A delegated child Plan is not valid for its own authorities.',
    native_orchestration_control_output_required: 'This node needs a control output port for its role.',
    native_orchestration_rp_output_policy_invalid: 'The chat output policy does not match this graph.',
};
export const describeIssue = issue => issue.message && issue.code === 'native_orchestration_graph_invalid'
    ? fmt('${0} (${1})', [tl(VALIDATION_ISSUES[issue.code]), issue.message])
    : VALIDATION_ISSUES[issue.code] ? tl(VALIDATION_ISSUES[issue.code]) : issue.code;

/** Request failures in plain words with the next lawful action. */
const ERRORS = {
    native_orchestration_host_changed: 'The Native Host restarted. Your draft is kept; reload before saving again.',
    native_orchestration_draft_conflict: 'This Plan changed elsewhere. Your draft is kept; compare and reload before saving.',
    native_orchestration_validation_stale: 'The Plan or its dependencies changed after validation. Validate again before publishing.',
    native_orchestration_binding_conflict: 'The Plan selection for this source changed. Reload it, then choose again.',
    native_orchestration_command_conflict: 'This request identity was already used for different content.',
    native_orchestration_projection_resync_required: 'The Run view expired. Reading a fresh snapshot.',
    native_orchestration_writer_unavailable: 'This Host is not the active writer. Nothing was changed.',
    native_orchestration_review_unavailable: 'Trusted review is not available for this approval now.',
    native_orchestration_reconcile_unavailable: 'Receipt check is not available for this Run.',
    native_orchestration_reconcile_request_exists: 'A receipt check is already recorded for this effect.',
    native_orchestration_invalid_command: 'The Host rejected this request as invalid.',
    native_orchestration_unauthenticated: 'Sign in again to continue.',
    native_orchestration_unreachable: 'The Native Host could not be reached.',
    request_outcome_unknown: 'The Host may or may not have recorded this. Check the same request again; it will not be sent as a new one.',
    storage_commit_unknown: 'The Host may or may not have recorded this. Check the same request again; it will not be sent as a new one.',
    storage_read_only: 'Storage is read-only. Nothing was changed.',
    native_orchestration_rp_plan_unavailable: 'The chosen Plan is valid but not a shape the chat runner supports: one entry Agent without input ports, joined to one Output. Publishing a Plan does not make every graph runnable.',
    native_orchestration_rp_review_stale: 'The chat, Plan or route changed after review. Review again.',
    native_orchestration_rp_input_required: 'The last chat message must be a user message.',
    native_orchestration_source_stale: 'The source changed since it was read. Read it again.',
    native_orchestration_rp_output_unavailable: 'The chosen Plan does not write chat narration.',
};
export const describeError = error => ERRORS[error?.code] ? tl(ERRORS[error.code]) : fmt('The Host refused this request (${0}).', [error?.code ?? 'unknown']);

/** Token counts: unknown stays unknown; never coerced to zero. */
export const formatTokens = value => Number.isSafeInteger(value) ? new Intl.NumberFormat().format(value) : tl('Unknown');
export const formatDuration = ms => !Number.isFinite(ms) ? tl('Unknown') : ms < 1000 ? fmt('${0} ms', [Math.round(ms)]) : ms < 60000 ? fmt('${0} s', [(ms / 1000).toFixed(1)]) : fmt('${0} min', [(ms / 60000).toFixed(1)]);
export const formatTime = at => Number.isFinite(at) ? new Date(at).toLocaleString() : tl('Unknown');
