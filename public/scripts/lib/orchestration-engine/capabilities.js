export const CAPABILITIES = Object.freeze(['memory.recall', 'tool.call', 'agent.handoff', 'agent.delegate',
    'graph.inspect', 'graph.mutate', 'result.submit', 'result.judge', 'reply.read', 'reply.write', 'reply.submit']);

export function intersectCapabilities(...layers) {
    for (const layer of layers) {
        if (!layer || typeof layer !== 'object' || Object.keys(layer).some(key => !CAPABILITIES.includes(key))) throw new TypeError('Invalid capabilities');
    }
    return Object.fromEntries(CAPABILITIES.map(key => [key, layers.every(layer => layer[key] === true)]));
}

export function modeCapabilities(mode) {
    return Object.fromEntries(CAPABILITIES.map(key => [key,
        key.startsWith('reply.') ? mode === 'director' : key === 'graph.mutate' ? mode === 'agenda' : true]));
}

export function effectiveCapabilities(plan, node) {
    const agent = plan.agents.find(item => item.id === node.agentId);
    return intersectCapabilities(modeCapabilities(plan.source.mode), plan.capabilities, node.capabilities, agent?.capabilities || node.capabilities);
}

export function assertCapability(plan, node, capability) {
    if (!effectiveCapabilities(plan, node)[capability]) throw new Error(`Capability denied: ${capability} (${node.nodeId})`);
}

export function toolCapability(name, mode) {
    if (['write_message', 'apply_message_patches'].includes(name)) return 'reply.write';
    if (['get_draft', 'draft_search'].includes(name)) return 'reply.read';
    if (mode === 'director' && name === 'finalize') return 'reply.submit';
    if (['dispatch_subagent', 'dispatch_inline_subagent', 'await_subagents', 'cancel_subagent'].includes(name)) return 'agent.delegate';
    return name === 'memory_recall' ? 'memory.recall' : 'tool.call';
}

/** Runtime allowlists are compiled from the intersection, never from prompt promises. */
export function compileAgentDefinition(plan, node, availableTools) {
    const agent = plan.agents.find(item => item.id === node.agentId);
    if (!agent) throw new Error('Unknown node agent');
    const caps = effectiveCapabilities(plan, node);
    const tools = agent.tools.filter(name => availableTools.includes(name) && caps[toolCapability(name, plan.source.mode)]
        && (!['reply.write', 'reply.submit'].includes(toolCapability(name, plan.source.mode)) || node.nodeId === plan.output.ownerNodeId));
    return { ...agent, tools, handoffs: caps['agent.handoff'] ? agent.handoffs || [] : [],
        policies: { ...agent.policies, maxConcurrency: Math.min(agent.policies?.maxConcurrency || plan.budgets.maxConcurrency, plan.budgets.maxConcurrency) } };
}
