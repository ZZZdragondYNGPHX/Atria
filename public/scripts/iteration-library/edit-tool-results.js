// Edit tool replies shared by the proposal bus and Memory Schema Studio.

const CONFLICT_MESSAGE_BY_REASON = {
    VALIDATION_ARGS: 'Validation failed — args rejected by the tool contract. Do not retry with the same args.',
    VALIDATION_TARGET: 'Target not found (may have been renamed/deleted). Re-read the live state and adjust the target.',
    VALIDATION_COMMIT: 'Payload rejected by commit-time validation. Adjust the payload.',
    INSTANCE_DESTROYED: 'Target instance was destroyed. Cannot re-issue.',
    CONFLICT: 'Skipped — target was modified after this edit was captured. The write was NOT applied. Re-read the current state and re-issue if still needed.',
    HTTP_ERROR: 'Server/network error. Safe to retry the same edit.',
    TRANSPORT_ERROR: 'Server/network error. Safe to retry the same edit.',
    LOG_WRITE_FAILED: 'Persistence error. The edit may or may not have applied; re-read state to verify.',
};

const DEFAULT_CONFLICT_MESSAGE = CONFLICT_MESSAGE_BY_REASON.CONFLICT;

/**
 * Build the tool_result payload for an edit-tool call.
 *
 * @param {'pending'|'committed'|'rejected'|'conflict'|'rolledBack'} status
 * @param {{reason?: string, hint?: string}} [opts]
 * @returns {object} JSON-serializable payload for the tool_result content
 */
export function buildEditToolResultPayload(status, opts = {}) {
    if (status === 'pending') {
        return {
            status: 'proposal_pending',
            message: 'Edit proposed as a sandbox diff. Awaiting user review in the popup. The iter-studio pauses the auto-continue loop until the user approves, rejects, or conflicts. This result will update in place to the resolved status once the user acts.',
        };
    }
    if (status === 'committed') {
        return {
            status: 'committed',
            message: 'User approved this edit. The change has been applied to the live state.',
        };
    }
    if (status === 'rejected') {
        return {
            status: 'rejected',
            message: 'User rejected this edit. The live state is unchanged. Adjust your approach — propose a different edit or respond with plain text and no tool calls when finished.',
        };
    }
    if (status === 'conflict') {
        const reason = typeof opts.reason === 'string' && opts.reason
            ? opts.reason
            : 'CONFLICT';
        const message = CONFLICT_MESSAGE_BY_REASON[reason] || DEFAULT_CONFLICT_MESSAGE;
        const out = {
            status: 'conflict',
            reason,
            message,
        };
        if (typeof opts.hint === 'string' && opts.hint) {
            out.hint = opts.hint;
        }
        return out;
    }
    if (status === 'rolledBack') {
        return {
            status: 'rolled_back',
            message: 'User rolled back this edit. The live state has been reverted to before this edit was applied.',
        };
    }
    throw new TypeError('Unknown edit proposal status: ' + status);
}

// Update persisted replies after user review. A profile edit represents all
// pending edits in the same assistant turn; read replies keep their contents.
export function applyOutcomesToToolResults(messages, outcomes) {
    const owners = new Map();
    for (const message of messages) {
        if (message.role !== 'assistant') continue;
        for (const call of message.toolCalls ?? []) owners.set(call.id, message);
    }
    const batches = new Map();
    for (const outcome of outcomes) {
        const message = owners.get(outcome.sourceCallId);
        // Outcomes can outlive a deleted history message.
        if (!message?.toolResults) continue;
        const index = message.toolResults.findIndex(reply => reply.tool_call_id === outcome.sourceCallId);
        if (index < 0) continue;
        message.toolResults[index] = replyForOutcome(outcome.sourceCallId, outcome);
        if (outcome.kind === 'profile-edit') batches.set(message, outcome);
    }
    for (const [message, outcome] of batches) {
        message.toolResults.forEach((reply, index) => {
            if (reply.content?.status === 'proposal_pending') message.toolResults[index] = replyForOutcome(reply.tool_call_id, outcome);
        });
    }
}

function replyForOutcome(callId, outcome) {
    return {
        tool_call_id: callId,
        content: buildEditToolResultPayload(outcome.status, outcome),
        status: outcome.status === 'committed' ? 'ok' : 'fail',
    };
}
