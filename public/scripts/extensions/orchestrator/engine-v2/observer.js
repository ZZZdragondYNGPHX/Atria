import { createRuntimeObserver } from '../run-state/runtime-observer.js';
import { projectEngine } from '../../../lib/orchestration-engine/projection.js';
import { bindEngineInspector } from '../run-state/store.js';

/** Project metadata only. Checkpoint policy remains the owner; UI never drives scheduling. */
export function createEngineObserver({ plan, getState, panelRunId, onEvent }) {
    const observe = createRuntimeObserver({ panelRunId, onEvent });
    let lastProjection = '';
    const projectedResults = new Set();
    return event => {
        bindEngineInspector(panelRunId, event.runId, nodeId => {
            const node = plan.nodes.find(item => item.nodeId === nodeId);
            if (!node) return null;
            const agent = plan.agents.find(item => item.id === node.agentId);
            const state = getState(event.runId)?.policyState;
            return { definition: { instructions: agent.instructions, modelProfile: agent.modelProfile,
                tools: agent.tools, handoffs: agent.handoffs, policies: agent.policies },
            results: state?.results?.filter(result => result.nodeId === nodeId) || [],
            tasks: state?.taskGraph?.filter(task => task.agentId === node.agentId) || [] };
        });
        observe(event);
        const emit = (detail, index) => observe({ ...event, ...detail, planId: plan.planId,
            eventId: `${event.eventId}/engine/${index}`, effectId: null });
        if (event.type === 'run.started') emit({ type: 'graph.compiled', routing: plan.source.mode, engine: projectEngine(plan) }, 'plan');
        if (event.type !== 'policy.advance.completed') return;
        const state = getState(event.runId)?.policyState;
        const activeNodeIds = [...(state?.activeNodeIds || [])];
        // Translate host policy scratch into generic node identities at the adapter boundary.
        if (state?.pending && !state.outputState) {
            if (['loop', 'director'].includes(plan.source.mode)) activeNodeIds.push(plan.output.ownerNodeId);
            if (state.pending.kind === 'planner') activeNodeIds.push(plan.scheduler.plannerNodeId);
            for (const dispatch of state.pending.dispatches || []) {
                const node = plan.nodes.find(node => node.metadata?.legacyAgentId === dispatch.agent);
                if (node) activeNodeIds.push(node.nodeId);
            }
        }
        const engine = projectEngine(plan, { ...state, activeNodeIds });
        const serialized = JSON.stringify(engine);
        if (serialized !== lastProjection) {
            const results = engine.results.filter(result => !projectedResults.has(result.resultId));
            results.forEach(result => projectedResults.add(result.resultId));
            emit({ type: 'graph.snapshot', engine: { ...engine, results, resultsDelta: true } }, 'snapshot');
            lastProjection = serialized;
        }
        for (const [index, detail] of (state?.events || []).entries()) emit(detail, index);
        if (state?.outputState && !state.events?.some(item => item.type === 'output.ready')) {
            emit({ type: 'output.ready', nodeId: state.outputState.ownerNodeId,
                resultId: state.outputState.resultId, outcome: state.outputState.status }, 'output');
        }
    };
}
