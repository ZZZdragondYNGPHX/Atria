import { beforeAll, expect, test } from '@jest/globals';
import { runComparison, validateComparison, blindPair, recordJudgment } from './comparison.js';
import { BASE_SETTINGS, assertCandidate } from './evaluation-settings.js';
import { withSyntheticSessionCopies } from './session-copy.js';
import { hash } from './cases.js';
import { selectCases, loadFixture } from './cases.js';
import { captureFor, withIsolatedRuntime } from './runner.js';

let development, promotion;
beforeAll(async () => {
    development = await runComparison({ candidate: { target: 'rpPrompt', value: 'React as the NPC. Leave the player action undecided.' }, split: 'development' });
    promotion = await runComparison({ candidate: { target: 'projectSkill', value: 'Inspect metadata, prepare the exact proposal, then wait for human Review.' }, split: 'promotion', repetitions: 2 });
}, 30000);

test('both entrances run fresh paired copies with observed request content and no empirical claim', () => {
    for (const report of [development, promotion]) {
        expect(validateComparison(JSON.parse(JSON.stringify(report)))).toEqual(report);
        expect(report.summary).toMatchObject({ status: 'structural_only', externalProviderCalls: 0, deterministic: { failed: 0 }, totalTokensStatus: 'unavailable', tokenDelta: null, costDelta: null });
        expect(report.empiricalReady).toBe(false); expect(report.publicationStatus).toBe('ineligible');
        for (const pair of report.pairs) {
            expect(pair.baseline.artifact.sourceHash).toBe(pair.candidate.artifact.sourceHash);
            expect(pair.baseline.artifact.targetConsumed).toBe(true);
            expect(pair.candidate.artifact.targetConsumed).toBe(true);
            expect(pair.baseline.trial.refs.requestIds).not.toEqual(pair.candidate.trial.refs.requestIds);
            expect(pair.baseline.trial.checks.isolation.status).toBe('passed');
            expect(pair.candidate.trial.checks.isolation.status).toBe('passed');
        }
    }
    expect(development.summary).toMatchObject({ pairCount: 6, generationCalls: 24, toolCalls: 36 });
    expect(promotion.summary).toMatchObject({ pairCount: 12, generationCalls: 48, toolCalls: 72 });
    expect(development.ablations.map(item => item.status)).toEqual(['unavailable', 'unavailable', 'unavailable', 'scripted_observation']);
});

test('real configuration limits affect the original loop; incomplete outcomes stay failed', async () => {
    const report = await runComparison({ candidate: { target: 'roundLimit', value: 1 }, split: 'development' });
    expect(report.summary.status).toBe('failed');
    expect(report.pairs.filter(pair => pair.caseId.startsWith('project_')).every(pair => pair.candidate.trial.metrics.generationCalls === 1)).toBe(true);
    expect(report.pairs.some(pair => pair.candidate.trial.authorityStatus === 'failed')).toBe(true);
});

test('shared finite send budget stops before sends and retains all later slots', async () => {
    const report = await runComparison({ candidate: { target: 'roundLimit', value: 5 }, split: 'development', maxRequests: 1 });
    expect(report.pairs).toHaveLength(6);
    expect(report.summary.generationCalls).toBe(1);
    expect(report.pairs.slice(1).flatMap(pair => [pair.baseline.trial, pair.candidate.trial]).every(trial => trial.executionStatus === 'budget_blocked')).toBe(true);
    expect(report.summary.totalTokensStatus).toBe('unavailable');
});

test('model mode keeps every requested baseline/candidate slot blocked or unavailable without live calls', async () => {
    for (const pilot of [null, { maxRequests: 36, maxTotalTokens: 10000 }]) {
        const report = await runComparison({ candidate: { target: 'roundLimit', value: 5 }, split: 'promotion', repetitions: 3, mode: 'model', pilot });
        expect(report.pairs).toHaveLength(18);
        expect(report.pairs.every(pair => [pair.baseline, pair.candidate].every(arm => arm.trial.executionStatus === (pilot ? 'unavailable' : 'budget_blocked')))).toBe(true);
        expect(report.summary.generationCalls).toBe(0); expect(report.empiricalReady).toBe(false);
    }
});

test('human observations are blinded, bound, and disagreements require review without creating behavior grades', () => {
    const pairId = promotion.pairs[0].pairId;
    const blind = blindPair(promotion, pairId, { purpose: 'evaluation' });
    expect(Object.keys(blind).sort()).toEqual(['binding', 'left', 'pairId', 'right']);
    let report = recordJudgment(promotion, { pairId, binding: blind.binding, judgeId: 'reviewer_a', source: 'human', preference: 'left' });
    report = recordJudgment(report, { pairId, binding: blind.binding, judgeId: 'reviewer_b', source: 'human', preference: 'right' });
    expect(report.pairs[0].judge).toMatchObject({ status: 'awaiting_review', preference: null, disagreements: ['reviewer_a', 'reviewer_b'] });
    expect(report.empiricalReady).toBe(false);
    expect(() => recordJudgment(report, report.judgments[0])).toThrow('Duplicate');
    expect(() => recordJudgment(report, { ...report.judgments[0], judgeId: 'model', source: 'model' })).toThrow();
    expect(() => blindPair(promotion, pairId, { purpose: 'extraction' })).toThrow('evaluator-only');
});

test.each([
    ['unknown schema', report => { report.schemaVersion = 2; }],
    ['unknown field', report => { report.owner = 'production'; }],
    ['missing pair', report => { report.pairs.pop(); }],
    ['duplicate pair', report => { report.pairs[1] = report.pairs[0]; }],
    ['wrong split', report => { report.split = 'promotion'; }],
    ['fixture drift', report => { report.pairs[0].candidate.envelope.fixtureHash = hash('other'); }],
    ['rubric drift', report => { report.pairs[0].baseline.envelope.rubricRevision = hash('other'); }],
    ['settings drift', report => { report.pairs[0].candidate.envelope.settingsHash = hash(BASE_SETTINGS); }],
    ['mixed head', report => { report.pairs[0].candidate.trial.testedProductHead = 'a'.repeat(40); }],
    ['shared request', report => { report.pairs[0].candidate.trial.refs.requestIds = report.pairs[0].baseline.trial.refs.requestIds; }],
    ['swapped arms', report => { [report.pairs[0].baseline, report.pairs[0].candidate] = [report.pairs[0].candidate, report.pairs[0].baseline]; }],
    ['mixed source', report => { report.pairs[0].candidate.artifact.sourceHash = hash('foreign'); }],
    ['both forged sources', report => { report.pairs[0].candidate.artifact.sourceHash = report.pairs[0].baseline.artifact.sourceHash = hash('foreign'); }],
    ['output edit', report => { report.pairs[0].candidate.artifact.output = 'changed'; }],
    ['consumed target missing', report => { report.pairs[0].candidate.artifact.targetConsumed = false; }],
    ['request evidence drift', report => { report.pairs[0].candidate.artifact.requestHashes[0] = hash('other'); }],
    ['forged usage', report => { report.pairs[0].candidate.trial.usage.totalTokens = 0; }],
    ['forged summary', report => { report.summary.generationCalls++; }],
    ['forged eligibility', report => { report.empiricalReady = true; }],
    ['forged publication', report => { report.publicationStatus = 'eligible'; }],
    ['forged judge', report => { report.pairs[0].judge.preference = 'left'; }],
    ['unsupported ablation', report => { report.ablations[0].status = 'passed'; }],
])('consumer rejects %s', (_name, change) => {
    const report = structuredClone(development); change(report);
    expect(() => validateComparison(report)).toThrow();
});

test.each([
    { target: 'tools', value: '*' }, { target: 'rpPrompt', value: '' }, { target: 'roundLimit', value: 7 },
    { target: 'roundLimit', value: 6 }, { target: 'projectSkill', value: 'text', permission: 'commit' },
])('rejects unauthorized, unbounded or unchanged target %j', candidate => { expect(() => assertCandidate(candidate)).toThrow(); });

test('isolated Studio bridge rejects publication, model Commit, foreign projects, network and wrong methods', async () => {
    const originalFetch = globalThis.fetch; let leaked = 0;
    globalThis.fetch = async () => { leaked++; throw new Error('Unexpected real transport'); };
    try {
        await withIsolatedRuntime(async () => {
            const { runProject } = await import('./adapters.js');
            const entry = selectCases({ purpose: 'evaluation', split: 'development' }).find(item => item.caseId === 'project_authoring_d1');
            const capture = captureFor(entry, 'deny-boundary');
            await runProject(entry, loadFixture(entry, { purpose: 'evaluation' }), capture, {
                settings: BASE_SETTINGS, beforeSend: () => {}, probe: async ({ projectId, taskId }) => {
                    const base = `/api/native/studio/projects/${projectId}`;
                    for (const [url, method] of [[`${base}/agent/tasks/${taskId}/commit`, 'POST'], [`${base}/publish`, 'POST'],
                        [`${base}/agent/tasks/${taskId}`, 'DELETE'], ['/api/native/studio/projects/foreign', 'GET'], ['https://example.invalid', 'POST']]) {
                        await expect(globalThis.fetch(url, { method })).rejects.toThrow('isolated_route_denied');
                    }
                    const reply = await globalThis.fetch(`${base}/agent/tasks/${taskId}/tool`, { method: 'POST', body: JSON.stringify({ name: 'atri_agent_commit', args: {} }) });
                    expect(reply.status).toBe(400);
                },
            });
            expect(capture.checks.review_gate.status).toBe('passed');
            expect(capture.checks.isolation.status).toBe('passed');
            expect(capture.refs.effectIds).toHaveLength(1); // Explicit copy reviewer only.
        });
        expect(leaked).toBe(0);
    } finally { globalThis.fetch = originalFetch; }
});

test('Native Session copies retain exact save revision and isolate candidate branch/effects', async () => {
    const { result, proof } = await withSyntheticSessionCopies(async copies => {
        const { baseline, candidate } = copies;
        expect(baseline.core).not.toBe(candidate.core);
        expect(baseline.revisionId).toBe(candidate.revisionId);
        const before = await baseline.core.load(baseline.handle, baseline.sessionId);
        const changed = await candidate.core.appendTimeline(candidate.handle, candidate.sessionId, { role: 'user', content: 'Candidate copy only' }, { expectedRevisionId: candidate.revisionId });
        expect(hash(await baseline.core.load(baseline.handle, baseline.sessionId))).toBe(hash(before));
        await expect(candidate.core.appendTimeline(candidate.handle, candidate.sessionId, { role: 'user', content: 'Stale' }, { expectedRevisionId: candidate.revisionId })).rejects.toThrow();
        return changed.timeline.at(-1).content;
    });
    expect(result).toBe('Candidate copy only');
    expect(proof.sourceBefore).toBe(proof.sourceAfter);
    expect(proof.baselineInputHash).toBe(proof.candidateInputHash);
    expect(proof.generationStatus).toBe('unavailable');
});
