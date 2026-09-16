import { test, expect } from '@jest/globals';
import { CAPABILITIES } from '../../public/scripts/lib/orchestration-engine/capabilities.js';
import { emptyPresetLibrary, updatePresetLibrary, resolvePresetBinding, compileWorkspacePreset,
    importWorkspacePreset, exportWorkspacePreset } from '../../public/scripts/lib/agent-workspace/presets.js';
import { projectEngine, workspaceRunView } from '../../public/scripts/lib/agent-workspace/projection.js';

const caps = Object.fromEntries(CAPABILITIES.map(key => [key, true]));
const preset = () => ({ schemaVersion: 1, id: 'a', name: 'A', mode: 'loop', planTemplate: {
    schemaVersion: 1, planId: 'p', source: { mode: 'loop' }, agents: [{ id: 'owner', tools: [], capabilities: caps }],
    nodes: [{ nodeId: 'owner', agentId: 'owner', kind: 'agent', capabilities: caps }], edges: [], entryNodeId: 'owner', capabilities: caps,
    budgets: { maxSteps: 20, maxTasks: 10, maxConcurrency: 2 }, arbitration: { kind: 'pass-through' },
    output: { kind: 'guidance', ownerNodeId: 'owner', submitCapability: 'result.submit' },
} });

test('one definition resolves conversation > character > default without embedding copies', () => {
    let library = updatePresetLibrary(emptyPresetLibrary(), { type: 'save', preset: preset() });
    library = updatePresetLibrary(library, { type: 'duplicate', id: 'a', newId: 'b' });
    library = updatePresetLibrary(library, { type: 'bind', scope: 'default', presetId: 'a' });
    library = updatePresetLibrary(library, { type: 'bind', scope: 'character', subjectId: 'c', presetId: 'b' });
    library = updatePresetLibrary(library, { type: 'bind', scope: 'conversation', subjectId: 'chat', presetId: 'a' });
    expect(resolvePresetBinding(library, { character: 'c' })).toEqual({ presetId: 'b', selectionSource: 'character' });
    expect(resolvePresetBinding(library, { character: 'c', conversation: 'chat' })).toEqual({ presetId: 'a', selectionSource: 'conversation' });
    expect(library.bindings.entries[0]).toEqual({ scope: 'character', subjectId: 'c', presetId: 'b' });
    expect(() => updatePresetLibrary(library, { type: 'delete', id: 'a' })).toThrow('bound');
    const deleted = updatePresetLibrary(library, { type: 'delete', id: 'a', replacementId: 'b' });
    expect(deleted.bindings.defaultPresetId).toBe('b');
    expect(deleted.bindings.entries.every(entry => entry.presetId === 'b')).toBe(true);
    expect(library.presets).toHaveLength(2);
});

test('native import/export validates graphs and rejects host-profile definitions and dangling bindings', () => {
    const input = preset(); const plan = compileWorkspacePreset(input);
    expect(plan.planId).toBe('preset:a');
    expect(importWorkspacePreset(exportWorkspacePreset(input)).id).toBe('a');
    input.planTemplate.source.profile = { secret: 'legacy' };
    expect(() => compileWorkspacePreset(input)).toThrow('native');
    expect(() => updatePresetLibrary(emptyPresetLibrary(), { type: 'bind', scope: 'default', presetId: 'missing' })).toThrow('Unknown');
    const invalid = preset(); invalid.planTemplate.output.ownerNodeId = 'missing';
    expect(() => compileWorkspacePreset(invalid)).toThrow('owner');
    const runtime = preset(); runtime.planTemplate.taskGraph = [];
    expect(() => compileWorkspacePreset(runtime)).toThrow('Runtime state');
    expect(() => compileWorkspacePreset({ ...preset(), mode: 'single' })).toThrow('Spec template');
});

test('Engine projection explains capabilities and results without prompt or memory bodies', () => {
    const plan = compileWorkspacePreset(preset());
    const view = projectEngine(plan, { activeNodeIds: ['owner'], attempts: { owner: 2 }, graphRevision: 3,
        results: [{ resultId: 'r', nodeId: 'owner', value: 'SECRET', provenance: [{ childRunId: 'child', prompt: 'SECRET' }] }],
        history: 'SECRET', outputState: { value: 'SECRET', status: 'completed' } });
    expect(view.nodes[0]).toMatchObject({ status: 'running', attempts: 2 });
    expect(view.nodes[0].capabilities['reply.submit']).toBe(false);
    expect(view.results[0].provenance).toEqual([{ childRunId: 'child' }]);
    expect(JSON.stringify(view)).not.toContain('SECRET');
});

test('Memory linkage uses stable run/node/agent/step identities and clears cross-run selection', () => {
    const engine = projectEngine(compileWorkspacePreset(preset()));
    const run = { runId: 'run', runtime: { runs: [{ engine }], events: [
        { type: 'memory.recall.completed', runId: 'child', agentId: 'owner', stepId: 's', references: [{ id: 'f' }] },
    ] } };
    const view = workspaceRunView(run, { runId: 'run', nodeId: 'owner' });
    expect(view.recalls).toHaveLength(1);
    expect(view.memoryUsers('f')).toEqual([{ runId: 'child', agentId: 'owner', stepId: 's' }]);
    expect(workspaceRunView(run, { runId: 'old', nodeId: 'no' }).nodeId).toBeNull();
});
