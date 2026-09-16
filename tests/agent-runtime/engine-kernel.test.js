import { test, expect } from '@jest/globals';
import { AgentRuntime, AgentRegistry, ParallelExecutor, MemoryCheckpointStore } from '../../public/scripts/lib/agent-runtime/index.js';
import { CAPABILITIES, validateGraph, createPolicyController, initialPolicyState, applyTaskProposal, compileAgentDefinition, arbitrate, createResult, planIdentity } from '../../public/scripts/lib/orchestration-engine/index.js';
import { fakePorts } from './fakes.js';

const caps = Object.fromEntries(CAPABILITIES.map(key => [key, !key.startsWith('reply.')]));
function plan() {
    return { schemaVersion: 1, planId: 'fixture', source: { mode: 'spec' }, entryNodeId: 'first',
        agents: [{ id: 'worker', tools: ['lookup', 'write_message', 'finalize'], capabilities: caps }],
        nodes: ['first', 'second'].map(nodeId => ({ nodeId, agentId: 'worker', kind: 'agent', capabilities: caps })),
        edges: [{ edgeId: 'next', from: 'first', to: 'second' }], capabilities: caps,
        scheduler: {}, arbitration: { kind: 'pass-through' },
        output: { kind: 'guidance', ownerNodeId: 'second', submitCapability: 'result.submit' },
        budgets: { maxSteps: 10, maxTasks: 10, maxConcurrency: 2 } };
}
async function run(p, execute, store = new MemoryCheckpointStore(), resume = false) {
    const fake = fakePorts();
    const runtime = new AgentRuntime({ registry: new AgentRegistry([{ id: 'engine', handoffs: ['worker'], policies: { maxConcurrency: 2 } }, { id: 'worker' }]),
        ports: { ...fake.ports, policy: createPolicyController(p), parallel: new ParallelExecutor({ execute, resume: execute }) }, store,
        countTokens: m => m.content.length });
    return resume ? runtime.resumeRun('graph') : runtime.startRun({ runId: 'graph', agentId: 'engine', controlMode: 'policy', policyState: initialPolicyState(p) });
}

test('static graph delegates in dependency order, retaining ResultEnvelope identities', async () => {
    const calls = [];
    const result = await run(plan(), async request => { calls.push(request); return request.payload.nodeId; });
    expect(result.status).toBe('completed');
    expect(result.output.value).toBe('second');
    expect(calls.map(call => call.payload.nodeId)).toEqual(['first', 'second']);
    expect(calls[1].payload.inputs[0].resultId).toBe('graph/result/first/1');
    expect(result.currentAgentId).toBe('engine');
});

test.each([
    p => { p.nodes.push(p.nodes[0]); },
    p => { p.edges[0].to = 'missing'; },
    p => { p.nodes[0].agentId = 'missing'; },
    p => { p.edges.push({ edgeId: 'back', from: 'second', to: 'first' }); },
    p => { p.output.kind = 'reply'; },
    p => { p.nodes[0].capabilities = { invented: true }; },
])('invalid graph rejected before Runtime starts', mutate => {
    const p = plan(); mutate(p); expect(() => validateGraph(p)).toThrow();
});

test('bounded cycle is accepted; unreachable nodes are diagnosed', () => {
    const p = plan();
    p.edges.push({ edgeId: 'back', from: 'second', to: 'first', maxVisits: 1, condition: 'rejected' });
    p.nodes.push({ ...p.nodes[0], nodeId: 'unused' });
    expect(validateGraph(p).diagnostics).toEqual([{ code: 'unreachable', nodeId: 'unused' }]);
});

test('reply tools are excluded from worker allowlists even if the preset requests them', () => {
    const p = plan();
    expect(compileAgentDefinition(p, p.nodes[0], ['lookup', 'write_message', 'finalize']).tools).toEqual(['lookup', 'finalize']);
    p.source.mode = 'director'; p.capabilities = Object.fromEntries(CAPABILITIES.map(key => [key, true]));
    expect(compileAgentDefinition(p, p.nodes[0], ['lookup', 'write_message', 'finalize']).tools).toEqual(['lookup']);
});

test('plan identity includes permissions and recovery refuses changed plans', async () => {
    const p = plan(), changed = structuredClone(p); changed.budgets.maxTasks++;
    expect(planIdentity(changed)).not.toBe(planIdentity(p));
    const store = new MemoryCheckpointStore();
    const pending = new Promise(() => {});
    const active = run(p, () => pending, store);
    await new Promise(resolve => setTimeout(resolve, 0));
    // Save a policy boundary to emulate restart without a live JS closure.
    const state = store.load('graph');
    state.pendingEffect = { runId: 'graph', stepId: state.stepId, effectId: 'restored-policy', type: 'policy.advance' };
    state.policyState.pending = null;
    store.save({ ...state, checkpointVersion: state.checkpointVersion + 1 }, state.checkpointVersion);
    expect((await run(changed, async () => 'never', store, true)).error).toMatch(/fingerprint/);
    void active;
});

test('dynamic proposals validate capabilities, dependency cycles, dispatch readiness and budgets atomically', () => {
    const p = plan(); p.source.mode = 'agenda'; p.scheduler.workerAgentIds = ['worker'];
    const state = initialPolicyState(p);
    const next = applyTaskProposal(p, state, { addTasks: [{ id: 't', task: 'work', agentId: 'worker' }], dispatch: ['t'] }, p.nodes[0]);
    expect(next.taskGraph).toHaveLength(1); expect(state.taskGraph).toHaveLength(0);
    expect(() => applyTaskProposal(p, next, { dispatch: ['unknown'] }, p.nodes[0])).toThrow();
    expect(() => applyTaskProposal(p, state, { addTasks: [
        { id: 'a', task: 'a', agentId: 'worker', dependsOn: ['b'] },
        { id: 'b', task: 'b', agentId: 'worker', dependsOn: ['a'] },
    ] }, p.nodes[0])).toThrow(/cycle/);
    p.source.mode = 'spec';
    expect(() => applyTaskProposal(p, state, {}, p.nodes[0])).toThrow(/Capability/);
});

test('arbitration validates stable references, majority and partial admission', () => {
    const results = [1, 2, 3].map(id => createResult({ runId: 'r', nodeId: String(id), agentId: 'w', value: id === 3 ? 'B' : 'A' }));
    expect(arbitrate(results, { kind: 'consensus' }).value).toBe('A');
    expect(() => arbitrate(results, { kind: 'judge' }, { choice: 'invented', reason: 'guess' })).toThrow();
    expect(arbitrate(results, { kind: 'judge' }, { choice: results[2].resultId, reason: 'evidence' }).value).toBe('B');
    results[2].status = 'partial';
    expect(arbitrate(results, { kind: 'merge' }).value).toHaveLength(2);
    expect(() => arbitrate(results, { kind: 'merge', conflict: 'fail' })).toThrow();
});

test.each(['judge', 'synthesize'])('bounded %s delegates one decision and retains candidate provenance', async kind => {
    const p = plan(); p.nodes[1].kind = kind;
    const calls = [];
    const result = await run(p, async request => {
        calls.push(request);
        if (request.payload.nodeId === 'first') return 'candidate';
        const id = request.payload.inputs[0].resultId;
        return { engineResult: true, status: 'completed', structured: kind === 'judge' ? { choice: id, reason: 'fit' } : { text: 'synthesis', inputResultIds: [id] } };
    });
    expect(result.status).toBe('completed');
    expect(result.output.value).toBe(kind === 'judge' ? 'candidate' : 'synthesis');
    expect(result.policyState.budgets.arbitrationCalls).toBe(1);
    expect(result.policyState.results.at(-1).provenance).toContainEqual({ resultId: 'graph/result/first/1' });
    expect(calls).toHaveLength(2);
});

test.each([{ maxCalls: 0 }, { maxInputBytes: 1 }])('arbitration budget prevents admission: %j', async budget => {
    const p = plan(); p.nodes[1].kind = 'judge'; Object.assign(p.arbitration, budget);
    let calls = 0;
    const result = await run(p, async () => { calls++; return 'candidate'; });
    expect(result.output.status).toBe('budget_exhausted'); expect(calls).toBe(1);
});

test('invalid Judge IDs fail without publishing a reply', async () => {
    const p = plan(); p.nodes[1].kind = 'judge';
    const result = await run(p, async request => request.payload.nodeId === 'first' ? 'candidate'
        : { engineResult: true, status: 'completed', structured: { choice: 'old-run/result/first/1', reason: 'stale' } });
    expect(result.status).toBe('failed'); expect(result.error).toMatch(/Judge/); expect(result.output).toBeUndefined();
});

test('consensus uses structural equality and synthesis rejects duplicate references', () => {
    const results = [{ a: 1, b: 2 }, { b: 2, a: 1 }, 'different'].map((value, index) => createResult({ runId: 'r', nodeId: String(index), agentId: 'w', value }));
    expect(arbitrate(results, { kind: 'consensus' }).value).toEqual({ a: 1, b: 2 });
    const id = results[0].resultId;
    expect(() => arbitrate(results, { kind: 'synthesize' }, { text: 'x', inputResultIds: [id, id] })).toThrow(/references/);
});

test('cancelled Judge cannot publish a late decision or output', async () => {
    const p = plan(); p.nodes[1].kind = 'judge';
    let release, started;
    const entered = new Promise(resolve => { started = resolve; });
    const late = new Promise(resolve => { release = resolve; });
    const fake = fakePorts();
    const runtime = new AgentRuntime({ registry: new AgentRegistry([{ id: 'engine', handoffs: ['worker'] }, { id: 'worker' }]),
        countTokens: () => 1, ports: { ...fake.ports, policy: createPolicyController(p),
            parallel: new ParallelExecutor({ execute: async request => {
                if (request.payload.nodeId === 'first') return 'candidate';
                started(); return late;
            } }) } });
    const running = runtime.startRun({ runId: 'cancel-judge', agentId: 'engine', controlMode: 'policy', policyState: initialPolicyState(p) });
    await entered; runtime.cancelRun('cancel-judge');
    expect((await running).status).toBe('cancelled');
    release({ engineResult: true, status: 'completed', structured: { choice: 'cancel-judge/result/first/1', reason: 'late' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(runtime.getState('cancel-judge').output).toBeUndefined();
    expect(runtime.getState('cancel-judge').policyState.results).toHaveLength(1);
});
