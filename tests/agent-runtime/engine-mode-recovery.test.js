import { test, expect, jest } from '@jest/globals';
import { DurableCheckpointStore } from '../../public/scripts/lib/agent-runtime/index.js';
import { runLoopEngine } from '../../public/scripts/extensions/orchestrator/engine-v2/loop-adapter.js';
import { runDirectorEngine } from '../../public/scripts/extensions/orchestrator/engine-v2/director-adapter.js';
import { modelIntent, toolIntent } from '../../public/scripts/extensions/orchestrator/legacy-workflow-adapter.js';
import { clearCurrentRun, startRun } from '../../public/scripts/extensions/orchestrator/run-state/store.js';

jest.unstable_mockModule('../../public/scripts/extensions/orchestrator/agent-resolution.js', () => ({
    resolveOrchestrationAgentApiPresetName: () => null, resolveOrchestrationAgentPromptPresetName: () => null,
}));
const { runSpecEngine } = await import('../../public/scripts/extensions/orchestrator/engine-v2/spec-adapter.js');
const { runAgendaEngine } = await import('../../public/scripts/extensions/orchestrator/engine-v2/agenda-adapter.js');

const runId = 'mode-recovery';
const no = () => {};
const schema = name => ({ type: 'function', function: { name, parameters: {} } });
async function disk(seed) {
    let saved = seed ? structuredClone(seed) : null;
    const states = [];
    const store = await DurableCheckpointStore.open({ runId, backend: {
        load: async () => saved,
        async compareAndSet(state, version) {
            if ((saved?.checkpointVersion || 0) !== version) throw new Error('conflict');
            saved = structuredClone(state); states.push(structuredClone(state));
        },
    } });
    return { store, states };
}

async function execute(mode, store, resume, calls) {
    clearCurrentRun(); const panelRunId = startRun({ mode, quiet: true });
    const payload = { engineStore: store, engineRunId: runId, engineResume: resume, signal: new AbortController().signal };
    const result = { assistantText: '', toolCalls: [{ id: 'final', name: 'finalize', args: { capsule_text: 'guidance' } }] };
    if (mode === 'loop') return runLoopEngine({ context: {}, payload, profile: { max_rounds: 3 },
        deps: { engineStore: store, engineRunId: runId, engineResume: resume }, runId: panelRunId,
        toolContext: {}, tools: [schema('finalize')], messages: [], refreshRuntimeStateMessage: no, deadline: null,
        sendLlm: async () => { calls.model++; return result; }, executeTool: () => { calls.tool++; },
        record: no, resolveToolSource: () => 'builtin', isStructuredToolError: () => false, normalizeToolOk: value => value,
        makeOkToolMessage: (id, data) => ({ role: 'tool', tool_call_id: id, content: JSON.stringify(data) }), makeErrorToolMessage: no });
    if (mode === 'director') return runDirectorEngine({ profile: { director: { mainAgent: {}, subAgents: [], maxRounds: 3 } },
        handle: { getText: () => 'reply' }, eventData: { abortSignal: payload.signal },
        deps: { runId: panelRunId, engineStore: store, engineRunId: runId, engineResume: resume }, toolSchemas: [schema('finalize')], messages: [],
        requestRound: async function* () { const value = yield modelIntent(async () => { calls.model++; return result; }, { taskMessages: [] });
            return { result: value, toolCalls: value.toolCalls, reasoningAccum: '' }; },
        executeMainTool: async function* () { return yield toolIntent('finalize', {}, {}, async () => { calls.tool++; return { ok: true }; }); },
        dispatcher: { snapshot: () => ({ descriptors: [], results: [] }), restore: () => { if ('restore' in calls) calls.restore++; }, cancelAll: no, drainCompletionNotifications: () => [] },
        limits: { maxRounds: 3 }, resolveToolSource: () => 'builtin' });
    if (mode === 'spec') {
        const stages = [{ id: 'final', mode: 'serial', nodes: [{ id: 'writer', preset: 'writer', type: 'worker' }] }];
        return runSpecEngine({ context: {}, payload, messages: [], settings: {}, profile: { presets: { writer: {} } },
            runtime: { runId: panelRunId, spec: { stages }, stages, specDefaultTools: {} },
            runWorkerNode: async () => { calls.model++; return 'guidance'; }, runReviewNode: no,
            normalizeNodeSpec: value => value, resolveReviewTargetEntries: no,
            createStageOutputSnapshot: (stage, outputs) => ({ id: stage.id, nodes: [...outputs] }) });
    }
    return runAgendaEngine({ context: {}, payload, messages: [], settings: {}, runId: panelRunId,
        profile: { planner: {}, agents: { writer: {} }, finalAgentId: 'writer', limits: {} }, trace: {},
        runAgendaPlannerStep: async () => { calls.model++; return { plannerStep: { finalize: 'ready', todo_ops: [], dispatches: [] } }; },
        runAgendaTextAgent: async () => { calls.model++; return { runId: 'final-result', outputText: 'guidance' }; },
        applyAgendaPlannerOps: agenda => { agenda.todos[0].status = 'done'; }, normalizeAgendaDispatches: () => [], syncTrace: no, finalizeTrace: no });
}

test.each(['spec', 'loop', 'agenda', 'director'])('%s restores the final policy receipt from disk without model/tool replay', async mode => {
    const recorded = await disk(); const calls = { model: 0, tool: 0 };
    await execute(mode, recorded.store, false, calls);
    const output = recorded.store.load(runId).output;
    const boundary = recorded.states.filter(state => state.pendingEffect?.type === 'policy.advance'
        && state.pendingEffect.receiptId && !state.completedEffects[state.pendingEffect.effectId]).at(-1);
    expect(boundary).toBeTruthy();
    const restored = await disk(boundary); const resumedCalls = { model: 0, tool: 0 };
    await execute(mode, restored.store, true, resumedCalls);
    expect(resumedCalls).toEqual({ model: 0, tool: 0 });
    expect(restored.store.load(runId).output).toEqual(output);
    expect(restored.store.load(runId).generation).toBe(boundary.generation + 1);
});

test('Director recovery of an unacknowledged submit fails closed and never submits twice', async () => {
    const recorded = await disk(); await execute('director', recorded.store, false, { model: 0, tool: 0 });
    const boundary = recorded.states.find(state => state.pendingEffect?.type === 'tool.execute'
        && !state.completedEffects[state.pendingEffect.effectId]);
    const restored = await disk(boundary); const calls = { model: 0, tool: 0 };
    await expect(execute('director', restored.store, true, calls)).rejects.toThrow(/reconciliation|resolve|replay|outcome|uncertain/i);
    expect(calls).toEqual({ model: 0, tool: 0 });
});

test.each(['spec', 'agenda'])('%s refuses branch replay when durable child storage is unavailable', async mode => {
    const recorded = await disk(); await execute(mode, recorded.store, false, { model: 0, tool: 0 });
    const boundary = recorded.states.find(state => state.pendingEffect?.type === 'parallel.fanout'
        && !state.completedEffects[state.pendingEffect.effectId]);
    const restored = await disk(boundary); const calls = { model: 0, tool: 0 };
    await expect(execute(mode, restored.store, true, calls)).rejects.toThrow();
    expect(calls).toEqual({ model: 0, tool: 0 });
});

test.each(['completed', 'cancelled', 'failed'])('Director terminal %s recovery never reactivates descendants', async status => {
    const recorded = await disk(); await execute('director', recorded.store, false, { model: 0, tool: 0 });
    const terminal = recorded.store.load(runId); terminal.status = status;
    terminal.policyState.history.push({ transientRef: 'lost-after-close' });
    const restored = await disk(terminal), calls = { model: 0, tool: 0, restore: 0 };
    const result = execute('director', restored.store, true, calls);
    const outcome = await result.then(value => ({ value }), error => ({ error }));
    const expectedError = expect.objectContaining({ name: status === 'cancelled' ? 'AbortError' : 'Error' });
    expect(outcome).toMatchObject(status === 'completed' ? { value: { kind: 'reply' } } : { error: expectedError });
    expect(calls).toEqual({ model: 0, tool: 0, restore: 0 });
});
