import { createRuntimeObserver } from '../run-state/runtime-observer.js';

/** Project metadata only. Checkpoint policy remains the owner; UI never drives scheduling. */
export function createEngineObserver({ plan, getState, panelRunId, onEvent }) {
    const observe = createRuntimeObserver({ panelRunId, onEvent });
    return event => {
        observe(event);
        const emit = (detail, index) => observe({ ...event, ...detail, planId: plan.planId,
            eventId: `${event.eventId}/engine/${index}`, effectId: null });
        if (event.type === 'run.started') emit({ type: 'graph.compiled', routing: plan.source.mode }, 'plan');
        if (event.type !== 'policy.advance.completed') return;
        const state = getState(event.runId)?.policyState;
        for (const [index, detail] of (state?.events || []).entries()) emit(detail, index);
        if (state?.outputState && !state.events?.some(item => item.type === 'output.ready')) {
            emit({ type: 'output.ready', nodeId: state.outputState.ownerNodeId,
                resultId: state.outputState.resultId, outcome: state.outputState.status }, 'output');
        }
    };
}
