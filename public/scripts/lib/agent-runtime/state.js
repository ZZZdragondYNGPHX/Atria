import { copy, requireId, TERMINAL } from './contracts.js';

export function initialState({ runId, agentId, task, maxSteps = 32, legacyPolicy = false }) {
    requireId(runId, 'runId');
    requireId(agentId, 'agentId');
    if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new TypeError('Invalid step budget');
    return {
        schemaVersion: 1, legacyPolicy, runId, currentAgentId: agentId, task: String(task || ''), payload: null,
        status: 'idle', generation: 1, step: 0, stepId: null, effectSequence: 0,
        scratch: [], handoffStack: [], memoryRefs: [], budget: { maxSteps },
        checkpointVersion: 0, pendingEffect: null, pendingTools: [], completedEffects: {},
    };
}

function schedule(state, type, data = {}) {
    state.effectSequence++;
    state.pendingEffect = {
        runId: state.runId, stepId: state.stepId,
        effectId: `${state.runId}/effect/${state.effectSequence}`, type, ...data,
    };
    state.status = { 'model.request': 'waiting_model', 'tool.execute': 'waiting_tool', 'agent.handoff': 'waiting_handoff' }[type] || 'running';
}

function nextStep(state) {
    if (state.step >= state.budget.maxSteps) {
        state.status = 'failed';
        state.error = 'Step budget exhausted';
        state.pendingEffect = null;
        return;
    }
    state.step++;
    state.stepId = `${state.runId}/step/${state.step}`;
    schedule(state, 'memory.recall');
}

function nextTool(state) {
    const call = state.pendingTools.shift();
    schedule(state, 'tool.execute', {
        toolName: call.toolName, args: call.args ?? {}, providerCallId: call.providerCallId ?? null, metadata: call.metadata ?? {},
    });
}

/** Pure transition: callers persist before executing the returned pending effect. */
export function transition(previous, event) {
    const state = copy(previous);
    const terminal = TERMINAL.includes(state.status);
    if (event.type === 'cancelRun') {
        if (terminal || state.status === 'cancelling') return state;
        state.status = 'cancelling';
        state.generation++;
        state.pendingEffect = null;
        state.pendingTools = [];
    } else if (event.type === 'run.cancelled' && state.status === 'cancelling') {
        state.status = 'cancelled';
    } else if (terminal) {
        throw new Error(`Invalid transition from ${state.status}`);
    } else if (event.type === 'startRun' && state.status === 'idle') {
        if (state.legacyPolicy) {
            state.stepId = `${state.runId}/step/0`;
            schedule(state, 'policy.advance');
        } else nextStep(state);
    } else if (event.type === 'appendUserInput' && state.status === 'waiting_user') {
        state.scratch.push({ user: String(event.input) });
        nextStep(state);
    } else if (event.type === 'run.fail') {
        state.status = 'failed';
        state.error = event.error;
        state.pendingEffect = null;
        state.pendingTools = [];
    } else if (event.type === 'effect.consumed' && state.pendingEffect?.effectId === event.effectId) {
        const effect = state.pendingEffect;
        const receipt = state.completedEffects[effect.effectId];
        if (!receipt || receipt.consumed) throw new Error('Effect has no unconsumed receipt');
        const result = receipt.result;
        receipt.consumed = true;
        state.pendingEffect = null;
        if (effect.type === 'policy.advance') {
            if (result.type === 'complete') {
                state.status = 'completed';
                state.output = result.output;
            } else if (result.type === 'model') nextStep(state);
            else if (result.type === 'handoff') schedule(state, 'agent.handoff', { handoff: result });
            else if (result.type === 'tool') schedule(state, 'tool.execute', { toolName: result.toolName });
            else throw new Error('Invalid legacy policy intent');
        } else if (state.legacyPolicy && ['model.request', 'tool.execute'].includes(effect.type)) {
            schedule(state, 'policy.advance', { receiptId: effect.effectId });
        } else if (effect.type === 'memory.recall') {
            state.memoryRefs = result.references;
            schedule(state, 'model.request');
        } else if (effect.type === 'tool.execute') {
            state.scratch.push({ toolCallId: effect.effectId, providerCallId: effect.providerCallId ?? effect.effectId, tool: effect.toolName, result, step: state.step });
            if (state.pendingTools?.length) nextTool(state);
            else nextStep(state);
        } else if (effect.type === 'agent.handoff') {
            state.handoffStack.push(result);
            state.currentAgentId = result.toAgentId;
            state.task = result.task;
            state.payload = result.payload ?? null;
            if (result.contextPolicy === 'task_only') state.scratch = [];
            state.memoryRefs = [];
            if (state.legacyPolicy) schedule(state, 'policy.advance', { receiptId: effect.effectId });
            else nextStep(state);
        } else if (effect.type === 'model.request') {
            if (result.type === 'complete') {
                state.status = 'completed';
                state.output = result.output ?? '';
            } else if (result.type === 'wait') {
                state.status = 'waiting_user';
            } else if (result.type === 'continue') {
                state.scratch.push({ assistant: result.output ?? '' });
                nextStep(state);
            } else if (result.type === 'tool') {
                schedule(state, 'tool.execute', { toolName: result.toolName, args: result.args ?? {} });
            } else if (result.type === 'tools') {
                if (result.turn) state.scratch.push({ modelTurn: result.turn, step: state.step });
                state.pendingTools = result.calls;
                nextTool(state);
            } else if (result.type === 'handoff') {
                schedule(state, 'agent.handoff', { handoff: result });
            } else throw new Error('Invalid model receipt');
        } else throw new Error('Unknown effect');
    } else {
        throw new Error(`Invalid ${event.type} from ${state.status}`);
    }
    return state;
}
