import { assertObject, assertDigest, assertOrchestrationId, assertCounter } from '../../../public/shared/native-orchestration-contracts.js';
import { ProjectAgentService } from '../project-agent.js';

export const PROJECT_READ_TOOLS = Object.freeze(['atri_agent_get_project', 'atri_agent_list_sources', 'atri_agent_read_source',
    'atri_agent_query_resources', 'atri_agent_resource_references', 'atri_agent_resource_closure', 'atri_agent_validate_current',
    'atri_agent_frontend_graph', 'atri_agent_api_catalog', 'atri_agent_api_read']);
export const PROJECT_PROPOSAL_TOOLS = Object.freeze(['atri_agent_set_plan', 'atri_agent_reuse_plan', 'atri_agent_reset_operations',
    'atri_agent_project_save', 'atri_agent_resource_attach', 'atri_agent_resource_update', 'atri_agent_resource_fork',
    'atri_agent_source_write', 'atri_agent_source_move', 'atri_agent_source_delete', 'atri_agent_frontend_patch', 'atri_agent_prepare_review']);
export const projectToolCapability = name => PROJECT_READ_TOOLS.includes(name) ? 'project.read'
    : PROJECT_PROPOSAL_TOOLS.includes(name) ? 'project.propose' : null;
export const PROJECT_TOOL_BATCH_POLICY = Object.freeze({ maxProposalCalls: 1, proposalOrder: 'last' });
export function projectToolBatchAllowed(calls) {
    const proposals = calls.filter(call => projectToolCapability(call.name) === 'project.propose');
    return proposals.length <= PROJECT_TOOL_BATCH_POLICY.maxProposalCalls
        && (!proposals.length || PROJECT_TOOL_BATCH_POLICY.proposalOrder === 'last' && calls.at(-1) === proposals[0]);
}
export const projectToolAction = name => projectToolCapability(name) === 'project.read' ? 'native_project_read' : 'native_project_proposal';
export const projectToolReason = name => projectToolCapability(name) === 'project.read' ? 'project_read_completed' : 'project_proposal_completed';

// A completed original evaluation can close Task editing while its exact
// generation still needs to publish its round/output metadata. Never permits
// a new generation, another proposal or a formal Project Commit.
export const projectReviewSource = (task, receipt) => receipt?.name === 'atri_agent_prepare_review'
    && receipt.toFingerprint === task.executionFingerprint && ['review', 'blocked', 'conflict'].includes(task.status);

// The original writer appends its call receipt and advances sequence after a
// Task-shaped result is produced. Bind all other original returned fields.
export function projectToolResultPayload(name, result) {
    if (!PROJECT_PROPOSAL_TOOLS.includes(name)) return result;
    if (!result?.taskId || !result.projectId || !result.executionFingerprint) throw new TypeError('Original Task result required');
    const { sequence: _sequence, attempts: _attempts, ...payload } = result;
    return payload;
}

/** Original tool schema only. This publication evidence grants no execution. */
export async function readProjectToolDescriptor(handle, ref, agent) {
    assertObject(ref, ['kind', 'projectId', 'taskId', 'name'], 'Project tool pin');
    if (ref.kind !== 'project_agent_tool' || !(agent instanceof ProjectAgentService) || !projectToolCapability(ref.name))
        throw new TypeError('native_orchestration_project_tool_unavailable');
    const context = await ProjectAgentService.prototype.observeModelContext.call(agent, handle, ref.projectId, ref.taskId);
    const descriptor = context.tools.find(tool => tool.function.name === ref.name);
    if (!descriptor) throw new TypeError('native_orchestration_project_tool_unavailable');
    return descriptor;
}

export function assertProjectToolReceipt(value) {
    assertObject(value, ['schemaVersion', 'runId', 'effectId', 'nodeAttemptId', 'sourceBindingDigest', 'operationId', 'projectAttemptId',
        'callId', 'name', 'argsHash', 'fromFingerprint', 'toFingerprint', 'fromSequence', 'toSequence', 'resultHash'], 'Project tool receipt');
    if (value.schemaVersion !== 1 || !projectToolCapability(value.name) || !value.projectAttemptId || !value.callId || !value.operationId)
        throw new TypeError('Invalid original Project tool receipt');
    for (const [field, prefix] of [['runId', 'orun'], ['effectId', 'oeffect'], ['nodeAttemptId', 'oattempt']]) assertOrchestrationId(value[field], prefix, field);
    for (const field of ['sourceBindingDigest', 'argsHash', 'fromFingerprint', 'toFingerprint', 'resultHash']) assertDigest(value[field], field);
    assertCounter(value.fromSequence, 'fromSequence'); assertCounter(value.toSequence, 'toSequence');
    if (value.toSequence <= value.fromSequence || projectToolCapability(value.name) === 'project.read' && value.fromFingerprint !== value.toFingerprint)
        throw new TypeError('Invalid Project tool progression');
    return value;
}
