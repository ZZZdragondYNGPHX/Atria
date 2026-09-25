import { getCurrentRun as getRuntimePanelState } from '../../public/scripts/agents/orchestrator/run-state/store.js';
// tests/orchestrator/custom-tool-runtime-agenda.test.js
//
// Verifies agenda runtime constructs the per-run customToolRegistry at
// orchestration entry and threads it into the per-call executeLoopTool
// ctx. Same strategy as the spec runtime test: only the LLM is mocked
// (legitimate non-deterministic surface). The real loop-tools /
// loop-runtime / agent-resolution / per-run custom-tool registry all
// run for real. To verify the registry reached `executeLoopTool`, the
// test profile registers a custom tool whose `body` records its own
// dispatch onto a sidecar.

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

// agenda-runtime.js + defaults.js consume core symbols via
// `Atria.getContext()` after upstream commit 571c529c2. Provide a
// shim with the constants + the shared `capabilitySettings` binding the
// runtime captures at module-load time. Mutating
// `globalThis.Atria.__settings.orchestrator` in beforeEach
// propagates because the runtime stores the live object reference.
const __sillyTavernSettings = {
    orchestrator: {
        agendaPlannerMaxRounds: 4,
        agendaMaxConcurrentAgents: 2,
        agendaMaxTotalRuns: 12,
        nodeIterationMaxRounds: 3,
    },
};
globalThis.Atria = {
    __settings: __sillyTavernSettings,
    getContext: () => ({
        constants: {
            promptRoles: { SYSTEM: 0, USER: 1, ASSISTANT: 2 },
            wiPosition: { before: 0, after: 1, ANTop: 2, ANBottom: 3, EMTop: 4, EMBottom: 5, atDepth: 6 },
        },
        lib: {
            yaml: { dump: (v) => JSON.stringify(v), load: (s) => JSON.parse(s) },
        },
        capabilitySettings: __sillyTavernSettings,
    }),
};

jest.unstable_mockModule('../../public/lib.js', () => ({
    Popper: {},
    lodash: {},
    yaml: { dump: (v) => JSON.stringify(v), load: (s) => JSON.parse(s) },
    default: {},
}));

jest.unstable_mockModule('../../public/scripts/capability-host.js', () => ({
    capabilitySettings: {
        orchestrator: {
            agendaPlannerMaxRounds: 4,
            agendaMaxConcurrentAgents: 2,
            agendaMaxTotalRuns: 12,
            nodeIterationMaxRounds: 3,
        },
    },
    getContext: () => ({}),
    writeExtensionField: () => {},
    UNSET_VALUE: Symbol('unset'),
}));

jest.unstable_mockModule('../../public/script.js', () => ({
    saveSettingsDebounced: () => {},
    saveSettings: async () => {},
    extension_prompt_roles: { SYSTEM: 0, USER: 1, ASSISTANT: 2 },
    extension_prompt_types: { IN_PROMPT: 0, IN_CHAT: 1 },
    substituteParams: (s) => s,
    chat_metadata: {},
    this_chid: 0,
    characters: [],
    getRequestHeaders: () => ({}),
}));

jest.unstable_mockModule('../../public/scripts/world-info.js', () => ({
    world_info_position: { before: 0, after: 1 },
    wi_anchor_position: {},
}));

// Stub the connection-manager gate so the real agent-resolution.js can load
// without pulling textgen-models.js → document.addEventListener under Node.



let plan, runAgenda, panel;
beforeAll(async () => {
    const runtime = await import('../../public/scripts/agents/orchestrator/agenda-runtime.js');
    plan = runtime.runAgendaPlannerStep; runAgenda = runtime.runAgendaOrchestration;
    panel = (await import('../../public/scripts/agents/orchestrator/run-state/store.js')).getCurrentRun;
});
const expected = 'atri_orch_planner_step';
const workerTool = 'atri_orch_submit_result';
const step = { dispatches: [{ todo_id: 'main', agent: 'researcher', task_brief: 'inspect', input_run_ids: [] }] };
const response = (name, args) => ({ toolCalls: [{ name, args, raw: { id: 'fixture-call', type: 'function', function: { name, arguments: JSON.stringify(args) } } }] });
const profile = () => ({ mode: 'agenda', planner: { systemPrompt: 'Only plan.', userPromptTemplate: 'choose' },
    agents: { researcher: { purpose: 'Inspect evidence', systemPrompt: 'WORKER PRIVATE PROTOCOL atri_orch_submit_result', userPromptTemplate: 'WORKER TEMPLATE', tools: {} },
        finalizer: { systemPrompt: 'Summarize', tools: {} } }, finalAgentId: 'finalizer', limits: { plannerMaxRounds: 3, maxConcurrentAgents: 1, maxTotalRuns: 4 } });
const state = () => ({ todos: [{ id: 'main', status: 'todo', goal: 'inspect' }], runs: [], plannerRounds: 1 });
const callPlan = (context, signal) => plan(context, {}, [{ role: 'user', content: 'Test task' }], profile(), state(), signal);

test('correct tool is accepted and Planner prompt excludes all Worker protocols', async () => {
    const context = { generateTask: jest.fn(async () => response(expected, step)) };
    expect((await callPlan(context)).plannerStep).toEqual(step);
    const request = context.generateTask.mock.calls[0][0];
    expect(request.stream).toBe(false);
    const text = JSON.stringify(request.taskMessages);
    expect(text).toContain('Inspect evidence');
    expect(text).not.toMatch(/WORKER PRIVATE|WORKER TEMPLATE|atri_orch_submit_result|system_prompt/);
});
test('wrong name with valid complete Planner schema is normalized with warning', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        const context = { generateTask: jest.fn(async () => response(workerTool, step)) };
        expect((await callPlan(context)).plannerStep).toEqual(step);
        expect(context.generateTask).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Safely normalized'), expect.objectContaining({ actual: [workerTool] }));
    } finally { warn.mockRestore(); }
});
test('Worker arguments are not normalized; one compact repair recovers', async () => {
    const context = { generateTask: jest.fn().mockResolvedValueOnce(response(workerTool, { text: 'wrong' })).mockResolvedValueOnce(response(expected, step)) };
    expect((await callPlan(context)).plannerStep).toEqual(step);
    expect(context.generateTask).toHaveBeenCalledTimes(2);
    const repair = context.generateTask.mock.calls[1][0];
    expect(repair.stream).toBe(false); expect(repair.temperature).toBe(0);
    expect(repair.promptMode).toBe('task'); expect(repair.includeCharacterCard).toBe(false);
    expect(JSON.stringify(repair.taskMessages)).not.toContain('WORKER PRIVATE');
});
test.each([
    ['worker args', () => response(workerTool, { text: 'wrong' })],
    ['multiple calls', () => ({ toolCalls: [...response(expected, step).toolCalls, ...response(workerTool, step).toolCalls] })],
    ['bad JSON', () => ({ toolCalls: [{ name: expected, raw: { function: { name: expected, arguments: '{' } } }] })],
    ['no calls', () => ({ toolCalls: [] })],
])('%s fails after exactly one repair', async (_label, answer) => {
    const context = { generateTask: jest.fn(async () => answer()) };
    await expect(callPlan(context)).rejects.toThrow('Planner failed');
    expect(context.generateTask).toHaveBeenCalledTimes(2);
});
test('explicit named-choice rejection retries required, not a brand-based fallback', async () => {
    const context = { generateTask: jest.fn().mockRejectedValueOnce(new Error('named tool_choice not supported')).mockResolvedValueOnce(response(expected, step)) };
    await callPlan(context);
    expect(context.generateTask.mock.calls[1][0].toolChoice).toBe('required');
});
test.each([false, true])('complete Agenda lifecycle with legacy=%s', async legacy => {
    const answers = [response(expected, step), response(workerTool, { text: 'evidence' }),
        response(expected, { todo_ops: [{ op: 'set_status', todo_id: 'main', status: 'done' }], finalize: 'ready' }), response(workerTool, { text: 'guidance' })];
    const context = { generateTask: jest.fn(async () => answers.shift()) };
    const result = await runAgenda(context, { agentRuntimeV2: !legacy }, [{ role: 'user', content: 'Test' }], profile());
    expect(result.stageOutputs[0].nodes[0].output).toBe('guidance');
    expect(context.generateTask.mock.calls.map(([request]) => request.tools[0].function.name)).toEqual([expected, workerTool, expected, workerTool]);
    expect(context.generateTask.mock.calls.every(([request]) => request.stream === false)).toBe(true);
});
test.each([false, true])('cancel Planner records cancelled and never dispatches/finalizes, legacy=%s', async legacy => {
    const abort = new AbortController();
    const context = { generateTask: jest.fn(async () => { abort.abort(); return response(expected, step); }) };
    await expect(runAgenda(context, { signal: abort.signal, agentRuntimeV2: !legacy }, [{ role: 'user', content: 'Test' }], profile())).rejects.toThrow();
    expect(context.generateTask).toHaveBeenCalledTimes(1);
    expect(panel().status).toBe('aborted');
});
