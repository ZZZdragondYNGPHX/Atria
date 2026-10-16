import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { projectModelFixture } from './project-model-fixture.js';
import { projectToolCapability } from '../../../src/native/orchestration/project-tool-contracts.js';

export const projectReadResponse = () => ({ id: 'project-tool-response', status: 'completed',
    output: [{ id: 'project-tool-item', type: 'function_call', status: 'completed', call_id: 'project-tool-call', name: 'atri_agent_get_project', arguments: '{}' }],
    usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } });

export const configureProjectReadPlan = async ({ plan, host, task, h }) => {
    const descriptor = (await host.agent.observeModelContext(h.handle, task.projectId, task.taskId)).tools.find(item => item.function.name === 'atri_agent_get_project');
    const node = plan.definition.nodes[0]; node.capabilities.push('project.read'); node.dependencyPinIds.push('project.read');
    plan.definition.capabilityCeiling.push('project.read');
    plan.dependencyPins.push({ pinId: 'project.read', port: 'tool', resourceRef: { kind: 'project_agent_tool', projectId: task.projectId,
        taskId: task.taskId, name: 'atri_agent_get_project' }, integrity: hash(descriptor) });
};

export const configureProjectToolPlan = names => async ({ plan, host, task, h }) => {
    const tools = (await host.agent.observeModelContext(h.handle, task.projectId, task.taskId)).tools, node = plan.definition.nodes[0];
    const capabilities = ['project.read', 'project.propose'].filter(capability => names.some(name => projectToolCapability(name) === capability));
    node.capabilities.push(...capabilities); plan.definition.capabilityCeiling.push(...capabilities);
    for (const [index, name] of names.entries()) {
        const pinId = 'project.tool.' + index; node.dependencyPinIds.push(pinId);
        plan.dependencyPins.push({ pinId, port: 'tool', resourceRef: { kind: 'project_agent_tool', projectId: task.projectId, taskId: task.taskId, name },
            integrity: hash(tools.find(tool => tool.function.name === name)) });
    }
};

export const projectReadFixture = (make, options = {}) => projectModelFixture(make,
    { configurePlan: configureProjectReadPlan, responseBody: projectReadResponse, ...options });
