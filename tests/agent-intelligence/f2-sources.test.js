import { expect, test } from '@jest/globals';
import { CASES, CASE_SET_REVISION, PILOT_CASES, PILOT_CASE_SET_REVISION, PILOT_RUBRIC, canonical, hash, selectCases, loadFixture, validateCase } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { DEVELOPMENT_SOURCES } from '../../src/native/agent-intelligence/evaluation/pilot-sources.js';
import { EvolutionEvaluator, promotionDecision } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { runRp, runProject } from '../../src/native/agent-intelligence/evaluation/adapters.js';
import { withIsolatedRuntime } from './runner.js';
import { evolutionFixture, restoreEvolutionFixture } from './evolution-fixture.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { validateF2Scope, runF2Domain, parseF2SourceAssessment, f2CalibrationMessages, f2SourceEvidence, reusableF2Calibration } from './m1-f2.js';

test('calibration reuse requires the actual judge configuration and exact control messages', () => {
    const control = { group: 'known_violation', flipped: false, messages: [{ role: 'user', content: 'control' }] };
    const config = { outputTokens: 8000 };
    const row = { passed: true, group: control.group, flipped: false, label: 'secondary', configurationHash: hash(config), messagesHash: hash(f2CalibrationMessages(control)) };
    expect(reusableF2Calibration(row, control, 'secondary', config)).toBe(true);
    expect(reusableF2Calibration(row, control, 'secondary', { outputTokens: 16384 })).toBe(false);
    expect(reusableF2Calibration(row, { ...control, flipped: true }, 'secondary', config)).toBe(false);
    expect(reusableF2Calibration({ ...row, passed: false }, control, 'secondary', config)).toBe(false);
});

const captureFor = entry => ({ trialId: 'f2:' + entry.caseId, refs: { runIds: [], requestIds: [], effectIds: [], taskIds: [], messageVariants: [] },
    prompts: [], evidence: [], checks: {}, completeness: [], toolCalls: 0, repairCount: 0,
    observe(name, observed, expected) { this.checks[name] = canonical(observed) === canonical(expected); this.evidence.push({ name, observed, expected }); } });

test('reviewed pilot sources retain the legacy catalogue and isolate original roots and template groups', () => {
    expect(CASES).toHaveLength(12);
    expect(CASE_SET_REVISION).toBe('49c56c12126aff08c83465f83412d2acb2aa6417e4183b25d7cbebe59f63b54b');
    expect(PILOT_CASES).toHaveLength(12); expect(PILOT_CASE_SET_REVISION).not.toBe(CASE_SET_REVISION);
    expect(new Set(PILOT_CASES.map(c => c.provenance.groupId)).size).toBe(12);
    expect(new Set(PILOT_CASES.map(c => c.provenance.templateGroup)).size).toBe(12);
    for (const entry of PILOT_CASES) {
        expect(entry.provenance).toMatchObject({ origin: 'agent_authored_synthetic', derivedFrom: [], independence: 'isolated_synthetic' });
        expect(entry.behaviorDimensions).toHaveLength(6);
        expect(entry.behaviorDimensions.every(d => typeof PILOT_RUBRIC[d] === 'string')).toBe(true);
        expect(entry.limits).toEqual({ maxRequests: 6, maxRepairRounds: 2 });
    }
});

test('extraction cannot access sealed promotion, arbitrary payloads or changed source pins', () => {
    expect(() => selectCases({ purpose: 'extraction', split: 'promotion', profileId: 'rp.m1.information' })).toThrow('evaluator-only');
    const promotion = PILOT_CASES.find(c => c.split === 'promotion');
    expect(() => loadFixture(promotion, { purpose: 'evaluation' })).toThrow('source_unready');
    expect(() => loadFixture(promotion, { purpose: 'extraction', sealedSource: {} })).toThrow('evaluator-only');
    expect(() => validateCase({ ...promotion, fixtureHash: hash('forged') })).toThrow('identity');
    expect(() => validateCase({ ...promotion, provenance: { ...promotion.provenance, groupId: 'new-name' } })).toThrow('identity');
});

test('baseline source probes cannot select promotion or become comparative eligibility', async () => {
    await expect(EvolutionEvaluator.prototype.probe.call({}, null, { domain: 'rp' }, null, null, null, null, undefined, undefined,
        { profileId: 'rp.m1.information', split: 'promotion', repetitions: 1, mode: 'source_probe' })).rejects.toThrow('Invalid source probe');
    await expect(EvolutionEvaluator.prototype.compare.call({}, null, null, null, null, null, null, undefined, undefined,
        { profileId: 'rp.m1.information', split: 'development', repetitions: 1 })).rejects.toThrow('source_unready');
    expect(promotionDecision({ origin: 'host_source_probe' }).eligible).toBe(false);
});

test('F2 configuration rejects source drift without reviving old packet quotas or Step permission', () => {
    const controls = { origin: 'engineering_control', controls: ['rp', 'project'].flatMap(domain => ['known_violation', 'counterfactual', 'missing_evidence'].flatMap(group => [false, true].map(flipped => {
        const entry = PILOT_CASES.find(c => c.entrance === domain && c.split === 'development');
        return { domain, group, flipped, expected: group === 'missing_evidence' ? 'uncertain' : flipped ? 'left' : 'right', caseId: entry.caseId, fixtureHash: entry.fixtureHash };
    }))) };
    const identity = { testedHead: hash('head'), evaluatorRevision: hash('evaluator'), runnerRevision: hash('runner'), initialAccounting: { requests: 761, tokens: 2939582 } };
    const scope = { schemaVersion: 1, purpose: 'f2_source_calibration', pilotCaseSetRevision: PILOT_CASE_SET_REVISION, controlHash: hash(controls),
        ...identity, maxSends: 60, maxSecondarySends: 12, retries: 0, extraction: 0, promotion: 0, publication: 0, stepPermission: null };
    expect(validateF2Scope(scope, controls, identity, true)).toBe(scope);
    expect(validateF2Scope(scope, controls, identity, false)).toBe(scope);
    const authorized = { ...scope, stepPermission: { explicitAuthorization: true, maxSends: 12, evidenceHash: hash('new explicit limited authority') } };
    expect(validateF2Scope(authorized, controls, identity, false)).toBe(authorized);
    const expanded = { ...authorized, schemaVersion: 2, headroomAssessment: true, apiHardLimits: { rollingDayRequests: 2000, requestsPerMinute: 20 }, maxSends: 72, maxSecondarySends: 18,
        stepPermission: { ...authorized.stepPermission, maxSends: 18 } };
    expect(validateF2Scope(expanded, controls, identity, false)).toBe(expanded);
    expect(() => validateF2Scope({ ...expanded, apiHardLimits: { rollingDayRequests: 2001, requestsPerMinute: 20 } }, controls, identity, false)).toThrow('f2_scope_changed');
    expect(validateF2Scope({ ...scope, maxSends: 9999, maxSecondarySends: 9999, retries: 2, initialAccounting: { requests: 1, tokens: 1 } }, controls, identity, false)).toBeDefined();
    for (const change of [{ extraction: 1 }, { promotion: 1 }, { publication: 1 }, { pilotCaseSetRevision: hash('other source') }, { testedHead: hash('other source') }])
        expect(() => validateF2Scope({ ...authorized, ...change }, controls, identity, false)).toThrow('f2_scope_changed');
});

test('source readiness assessments require all dimensions and literal evidence, with explicit unknown', () => {
    const entry = PILOT_CASES[0], quote = 'Actual public\nevidence.', evidence = JSON.stringify({ output: quote });
    const value = { dimensions: Object.fromEntries(entry.behaviorDimensions.map(d => [d, { status: 'met', quote, rationale: 'Bounded evidence.' }])) };
    expect(parseF2SourceAssessment(JSON.stringify(value), entry, evidence)).toEqual(value);
    expect(parseF2SourceAssessment(JSON.stringify({ dimensions: { ...value.dimensions, engineering_check: { status: 'unknown' } } }), entry, evidence)).toEqual(value);
    const incomplete = structuredClone(value); delete incomplete.dimensions[entry.behaviorDimensions[0]];
    expect(() => parseF2SourceAssessment(JSON.stringify(incomplete), entry, evidence)).toThrow('invalid_f2_source_assessment');
    value.dimensions[entry.behaviorDimensions[0]] = { status: 'unknown', quote: '', rationale: 'Insufficient evidence.' };
    expect(parseF2SourceAssessment(JSON.stringify(value), entry, evidence)).toEqual(value);
    value.dimensions[entry.behaviorDimensions[0]] = { status: 'gap', quote: 'Invented evidence', rationale: 'Claim.' };
    expect(() => parseF2SourceAssessment(JSON.stringify(value), entry, evidence)).toThrow('invalid_f2_source_assessment');
    expect(f2CalibrationMessages({ messages: [] })[0].content).toContain('512 characters');
});

test('Project source evidence removes duplicated old history while retaining conflict, operations and human source', () => {
    const entry = PILOT_CASES.find(c => c.entrance === 'project' && c.split === 'development');
    const source = { project: { displayName: 'Human revision' } };
    const original = { status: 'active', source, originalSource: source, validation: { passed: false }, validatedProposal: null,
        priorConflictTask: { taskId: 'old-task', baseRevision: 'old-base', status: 'conflict', operations: [{ kind: 'reviewed' }], changeSets: [], timeline: ['duplicate'], inspection: source, workspace: source } };
    const pair = { case: entry, baseline: { output: canonical(original), checks: { review_gate: false, human_revision: true }, evidence: [], repairCount: 0 } };
    const projected = JSON.parse(f2SourceEvidence(pair)).baseline.output;
    expect(projected.source).toEqual(source); expect(projected.originalSource).toEqual(source);
    expect(projected.priorConflictTask).toEqual({ taskId: 'old-task', baseRevision: 'old-base', status: 'conflict', operations: [{ kind: 'reviewed', operation: {}, inputHash: null }], changeSets: [] });
    expect(pair.baseline.output).toBe(canonical(original));
});

test.each(PILOT_CASES.filter(c => c.split === 'development' && c.entrance === 'rp'))('RP evidence window keeps every original authority check: $sourceId', async entry => {
    const capture = captureFor(entry);
    await withIsolatedRuntime(() => runRp(entry, loadFixture(entry, { purpose: 'evaluation' }), capture));
    expect(entry.expectedInvariants.every(name => capture.checks[name] === true)).toBe(true);
    expect(capture.checks.isolation).toBe(true);
    expect(capture.refs.messageVariants.map(v => v.variantId)).toEqual(['v1', 'v2']);
});

test.each(PILOT_CASES.filter(c => c.split === 'development' && c.entrance === 'project'))('Project evidence window validates the repair and protects the human revision: $sourceId', async entry => {
    const capture = captureFor(entry);
    await withIsolatedRuntime(() => runProject(entry, loadFixture(entry, { purpose: 'evaluation' }), capture,
        { settings: { projectSkill: 'Preserve original authority.', roundLimit: 6 }, beforeSend: () => {} }));
    expect(capture.checks).toEqual(expect.objectContaining(Object.fromEntries([...entry.expectedInvariants, 'isolation'].map(d => [d, true]))));
    const output = JSON.parse(capture.artifact.output);
    expect(output.status).toBe('review'); expect(output.validationHistory.map(v => v.validation)).toEqual(['failed', 'passed']);
    expect(output.validatedProposal).not.toBeNull(); expect(capture.refs.effectIds).toEqual([]);
    expect(output).toMatchObject({ conflictChallenge: 'fixture_reviewer', priorConflictTask: { status: 'conflict', changeSets: [] } });
    expect(output.freshTaskId).not.toBe(output.priorConflictTask.taskId);
    expect(output.priorConflictTask.baseRevision).not.toBe(output.baseRevision);
    expect(capture.refs.taskIds).toEqual([output.priorConflictTask.taskId, output.freshTaskId]);
    expect(JSON.stringify(capture.prompts[0])).toContain(output.priorConflictTask.taskId);
    // Two original public model rounds suffice for the constructive path;
    // the scripted response remains engineering evidence, not a model grade.
    expect(capture.refs.requestIds).toHaveLength(2);
    expect(capture.finalTextStatus).toBe('not_run');
    expect(output.source.project.displayName).toContain('(human revision)');
    expect(capture.refs.requestIds.length).toBeLessThanOrEqual(6);
});

test('the original funded worker executes only baseline and returns a non-promotable source-probe report', async () => {
    let calls = 0;
    const f = await evolutionFixture(makeTempFsEngineHarness, 'rp-skill', { realEvaluator: true, confirmedPrice: null, fetchImpl: async () => {
        calls++;
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { content: '', tool_calls: [
            { id: 'w', type: 'function', function: { name: 'write_message', arguments: JSON.stringify({ text: 'NPC offers the next choice.', mode: 'replace' }) } },
            { id: 'f', type: 'function', function: { name: 'finalize', arguments: '{}' } },
        ] }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }) };
    } });
    try {
        const doc = await f.repository.get(f.h.handle, f.scope, f.subject);
        const settings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target);
        const config = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId);
        const entry = selectCases({ purpose: 'evaluation', split: 'development', profileId: 'rp.m1.information' })[0];
        const report = await f.evaluator.probe(f.h.handle, { id: 'f2-probe', scopeId: doc.scopeId, domain: 'rp', price: null }, config, settings,
            new AbortController().signal, async () => {}, undefined, undefined,
            { profileId: 'rp.m1.information', split: 'development', repetitions: 1, mode: 'source_probe', caseIds: [entry.caseId] });
        expect(calls).toBe(1); expect(report.origin).toBe('host_source_probe'); expect(report.purpose).toBe('source_probe');
        expect(report.pairs).toHaveLength(1); expect(report.pairs[0]).toMatchObject({ candidate: null, judge: null, human: null });
        expect(report.pairs[0].baseline.checks.target_consumed).toBe(true);
        expect(report.charges.map(c => c.kind)).toEqual(['baseline']);
        expect(promotionDecision(report).eligible).toBe(false);
        expect((await f.repository.get(f.h.handle, f.scope, f.subject)).jobs).toEqual([]);
        expect(DEVELOPMENT_SOURCES.some(s => s.sourceId === entry.sourceId)).toBe(true);
    } finally { await f.h.cleanup(); }
}, 30000);

test('a real funded calibration failure settles once and stops before baseline or candidate work', async () => {
    let calls = 0;
    const f = await evolutionFixture(makeTempFsEngineHarness, 'rp-skill', { realEvaluator: true, confirmedPrice: null, fetchImpl: async () => {
        calls++;
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { content: '{"preference":"uncertain","deltas":{},"rationale":"Insufficient evidence."}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }) };
    } });
    try {
        const config = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId);
        const settings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target);
        const source = PILOT_CASES.find(c => c.entrance === 'rp' && c.split === 'development');
        const entry = {}, persisted = [];
        const scope = { configurations: { 'rp-skill': { primary: hash(config), secondary: hash(config), settings: hash(settings) } } };
        const controls = { controls: [{ domain: 'rp', group: 'known_violation', flipped: false, expected: 'right', caseId: source.caseId,
            fixtureHash: source.fixtureHash, messages: [{ role: 'user', content: 'Compare the engineering controls.' }] }] };
        await expect(runF2Domain({ f, kind: 'rp-skill', primaryConfig: config, secondaryConfig: config, controls, scope, entry,
            store: (name, value) => persisted.push({ name, value: structuredClone(value) }), signal: new AbortController().signal })).rejects.toThrow('f2_calibration_failed');
        expect(calls).toBe(1); expect(entry.calibration).toHaveLength(1); expect(entry.calibration[0].passed).toBe(false);
        expect(persisted).toHaveLength(1);
        const owner = await f.repository.owner(f.h.handle);
        expect(owner.attempts).toHaveLength(1); expect(owner.attempts[0]).toMatchObject({ kind: 'judge', status: 'reported', tokens: 10 });
        expect((await f.repository.get(f.h.handle, f.scope, f.subject)).jobs).toEqual([]);
    } finally { await f.h.cleanup(); }
}, 30000);

test('the original restore preserves exact prepared Project baseline pins without a candidate or publication', async () => {
    const f = await evolutionFixture(makeTempFsEngineHarness, 'project-prompt', { policyMode: 'review', realEvaluator: true });
    let restored;
    try {
        const doc = await f.repository.get(f.h.handle, f.scope, f.subject), result = { doc, target: f.target };
        const settings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target);
        const config = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId);
        restored = await restoreEvolutionFixture(makeTempFsEngineHarness, f.h.dataRoot, result, { baselineOnly: true });
        expect(hash(await restored.service.targets.evaluationSettings(restored.h.handle, restored.scope, restored.subject, restored.target))).toBe(hash(settings));
        expect(hash(await restored.evaluator.configuration(restored.h.handle, restored.route.runtimeRouteId))).toBe(hash(config));
        expect((await restored.repository.get(restored.h.handle, restored.scope, restored.subject)).jobs).toEqual([]);
        await expect(restoreEvolutionFixture(makeTempFsEngineHarness, f.h.dataRoot, { ...result, target: { ...f.target, presetId: 'forged' } }, { baselineOnly: true })).rejects.toThrow('f2_baseline_restore_changed');
    } finally { await restored?.h.cleanup(); await f.h.cleanup(); }
}, 30000);
