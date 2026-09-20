import { policyCopy, requireId } from '../agent-runtime/contracts.js';

export function createResult({ runId, nodeId, agentId, attempt = 1, status = 'completed', value = null, structured = null, provenance = [], createdAt = 0 }) {
    [runId, nodeId, agentId].forEach(id => requireId(id));
    if (!['completed', 'partial', 'failed', 'cancelled'].includes(status)) throw new Error('Invalid result status');
    if (!Number.isSafeInteger(attempt) || attempt < 1) throw new Error('Invalid result attempt');
    return policyCopy({ resultId: `${runId}/result/${encodeURIComponent(nodeId)}/${attempt}`, runId, nodeId, agentId, attempt,
        status, value, structured, provenance, createdAt });
}
