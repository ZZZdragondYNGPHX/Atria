import { expect, test } from '@jest/globals';
import { CASES, CASE_SET_REVISION, PILOT_CASES, PILOT_CASE_SET_REVISION, PILOT_RUBRIC, canonical, hash, selectCases, loadFixture, validateCase } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { DEVELOPMENT_SOURCES } from '../../src/native/agent-intelligence/evaluation/pilot-sources.js';
import { EvolutionEvaluator, promotionDecision } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { runRp, runProject } from '../../src/native/agent-intelligence/evaluation/adapters.js';
import { withIsolatedRuntime } from './runner.js';
import { evolutionFixture, restoreEvolutionFixture } from './evolution-fixture.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { validateF2Scope, runF2Domain, parseF2SourceAssessment, f2CalibrationMessages, f2SourceEvidence, f2SourceMessages, reusableF2Calibration, f2JudgeTransport, f2SourceTransport } from './m1-f2.js';

const judgeConfig = () => ({ connection: { providerAdapter: 'provider.openai-compatible' }, model: { limits: { contextTokens: 32000, outputTokens: 8000 } },
    generation: { output: { maxTokens: 8000 }, streaming: { enabled: false } }, route: { generationProfileRef: { revision: 'old' } },
    resources: [{ ref: { resourceType: 'core.generation-profile', revision: 'old' }, resource: { output: { maxTokens: 8000 }, revision: 'old' } }] });

test('F2 judge streaming changes transport only and leaves the baseline configuration intact', () => {
    const config = { connection: { options: { toolSchemaMode: 'string-enums' } }, generation: { output: { maxTokens: 16384 } } };
    expect(f2JudgeTransport(config)).toEqual({ ...config, connection: { options: { toolSchemaMode: 'string-enums', responseMode: 'stream' } } });
    expect(config.connection.options).toEqual({ toolSchemaMode: 'string-enums' });
    const original = judgeConfig(), extended = f2JudgeTransport(original, 16384);
    expect(extended.generation.output.maxTokens).toBe(16384);
    expect(extended.model.limits.outputTokens).toBe(16384);
    expect(extended.resources[0].resource.output.maxTokens).toBe(16384);
    expect(extended.route.generationProfileRef.revision).toBe(extended.resources[0].ref.revision);
    expect(original.generation.output.maxTokens).toBe(8000);
    const low = f2JudgeTransport(original, 16384, 'low');
    expect(low.generation.reasoning).toEqual({ effort: 'low' });
    expect(low.resources[0].resource.reasoning).toEqual(low.generation.reasoning);
    expect(low.route.generationProfileRef.revision).toBe(low.resources[0].ref.revision);
    expect(hash(low)).not.toBe(hash(extended));
    expect(original.generation.reasoning).toBeUndefined();
});

test('calibration reuse requires the actual judge configuration and exact control messages', () => {
    const control = { group: 'known_violation', flipped: false, messages: [{ role: 'user', content: 'control' }] };
    const config = { outputTokens: 8000 };
    const row = { passed: true, group: control.group, flipped: false, label: 'secondary', configurationHash: hash(config), messagesHash: hash(f2CalibrationMessages(control)) };
    expect(reusableF2Calibration(row, control, 'secondary', config)).toBe(true);
    expect(reusableF2Calibration(row, control, 'secondary', { outputTokens: 16384 })).toBe(false);
    expect(reusableF2Calibration(row, { ...control, flipped: true }, 'secondary', config)).toBe(false);
    expect(reusableF2Calibration({ ...row, passed: false }, control, 'secondary', config)).toBe(false);
    const fullConfig = judgeConfig();
    const pinned = { ...row, configurationHash: hash(fullConfig), transportConfigurationHash: hash(f2JudgeTransport(fullConfig, 16384)) };
    expect(reusableF2Calibration(pinned, control, 'secondary', fullConfig, 16384)).toBe(true);
    expect(reusableF2Calibration(pinned, control, 'secondary', fullConfig, 20000)).toBe(false);
    expect(reusableF2Calibration(pinned, control, 'secondary', fullConfig, 16384, 'low')).toBe(false);
});

test('Project source response reservation leaves RP, comparisons and baseline identities intact', () => {
    const config = judgeConfig(), original = structuredClone(config);
    const scope = { judgeOutputTokens: 16384, sourceOutputTokens: { 'project-prompt': 8000 },
        judgeReasoningEffort: { primary: 'low' }, sourceReasoningEffort: { 'rp-skill': { primary: 'high' } } };
    expect(f2SourceTransport(config, scope, 'project-prompt', 'primary')).toEqual(f2JudgeTransport(config, 8000, 'low'));
    expect(f2SourceTransport(config, scope, 'rp-skill', 'primary')).toEqual(f2JudgeTransport(config, 16384, 'high'));
    expect(hash(f2SourceTransport(config, scope, 'project-prompt', 'primary'))).not.toBe(hash(f2JudgeTransport(config, 16384, 'low')));
    expect(f2SourceTransport(config, { judgeOutputTokens: 16384 }, 'project-prompt', 'primary')).toEqual(f2JudgeTransport(config, 16384));
    expect(config).toEqual(original);
});

const captureFor = entry => ({ trialId: 'f2:' + entry.caseId, refs: { runIds: [], requestIds: [], effectIds: [], taskIds: [], messageVariants: [] },
    prompts: [], evidence: [], checks: {}, completeness: [], toolCalls: 0, repairCount: 0,
    observe(name, observed, expected) { this.checks[name] = canonical(observed) === canonical(expected); this.evidence.push({ name, observed, expected }); } });

test('Project calibration projection preserves opposite outcomes and authoritative sources', () => {
    const priorConflictTask = { taskId: 'old', status: 'conflict', timeline: ['duplicate'], operations: [], changeSets: [] };
    const content = { left: canonical({ status: 'repair', source: { binding: 'wrong' }, priorConflictTask }),
        right: canonical({ engineeringControlStatement: 'Correct authority state.', observedAuthority: { status: 'review', source: { binding: 'correct' }, priorConflictTask } }) };
    const control = { domain: 'project', messages: [{ role: 'user', content: canonical(content) }] };
    const projected = JSON.parse(f2CalibrationMessages(control)[0].content);
    expect(projected.left).toMatchObject({ status: 'repair', source: { binding: 'wrong' }, priorConflictTask: { status: 'conflict' } });
    expect(projected.right).toMatchObject({ engineeringControlStatement: 'Correct authority state.', observedAuthority: { status: 'review', source: { binding: 'correct' }, priorConflictTask: { status: 'conflict' } } });
    expect(projected.right.observedAuthority.priorConflictTask.timeline).toBeUndefined();
    expect(projected.left.priorConflictTask.timeline).toBeUndefined();
    expect(JSON.parse(control.messages[0].content)).toEqual(content);
});

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
        expect(entry.limits).toEqual({ maxRequests: entry.entrance === 'project' ? 12 : 6, maxRepairRounds: 2 });
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
    expect(validateF2Scope({ ...expanded, domainOrder: ['project-prompt', 'rp-skill'] }, controls, identity, false)).toBeDefined();
    expect(validateF2Scope({ ...expanded, judgeMode: 'primary_only' }, controls, identity, false)).toBeDefined();
    expect(() => validateF2Scope({ ...expanded, judgeMode: 'unverified' }, controls, identity, false)).toThrow('f2_scope_changed');
    expect(() => validateF2Scope({ ...expanded, domainOrder: ['project-prompt'] }, controls, identity, false)).toThrow('f2_scope_changed');
    expect(() => validateF2Scope({ ...expanded, apiHardLimits: { rollingDayRequests: 2001, requestsPerMinute: 20 } }, controls, identity, false)).toThrow('f2_scope_changed');
    expect(validateF2Scope({ ...scope, maxSends: 9999, maxSecondarySends: 9999, retries: 2, initialAccounting: { requests: 1, tokens: 1 } }, controls, identity, false)).toBeDefined();
    for (const change of [{ extraction: 1 }, { promotion: 1 }, { publication: 1 }, { pilotCaseSetRevision: hash('other source') }, { testedHead: hash('other source') }])
        expect(() => validateF2Scope({ ...authorized, ...change }, controls, identity, false)).toThrow('f2_scope_changed');
    const sourceControls = ['rp', 'project'].flatMap(domain => ['positive', 'known_violation', 'missing_evidence'].map(group => {
        const entry = PILOT_CASES.find(c => c.entrance === domain && c.split === 'development');
        return { group, pair: { case: entry, baseline: { origin: 'engineering_control', output: '{}' } }, expected: { [entry.behaviorDimensions[0]]: 'unknown' } };
    }));
    sourceControls.push({ ...sourceControls[0], group: 'unsupported_rule', expected: { knowledge_boundary: 'gap' } },
        { ...sourceControls[3], group: 'communication_omission', expected: { status_accuracy: 'gap' } });
    const extendedControls = { ...controls, sourceControls }, sourceScope = { ...expanded, controlHash: hash(extendedControls) };
    expect(validateF2Scope(sourceScope, extendedControls, identity, false)).toBeDefined();
    const wrongDomain = { ...extendedControls, sourceControls: sourceControls.map(row => row.group === 'unsupported_rule' ? { ...row, group: 'communication_omission' } : row) };
    expect(() => validateF2Scope({ ...sourceScope, controlHash: hash(wrongDomain) }, wrongDomain, identity, false)).toThrow('f2_control_changed');
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
    const pair = { case: entry, baseline: { output: quote } };
    const messages = f2SourceMessages(pair);
    expect(messages[0].content).toContain('invented mandatory procedures');
    expect(hash(messages)).not.toBe(hash([{ ...messages[0], content: 'Different assessor contract' }, messages[1]]));
    const citedEvidence = f2SourceEvidence(pair), catalogue = JSON.parse(citedEvidence).quoteCatalogue;
    const cited = { dimensions: Object.fromEntries(entry.behaviorDimensions.map(d => [d, { status: 'met', quoteRef: catalogue[0].ref, rationale: 'Observed.' }])),
        knowledgeReview: catalogue.map(item => ({ quoteRef: item.ref, status: 'supported', rationale: 'Exposed fixture support.' })) };
    expect(parseF2SourceAssessment(JSON.stringify(cited), entry, citedEvidence).dimensions[entry.behaviorDimensions[0]].quote).toBe(catalogue[0].quote);
    cited.dimensions[entry.behaviorDimensions[0]].status = 'unknown';
    expect(parseF2SourceAssessment(JSON.stringify(cited), entry, citedEvidence).dimensions[entry.behaviorDimensions[0]]).toMatchObject({ status: 'unknown', quote: catalogue[0].quote });
    const forged = JSON.parse(citedEvidence); forged.quoteCatalogue[0].quote = 'Invented catalogue evidence';
    expect(() => parseF2SourceAssessment(JSON.stringify(cited), entry, canonical(forged))).toThrow('invalid_f2_source_assessment');
    cited.dimensions[entry.behaviorDimensions[0]].quoteRef = 'q9999';
    expect(() => parseF2SourceAssessment(JSON.stringify(cited), entry, citedEvidence)).toThrow('invalid_f2_source_assessment');
});

test('RP knowledge assessment covers each output span and rejects a summary hiding an unsupported assertion', () => {
    const entry = PILOT_CASES.find(c => c.entrance === 'rp' && c.split === 'development');
    const evidence = f2SourceEvidence({ case: entry, baseline: { output: 'NPC offers a choice.\nNPC asserts an unsupported penalty.' } });
    const catalogue = JSON.parse(evidence).quoteCatalogue;
    expect(catalogue.map(item => item.quote).join('')).toBe('NPC offers a choice.NPC asserts an unsupported penalty.');
    const value = { dimensions: Object.fromEntries(entry.behaviorDimensions.map(d => [d, { status: 'met', quoteRef: catalogue[0].ref, rationale: 'Observed.' }])),
        knowledgeReview: catalogue.map((item, i) => ({ quoteRef: item.ref, status: i ? 'unsupported' : 'nonbinding', rationale: i ? 'Penalty has no exposed support.' : 'A choice remains open.' })) };
    expect(() => parseF2SourceAssessment(JSON.stringify(value), entry, evidence)).toThrow('invalid_f2_source_assessment');
    value.dimensions.knowledge_boundary = { status: 'gap', quoteRef: catalogue[1].ref, rationale: 'Unexposed penalty.' };
    expect(parseF2SourceAssessment(JSON.stringify(value), entry, evidence).knowledgeReview).toEqual(value.knowledgeReview);
    const messages = f2SourceMessages({ case: entry }, evidence);
    expect(messages.at(-1).content).toContain('exactly 2 rows');
    expect(messages.at(-1).content).toContain(canonical(catalogue.map(item => item.ref)));
    // A correct gap is still invalid when only the violating span is returned.
    expect(() => parseF2SourceAssessment(JSON.stringify({ ...value, knowledgeReview: [value.knowledgeReview[1]] }), entry, evidence)).toThrow('invalid_f2_source_assessment');
    value.knowledgeReview.pop();
    expect(() => parseF2SourceAssessment(JSON.stringify(value), entry, evidence)).toThrow('invalid_f2_source_assessment');
});

test('RP evidence isolates appended restrictions and penalties without losing surrounding text', () => {
    const entry = PILOT_CASES.find(c => c.entrance === 'rp' && c.split === 'development');
    const output = 'Anonymous return is permitted, but only for undisputed items—otherwise discard them.';
    const evidence = JSON.parse(f2SourceEvidence({ case: entry, baseline: { output } }));
    expect(evidence.quoteCatalogue.map(row => row.quote).join('')).toBe(output);
    expect(evidence.quoteCatalogue.map(row => row.quote)).toContain('otherwise discard them.');
    expect(evidence.quoteCatalogue.map(row => row.quote)).toContain(' but only for undisputed items—');
});

test('missing Project observations remain unknown rather than proving absent proposals or zero writes', () => {
    const entry = PILOT_CASES.find(c => c.entrance === 'project' && c.split === 'development');
    const evidence = output => JSON.parse(f2SourceEvidence({ case: entry, baseline: { output: canonical(output) } })).baseline.facts;
    const missing = evidence({});
    expect(missing).toContain('Validated proposal: unknown');
    expect(missing).toContain('Prior Task writes: unknown');
    expect(missing).toContain('Fresh Task status: not available');
    expect(missing).not.toContain('Validated proposal: absent');
    const observed = evidence({ validatedProposal: null, priorConflictTask: { changeSets: [] } });
    expect(observed).toContain('Validated proposal: absent');
    expect(observed).toContain('Prior Task writes: 0');
});

test('Project source evidence removes duplicated old history while retaining conflict, operations and human source', () => {
    const entry = PILOT_CASES.find(c => c.entrance === 'project' && c.split === 'development');
    const source = { project: { displayName: 'Human revision' } };
    const original = { status: 'active', source, originalSource: source, validation: { passed: false }, validatedProposal: null,
        priorConflictTask: { taskId: 'old-task', baseRevision: 'old-base', status: 'conflict', operations: [{ toolName: 'atri_agent_project_save', operation: { operationId: 'old-operation', operationType: 'project.save', input: { source } } }], changeSets: [], timeline: ['duplicate'], inspection: source, workspace: source } };
    const pair = { case: entry, baseline: { output: canonical(original), checks: { review_gate: false, human_revision: true }, evidence: [], repairCount: 0 } };
    const projected = JSON.parse(f2SourceEvidence(pair)).baseline.output;
    expect(JSON.parse(f2SourceEvidence(pair)).baseline.facts).toContain('Current source equals the recorded protected original source: true');
    expect(JSON.parse(f2SourceEvidence(pair)).baseline.facts).toContain('Validated proposal: absent');
    expect(projected.source).toEqual(source); expect(projected.originalSource).toEqual(source);
    expect(projected.priorConflictTask).toEqual({ taskId: 'old-task', baseRevision: 'old-base', status: 'conflict', operations: [{ toolName: 'atri_agent_project_save', operation: { operationId: 'old-operation', operationType: 'project.save' }, inputHash: hash({ source }) }], changeSets: [] });
    expect(pair.baseline.output).toBe(canonical(original));
});

test.each([false, true])('Project status met requires model communication rather than host state or a seeded plan: nested=$#', nested => {
    const entry = PILOT_CASES.find(c => c.entrance === 'project' && c.split === 'development');
    const output = { status: 'review', conversation: [{ content: '' }], plan: { summary: 'Host-created seed says Review.' }, tools: [] };
    const evidenceFor = () => f2SourceEvidence({ case: entry, baseline: { origin: 'host_source_probe', output: canonical(output) } });
    const evidence = evidenceFor(), hostQuote = 'Fresh Task status: review';
    expect(JSON.parse(evidence).baseline.modelStatements).toEqual([]);
    const assessment = { dimensions: Object.fromEntries(entry.behaviorDimensions.map(d => [d, { status: 'met', quote: hostQuote, rationale: 'Observed state.' }])) };
    expect(() => parseF2SourceAssessment(JSON.stringify(assessment), entry, evidence)).toThrow('invalid_f2_source_assessment');
    assessment.dimensions.status_accuracy.status = 'unknown';
    expect(parseF2SourceAssessment(JSON.stringify(assessment), entry, evidence).dimensions.status_accuracy.status).toBe('unknown');
    const statement = 'The bounded correction is prepared for uncommitted Review; the prior Task remains conflicted.';
    const plan = { summary: statement, steps: [] };
    output.tools.push({ name: 'atri_agent_set_plan', args: nested ? { plan } : plan });
    assessment.dimensions.status_accuracy = { status: 'met', quote: statement, rationale: 'Model-authored status agrees with the host.' };
    expect(JSON.parse(evidenceFor()).baseline.modelStatements).toEqual([{ origin: 'tools.0.args' + (nested ? '.plan' : '') + '.summary', text: statement }]);
    expect(parseF2SourceAssessment(JSON.stringify(assessment), entry, evidenceFor()).dimensions.status_accuracy.status).toBe('met');
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
    expect(output.tools.some(t => t.args && t.result)).toBe(true);
    expect(capture.refs.requestIds.length).toBeLessThanOrEqual(6);
});

test('Project pilot reaches Review beyond the legacy six-round setting using its declared source window', async () => {
    const entry = PILOT_CASES.find(c => c.entrance === 'project' && c.split === 'development');
    const fixture = loadFixture(entry, { purpose: 'evaluation' }), capture = captureFor(entry);
    let rounds = 0, readSource;
    const bridge = { project: async ({ input }) => {
        rounds++;
        for (const message of input.messages.filter(m => m.role === 'tool')) {
            const result = JSON.parse(message.content);
            if (result.source?.package) readSource = result.source;
        }
        const calls = rounds <= 7 ? [{ id: 'read-' + rounds, name: 'atri_agent_get_project', args: {} }] : (() => {
            const source = structuredClone(readSource), point = source.package.entryPoints[1], worldId = source.dependencies.worlds[1].worldId;
            point.worldIds = [worldId]; point.primaryWorldId = worldId;
            return [
                { id: 'reset', name: 'atri_agent_reset_operations', args: {} },
                { id: 'plan', name: 'atri_agent_set_plan', args: { summary: fixture.input, steps: [{ id: 'fix', title: 'Correct dependency', impact: 'low' }] } },
                { id: 'save', name: 'atri_agent_project_save', args: { source, stepId: 'fix' } },
                { id: 'review', name: 'atri_agent_prepare_review', args: {} },
            ];
        })();
        return { response: { assistantText: '', toolCalls: calls, usage: null } };
    } };
    await withIsolatedRuntime(() => runProject(entry, fixture, capture, { settings: { projectSkill: 'Preserve authority.', roundLimit: 6 }, beforeSend: () => {}, bridge }));
    expect(rounds).toBe(8);
    expect(capture.refs.requestIds).toHaveLength(8);
    expect(JSON.parse(capture.artifact.output).status).toBe('review');
    expect(capture.checks.review_gate).toBe(true);
    expect(capture.checks.related_proposal).toBe(true);
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

test.each([false, true])('a funded calibration failure settles once and preserves partial calibration reuse: resume=$#', async reuse => {
    let calls = 0;
    const f = await evolutionFixture(makeTempFsEngineHarness, 'rp-skill', { realEvaluator: true, confirmedPrice: null, fetchImpl: async (_url, options) => {
        calls++;
        expect(JSON.parse(options.body).stream).toBe(true);
        const events = [{ choices: [{ delta: { reasoning_content: 'Private reasoning is not grading evidence.' } }] },
            { choices: [{ delta: { content: '{"preference":"uncertain","deltas":{},"rationale":"Insufficient evidence."}' }, finish_reason: 'stop' }] },
            { choices: [], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }];
        return { ok: true, headers: { get: () => 'text/event-stream' }, body: (async function* () {
            for (const event of events) yield new TextEncoder().encode('data: ' + JSON.stringify(event) + '\n\n');
            yield new TextEncoder().encode('data: [DONE]\n\n');
        })() };
    } });
    try {
        const config = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId);
        const settings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target);
        const source = PILOT_CASES.find(c => c.entrance === 'rp' && c.split === 'development');
        const entry = {}, persisted = [];
        const scope = { configurations: { 'rp-skill': { primary: hash(config), secondary: hash(config), settings: hash(settings) } } };
        const controls = { controls: [{ domain: 'rp', group: 'known_violation', flipped: false, expected: 'right', caseId: source.caseId,
            fixtureHash: source.fixtureHash, messages: [{ role: 'user', content: 'Compare the engineering controls.' }] }] };
        const resume = reuse ? { run: 'prior-control-run', calibration: [{ passed: true, label: 'primary', group: 'known_violation', flipped: false,
            configurationHash: hash(config), messagesHash: hash(f2CalibrationMessages(controls.controls[0])) }] } : null;
        await expect(runF2Domain({ f, kind: 'rp-skill', primaryConfig: config, secondaryConfig: config, controls, scope, entry,
            store: (name, value) => persisted.push({ name, value: structuredClone(value) }), signal: new AbortController().signal, resume })).rejects.toThrow('f2_calibration_failed');
        expect(calls).toBe(1); expect(entry.calibration).toHaveLength(reuse ? 2 : 1); expect(entry.calibration.at(-1).passed).toBe(false);
        expect(entry.calibration[0].passed).toBe(reuse);
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

test.each([false, true])('primary-only F2 funds no independent requests and cannot claim shared headroom: primaryOnly=$#', async primaryOnly => {
    let calls = 0;
    const f = await evolutionFixture(makeTempFsEngineHarness, 'rp-skill', { realEvaluator: true, confirmedPrice: null, fetchImpl: async (_url, options) => {
        calls++;
        const evidence = JSON.parse(options.body).messages.flatMap(message => {
            try { const value = JSON.parse(message.content); return value.quoteCatalogue ? [value] : []; } catch { return []; }
        })[0];
        const content = evidence ? { dimensions: Object.fromEntries(Object.keys(evidence.scenario.rubric).map(d => [d,
            { status: d === 'knowledge_boundary' ? 'gap' : 'met', quoteRef: evidence.quoteCatalogue[0].ref, rationale: 'Controlled observation.' }])),
        knowledgeReview: evidence.quoteCatalogue.filter(row => row.origin === 'baseline.output').map(row =>
            ({ quoteRef: row.ref, status: 'unsupported', rationale: 'Controlled unsupported assertion.' })) }
            : { preference: 'uncertain', deltas: {}, rationale: 'No observations.' };
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }) };
    } });
    try {
        const config = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId);
        const settings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target);
        const cases = PILOT_CASES.filter(c => c.entrance === 'rp' && c.split === 'development');
        const control = { domain: 'rp', group: 'missing_evidence', flipped: false, expected: 'uncertain', caseId: cases[0].caseId,
            fixtureHash: cases[0].fixtureHash, messages: [{ role: 'user', content: 'No observations.' }] };
        const report = { domain: 'rp', origin: 'host_source_probe', caseSetRevision: PILOT_CASE_SET_REVISION,
            configurations: { baseline: hash(config) }, settings: { baseline: hash(settings) }, pairs: cases.map(entry =>
                ({ case: entry, baseline: { output: 'NPC asserts an unsupported penalty.' }, candidate: null, judge: null, human: null })) };
        const entry = {}, saved = new Map();
        const scope = { judgeMode: primaryOnly ? 'primary_only' : 'dual', headroomAssessment: true,
            configurations: { 'rp-skill': { primary: hash(config), secondary: hash(config), settings: hash(settings) } } };
        await runF2Domain({ f, kind: 'rp-skill', primaryConfig: config, secondaryConfig: config, controls: { controls: [control] }, scope, entry,
            store: (name, value) => saved.set(name, structuredClone(value)), signal: new AbortController().signal, resume: { calibration: [], report } });
        expect(calls).toBe(primaryOnly ? 4 : 8);
        const owner = await f.repository.owner(f.h.handle);
        expect(owner.attempts.filter(row => row.jobId.endsWith(':independent'))).toHaveLength(primaryOnly ? 0 : 4);
        expect(entry.baselineHeadroom).toBe(primaryOnly ? 'primary_observed_gap' : 'observed_gap');
        const assessments = saved.get('rp-skill-f2-source-assessments.json');
        expect(assessments.map(row => row.sharedGaps)).toEqual(cases.map(() => primaryOnly ? [] : ['knowledge_boundary']));
        expect(assessments.map(row => row.observations.length)).toEqual(cases.map(() => primaryOnly ? 1 : 2));
    } finally { await f.h.cleanup(); }
}, 30000);

test('pointwise calibration rejects an uninformative assessor before using a saved source probe', async () => {
    const source = PILOT_CASES.find(c => c.entrance === 'rp' && c.split === 'development');
    const catalogue = JSON.parse(f2SourceEvidence({ case: source, baseline: { output: loadFixture(source, { purpose: 'evaluation' }).reply } })).quoteCatalogue;
    let calls = 0;
    const f = await evolutionFixture(makeTempFsEngineHarness, 'rp-skill', { realEvaluator: true, confirmedPrice: null, fetchImpl: async () => {
        calls++;
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { content: JSON.stringify({ dimensions:
            Object.fromEntries(source.behaviorDimensions.map(d => [d, { status: 'unknown', quote: '', rationale: 'No observation.' }])),
        knowledgeReview: catalogue.map(item => ({ quoteRef: item.ref, status: 'unresolved', rationale: 'No observation.' })) }) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }) };
    } });
    try {
        const config = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId);
        const settings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target);
        const control = { domain: 'rp', group: 'known_violation', flipped: false, expected: 'right', caseId: source.caseId,
            fixtureHash: source.fixtureHash, messages: [{ role: 'user', content: 'Compare controls.' }] };
        const resume = { calibration: ['primary', 'secondary'].map(label => ({ passed: true, label, group: control.group, flipped: false,
            configurationHash: hash(config), messagesHash: hash(f2CalibrationMessages(control)) })) };
        const entry = {}, controls = { controls: [control], sourceControls: [{ group: 'positive',
            pair: { case: source, baseline: { origin: 'engineering_control', output: loadFixture(source, { purpose: 'evaluation' }).reply } },
            expected: Object.fromEntries(source.behaviorDimensions.map(d => [d, 'met'])) }] };
        const scope = { configurations: { 'rp-skill': { primary: hash(config), secondary: hash(config), settings: hash(settings) } } };
        await expect(runF2Domain({ f, kind: 'rp-skill', primaryConfig: config, secondaryConfig: config, controls, scope, entry,
            store: () => {}, signal: new AbortController().signal, resume })).rejects.toThrow('f2_source_calibration_failed');
        expect(calls).toBe(1); expect(entry.sourceCalibration[0].passed).toBe(false);
        expect((await f.repository.owner(f.h.handle)).attempts[0]).toMatchObject({ kind: 'judge', status: 'reported', tokens: 10 });
        expect((await f.repository.get(f.h.handle, f.scope, f.subject)).jobs).toEqual([]);
    } finally { await f.h.cleanup(); }
}, 30000);
