import { test, expect } from '@jest/globals';
import { AgentRuntime, AgentRegistry, MemoryCheckpointStore } from '../../public/scripts/lib/agent-runtime/index.js';
import { validateDecision } from '../../public/scripts/lib/agent-runtime/contracts.js';
import { runLegacyWorkflow, modelIntent } from '../../public/scripts/agents/orchestrator/legacy-workflow-adapter.js';
import { createLegacyAgentGraph, agentKey, runRoutedLegacyWorkflow, selectHandoffInputs, createSpecAgentRoute } from '../../public/scripts/agents/orchestrator/legacy-agent-routing.js';
import { fakePorts } from './fakes.js';

const graph = () => createLegacyAgentGraph('test', [{ id: 'worker', preset: { systemPrompt: 'private preset' } }]);
const target = agentKey('test', 'worker');
const request = { taskMessages: [{ role: 'user', content: 'private task' }] };
const route = extra => ({ graph: graph(), toAgentId: target, task: 'assigned', reason: 'dispatch', ...extra });

test('handoff is checkpointed before the target policy and retains stable IDs without raw inputs', async () => {
    const store = new MemoryCheckpointStore(), events = [];
    const result = await runRoutedLegacyWorkflow(async function* (handoff) {
        const state = store.load('route');
        expect(state.currentAgentId).toBe(target);
        expect(state.handoffStack).toEqual([handoff]);
        expect(handoff).toMatchObject({ handoffId: 'route/effect/2', fromAgentId: 'test/controller', toAgentId: target });
        return yield modelIntent(async () => 'done', request);
    }, route({ runId: 'route', store, inputIds: ['chosen'], onEvent: e => events.push(e) }));
    expect(result).toBe('done');
    const audit = events.find(e => e.type === 'agent.handoff.completed');
    expect(audit).toMatchObject({ handoffId: 'route/effect/2', fromAgentId: 'test/controller', toAgentId: target });
    expect(events.indexOf(audit)).toBeLessThan(events.findIndex(e => e.type === 'model.request.started'));
    expect(JSON.stringify(store.load('route'))).not.toMatch(/private task|private preset/);
});

test.each(['missing', 'test/controller'])('illegal target %s never starts target policy or sender', async toAgentId => {
    let starts = 0;
    await expect(runRoutedLegacyWorkflow(async function* () { starts++; yield modelIntent(async () => 'bad', request); }, route({ toAgentId }))).rejects.toThrow(/Unknown agent|Handoff not allowed/);
    expect(starts).toBe(0);
});

test.each(['agent.handoff.started', 'agent.handoff.completed'])('cancel at %s prevents target code', async boundary => {
    let starts = 0; const controller = new AbortController();
    await expect(runRoutedLegacyWorkflow(async function* () { starts++; yield modelIntent(async () => 'bad', request); }, route({
        signal: controller.signal, onEvent: e => { if (e.type === boundary) controller.abort(); },
    }))).rejects.toMatchObject({ name: 'AbortError' });
    expect(starts).toBe(0);
});

test('graph owns preset copies, rejects duplicate identity, and excludes unselected inputs', () => {
    const preset = { systemPrompt: 'original' }, entries = [['a', { output: 'chosen' }], ['b', { output: 'secret' }]];
    const compiled = createLegacyAgentGraph('test', [{ id: 'worker', preset }]);
    preset.systemPrompt = 'mutated';
    const selected = selectHandoffInputs(entries, ['a']); entries[0][1].output = 'changed';
    expect([...selected.values()]).toEqual([{ output: 'chosen' }]);
    expect(compiled.registry.get(target).instructions).toBe('original');
    expect(() => selectHandoffInputs(entries, ['missing'])).toThrow('Unknown handoff input');
    expect(() => createLegacyAgentGraph('test', [{ id: 'worker' }, { id: 'worker' }])).toThrow('Duplicate agent');
});

test('routing policies reject scratch transfer and discard forged identity fields', () => {
    const compiled = graph(), agent = compiled.registry.get(compiled.entryId);
    const decision = { type: 'handoff', toAgentId: target, reason: 'dispatch', task: 'work', contextPolicy: 'task_only',
        handoffId: 'forged', fromAgentId: 'forged', createdAt: -1 };
    expect(validateDecision(decision, agent, compiled.registry)).not.toHaveProperty('handoffId');
    expect(() => validateDecision({ ...decision, contextPolicy: 'include_scratch' }, agent, compiled.registry)).toThrow('context policy');
});

test('review graph permits earlier targets but rejects future or worker-initiated reruns', () => {
    const nodes = [{ id: 'first' }, { id: 'review', type: 'review' }, { id: 'later' }];
    const options = { runtime: { stages: [{ nodes }] }, handoffFrom: '0:1:review' };
    const route = createSpecAgentRoute(nodes[0], {}, options);
    const decision = { type: 'handoff', toAgentId: route.toAgentId, reason: 'rerun', task: 'fix', contextPolicy: 'task_only' };
    expect(validateDecision(decision, route.graph.registry.get(route.fromAgentId), route.graph.registry).toAgentId).toBe(agentKey('spec', '0:0:first'));
    expect(() => validateDecision({ ...decision, toAgentId: agentKey('spec', '0:2:later') }, route.graph.registry.get(route.fromAgentId), route.graph.registry)).toThrow('Handoff not allowed');
    expect(() => validateDecision(decision, route.graph.registry.get(agentKey('spec', '0:2:later')), route.graph.registry)).toThrow('Handoff not allowed');
});

test.each(['task_only', 'include_scratch'])('native handoff applies %s and recalls target memory', async contextPolicy => {
    const registry = new AgentRegistry([{ id: 'a', handoffs: ['b'] }, { id: 'b' }]);
    const fake = fakePorts([{ type: 'continue', output: 'parent-scratch' },
        { type: 'handoff', toAgentId: 'b', task: 'child-task', reason: 'review', contextPolicy }, { type: 'complete', output: 'done' }]);
    const runtime = new AgentRuntime({ registry, ports: fake.ports, countTokens: () => 1 });
    const state = await runtime.startRun({ runId: contextPolicy, agentId: 'a', task: 'start' });
    expect(state.status).toBe('completed');
    expect(state.currentAgentId).toBe('b');
    expect(JSON.stringify(fake.calls.model.at(-1).messages).includes('parent-scratch')).toBe(contextPolicy === 'include_scratch');
    expect(fake.calls.memory.at(-1)).toMatchObject({ agentId: 'b', query: 'child-task' });
});

test('unconsumed native handoff receipt resumes once using the original ID', async () => {
    const store = new MemoryCheckpointStore(), save = store.save.bind(store); let captured;
    store.save = (state, version) => {
        if (state.pendingEffect?.type === 'agent.handoff' && state.completedEffects[state.pendingEffect.effectId]) captured = structuredClone(state);
        save(state, version);
    };
    const registry = new AgentRegistry([{ id: 'a', handoffs: ['b'] }, { id: 'b' }]);
    const fake = fakePorts([{ type: 'handoff', toAgentId: 'b', task: 'child', reason: 'dispatch', contextPolicy: 'task_only' }, { type: 'complete' }]);
    await new AgentRuntime({ registry, ports: fake.ports, store, countTokens: () => 1 }).startRun({ runId: 'recovery', agentId: 'a', task: 'start' });
    const restored = new MemoryCheckpointStore(); restored.save({ ...captured, checkpointVersion: 1 }, 0);
    const again = fakePorts(), events = [];
    const runtime = new AgentRuntime({ registry, ports: again.ports, store: restored, countTokens: () => 1 });
    runtime.events.subscribe(e => events.push(e));
    const state = await runtime.resumeRun('recovery');
    expect(state.handoffStack).toHaveLength(1);
    expect(state.handoffStack[0].handoffId).toBe(captured.pendingEffect.effectId);
    expect(events.some(e => e.type === 'agent.handoff.started')).toBe(false);
    expect(again.calls.model[0].agent.id).toBe('b');
});

test('cyclic legacy handoffs stop at the Runtime budget without executing a model', async () => {
    const registry = new AgentRegistry([{ id: 'a', handoffs: ['a'] }]);
    await expect(runLegacyWorkflow(async function* () {
        while (true) yield { kind: 'handoff', handoff: { toAgentId: 'a', task: 'loop', reason: 'loop', contextPolicy: 'task_only' } };
    }, { registry, agentId: 'a', maxSteps: 2 })).rejects.toThrow('Handoff budget exhausted');
});

test('invalid definition context policies cannot weaken handoff validation', () => {
    expect(() => new AgentRegistry([{ id: 'a', policies: { handoffContextPolicies: 'task_only' } }])).toThrow('Invalid agent handoff');
    expect(() => new AgentRegistry([{ id: 'a', policies: { handoffContextPolicies: ['unrestricted'] } }])).toThrow('Invalid agent handoff');
});

test('Single uses the graph identity selected by its preceding handoff', async () => {
    const { runLegacySingleRequest } = await import('../../public/scripts/agents/orchestrator/legacy-runtime-adapter.js');
    const store = new MemoryCheckpointStore();
    await runLegacySingleRequest({ runId: 'single-identity', agentId: 'spec/agent/0%3A0%3Asingle', store,
        request: { taskMessages: [] }, send: async () => ({ text: 'done' }) });
    expect(store.load('single-identity').currentAgentId).toBe('spec/agent/0%3A0%3Asingle');
});
