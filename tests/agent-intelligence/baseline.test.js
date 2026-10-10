import { beforeAll, describe, expect, test } from '@jest/globals';
import { CASES, hash, loadFixture, makeCase, selectCases, validateCase } from './cases.js';
import { runBaseline } from './runner.js';
import { summarize, validateReport, validateMeasurements } from './report.js';
import { PilotBudget } from './budget.js';

let baseline;
beforeAll(async () => { baseline = await runBaseline(); });
const edit = change => { const report = JSON.parse(JSON.stringify(baseline.report)); change(report); return report; };

describe('S01 real entrypoint scripted baseline', () => {
    test('all 12 isolated cases execute both development and promotion paths', () => {
        const { report } = baseline;
        expect(report.trials).toHaveLength(12);
        expect(report.trials.every(trial => trial.executionStatus === 'passed' && trial.authorityStatus === 'passed')).toBe(true);
        expect(report.summary).toMatchObject({ executedTrials: 12, generationCalls: 24, toolCalls: 36, externalProviderCalls: 0, deterministic: { passed: 44, failed: 0 }, behavior: { not_run: 14 }, totalTokensStatus: 'unavailable', usageMissingTrials: 12 });
        expect(report.empiricalReady).toBe(false);
        expect(validateReport(JSON.parse(JSON.stringify(report)))).toEqual(report);
        expect(validateMeasurements(JSON.parse(JSON.stringify(baseline.sidecar)), report)).toEqual(baseline.sidecar);
    });
    test('player ownership and late completion results are observed through takeover', () => {
        const variants = baseline.report.trials.filter(item => item.caseId.startsWith('rp_variant'));
        expect(variants).toHaveLength(2);
        for (const trial of variants) {
            expect(trial.refs.messageVariants.map(item => item.variantId)).toEqual(['v1', 'v2']);
            expect(trial.evidence.find(item => item.evidenceId.endsWith(':stale_completion')).value.observed).toMatchObject({ rejected: true, oldStatus: 'aborted' });
        }
    });
    test('human conflicts retain original base and zero agent changesets', () => {
        for (const trial of baseline.report.trials.filter(item => item.caseId.startsWith('project_conflict'))) {
            expect(trial.evidence.find(item => item.evidenceId.endsWith(':no_silent_rebase')).value.observed).toMatchObject({ status: 'conflict', writes: 0, error: 'project_revision_conflict' });
            expect(trial.refs.effectIds).toEqual([]);
        }
    });
    test('real validation errors lead to blocked or explicit reviewer commit', () => {
        const blocked = baseline.report.trials.find(item => item.caseId === 'project_repair_d1');
        const repaired = baseline.report.trials.find(item => item.caseId === 'project_repair_p1');
        expect(blocked.evidence.find(item => item.evidenceId.endsWith(':repair_bound')).value.observed).toEqual({ statuses: ['repair', 'blocked'], round: 2, closed: true, writes: 0 });
        expect(repaired.evidence.find(item => item.evidenceId.endsWith(':repair_bound')).value.observed).toEqual({ statuses: ['repair', 'review'], round: 1, formalWrites: 1, receiptReplayed: true });
        expect(repaired.refs.effectIds).toHaveLength(1);
    });
    test('fixtures have distinct promotion inputs and revision drift is rejected', () => {
        expect(CASES).toHaveLength(12);
        for (const family of ['rp_agency', 'rp_memory', 'rp_variant', 'project_authoring', 'project_conflict', 'project_repair']) {
            expect(makeCase(family, 'development').inputHash).not.toBe(makeCase(family, 'promotion').inputHash);
        }
        expect(() => validateCase({ ...CASES[0], caseRevision: 'latest' })).toThrow();
        expect(() => validateCase({ ...CASES[0], rubricRevision: hash('different rubric') })).toThrow();
        expect(() => validateCase({ ...CASES[0], limits: { maxRequests: 7, maxRepairRounds: 2 } })).toThrow();
        expect(() => validateCase({ ...CASES[0], fixtureHash: hash('different fixture') })).toThrow();
    });
    test('extraction cannot obtain promotion fixture through the consumer', () => {
        expect(selectCases({ purpose: 'extraction', split: 'development' })).toHaveLength(6);
        expect(() => selectCases({ purpose: 'extraction', split: 'promotion' })).toThrow('evaluator-only');
        expect(() => loadFixture(CASES.find(item => item.split === 'promotion'), { purpose: 'extraction' })).toThrow();
        expect(() => selectCases({ purpose: 'evaluation' })).toThrow();
    });
});

describe('strict report consumer rejects corrupt evidence', () => {
    test.each([
        ['unknown report schema', report => { report.schemaVersion = 2; }],
        ['unversioned side field', report => { report.futureCapture = true; }],
        ['unknown trial schema', report => { report.trials[0].schemaVersion = 2; }],
        ['unknown trial field', report => { report.trials[0].modelName = 'invented'; }],
        ['unknown case ref', report => { report.trials[0].caseId = 'invented'; }],
        ['case revision drift', report => { report.trials[0].caseRevision = hash('new case'); }],
        ['case set drift', report => { report.cases[0].inputHash = hash('new input'); }],
        ['duplicate trial ID', report => { report.trials[1].trialId = report.trials[0].trialId; report.trialRefs[1] = report.trialRefs[0]; }],
        ['unknown trial ref', report => { report.trialRefs[0] = 'unknown'; }],
        ['mixed modes', report => { report.trials[0].executionMode = 'model'; }],
        ['mixed product heads', report => { report.trials[0].testedProductHead = 'a'.repeat(40); }],
        ['mixed adapters', report => { report.trials[0].adapterRevision = 'invented-adapter'; }],
        ['forged empirical success', report => { report.empiricalReady = true; }],
        ['fake zero usage', report => { report.trials[0].usage.totalTokens = 0; }],
        ['hidden missing usage', report => { report.trials[0].completeness = report.trials[0].completeness.filter(item => item !== 'usage'); }],
        ['scripted provider usage', report => { report.trials[0].usage.externalProviderCalls = 1; }],
        ['fake request count', report => { report.trials[0].metrics.generationCalls++; }],
        ['fake aggregate', report => { report.summary.deterministic.passed++; }],
        ['success without evidence', report => { report.trials[0].checks.player_ownership.evidenceRefs = []; }],
        ['unknown evidence', report => { report.trials[0].checks.player_ownership.evidenceRefs = ['unknown']; }],
        ['wrong ownership', report => { report.trials[0].evidence.find(item => item.evidenceId.endsWith(':player_ownership')).value.observed.player = 'changed-player'; }],
        ['unknown status', report => { report.trials[0].authorityStatus = 'ok'; }],
        ['forged behavioral score', report => { report.trials[0].behavior.player_agency.score = 2; }],
        ['cross-run variant', report => { report.trials[0].refs.messageVariants[0].runId = 'other-run'; }],
        ['request shared between variants', report => { const trial = report.trials.find(item => item.caseId === 'rp_variant_d1'); trial.refs.messageVariants[1].requestIds = trial.refs.messageVariants[0].requestIds; }],
        ['unanchored request', report => { report.trials[0].refs.messageVariants = []; }],
        ['duplicate request across trials', report => { report.trials[1].refs.requestIds = report.trials[0].refs.requestIds; report.trials[1].refs.messageVariants[0].requestIds = report.trials[0].refs.requestIds; }],
        ['missing coverage', report => { report.trials.pop(); report.trialRefs.pop(); report.summary = summarize(report.trials); }],
        ['non JSON-safe', report => { report.trials[0].metrics.latencyMs = NaN; }],
    ])('%s', (_name, change) => { expect(() => validateReport(edit(change))).toThrow(); });
    test('failed evidence is retained in the denominator and authority cannot pass', () => {
        const report = edit(report => {
            const trial = report.trials[0];
            trial.evidence.find(item => item.evidenceId.endsWith(':player_ownership')).value.observed.player = 'wrong-owner';
            trial.checks.player_ownership.status = 'failed'; trial.authorityStatus = 'failed';
            report.summary = summarize(report.trials);
        });
        expect(validateReport(report).summary.deterministic.failed).toBe(1);
        report.trials[0].authorityStatus = 'passed'; expect(() => validateReport(report)).toThrow();
    });
    test.each(['schema', 'trial', 'request', 'count'])('rejects sidecar %s drift', kind => {
        const sidecar = JSON.parse(JSON.stringify(baseline.sidecar));
        if (kind === 'schema') sidecar.schemaVersion++;
        if (kind === 'trial') sidecar.trials[0].trialId = 'unknown';
        if (kind === 'request') sidecar.trials[0].callGraph[0].requestId = 'unknown';
        if (kind === 'count') sidecar.trials.pop();
        expect(() => validateMeasurements(sidecar, baseline.report)).toThrow();
    });
});

describe('model pilot missing/finite budget state', () => {
    test('missing finite config preserves all six unexecuted slots without network', async () => {
        const oldFetch = globalThis.fetch; const oldAtria = globalThis.Atria;
        const { report } = await runBaseline({ mode: 'model' });
        expect(report.trials).toHaveLength(6);
        expect(report.trials.every(item => item.executionStatus === 'budget_blocked')).toBe(true);
        expect(report.summary.executedTrials).toBe(0); expect(report.empiricalReady).toBe(false);
        expect(globalThis.fetch).toBe(oldFetch); expect(globalThis.Atria).toBe(oldAtria);
    });
    test('finite limits alone do not create a live route or empirical evidence', async () => {
        const { report } = await runBaseline({ mode: 'model', pilot: { maxRequests: 36, maxTotalTokens: 10000 } });
        expect(report.trials.every(item => item.executionStatus === 'unavailable')).toBe(true);
        expect(report.reasonCode).toBe('configured_generation_bridge_unavailable');
    });
    test('mixed exact configurations in repeated pilot trials are rejected', async () => {
        const { report } = await runBaseline({ mode: 'model' });
        report.trials[1].configuration.promptHash = hash('other prompt');
        const { fingerprint, ...config } = report.trials[1].configuration;
        report.trials[1].configuration.fingerprint = hash(config);
        expect(() => validateReport(report)).toThrow('Mixed case configuration');
    });
    test.each([{}, { maxRequests: Infinity, maxTotalTokens: 100 }, { maxRequests: 37, maxTotalTokens: 100 }, { maxRequests: 36, maxTotalTokens: 0 }])('refuses invalid pilot %j', config => {
        expect(() => new PilotBudget(config)).toThrow();
    });
    test('reservation blocks before send and missing/cancelled usage never refunds', () => {
        const budget = new PilotBudget({ maxRequests: 4, maxTotalTokens: 100 });
        const reserve = (requestId, kind = 'model') => budget.reserve({ requestId, trialId: 'trial', inputTokens: 20, reservedOutput: 30, kind });
        expect(reserve('first').status).toBe('passed'); budget.settle('first');
        expect(reserve('second', 'retry').status).toBe('passed'); budget.settle('second', null);
        expect(reserve('third', 'fallback').status).toBe('budget_blocked');
        expect(budget.snapshot()).toMatchObject({ requests: 2, tokens: 100, entries: { first: { usageStatus: 'reserved_upper_bound' } } });
        expect(() => budget.settle('first', { totalTokens: 0 })).toThrow();
        expect(() => reserve('first')).toThrow();
    });
    test('provider usage releases only verified excess reservation', () => {
        const budget = new PilotBudget({ maxRequests: 1, maxTotalTokens: 100 });
        budget.reserve({ requestId: 'one', trialId: 'trial', inputTokens: 20, reservedOutput: 80 });
        expect(() => budget.settle('one', { totalTokens: 101 })).toThrow();
        budget.settle('one', { totalTokens: 30 }); expect(budget.snapshot().tokens).toBe(30);
        expect(budget.reserve({ requestId: 'two', trialId: 'trial', inputTokens: 1, reservedOutput: 1 }).status).toBe('budget_blocked');
    });
    test('all attempt kinds and independent graders share the hard pilot cap', () => {
        const budget = new PilotBudget({ maxRequests: 42, maxTotalTokens: 1000, modelJudge: true });
        for (let trial = 0; trial < 6; trial++) {
            for (let attempt = 0; attempt < 6; attempt++) expect(budget.reserve({ requestId: `${trial}:${attempt}`, trialId: String(trial), inputTokens: 1, reservedOutput: 1, kind: ['model', 'retry', 'fallback'][attempt % 3] }).status).toBe('passed');
            expect(budget.reserve({ requestId: `${trial}:over`, trialId: String(trial), inputTokens: 1, reservedOutput: 1 }).status).toBe('budget_blocked');
            expect(budget.reserve({ requestId: `${trial}:judge`, trialId: String(trial), inputTokens: 1, reservedOutput: 1, kind: 'grader' }).status).toBe('passed');
        }
        expect(budget.reserve({ requestId: 'seventh', trialId: '7', inputTokens: 1, reservedOutput: 1 }).status).toBe('budget_blocked');
        expect(budget.snapshot().requests).toBe(42);
    });
    test('missing preview count, duplicate IDs, and unconfigured graders fail closed', () => {
        const budget = new PilotBudget({ maxRequests: 6, maxTotalTokens: 100 });
        expect(() => budget.reserve({ requestId: 'r', trialId: 't', reservedOutput: 10 })).toThrow();
        expect(() => budget.reserve({ requestId: 'r', trialId: 't', inputTokens: 1, reservedOutput: 10, kind: 'grader' })).toThrow();
        expect(new PilotBudget().reserve({ requestId: 'r' }).status).toBe('budget_blocked');
    });
});
