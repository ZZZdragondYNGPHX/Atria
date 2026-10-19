import { expect, test } from '@jest/globals';
import { assertAssessment, assertRefusalDiagnosis, QUALITY_PROFILES, qualityRef, requirePilotSources, qualityEnvelope } from '../../src/native/agent-intelligence/evaluation/quality.js';
import { promotionDecision } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { evolutionHash as hash } from '../../src/native/agent-intelligence/evolution-repository.js';
import { selectCases } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { syntheticReport, price } from './evolution-fixture.js';

const producer = { modelId: 'fixture', configurationHash: hash('config'), requestHash: hash('request'), snapshotHash: hash('snapshot'), chargeId: 'fixture-charge' };
test('literary, Agent and creative-refusal profiles expose separate dimensions without claiming reviewed sources', () => {
    expect(QUALITY_PROFILES['rp.narrative'].dimensions).toContain('long_horizon_consistency');
    expect(QUALITY_PROFILES['rp.narrative'].criticalDimensions).toContain('player_agency');
    expect(QUALITY_PROFILES['rp.narrative'].criticalDimensions).not.toContain('narrative_craft');
    expect(QUALITY_PROFILES['project.agent'].criticalDimensions).toContain('approval_authority');
    expect(QUALITY_PROFILES['rp.creative_refusal'].sourceRequirements).toContain('negative_control');
    for (const id of ['rp.narrative', 'project.agent', 'rp.creative_refusal']) expect(() => requirePilotSources(id)).toThrow('source_unready');
});
test('model literary observations support all profile dimensions and retain quoted refusal suspicions', () => {
    const assessment = { profile: qualityRef('rp.narrative'), purpose: 'development', producer,
        claims: QUALITY_PROFILES['rp.narrative'].dimensions.map(dimension => ({ dimension, sourceHash: hash('source'), quote: 'Observed passage' })) };
    expect(assertAssessment(assessment, 'rp', 'model_assessment', 'suspected_failure')).toBe(assessment);
    const refusal = { profile: qualityRef('rp.creative_refusal'), purpose: 'development', producer,
        claims: [{ dimension: 'unwarranted_refusal', sourceHash: hash('source'), quote: 'Observed passage', refusal: { classification: 'under-responsive_prose', support: 'unverified' } }] };
    expect(assertAssessment(refusal, 'rp', 'model_assessment', 'suspected_failure')).toBe(refusal);
    refusal.claims[0].refusal.classification = 'provider_explicit_block';
    expect(() => assertAssessment(refusal, 'rp', 'model_assessment', 'suspected_failure')).toThrow('attribution');
    expect(() => assertRefusalDiagnosis({ classification: 'model_avoidance_suspected', support: 'rule_verified' }, 'model_assessment')).toThrow('attribution');
    expect(() => assertRefusalDiagnosis({ classification: 'model_avoidance_suspected', support: 'reproduced' }, 'model_assessment')).toThrow('attribution');
    expect(() => assertAssessment(assessment, 'rp', 'model_assessment', 'verified_failure')).toThrow('provenance');
});
function reportWithOneRepetition() {
    const report = syntheticReport({ id: 'quality-vector', domain: 'rp', price }, { baseline: {}, candidate: {} }, { baseline: {}, candidate: {} });
    report.pairs = report.pairs.filter(pair => pair.repetition === 1);
    report.selection = { split: 'promotion', repetitions: 1 };
    for (const pair of report.pairs) pair.human = { pairHash: pair.pairHash, preference: 'candidate', deltas: { ...pair.judge.deltas } };
    return report;
}
test('sampling does not require three repetitions or six wins; hard regressions cannot be offset by other wins', () => {
    const report = reportWithOneRepetition();
    expect(promotionDecision(report).eligible).toBe(true);
    const pair = report.pairs[0]; pair.human.deltas.player_agency = -1;
    expect(promotionDecision(report).reasons).toContain('behavior_regression_or_ungraded');
});
test('a shortened sample does not acquire independent-source status or hide missing/duplicate case coverage', () => {
    const report = reportWithOneRepetition();
    report.schemaVersion = 2;
    report.quality = qualityEnvelope('rp', selectCases({ purpose: 'evaluation', split: 'promotion' }).filter(c => c.entrance === 'rp'), 'promotion');
    expect(promotionDecision(report).reasons).toContain('source_unready');
    report.pairs[1] = report.pairs[0];
    expect(promotionDecision(report).reasons).toContain('independent_cases_incomplete');
});
