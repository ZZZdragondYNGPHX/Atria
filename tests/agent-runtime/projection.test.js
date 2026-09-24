import { test, expect, beforeEach } from '@jest/globals';
import { AgentRuntime, AgentRegistry } from '../../public/scripts/lib/agent-runtime/index.js';
import { RuntimeProjection, replayRuntimeEvents, sanitizeRuntimeEvent } from '../../public/scripts/lib/agent-runtime/projection.js';
import { createEventBus } from '../../public/scripts/lib/agent-runtime/events.js';
import { createRuntimeObserver } from '../../public/scripts/extensions/orchestrator/run-state/runtime-observer.js';
import { startRun, getCurrentRun, clearCurrentRun, requestRunStop } from '../../public/scripts/extensions/orchestrator/run-state/store.js';
import { runRoutedLegacyWorkflow, createLegacyAgentGraph } from '../../public/scripts/extensions/orchestrator/legacy-agent-routing.js';
import { modelIntent, toolIntent } from '../../public/scripts/extensions/orchestrator/legacy-workflow-adapter.js';
import { fakePorts, deferred } from './fakes.js';

beforeEach(() => clearCurrentRun());
const event = (version, type, extra = {}) => ({ eventId: `event-${version}-${type}`, runId: 'r', generation: 1,
    version, type, agentId: 'a', status: 'running', ...extra });

test('Engine diagnostics preserve IDs and outcomes without source material or policy state', () => {
    const projection = new RuntimeProjection();
    for (const [index, type] of ['graph.compiled', 'graph.mutated', 'graph.node.started', 'result.created', 'arbitration.started', 'capability.denied', 'output.ready'].entries()) {
        projection.append(event(index, type, { planId: 'p', nodeId: 'n', resultId: 'r', graphRevision: 2,
            outcome: 'partial', routing: 'delegate', capability: 'reply.submit', task: 'SECRET TASK',
            policyState: { history: 'SECRET HISTORY' }, value: 'SECRET RESULT', planFingerprint: 'SECRET PROFILE' }));
    }
    const snapshot = projection.snapshot();
    expect(snapshot.events).toHaveLength(7);
    expect(snapshot.events.at(-1)).toMatchObject({ outcome: 'partial', planId: 'p', nodeId: 'n', resultId: 'r', graphRevision: 2 });
    expect(JSON.stringify(snapshot)).not.toContain('SECRET');
    expect(replayRuntimeEvents(snapshot.events)).toEqual(snapshot);
});

test('event journal replay reconstructs the same key path and ignores duplicate deliveries', async () => {
    const projection = new RuntimeProjection();
    const fake = fakePorts([{ type: 'tool', toolName: 'read' }, { type: 'complete', output: 'private-result' }]);
    const runtime = new AgentRuntime({ registry: new AgentRegistry([{ id: 'a', tools: ['read'] }]), ports: fake.ports,
        countTokens: () => 1, eventSink: e => { projection.append(e); projection.append(e); } });
    await runtime.startRun({ runId: 'r', agentId: 'a', task: 'private-task' });
    const result = projection.snapshot();
    expect(replayRuntimeEvents(result.events)).toEqual(result);
    expect(result.runs[0].status).toBe('completed');
    expect(result.runs[0].effects.find(e => e.type === 'tool.execute')).toMatchObject({ status: 'completed', toolName: 'read', stepId: 'r/step/1' });
    expect(result.runs[0].contexts).toHaveLength(2);
    expect(JSON.stringify(result)).not.toMatch(/private-task|private-result|private-recall-text/);
});

test('old generation, out-of-order and late completions cannot revive a cancelled execution', () => {
    const projection = new RuntimeProjection();
    projection.append(event(3, 'model.request.started', { effectId: 'effect', status: 'waiting_model' }));
    projection.append(event(7, 'run.cancelled', { generation: 2, status: 'cancelled' }));
    projection.append(event(9, 'model.request.completed', { effectId: 'effect', status: 'running' }));
    projection.append(event(3, 'effect.stale', { effectId: 'effect' }));
    expect(projection.snapshot().runs[0]).toMatchObject({ status: 'cancelled', generation: 2, staleEffects: ['effect'] });
    expect(projection.snapshot().runs[0].effects[0].status).toBe('cancelled');
    expect(replayRuntimeEvents(projection.snapshot().events)).toEqual(projection.snapshot());
});

test('metadata allowlist excludes credentials and raw payloads at nested boundaries', () => {
    const nativeRouteRef = { scope: 'player', runtimeRouteId: 'route_' + '1'.repeat(32) };
    const sanitized = sanitizeRuntimeEvent(event(1, 'context.compiled', { task: 'secret', apiKey: 'secret', args: { token: 'secret' },
        modelProfile: { apiPresetName: 'selected', apiKey: 'secret', nativeRouteRef: { ...nativeRouteRef, secret: 'secret' } }, diagnostics: [{ source: 'memory', tokens: 5, content: 'secret' }],
        references: [{ id: 'source', revision: 2, text: 'secret' }], reason: 'secret' }));
    expect(JSON.stringify(sanitized)).not.toContain('secret');
    expect(sanitized.modelProfile).not.toHaveProperty('apiPresetName');
    expect(sanitized.modelProfile.nativeRouteRef).toEqual(nativeRouteRef);
    expect(sanitized.diagnostics[0].tokens).toBe(5);
});

test('observer mutation and async failures cannot affect the next listener or producer', async () => {
    const bus = createEventBus(), original = { nested: { tokens: 2 } }; let seen;
    bus.subscribe(e => { e.nested.tokens = 999; });
    bus.subscribe(e => { seen = e.nested.tokens; });
    bus.subscribe(async () => { throw new Error('Observer failure'); });
    bus.emit(original);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(seen).toBe(2); expect(original.nested.tokens).toBe(2);
});

test('UI snapshots are detached and stop requests are acknowledged once without inventing Runtime completion', () => {
    let commands = 0;
    const id = startRun({ mode: 'loop', abortFn: () => commands++ });
    const view = getCurrentRun();
    expect(() => { view.status = 'completed'; }).toThrow();
    expect(requestRunStop(id)).toBe(true); expect(requestRunStop(id)).toBe(false);
    expect(commands).toBe(1); expect(getCurrentRun()).toMatchObject({ status: 'running', stopRequested: true });
    expect(getCurrentRun().runtime.runs).toEqual([]);
});

test('observer binds once; clearing the UI never redirects old events into a different chat', () => {
    let bound;
    const observer = createRuntimeObserver({ getPanelRunId: () => bound });
    observer(event(1, 'run.started'));
    bound = startRun({ mode: 'loop', chatKey: 'first' });
    observer(event(2, 'model.request.started'));
    expect(getCurrentRun().runtime.events).toHaveLength(2);
    clearCurrentRun(); startRun({ mode: 'loop', chatKey: 'other' });
    observer(event(3, 'run.completed', { status: 'completed' }));
    expect(getCurrentRun().runtime.events).toEqual([]);
});

test('production adapter projects handoff, profile, failed retry and tool completion automatically', async () => {
    const id = startRun({ mode: 'spec' });
    await runRoutedLegacyWorkflow(async function* () {
        try { yield modelIntent(async () => { throw new Error('private failure'); }, { taskMessages: [], apiPresetName: 'chosen' }); } catch { /* legacy retry */ }
        yield toolIntent('read', {}, {}, async () => 'private result');
        return yield modelIntent(async () => 'done', { taskMessages: [], apiPresetName: 'chosen' });
    }, { graph: createLegacyAgentGraph('spec', [{ id: 'worker' }]), toAgentId: 'spec/agent/worker', parentRunId: id,
        task: 'private task', reason: 'stage_dispatch' });
    const runtime = getCurrentRun().runtime, run = runtime.runs[0];
    expect(run.handoffs).toHaveLength(1);
    expect(run.contexts[0].modelProfile.apiPresetName).toBe('chosen');
    expect(run.effects.filter(e => e.type === 'model.request').map(e => e.status)).toEqual(['failed', 'completed']);
    expect(run.effects.find(e => e.toolName === 'read').status).toBe('completed');
    expect(JSON.stringify(runtime)).not.toMatch(/private/);
    expect(replayRuntimeEvents(runtime.events)).toEqual(runtime);
});

test('late async result remains observable after adapter cleanup without allowing the next effect', async () => {
    const controller = new AbortController(), pending = deferred(), started = deferred(); let writes = 0;
    const id = startRun({ mode: 'spec', abortFn: () => controller.abort() });
    const running = runRoutedLegacyWorkflow(async function* () {
        yield modelIntent(() => { started.resolve(); return pending.promise; }, { taskMessages: [] });
        yield toolIntent('write', {}, {}, async () => { writes++; });
    }, { graph: createLegacyAgentGraph('spec', [{ id: 'worker' }]), toAgentId: 'spec/agent/worker', parentRunId: id,
        task: 'task', reason: 'stage_dispatch', signal: controller.signal });
    await started.promise; requestRunStop(id);
    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    pending.resolve('late'); await new Promise(resolve => setTimeout(resolve, 0));
    expect(getCurrentRun().runtime.events.some(e => e.type === 'effect.stale')).toBe(true);
    expect(getCurrentRun().runtime.runs[0].status).toBe('cancelled');
    expect(writes).toBe(0);
});
