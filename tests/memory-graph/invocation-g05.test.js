import { expect, test } from '@jest/globals';
import { memoryInvocationDecision } from '../../public/scripts/agents/memory/invocation-policy.js';

const evidence = [{ text: '因为暴雨，艾琳离开了港口。', episodeIds: ['a'] }, { text: '因为承诺，艾琳前往城堡。', episodeIds: ['b'] }];
test('G05 rules do not add a classifier or rerank to ordinary, unknown or single-source evidence', () => {
    const configured = { configured: true, computeContext: { kind: 'session' } };
    expect(memoryInvocationDecision({ intent: 'location' }, evidence, configured).action).toBe('skip');
    expect(memoryInvocationDecision({ intent: 'cause' }, [], configured).reason).toBe('causal_evidence_unknown');
    expect(memoryInvocationDecision({ intent: 'cause' }, [evidence[0], { ...evidence[0], kind: 'fact' }], configured).reason).toBe('single_causal_source');
    expect(memoryInvocationDecision({ intent: 'cause' }, evidence, { configured: true }).reason).toBe('budget_authority_unavailable');
    expect(memoryInvocationDecision({ intent: 'cause' }, evidence, configured)).toMatchObject({ action: 'rerank', reason: 'competing_causal_sources' });
});
