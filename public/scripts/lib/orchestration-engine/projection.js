import { effectiveCapabilities } from './capabilities.js';
import { CAPABILITIES } from './capabilities.js';

const fields = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, structuredClone(value[key])]));

export function projectModelProfile(value) {
    const result = Object.fromEntries(['apiPresetName', 'promptPresetName'].filter(key => typeof value?.[key] === 'string').map(key => [key, value[key]]));
    const ref = value?.nativeRouteRef;
    if (ref?.scope === 'player' && /^route_[a-f0-9]{32}$/.test(ref.runtimeRouteId || '')) result.nativeRouteRef = { scope: 'player', runtimeRouteId: ref.runtimeRouteId };
    return result;
}

/** Reapply the allowlist at the untrusted event/replay boundary. */
export function sanitizeEngineProjection(input) {
    const scalar = (value, keys) => Object.fromEntries(keys.filter(key => ['string', 'number', 'boolean'].includes(typeof value?.[key])).map(key => [key, value[key]]));
    const strings = values => Array.isArray(values) ? values.filter(value => typeof value === 'string') : [];
    const list = (value, map) => Array.isArray(value) ? value.map(map) : [];
    return {
        ...scalar(input, ['planId', 'mode', 'presetId', 'presetName', 'graphRevision', 'resultsDelta']),
        nodes: list(input.nodes, node => ({ ...scalar(node, ['nodeId', 'agentId', 'kind', 'attempts', 'status']),
            capabilities: Object.fromEntries(CAPABILITIES.map(key => [key, node.capabilities?.[key] === true])),
            modelProfile: projectModelProfile(node.modelProfile), tools: strings(node.tools) })),
        edges: list(input.edges, edge => scalar(edge, ['edgeId', 'from', 'to', 'condition', 'maxVisits'])),
        tasks: list(input.tasks, task => ({ ...scalar(task, ['id', 'agentId', 'priority', 'status']), dependsOn: strings(task.dependsOn) })),
        results: list(input.results, result => ({ ...scalar(result, ['resultId', 'runId', 'nodeId', 'agentId', 'attempt', 'status', 'createdAt', 'hasValue', 'hasStructured']),
            provenance: list(result.provenance, ref => scalar(ref, ['runId', 'childRunId', 'nodeId', 'resultId', 'effectId'])) })),
        arbitration: scalar(input.arbitration, ['kind', 'maxCalls', 'maxInputBytes', 'allowPartial']),
        arbitrationState: { ...scalar(input.arbitrationState, ['status', 'resultId', 'completed', 'partial']),
            inputResultIds: strings(input.arbitrationState?.inputResultIds), selectedResultIds: strings(input.arbitrationState?.selectedResultIds) },
        output: scalar(input.output, ['kind', 'ownerNodeId', 'submitCapability', 'allowPartial', 'status', 'resultId']),
        budgets: scalar(input.budgets, ['maxSteps', 'maxTasks', 'maxConcurrency']),
    };
}

/** Explicit allowlist: no instructions, prompts, model output, provider credentials or memory bodies. */
export function projectEngine(plan, state = {}) {
    const active = new Set([...(state.activeNodeIds || []), state.activeNodeId].filter(Boolean));
    const latest = new Map((state.results || []).map(result => [result.nodeId, result]));
    return {
        planId: plan.planId, mode: plan.source.mode, presetId: plan.source.presetId || '', presetName: plan.source.presetName || '',
        nodes: plan.nodes.map(node => ({ ...fields(node, ['nodeId', 'agentId', 'kind']),
            capabilities: effectiveCapabilities(plan, node),
            modelProfile: projectModelProfile(plan.agents.find(agent => agent.id === node.agentId)?.modelProfile),
            tools: [...(plan.agents.find(agent => agent.id === node.agentId)?.tools || [])],
            attempts: state.attempts?.[node.nodeId] || 0,
            status: active.has(node.nodeId) ? 'running'
                : latest.get(node.nodeId)?.status || (state.completedNodeIds?.includes(node.nodeId) ? 'completed' : 'pending') })),
        edges: plan.edges.map(edge => fields(edge, ['edgeId', 'from', 'to', 'condition', 'maxVisits'])),
        graphRevision: state.graphRevision || 0,
        tasks: (state.taskGraph || []).map(task => fields(task, ['id', 'agentId', 'dependsOn', 'priority', 'status'])),
        results: (state.results || []).map(result => ({ ...fields(result, ['resultId', 'runId', 'nodeId', 'agentId', 'attempt', 'status', 'createdAt']),
            provenance: (result.provenance || []).map(ref => fields(ref, ['runId', 'childRunId', 'nodeId', 'resultId', 'effectId'])),
            hasValue: result.value !== null && result.value !== undefined, hasStructured: result.structured !== null && result.structured !== undefined })),
        arbitration: fields(plan.arbitration, ['kind', 'maxCalls', 'maxInputBytes', 'allowPartial']),
        arbitrationState: fields(state.arbitrationState, ['status', 'resultId', 'completed', 'partial', 'inputResultIds', 'selectedResultIds']),
        output: { ...fields(plan.output, ['kind', 'ownerNodeId', 'submitCapability', 'allowPartial']),
            ...fields(state.outputState, ['status', 'resultId']) },
        budgets: fields(plan.budgets, ['maxSteps', 'maxTasks', 'maxConcurrency']),
    };
}
