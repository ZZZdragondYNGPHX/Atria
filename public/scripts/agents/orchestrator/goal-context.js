import { boundEvidenceCapture } from './run-state/store.js';
import { goalRequest } from '../../native/agent-goals-panel.js';

// Reuse the evidence consumer's frozen scope. Never read a later active chat.
export async function loadRunGoalContext(runId, request = goalRequest) {
    const capture = boundEvidenceCapture(runId);
    const scope = capture?.view().scope;
    if (!scope) return null;
    const result = await request('context', { scope });
    if (boundEvidenceCapture(runId) !== capture) throw new Error('Goal context run changed');
    return result;
}
