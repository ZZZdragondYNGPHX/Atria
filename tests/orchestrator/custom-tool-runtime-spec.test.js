import { getCurrentRun as getRuntimePanelState } from '../../public/scripts/agents/orchestrator/run-state/store.js';
// tests/orchestrator/custom-tool-runtime-spec.test.js
//
// Verifies spec runtime constructs the per-run customToolRegistry at
// orchestration entry and threads it into the per-call executeLoopTool
// ctx. The spec runtime has no deps injection signature, so we only
// stub the LLM (`tool-calling.js`) — the only inherently non-deterministic
// surface. The real loop-tools / loop-runtime / agent-resolution / per-run
// custom-tool registry all run for real. To verify the registry reached
// `executeLoopTool`, the test profile registers a custom tool whose `body`
// records its own dispatch (via a sidecar map) and returns a probe value
// the LLM stub can assert reached the agent on the next round.

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

// spec-runtime.js + defaults.js consume core symbols via
// `Atria.getContext()` after upstream commit 571c529c2. Provide a
// shim with the constants + the shared `capabilitySettings` binding the
// runtime captures at module-load time.
const __sillyTavernSettings = {
    orchestrator: { nodeIterationMaxRounds: 3, reviewRerunMaxRounds: 2 },
};
globalThis.Atria = {
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
    capabilitySettings: { orchestrator: { nodeIterationMaxRounds: 3, reviewRerunMaxRounds: 2 } },
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


// LLM stub — controlled per-test via `llmResponses`. The only legitimate
// mock surface (LLM is slow / non-deterministic). Everything else runs
// the real product modules.
const llmResponses = [];
const llmRequests = [];
jest.unstable_mockModule('../../public/scripts/agents/orchestrator/tool-calling.js', () => ({
    appendStandardToolRoundMessages: () => {},
    requestToolCallsWithRetry: async (_context, _settings, request) => {
        llmRequests.push({ ...request, taskMessages: structuredClone(request.taskMessages) });
        if (llmResponses.length === 0) {
            throw new Error('LLM stub exhausted');
        }
        const next = llmResponses.shift();
        return typeof next === 'function' ? next(request) : next;
    },
    requestToolCallWithRetry: async () => ({}),
    serializeToolResultContent: (r) => JSON.stringify(r),
    makeRuntimeToolCallId: () => `tc_${Math.random().toString(36).slice(2, 10)}`,
}));

let runSpecOrchestration;

// Sidecar the custom-tool body writes into so the test can assert
// the registry actually dispatched my_tool with the LLM's args. The
// real executeLoopTool runs the body and the body has access to a
// global the test reads after the run.
const customToolDispatches = [];
globalThis.__customToolDispatchSink = customToolDispatches;

beforeAll(async () => {
    ({ runSpecOrchestration } = await import('../../public/scripts/agents/orchestrator/spec-runtime.js'));
});

beforeEach(() => {
    llmResponses.length = 0;
    customToolDispatches.length = 0;
    llmRequests.length = 0;
});

function singleWithTools() {
    return {
        source: 'single', mode: 'single',
        spec: { stages: [{ id: 'single', mode: 'serial', nodes: [{ id: 'single_agent', preset: 'p' }] }] },
        presets: { p: { systemPrompt: 'private system', userPromptTemplate: 'private task' } },
        customTools: [{
            name: 'my_tool', description: 'test', parameters: {}, mode: 'read',
            body: 'globalThis.__customToolDispatchSink.push({ x: args.x, ctx }); return { x: args.x };',
        }],
    };
}

const guidance = () => ({ toolCalls: [{ name: 'atri_orch_final_guidance', args: { text: 'done' } }], assistantText: '' });

describe('Single Runtime equivalence', () => {
    test('two calls preserve order, IDs, reasoning, results and unchanged settings', async () => {
        const profile = singleWithTools();
        const before = JSON.stringify(profile);
        const run = async agentRuntimeV2 => {
            customToolDispatches.length = 0;
            llmRequests.length = 0;
            llmResponses.push({
                assistantText: 'working', reasoning: 'thought', reasoningBlocks: [{ text: 'block' }], reasoningDetails: [{ text: 'detail' }],
                toolCalls: [1, 2].map(x => ({ id: `provider-${x}`, name: x === 1 ? 'my.tool' : 'my_tool', args: { x } })),
            }, guidance());
            const output = await runSpecOrchestration({}, { agentRuntimeV2 }, [], profile);
            return { output, messages: llmRequests.map(r => r.taskMessages), calls: [...customToolDispatches] };
        };
        const modern = await run(true), legacy = await run(false);
        expect(modern.messages).toEqual(legacy.messages);
        expect(modern.output.stageOutputs).toEqual(legacy.output.stageOutputs);
        expect(modern.output.runtimeTrace.attempts[0].conversation).toEqual(legacy.output.runtimeTrace.attempts[0].conversation);
        expect(modern.calls.map(c => c.x)).toEqual([1, 2]);
        expect(modern.calls[0].ctx).toBe(modern.calls[1].ctx);
        expect(modern.messages[1].filter(m => m.role === 'tool').map(m => m.tool_call_id)).toEqual(['provider-1', 'provider-2']);
        expect(JSON.stringify(profile)).toBe(before);
        const events = modern.output.runtimeTrace.events.filter(e => e.type === 'agent_runtime_v2').map(e => e.runtimeEvent);
        expect(events.filter(e => e.type === 'run.started')).toHaveLength(1);
        expect(events.filter(e => e.type === 'tool.execute.completed')).toHaveLength(2);
    });

    test('structured tool errors remain model-visible feedback in both paths', async () => {
        const outputs = [];
        for (const agentRuntimeV2 of [true, false]) {
            const profile = singleWithTools();
            profile.customTools[0].body = 'throw Object.assign(new Error("recoverable"), { name: "ToolError", code: "RETRY", hint: "again" });';
            llmRequests.length = 0;
            llmResponses.push({ toolCalls: [{ id: 'err', name: 'my_tool', args: {} }] }, guidance());
            await runSpecOrchestration({}, { agentRuntimeV2 }, [], profile);
            outputs.push(llmRequests[1].taskMessages.find(m => m.role === 'tool'));
        }
        expect(outputs[0]).toEqual(outputs[1]);
        expect(JSON.parse(outputs[0].content)).toEqual({ ok: false, error: 'recoverable', code: 'RETRY', hint: 'again' });
    });

    test('same round limit executes the final tool batch but never adds an extra model call', async () => {
        for (const agentRuntimeV2 of [true, false]) {
            customToolDispatches.length = 0;
            llmRequests.length = 0;
            for (let x = 0; x < 3; x++) llmResponses.push({ toolCalls: [{ id: `round-${x}`, name: 'my_tool', args: { x } }] });
            await expect(runSpecOrchestration({}, { agentRuntimeV2 }, [], singleWithTools())).rejects.toThrow('exceeded max iteration rounds (3)');
            expect(customToolDispatches.map(c => c.x)).toEqual([0, 1, 2]);
            expect(llmRequests).toHaveLength(3);
        }
    });

    test('cancellation in the first tool prevents the second tool and next model request', async () => {
        const controller = new AbortController();
        globalThis.__singleTestAbort = () => controller.abort();
        const profile = singleWithTools();
        profile.customTools[0].body = 'globalThis.__customToolDispatchSink.push(args.x); globalThis.__singleTestAbort(); return "late";';
        llmResponses.push({ toolCalls: [1, 2].map(x => ({ id: `c-${x}`, name: 'my_tool', args: { x } })) });
        try {
            await expect(runSpecOrchestration({}, { signal: controller.signal }, [], profile)).rejects.toMatchObject({ name: 'AbortError' });
            expect(customToolDispatches).toEqual([1]);
            expect(llmRequests).toHaveLength(1);
        } finally { delete globalThis.__singleTestAbort; }
    });

    test('unknown infrastructure errors stop subsequent tools instead of becoming successful feedback', async () => {
        const profile = singleWithTools();
        profile.customTools[0].body = 'globalThis.__customToolDispatchSink.push(args.x); throw new Error("broken tool");';
        llmResponses.push({ toolCalls: [1, 2].map(x => ({ id: `c-${x}`, name: 'my_tool', args: { x } })) });
        await expect(runSpecOrchestration({}, {}, [], profile)).rejects.toThrow('broken tool');
        expect(customToolDispatches).toEqual([1]);
        expect(llmRequests).toHaveLength(1);
    });

    test('final output wins over same-response ordinary tools', async () => {
        const profile = singleWithTools();
        for (const agentRuntimeV2 of [true, false]) {
            llmResponses.push({ toolCalls: [{ id: 'skip', name: 'my_tool', args: { x: 1 } }, ...guidance().toolCalls] });
            const output = await runSpecOrchestration({}, { agentRuntimeV2 }, [], profile);
            expect(output.stageOutputs[0].nodes[0].output).toBe('done');
        }
        expect(customToolDispatches).toHaveLength(0);
    });

    test('empty final output fails before any same-response tool writes', async () => {
        for (const agentRuntimeV2 of [true, false]) {
            llmResponses.push({ toolCalls: [{ id: 'skip', name: 'my_tool', args: {} }, { name: 'atri_orch_final_guidance', args: { text: '' } }] });
            await expect(runSpecOrchestration({}, { agentRuntimeV2 }, [], singleWithTools())).rejects.toThrow('empty final guidance');
        }
        expect(customToolDispatches).toHaveLength(0);
    });
});

describe('spec runtime Layer-3 dispatch', () => {
    test('Single v2 and explicit legacy fallback produce identical stage outputs', async () => {
        const profile = {
            source: 'single', mode: 'single',
            spec: { defaultTools: null, stages: [{ id: 'single', mode: 'serial', nodes: [{ id: 'single_agent', preset: 'single_agent' }] }] },
            presets: { single_agent: { systemPrompt: 'private system', userPromptTemplate: 'private task' } },
        };
        const before = JSON.stringify(profile);
        const run = async agentRuntimeV2 => {
            llmResponses.push({ toolCalls: [{ name: 'atri_orch_final_guidance', args: { text: 'same guidance' } }], assistantText: '' });
            return runSpecOrchestration({}, { agentRuntimeV2 }, [], profile);
        };
        const modern = await run(true);
        const legacy = await run(false);
        expect(modern.stageOutputs).toEqual(legacy.stageOutputs);
        expect(modern.runtimeTrace.events.some(e => e.type === 'agent_runtime_v2')).toBe(true);
        expect(legacy.runtimeTrace.events.some(e => e.type === 'agent_runtime_v2')).toBe(false);
        expect(JSON.stringify(profile)).toBe(before);
    });

    test('Single with inherited tool defaults now enters Runtime', async () => {
        const profile = {
            source: 'single', mode: 'single',
            spec: { stages: [{ id: 'single', mode: 'serial', nodes: [{ id: 'single_agent', preset: 'single_agent' }] }] },
            presets: { single_agent: { systemPrompt: 'private system', userPromptTemplate: 'private task' } },
        };
        llmResponses.push({ toolCalls: [{ name: 'atri_orch_final_guidance', args: { text: 'done' } }], assistantText: '' });
        const result = await runSpecOrchestration({}, {}, [], profile);
        expect(result.runtimeTrace.events.some(e => e.type === 'agent_runtime_v2')).toBe(true);
        expect(result.stageOutputs[0].nodes[0].output).toBe('done');
    });

    test('threads customToolRegistry into the per-call executeLoopTool ctx', async () => {
        // Profile: one stage, one worker node with the current custom-tool
        // flag enabled and a single custom tool the LLM is told to call. The body
        // records evidence the registry dispatch worked: it pushes the
        // received args plus a registry-presence probe onto the sidecar.
        const profile = {
            mode: 'spec',
            spec: {
                stages: [
                    {
                        id: 's1',
                        mode: 'serial',
                        nodes: [
                            { id: 'n1', preset: 'p1', type: 'worker', tools: { custom: { my_tool: true } } },
                        ],
                    },
                ],
            },
            presets: { p1: { id: 'p1', systemPrompt: 'sys', userPromptTemplate: 'user' } },
            customTools: [
                {
                    name: 'my_tool',
                    description: 'd',
                    parameters: {},
                    mode: 'read',
                    body: 'globalThis.__customToolDispatchSink.push({ name: "my_tool", args, hasRegistry: !!(ctx && ctx.__customToolRegistry && ctx.__customToolRegistry.has && ctx.__customToolRegistry.has("my_tool")) }); return { x: args.x };',
                    simulateBody: '',
                },
            ],
        };

        // LLM responses: round 1 calls my_tool, round 2 emits atri_orch_final_guidance.
        llmResponses.push({
            toolCalls: [{ id: 'tc1', name: 'my_tool', args: { x: 5 } }],
            assistantText: '',
            reasoning: '',
        });
        llmResponses.push({
            toolCalls: [{ id: 'tc2', name: 'atri_orch_final_guidance', args: { text: 'done' } }],
            assistantText: '',
            reasoning: '',
        });

        const messages = [];
        await runSpecOrchestration({}, { signal: new AbortController().signal }, messages, profile);

        // The real executeLoopTool dispatched my_tool. The body ran with
        // the LLM's args and saw the per-run customToolRegistry on ctx.
        const myToolCall = customToolDispatches.find(c => c.name === 'my_tool');
        expect(myToolCall).toBeTruthy();
        expect(myToolCall.args).toEqual({ x: 5 });
        expect(myToolCall.hasRegistry).toBe(true);
    });
});

test('Spec reviewer reruns an earlier worker through Engine delegation and preserves the preset', async () => {
    const profile = { mode: 'spec', spec: { stages: [
        { id: 'draft', mode: 'serial', nodes: [{ id: 'writer', preset: 'p' }, { id: 'reviewer', type: 'review', preset: 'p' }] },
        { id: 'final', mode: 'serial', nodes: [{ id: 'finalizer', preset: 'p' }] },
    ] }, presets: { p: { systemPrompt: 'role', userPromptTemplate: '{{previous_outputs}}' } } };
    const before = JSON.stringify(profile), events = [];
    const reply = (name, args) => ({ toolCalls: [{ name, args }], assistantText: '' });
    llmResponses.push(reply('atri_orch_node_output', { output: 'draft' }),
        reply('atri_orch_request_rerun', { target_node_ids: ['writer'], review_feedback: 'repair' }),
        reply('atri_orch_node_output', { output: 'repaired' }),
        reply('atri_orch_review_approve', { review_feedback: 'approved' }), guidance());
    const result = await runSpecOrchestration({}, {}, [], profile, { onRuntimeEvent: event => events.push(event) });
    expect(result.reviewRerunCount).toBe(1);
    expect(getRuntimePanelState().runtime.runs.flatMap(run => run.handoffs)).toHaveLength(0);
    expect(getRuntimePanelState().runtime.runs.every(run => run.status === 'completed')).toBe(true);
    const branches = events.filter(e => e.type === 'parallel.branch.started');
    expect(branches.map(e => e.toAgentId)).toEqual(['agent:stage:0/node:0', 'agent:stage:0/node:1',
        'agent:stage:0/node:0', 'agent:stage:0/node:1', 'agent:stage:1/node:0']);
    expect(new Set(branches.map(e => e.childRunId)).size).toBe(5);
    expect(result.stageOutputs[0].nodes[0].output).toEqual({ output: 'repaired' });
    expect(llmRequests.at(-1).taskMessages.some(message => message.content.includes('approved'))).toBe(true);
    expect(JSON.stringify(profile)).toBe(before);
});

test('legacy Spec string nodes and repeated names in different stages keep distinct route identities', async () => {
    const profile = { mode: 'spec', spec: { stages: [
        { id: 'first', mode: 'serial', nodes: ['same'] }, { id: 'second', mode: 'serial', nodes: ['same'] },
    ] }, presets: { same: { systemPrompt: 'role', userPromptTemplate: '{{previous_outputs}}' } } };
    llmResponses.push({ toolCalls: [{ name: 'atri_orch_node_output', args: { value: 'first' } }] }, guidance());
    const events = [];
    await runSpecOrchestration({}, {}, [], profile, { onRuntimeEvent: e => events.push(e) });
    expect(events.filter(e => e.type === 'parallel.branch.started').map(e => e.toAgentId))
        .toEqual(['agent:stage:0/node:0', 'agent:stage:1/node:0']);
});
