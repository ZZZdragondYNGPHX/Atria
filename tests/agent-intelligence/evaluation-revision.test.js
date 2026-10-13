import { expect, jest, test } from '@jest/globals';
import { fileURLToPath } from 'node:url';

const fs = jest.requireActual('node:fs');
let changedSource = null;
jest.unstable_mockModule('node:fs', () => ({ ...fs, readFileSync(file, options) {
    const value = fs.readFileSync(file, options);
    return changedSource && file instanceof URL && fileURLToPath(file) === changedSource ? value + '\n// changed execution semantics\n' : value;
} }));
const { evolutionEvaluatorRevision, promotionDecision } = await import('../../src/native/agent-intelligence/evolution-evaluator.js');
const { EVOLUTION_RULE } = await import('../../src/native/agent-intelligence/evolution-repository.js');
const { CASE_SET_REVISION } = await import('../../src/native/agent-intelligence/evaluation/cases.js');

test.each(['../../src/native/skill-invocation.js', '../../src/native/retrieval-compute.js', '../../src/native/run-control.js', '../../public/shared/native-compute-budget.js', '../../src/native/model-prompt-runtime/execution-utils.js'])('evaluator rejects an earlier report after %s source bytes change', dependency => {
    const revision = evolutionEvaluatorRevision();
    const report = { origin: 'host_evaluator', schemaVersion: 1, evaluatorRevision: revision, caseSetRevision: CASE_SET_REVISION,
        rule: EVOLUTION_RULE, domain: 'project', policyFingerprint: 'policy', targetPin: 'target', pairs: [], charges: [], price: null };
    const context = { policyFingerprint: 'policy', targetPin: 'target' };
    expect(promotionDecision(report, context).reasons).not.toContain('evaluation_identity_missing_or_changed');
    try {
        changedSource = fileURLToPath(new URL(dependency, import.meta.url));
        expect(evolutionEvaluatorRevision()).not.toBe(revision);
        expect(promotionDecision(report, context)).toEqual({ eligible: false, reasons: ['evaluation_identity_missing_or_changed'] });
    } finally { changedSource = null; }
    expect(evolutionEvaluatorRevision()).toBe(revision);
});
