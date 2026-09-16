import { copy } from '../agent-runtime/contracts.js';
import { planIdentity } from './contracts.js';
import { validateGraph, applyTaskProposal } from './graph.js';
import { assertCapability } from './capabilities.js';
import { createResult } from './results.js';
import { arbitrate } from './arbitration.js';
import { selectReadyNodes, routeEdges } from './scheduler.js';

export function initialPolicyState(plan) {
    return { planId: plan.planId, planFingerprint: planIdentity(plan), activeNodeId: null, activeNodeIds: [],
        graphRevision: 0, taskGraph: [], completedNodeIds: [], results: [], resultRefs: [], attempts: {}, edgeVisits: {},
        arbitrationState: null, outputState: null, budgets: { steps: 0, plannerRounds: 0, arbitrationCalls: 0 },
        pending: null, dispatch: [], requestFinalize: false, events: [] };
}

/** Pure controller: every invocation is reconstructed from Runtime state and its last receipt. */
export function createPolicyController(input) {
    const { plan } = validateGraph(input);
    const fingerprint = planIdentity(plan);
    const getNode = id => {
        const node = plan.nodes.find(node => node.nodeId === id);
        if (!node) throw new Error('Unknown scheduled node');
        return node;
    };
    const finish = (state, outcome, reason = '') => {
        const results = state.results.filter(result => result.nodeId === plan.output.ownerNodeId);
        const last = results.at(-1);
        if (outcome === 'completed' && (!last || last.status !== 'completed')) outcome = last ? 'partial' : 'failed';
        if (outcome === 'completed' && plan.source.mode !== 'agenda'
            && plan.nodes.some(node => node.required !== false && !state.results.some(result => result.nodeId === node.nodeId && result.status === 'completed'))) {
            outcome = 'partial';
        }
        state.outputState = { kind: plan.output.kind, ownerNodeId: plan.output.ownerNodeId, status: outcome,
            value: last?.value ?? null, resultId: last?.resultId ?? null, reason,
            unresolvedTaskIds: state.taskGraph.filter(task => !['completed', 'cancelled'].includes(task.status)).map(task => task.id) };
        state.events.push({ type: 'output.ready', nodeId: plan.output.ownerNodeId, outcome });
        return { intent: { type: outcome === 'failed' ? 'fail' : 'complete', output: state.outputState, error: reason || 'Required output unavailable' }, policyState: state };
    };
    const delegate = (state, nodes, runId, kind = 'nodes', tasks = null) => {
        const remaining = plan.budgets.maxSteps - state.budgets.steps;
        if (remaining < nodes.length) return finish(state, 'budget_exhausted', 'maxSteps');
        state.budgets.steps += nodes.length;
        state.activeNodeIds = nodes.map(node => node.nodeId);
        state.activeNodeId = nodes[0]?.nodeId || null;
        state.pending = { kind, nodeIds: state.activeNodeIds, taskIds: tasks?.map(task => task.id) || [], attempts: [] };
        state.events.push(...nodes.map(node => ({ type: 'graph.node.started', nodeId: node.nodeId, routing: 'delegate' })));
        return { intent: { type: 'fanout', concurrency: Math.min(nodes.length, plan.budgets.maxConcurrency), failurePolicy: plan.scheduler.failurePolicy || 'settled',
            branches: nodes.map((node, index) => {
                const attempt = (state.attempts[node.nodeId] || 0) + 1;
                state.attempts[node.nodeId] = attempt;
                state.pending.attempts.push(attempt);
                return { id: `${node.nodeId}/${attempt}`, toAgentId: node.agentId, task: tasks?.[index]?.task || node.task || 'Execute the configured node.',
                    reason: 'Engine delegate; parent retains control', contextPolicy: 'task_only', payload: {
                        planId: plan.planId, nodeId: node.nodeId, attempt, parentRunId: runId,
                        inputs: copy(state.results.filter(result => !node.inputPolicy?.nodeIds || node.inputPolicy.nodeIds.includes(result.nodeId))),
                        taskGraph: copy(state.taskGraph), node: copy(node),
                    } };
            }) }, policyState: state };
    };
    return { advance({ policyState, runSnapshot, receipt }) {
        if (policyState?.planFingerprint !== fingerprint) throw new Error('Plan fingerprint mismatch; cannot resume');
        const state = copy(policyState);
        state.events = [];
        if (state.pending) {
            if (!Array.isArray(receipt?.branches) || receipt.branches.length !== state.pending.nodeIds.length) throw new Error('Missing Engine join receipt');
            const pending = state.pending;
            for (let index = 0; index < receipt.branches.length; index++) {
                const branch = receipt.branches[index];
                const node = getNode(pending.nodeIds[index]);
                if (branch.id !== `${node.nodeId}/${pending.attempts[index]}`) throw new Error('Mismatched Engine branch receipt');
                const envelope = branch.value?.engineResult === true ? branch.value : null;
                const result = createResult({ runId: runSnapshot.runId, nodeId: node.nodeId, agentId: node.agentId,
                    attempt: pending.attempts[index], status: branch.status === 'completed' ? envelope?.status || 'completed' : branch.status,
                    value: envelope ? envelope.value : branch.value ?? null, structured: envelope?.structured || null,
                    provenance: [{ childRunId: branch.runId }] });
                state.results.push(result); state.resultRefs.push(result.resultId);
                state.events.push({ type: 'result.created', nodeId: node.nodeId, resultId: result.resultId, outcome: result.status });
                if (pending.kind === 'tasks') {
                    const task = state.taskGraph.find(task => task.id === pending.taskIds[index]);
                    task.status = result.status; task.resultId = result.resultId;
                } else if (pending.kind === 'planner') {
                    if (result.status !== 'completed') return finish(state, 'failed', 'Planner failed');
                    Object.assign(state, applyTaskProposal(plan, state, result.structured || result.value, node));
                    state.events.push({ type: 'graph.mutated', graphRevision: state.graphRevision });
                } else if (pending.kind === 'arbitration') {
                    if (result.status !== 'completed') return finish(state, 'failed', 'Arbitration agent failed');
                    const candidates = state.arbitrationState.inputResultIds.map(id => state.results.find(result => result.resultId === id));
                    const selection = arbitrate(candidates, plan.arbitration, result.structured || result.value);
                    result.value = selection.value; result.status = selection.partial ? 'partial' : 'completed';
                    state.arbitrationState = { ...selection, completed: true };
                    state.completedNodeIds.push(node.nodeId);
                } else {
                    if (!state.completedNodeIds.includes(node.nodeId)) state.completedNodeIds.push(node.nodeId);
                    for (const edge of routeEdges(plan, node.nodeId, result, state.edgeVisits).filter(edge => edge.maxVisits)) {
                        state.edgeVisits[edge.edgeId] = (state.edgeVisits[edge.edgeId] || 0) + 1;
                        state.completedNodeIds = state.completedNodeIds.filter(id => id !== edge.to && id !== node.nodeId);
                    }
                }
            }
            state.activeNodeIds = []; state.activeNodeId = null; state.pending = null;
            if (pending.kind === 'finalizer') return finish(state, state.budgetReason ? 'budget_exhausted'
                : state.taskGraph.some(task => !['completed', 'cancelled'].includes(task.status)) ? 'partial' : 'completed', state.budgetReason || '');
        }
        if (plan.source.mode === 'agenda') {
            const planner = getNode(plan.scheduler.plannerNodeId);
            if (state.dispatch.length) {
                assertCapability(plan, planner, 'agent.delegate');
                const tasks = state.dispatch.map(id => state.taskGraph.find(task => task.id === id));
                state.dispatch = [];
                const nodes = tasks.map(task => getNode(plan.scheduler.workerNodeIds[task.agentId]));
                tasks.forEach(task => { task.status = 'running'; });
                return delegate(state, nodes, runSnapshot.runId, 'tasks', tasks);
            }
            if (state.requestFinalize || state.budgets.plannerRounds >= plan.scheduler.maxPlannerRounds) {
                if (!state.requestFinalize) state.budgetReason = 'plannerMaxRounds';
                return delegate(state, [getNode(plan.output.ownerNodeId)], runSnapshot.runId, 'finalizer');
            }
            state.budgets.plannerRounds++;
            return delegate(state, [planner], runSnapshot.runId, 'planner');
        }
        const owner = getNode(plan.output.ownerNodeId);
        if (state.completedNodeIds.includes(owner.nodeId)) return finish(state, 'completed');
        let deterministic;
        while ((deterministic = selectReadyNodes(plan, state).filter(node => ['router', 'join', 'terminal'].includes(node.kind))).length) {
            for (const node of deterministic) {
            const parents = state.results.filter(result => (node.inputs || plan.edges.filter(edge => edge.to === node.nodeId).map(edge => edge.from)).includes(result.nodeId));
            const selection = arbitrate(parents, node.arbitration || plan.arbitration);
            const result = createResult({ runId: runSnapshot.runId, nodeId: node.nodeId, agentId: node.agentId,
                value: selection.value, status: selection.partial ? 'partial' : 'completed' });
            state.results.push(result); state.resultRefs.push(result.resultId); state.completedNodeIds.push(node.nodeId);
            }
        }
        if (state.completedNodeIds.includes(owner.nodeId)) return finish(state, 'completed');
        const runnable = selectReadyNodes(plan, state).filter(node => !['router', 'join', 'terminal'].includes(node.kind));
        if (!runnable.length) return finish(state, 'failed', 'Graph has no ready completion path');
        const advanced = runnable.find(node => ['judge', 'synthesize'].includes(node.kind));
        if (advanced) {
            assertCapability(plan, advanced, 'result.judge');
            if (state.budgets.arbitrationCalls >= (plan.arbitration.maxCalls || 1)) return finish(state, 'budget_exhausted', 'arbitration');
            state.budgets.arbitrationCalls++;
            state.arbitrationState = { inputResultIds: state.results.filter(result => result.nodeId !== advanced.nodeId).map(result => result.resultId) };
            return delegate(state, [advanced], runSnapshot.runId, 'arbitration');
        }
        return delegate(state, runnable.slice(0, plan.budgets.maxConcurrency), runSnapshot.runId);
    } };
}
