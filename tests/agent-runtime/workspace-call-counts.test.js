import { test, expect } from '@jest/globals';
import { workspaceRunView } from '../../public/scripts/lib/agent-workspace/projection.js';

const event = (type, effectId, extra = {}) => ({ type, effectId, runId: 'worker', nodeId: 'owner', stepId: 'one', ...extra });
const run = events => ({ runId: 'panel', runtime: { runs: [], events } });

test('Atria model and memory calls count as internal even without tool execution', () => {
    expect(workspaceRunView(run([
        event('memory.recall.completed', 'memory'),
        event('model.request.completed', 'model'),
    ])).calls).toEqual({ internal: 2, external: 0 });
});

test('starts count immediately; completion, replay and resume never double count a logical call', () => {
    const events = [
        event('model.request.started', 'model'), event('model.request.completed', 'model'),
        event('model.request.completed', 'model', { generation: 2 }),
        event('tool.execute.started', 'tool'), event('tool.execute.completed', 'tool', { ok: false }),
        event('tool.execute.started', 'running'), event('effect.failed', 'running'),
        event('policy.advance.completed', 'policy'), event('context.compiled', 'context'),
    ];
    expect(workspaceRunView(run(events)).calls).toEqual({ internal: 1, external: 2 });
});

test('counters respect node/step filters and separate child-run identities', () => {
    const snapshot = run([
        event('model.request.completed', 'same'),
        event('tool.execute.completed', 'same', { runId: 'child' }),
        event('model.request.started', 'next', { stepId: 'two' }),
        event('tool.execute.completed', 'other', { nodeId: 'other' }),
    ]);
    expect(workspaceRunView(snapshot, { runId: 'panel', nodeId: 'owner', stepId: 'one' }).calls)
        .toEqual({ internal: 1, external: 1 });
    expect(workspaceRunView(snapshot, { runId: 'old', nodeId: 'owner' }).calls)
        .toEqual({ internal: 2, external: 2 });
});

test('empty and old metadata-only traces remain readable', () => {
    expect(workspaceRunView(null).calls).toEqual({ internal: 0, external: 0 });
    expect(workspaceRunView(run([{ type: 'tool.execute.completed' }])).calls)
        .toEqual({ internal: 0, external: 1 });
});
