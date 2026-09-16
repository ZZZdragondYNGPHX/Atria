import { test, expect } from '@jest/globals';
import { compilePreset } from '../../public/scripts/extensions/orchestrator/engine-v2/preset-compiler.js';
import { createPolicyController, initialPolicyState } from '../../public/scripts/lib/orchestration-engine/index.js';

test('legacy parallel stages compile without mutating preset and repeated IDs retain slots', () => {
    const profile = { spec: { stages: [
        { mode: 'parallel', nodes: ['a', 'b'] }, { mode: 'serial', nodes: ['a'] },
    ] }, presets: { a: { systemPrompt: 'one' }, b: { systemPrompt: 'two' } } };
    const before = JSON.stringify(profile);
    const plan = compilePreset(profile);
    const policy = createPolicyController(plan);
    const first = policy.advance({ policyState: initialPolicyState(plan), runSnapshot: { runId: 'r' } });
    expect(first.intent.branches.map(branch => branch.toAgentId)).toEqual(['agent:stage:0/node:0', 'agent:stage:0/node:1']);
    expect(plan.scheduler.reviewMaxRounds).toBe(0);
    expect(JSON.stringify(profile)).toBe(before);
});

test.each(['loop', 'director', 'agenda'])('compiler records explicit output ownership for %s', mode => {
    const plan = compilePreset({ mode, agents: { final: {} }, finalAgentId: 'final', mainAgent: {} });
    expect(plan.output.kind).toBe(mode === 'director' ? 'reply' : 'guidance');
    expect(plan.nodes.find(node => node.nodeId === plan.output.ownerNodeId)).toBeTruthy();
});
