import { test, expect } from '@jest/globals';
import { createWorkspaceFactoryPreset, workspaceHostProfile } from '../../public/scripts/extensions/orchestrator/workspace/host-presets.js';
import { removeWorkspaceAgent } from '../../public/scripts/extensions/orchestrator/workspace/agent-editing.js';
import { compileWorkspacePreset } from '../../public/scripts/lib/agent-workspace/presets.js';

test.each(['spec', 'agenda', 'director'])('%s deletion cleans references without mutating the saved preset', mode => {
    const preset = createWorkspaceFactoryPreset(mode, 'test');
    const before = JSON.stringify(preset);
    const removed = preset.planTemplate.nodes[1];
    const next = removeWorkspaceAgent(preset, removed.agentId);
    expect(JSON.stringify(preset)).toBe(before);
    expect(next.planTemplate.nodes.some(node => node.nodeId === removed.nodeId)).toBe(false);
    expect(next.planTemplate.edges.some(edge => [edge.from, edge.to].includes(removed.nodeId))).toBe(false);
    expect(next.planTemplate.agents.some(agent => agent.id === removed.agentId)).toBe(false);
    expect(() => workspaceHostProfile(next)).not.toThrow();
    if (mode === 'agenda') {
        expect(next.planTemplate.scheduler.workerAgentIds).not.toContain(removed.agentId);
        expect(next.planTemplate.scheduler.workerNodeIds[removed.agentId]).toBeUndefined();
    }
});

test('Spec removal reconnects a middle stage and compacts host stage slots', () => {
    const preset = createWorkspaceFactoryPreset('spec', 'test');
    const node = preset.planTemplate.nodes.find(node => node.metadata.stageId === 'review');
    const next = removeWorkspaceAgent(preset, node.agentId);
    const profile = workspaceHostProfile(next);
    expect(profile.spec.stages).toHaveLength(4);
    expect(profile.spec.stages.every(stage => stage.nodes.length && stage.nodes.every(Boolean))).toBe(true);
    expect(next.planTemplate.edges.filter(edge => edge.to === next.planTemplate.output.ownerNodeId)).toHaveLength(2);
});

test.each(['loop', 'single', 'agenda', 'director'])('%s required entry / last agent cannot be deleted', mode => {
    const preset = createWorkspaceFactoryPreset(mode, 'test');
    const entry = preset.planTemplate.nodes.find(node => node.nodeId === preset.planTemplate.entryNodeId);
    expect(() => removeWorkspaceAgent(preset, entry.agentId)).toThrow();
});

test('conditional and shared graph dependencies are not silently discarded', () => {
    const preset = createWorkspaceFactoryPreset('spec', 'test');
    const node = preset.planTemplate.nodes[1];
    preset.planTemplate.edges.find(edge => edge.to === node.nodeId).condition = 'approved';
    expect(() => removeWorkspaceAgent(preset, node.agentId)).toThrow('conditional');
});

test('deleting the Spec finalizer cannot silently turn a review node into a final writer', () => {
    const preset = createWorkspaceFactoryPreset('spec', 'test');
    const owner = preset.planTemplate.nodes.find(node => node.nodeId === preset.planTemplate.output.ownerNodeId);
    expect(() => removeWorkspaceAgent(preset, owner.agentId)).toThrow('new output owner');
});

test('an agent display name survives normalization without renaming its references', () => {
    const preset = createWorkspaceFactoryPreset('director', 'test');
    const agent = preset.planTemplate.agents[1];
    const id = agent.id;
    agent.name = 'Continuity editor';
    const plan = compileWorkspacePreset(preset);
    expect(plan.agents.find(agent => agent.id === id).name).toBe('Continuity editor');
    expect(plan.nodes.some(node => node.agentId === id)).toBe(true);
});


test('factory Workspace presets use least-privilege Web Access defaults', () => {
    // Workspace intentionally starts from the dependency-light Minimal
    // Director factory, so canon_scout is absent until the user selects or
    // authors a research-capable profile. Every shipped remaining specialist
    // must therefore start without Web Access.
    const director = workspaceHostProfile(createWorkspaceFactoryPreset('director', 'web-director'));
    expect(director.subAgents.find(agent => agent.id === 'canon_scout')).toBeUndefined();
    for (const agent of director.subAgents) {
        expect(agent.tools?.custom?.search_search).toBe(false);
        expect(agent.tools?.custom?.search_visit).toBe(false);
    }

    const loop = workspaceHostProfile(createWorkspaceFactoryPreset('loop', 'web-loop'));
    expect(loop.tools?.custom?.search_search).toBe(false);
    expect(loop.tools?.custom?.search_visit).toBe(false);

    const spec = workspaceHostProfile(createWorkspaceFactoryPreset('spec', 'web-spec'));
    for (const preset of Object.values(spec.presets)) {
        expect(preset.tools?.custom?.search_search).toBe(false);
        expect(preset.tools?.custom?.search_visit).toBe(false);
    }

    const agenda = workspaceHostProfile(createWorkspaceFactoryPreset('agenda', 'web-agenda'));
    for (const agent of Object.values(agenda.agents)) {
        expect(agent.tools?.custom?.search_search).toBe(false);
        expect(agent.tools?.custom?.search_visit).toBe(false);
    }
});
