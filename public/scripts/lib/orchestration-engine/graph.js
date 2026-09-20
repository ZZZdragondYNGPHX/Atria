import { requireId, copy } from '../agent-runtime/contracts.js';
import { NODE_KINDS, normalizePlan } from './contracts.js';
import { effectiveCapabilities } from './capabilities.js';

export function validateGraph(input) {
    const plan = normalizePlan(input);
    const nodes = new Map(), agents = new Set(), edges = new Set();
    for (const agent of plan.agents) {
        requireId(agent.id);
        if (agents.has(agent.id)) throw new Error('Duplicate agent ID');
        if (!Array.isArray(agent.tools)) throw new Error('Invalid agent tools');
        agents.add(agent.id);
    }
    for (const node of plan.nodes) {
        requireId(node.nodeId);
        if (nodes.has(node.nodeId)) throw new Error('Duplicate node ID');
        if (!NODE_KINDS.includes(node.kind)) throw new Error('Invalid node kind');
        if (!agents.has(node.agentId)) throw new Error('Unknown agent reference');
        effectiveCapabilities(plan, node);
        nodes.set(node.nodeId, node);
    }
    if (!nodes.has(plan.entryNodeId)) throw new Error('Missing entry node');
    if (!nodes.has(plan.output.ownerNodeId)) throw new Error('Missing output owner');
    for (const edge of plan.edges) {
        requireId(edge.edgeId);
        if (edges.has(edge.edgeId)) throw new Error('Duplicate edge ID');
        edges.add(edge.edgeId);
        if (!nodes.has(edge.from) || !nodes.has(edge.to)) throw new Error('Missing edge target');
        if (edge.condition && !['always', 'completed', 'partial', 'failed', 'approved', 'rejected'].includes(edge.condition)) throw new Error('Invalid edge condition');
        if (edge.maxVisits !== undefined && (!Number.isSafeInteger(edge.maxVisits) || edge.maxVisits < 1)) throw new Error('Invalid edge retry budget');
    }
    for (const node of plan.nodes) {
        if (node.kind === 'join' && (!Array.isArray(node.inputs) || !node.inputs.length || node.inputs.some(id => !nodes.has(id) || id === node.nodeId))) throw new Error('Invalid join inputs');
    }
    const reached = new Set(), visiting = new Set(), visited = new Set();
    // Removing bounded edges must leave an acyclic graph: every cycle has an explicit bound.
    const checkCycle = id => {
        if (visiting.has(id)) throw new Error('Unbounded graph cycle');
        if (visited.has(id)) return;
        visiting.add(id);
        for (const edge of plan.edges.filter(edge => edge.from === id && !edge.maxVisits)) checkCycle(edge.to);
        visiting.delete(id); visited.add(id);
    };
    for (const id of nodes.keys()) checkCycle(id);
    const visit = id => { if (reached.has(id)) return; reached.add(id); plan.edges.filter(edge => edge.from === id).forEach(edge => visit(edge.to)); };
    visit(plan.entryNodeId);
    if (!reached.has(plan.output.ownerNodeId)) throw new Error('No output completion path');
    return { plan, diagnostics: plan.nodes.filter(node => !reached.has(node.nodeId)).map(node => ({ code: 'unreachable', nodeId: node.nodeId })) };
}

export function applyTaskProposal(plan, state, proposal, plannerNode) {
    if (!effectiveCapabilities(plan, plannerNode)['graph.mutate']) throw new Error('Capability denied: graph.mutate');
    if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) throw new Error('Invalid Planner proposal');
    const allowed = ['addTasks', 'cancelTasks', 'dispatch', 'reprioritize', 'requestFinalize'];
    if (Object.keys(proposal).some(key => !allowed.includes(key))) throw new Error('Unknown Planner proposal field');
    const next = copy(state);
    const tasks = next.taskGraph || [];
    for (const key of allowed.slice(0, 4)) if (proposal[key] !== undefined && !Array.isArray(proposal[key])) throw new Error('Invalid Planner proposal array');
    if (proposal.requestFinalize !== undefined && typeof proposal.requestFinalize !== 'boolean') throw new Error('Invalid finalize request');
    if (tasks.length + (proposal.addTasks?.length || 0) > plan.budgets.maxTasks) throw new Error('Task budget exhausted');
    for (const raw of proposal.addTasks || []) {
        requireId(raw.id); requireId(raw.task); requireId(raw.agentId);
        if (tasks.some(task => task.id === raw.id)) throw new Error('Duplicate task ID');
        const agent = plan.agents.find(agent => agent.id === raw.agentId);
        if (!agent || !plan.scheduler.workerAgentIds.includes(agent.id)) throw new Error('Task agent not allowed');
        if (raw.requires?.some(capability => agent.capabilities?.[capability] !== true)) throw new Error('Task capability mismatch');
        tasks.push({ id: raw.id, task: raw.task, agentId: raw.agentId, dependsOn: raw.dependsOn || [], priority: 0, status: 'todo' });
    }
    for (const task of tasks) {
        if (!Array.isArray(task.dependsOn) || task.dependsOn.some(id => !tasks.some(other => other.id === id) || id === task.id)) throw new Error('Invalid task dependency');
    }
    const pending = new Set(), done = new Set();
    const visit = id => {
        if (pending.has(id)) throw new Error('Task dependency cycle');
        if (done.has(id)) return;
        pending.add(id); tasks.find(task => task.id === id).dependsOn.forEach(visit); pending.delete(id); done.add(id);
    };
    tasks.forEach(task => visit(task.id));
    const get = id => { const task = tasks.find(task => task.id === id); if (!task) throw new Error('Unknown task'); return task; };
    for (const id of proposal.cancelTasks || []) {
        const task = get(id);
        if (task.status !== 'todo') throw new Error('Only queued tasks can be cancelled by Planner');
        task.status = 'cancelled';
    }
    for (const entry of proposal.reprioritize || []) {
        if (!Number.isFinite(entry.priority)) throw new Error('Invalid task priority');
        get(entry.id).priority = entry.priority;
    }
    const dispatch = proposal.dispatch || [];
    if (new Set(dispatch).size !== dispatch.length || dispatch.length > plan.budgets.maxConcurrency) throw new Error('Invalid dispatch concurrency');
    for (const id of dispatch) {
        const task = get(id);
        if (task.status !== 'todo' || task.dependsOn.some(id => get(id).status !== 'completed')) throw new Error('Task not ready');
    }
    if (proposal.requestFinalize && dispatch.length) throw new Error('Cannot dispatch and finalize together');
    next.taskGraph = tasks; next.graphRevision++; next.dispatch = dispatch;
    next.requestFinalize = proposal.requestFinalize === true;
    return next;
}
