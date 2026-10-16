import { assertObject, assertDigest, assertOrchestrationId, assertCounter } from '../../../public/shared/native-orchestration-contracts.js';
import { ProjectAgentService } from '../project-agent.js';

export const PROJECT_READ_TOOLS = Object.freeze(['atri_agent_get_project', 'atri_agent_list_sources', 'atri_agent_read_source',
    'atri_agent_query_resources', 'atri_agent_resource_references', 'atri_agent_resource_closure', 'atri_agent_validate_current',
    'atri_agent_frontend_graph', 'atri_agent_api_catalog', 'atri_agent_api_read']);

/** Original tool schema only. This publication evidence grants no execution. */
export async function readProjectToolDescriptor(handle, ref, agent) {
    assertObject(ref, ['kind', 'projectId', 'taskId', 'name'], 'Project tool pin');
    if (ref.kind !== 'project_agent_tool' || !(agent instanceof ProjectAgentService) || !PROJECT_READ_TOOLS.includes(ref.name))
        throw new TypeError('native_orchestration_project_tool_unavailable');
    const context = await ProjectAgentService.prototype.observeModelContext.call(agent, handle, ref.projectId, ref.taskId);
    const descriptor = context.tools.find(tool => tool.function.name === ref.name);
    if (!descriptor) throw new TypeError('native_orchestration_project_tool_unavailable');
    return descriptor;
}

export function assertProjectToolReceipt(value) {
    assertObject(value, ['schemaVersion', 'runId', 'effectId', 'nodeAttemptId', 'sourceBindingDigest', 'operationId', 'projectAttemptId',
        'callId', 'name', 'argsHash', 'fromFingerprint', 'toFingerprint', 'fromSequence', 'toSequence', 'resultHash'], 'Project tool receipt');
    if (value.schemaVersion !== 1 || !PROJECT_READ_TOOLS.includes(value.name) || !value.projectAttemptId || !value.callId || !value.operationId)
        throw new TypeError('Invalid original Project tool receipt');
    for (const [field, prefix] of [['runId', 'orun'], ['effectId', 'oeffect'], ['nodeAttemptId', 'oattempt']]) assertOrchestrationId(value[field], prefix, field);
    for (const field of ['sourceBindingDigest', 'argsHash', 'fromFingerprint', 'toFingerprint', 'resultHash']) assertDigest(value[field], field);
    assertCounter(value.fromSequence, 'fromSequence'); assertCounter(value.toSequence, 'toSequence');
    if (value.toSequence <= value.fromSequence || value.fromFingerprint !== value.toFingerprint) throw new TypeError('Invalid Project read progression');
    return value;
}
