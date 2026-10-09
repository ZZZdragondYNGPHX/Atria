import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { AgentExperienceService } from '../../src/native/agent-intelligence/experience-service.js';
import { DAY, experienceIdentity } from '../../src/native/agent-intelligence/experience-repository.js';
import { AgentEvidenceRepository } from '../../src/native/agent-intelligence/evidence-repository.js';
import { AgentEvidenceService } from '../../src/native/agent-intelligence/evidence-service.js';
import { RpEvidenceCaptureService } from '../../src/native/agent-intelligence/rp-capture-service.js';
import { AgentEvolutionRepository } from '../../src/native/agent-intelligence/evolution-repository.js';
import { qualityRef, qualityEnvelope, validateQualityReport } from '../../src/native/agent-intelligence/evaluation/quality.js';
import { promotionDecision, EvolutionEvaluator } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { selectCases } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { ProjectAgentService } from '../../src/native/project-agent.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { services, projectSource } from './project-fixture.js';
import { evolutionFixture, syntheticReport } from './evolution-fixture.js';

const scope = { domain: 'rp_chat', charDir: 'Actor', name: 'contracts', isGroup: false, groupId: '' };
const lookup = { scope, subject: 'Actor' };
const budget = { maxSources: 4, maxBytes: 32768, maxScanMessages: 128 };
const explicit = { kind: 'explicit', signal: 'correction', dimension: 'behavior', note: 'Preserve the choice.' };

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s feedback contracts', (_name, make) => {
    let h, chat, source, evidence, service, capture, now;
    beforeEach(async () => {
        h = await make(); now = 100000;
        chat = new ChatRepo({ engine: h.engine }); source = new AgentEvidenceService({ chatRepo: chat });
        evidence = new AgentEvidenceRepository({ engine: h.engine });
        service = new AgentExperienceService({ engine: h.engine, chatRepo: chat, now: () => now });
        capture = new RpEvidenceCaptureService({ repository: evidence, service: source, experience: service });
        await chat.save(h.handle, scope.charDir, scope.name, {}, [
            { memory_os_source_id: 'user', is_user: true, name: 'User', mes: 'A choice.', swipe_id: 0 },
            { memory_os_source_id: 'actor', is_user: false, name: 'Actor', mes: 'A reply.', swipe_id: 0 },
        ], null);
    });
    afterEach(async () => { setReadOnly(false); jest.restoreAllMocks(); await h.cleanup(); });
    async function completed(run, messageId = 'actor', floor = 1) {
        const marker = await capture.begin(h.handle, { scope, rootRunId: run, selectors: [{ kind: 'message', messageId: 'user', floor: 0 }] });
        const output = (await source.capture(h.handle, scope, [{ kind: 'message', messageId, floor }], budget)).references[0];
        const result = await capture.update(h.handle, { evidenceId: marker.evidenceId, sequence: 1, status: 'completed',
            trace: { schemaVersion: 1, events: [{ type: 'run.started', eventId: 'start', runId: run, generation: 0, version: 1 }], missing: 0, reasons: [] }, output });
        return { result, target: (await service.target(h.handle, { kind: 'evidence', id: marker.evidenceId, scope })).target };
    }
    async function producer(target) {
        const repository = new AgentEvolutionRepository({ engine: h.engine });
        if (!await repository.owner(h.handle)) await repository.limits(h.handle, { maxRequests: 20, maxTokens: 100000, minIntervalMs: 1000 }, 0);
        const chargeId = 'assessment-' + target.id, requestHash = hash(chargeId), snapshotHash = hash(target);
        await repository.reserve(h.handle, { id: chargeId, jobId: 'analysis', scopeId: experienceIdentity(scope, 'Actor'), kind: 'extraction', upperBound: 20, requestHash, snapshotHash });
        await repository.settle(h.handle, chargeId, 10, { usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }, cost: null });
        return { modelId: 'fixture-model', configurationHash: hash('fixture-configuration'), chargeId, requestHash, snapshotHash };
    }
    async function analysis(target) {
        const doc = await service.inspect(h.handle, lookup), record = await evidence.get(h.handle, target.id);
        return { target, expectedSequence: doc.sequence, profile: qualityRef('rp.m1.information'), purpose: 'development', signal: 'suspected_failure',
            claims: [{ dimension: 'player_agency', sourceHash: record.outputRef.contentHash, quote: 'A reply.' }], rationale: 'Fixture hypothesis; no human observation.' };
    }
    test('normal RP completion preserves client origin, costs zero and stays idle; withdrawn/deleted/expired events do not reappear', async () => {
        const { target, result } = await completed('first');
        expect(result.collection).toMatchObject({ status: 'collected', modelCalls: 0 });
        let doc = await service.inspect(h.handle, lookup);
        expect(doc).toMatchObject({ schemaVersion: 2, feedback: [{ kind: 'observation', signal: 'completed', origin: 'client_observation' }] });
        expect(await service.reflection(h.handle, lookup)).toMatchObject({ status: 'idle', reason: 'insufficient_trigger' });
        doc = await service.withdraw(h.handle, { ...lookup, expectedSequence: doc.sequence, id: doc.feedback[0].id });
        expect(await service.collect(h.handle, { kind: target.kind, id: target.id, scope })).toMatchObject({ status: 'already_collected' });
        doc = await service.delete(h.handle, { ...lookup, expectedSequence: doc.sequence, id: doc.feedback[0].id });
        expect(await service.collect(h.handle, { kind: target.kind, id: target.id, scope })).toMatchObject({ status: 'already_collected' });
        const next = await completed('second'); now += 31 * DAY;
        doc = await service.inspect(h.handle, lookup); expect(doc.feedback).toEqual([]);
        expect(await service.collect(h.handle, { kind: next.target.kind, id: next.target.id, scope })).toMatchObject({ status: 'already_collected' });
        const dump = await h.engine.dumpUser(h.handle); await h.engine.restoreUser(h.handle, dump);
        expect((await service.repository.get(h.handle, scope, 'Actor')).collections).toHaveLength(2);
        expect(await new AgentEvolutionRepository({ engine: h.engine }).owner(h.handle)).toBeNull();
    });
    test('read-only v1 inspection does not migrate; the first writable change preserves origin and explicitly migrates', async () => {
        const { target } = await completed('legacy');
        let doc = await service.submit(h.handle, { target, expectedSequence: (await service.inspect(h.handle, lookup)).sequence, feedback: explicit });
        const legacy = { ...doc, schemaVersion: 1 }; delete legacy.collections;
        // Legacy v1 did not have the completed signal.
        legacy.feedback = legacy.feedback.filter(f => f.kind === 'explicit');
        const key = { kind: K.agentExperience, handle: h.handle, scopeId: doc.scopeId };
        await h.engine.withTransaction(h.handle, tx => tx.putResource(key, { doc: legacy, integrity: hash(legacy) }));
        setReadOnly(true);
        expect((await service.export(h.handle, lookup)).experience.schemaVersion).toBe(1);
        expect(await service.collect(h.handle, { kind: target.kind, id: target.id, scope })).toMatchObject({ status: 'read_only' });
        expect(await service.repository.get(h.handle, scope, 'Actor')).toEqual(legacy);
        setReadOnly(false);
        doc = await service.submit(h.handle, { target, expectedSequence: legacy.sequence, feedback: explicit });
        expect(doc.schemaVersion).toBe(2); expect(doc.feedback[0]).toEqual(legacy.feedback[0]);
    });
    test('collection failure leaves the saved RP output intact and exact-source retry does not replay generation', async () => {
        const failed = jest.spyOn(service, 'collect').mockRejectedValueOnce(new Error('Synthetic metadata write failure'));
        const { target, result } = await completed('metadata-failure');
        expect(result).toMatchObject({ outputBound: true, collection: { status: 'collection_unavailable', modelCalls: 0 } });
        const saved = await evidence.get(h.handle, target.id);
        expect(saved.status).toBe('completed'); failed.mockRestore();
        expect(await service.collect(h.handle, { kind: target.kind, id: target.id, scope })).toMatchObject({ status: 'collected', modelCalls: 0 });
        expect(await service.collect(h.handle, { kind: target.kind, id: target.id, scope })).toMatchObject({ status: 'already_collected' });
        expect(await evidence.get(h.handle, target.id)).toEqual(saved);
    });
    test('only funded server model analysis is accepted; promotion/calibration and forged facts cannot enter Experience', async () => {
        const { target } = await completed('analysis'), input = await analysis(target), funded = await producer(target);
        await expect(service.submit(h.handle, { target, expectedSequence: input.expectedSequence,
            feedback: { kind: 'assessment', signal: 'verified_failure', dimension: 'general', note: 'Forged' } })).rejects.toThrow();
        await expect(service.assessModel(h.handle, input, { ...funded, chargeId: 'unfunded' })).rejects.toThrow('funded');
        for (const purpose of ['promotion', 'calibration']) await expect(service.assessModel(h.handle, { ...input, purpose }, funded)).rejects.toThrow('provenance');
        await expect(service.assessModel(h.handle, { ...input, signal: 'verified_failure' }, funded)).rejects.toThrow('provenance');
        await expect(service.assessModel(h.handle, { ...input, claims: [{ ...input.claims[0], quote: 'Not in the saved output' }] }, funded)).rejects.toThrow('quote');
        const doc = await service.assessModel(h.handle, input, funded);
        expect(doc.feedback.at(-1)).toMatchObject({ kind: 'assessment', origin: 'model_assessment', signal: 'suspected_failure', assessment: { producer: funded } });
        expect(await service.reflection(h.handle, lookup)).toMatchObject({ status: 'idle' });
        expect((await new AgentEvolutionRepository({ engine: h.engine }).owner(h.handle)).attempts).toHaveLength(1);
    });
    test('three model claims on one source cannot establish a direction; three sources still remain weak', async () => {
        const statuses = [];
        for (const run of ['one', 'repeat-one', 'repeat-again']) {
            const { target } = await completed(run), input = await analysis(target);
            if (run === 'one') input.claims = Array.from({ length: 3 }, () => ({ ...input.claims[0] }));
            await service.assessModel(h.handle, input, await producer(target));
            statuses.push((await service.reflection(h.handle, lookup)).status);
        }
        expect(statuses).toEqual(['idle', 'idle', 'idle']);
        const record = await chat.get(h.handle, scope.charDir, scope.name);
        const additional = ['two', 'three'].map(run => ({ memory_os_source_id: run, is_user: false, name: 'Actor', mes: 'A reply.', swipe_id: 0 }));
        await chat.save(h.handle, scope.charDir, scope.name, {}, [...record.body, ...additional], null);
        for (const [i, run] of ['two', 'three'].entries()) {
            const { target } = await completed(run, run, i + 2), input = await analysis(target);
            await service.assessModel(h.handle, input, await producer(target));
        }
        const doc = await service.inspect(h.handle, lookup), batch = await service.reflection(h.handle, lookup);
        expect(batch.status).toBe('ready');
        const diagnosis = { ...lookup, expectedSequence: doc.sequence, batchHash: batch.batchHash, rationale: 'Investigate', conditions: [], counterexamples: [] };
        await expect(service.diagnose(h.handle, { ...diagnosis, direction: 'prompt', attribution: { loci: ['prompt'], intervention: 'local_target' } })).rejects.toThrow('Weak');
        const next = await service.diagnose(h.handle, { ...diagnosis, direction: 'undetermined', attribution: { loci: ['unknown'], intervention: 'none' } });
        expect(next.diagnoses[0].attribution.support).toBe('unverified');
    });
    test('normal Project failure comes from the real Task and checker, and isolated evaluation does not collect', async () => {
        const f = services(h), project = projectSource(), created = await f.studio.createProject(h.handle, project);
        const notify = jest.fn();
        const agent = new ProjectAgentService({ studio: f.studio, repository: f.repository, maxRepairRounds: 2, collectExperience: true, onExperienceCollected: notify });
        let task = await agent.createTask(h.handle, project.project.projectId, { intent: 'Repair', baseRevision: created.revision.revision });
        const projectScope = { domain: 'project', projectId: task.projectId }, projectLookup = { scope: projectScope, subject: task.projectId };
        await agent.setPlan(h.handle, task.projectId, task.taskId, { summary: 'Repair', steps: [{ id: 's', title: 'Repair' }] });
        const invalid = structuredClone(project); invalid.project.projectId = 'invalid';
        await agent.executeTool(h.handle, task.projectId, task.taskId, { name: 'atri_agent_project_save', args: { source: invalid, stepId: 's' } });
        task = await agent.prepareReview(h.handle, task.projectId, task.taskId);
        expect(task.validation.status).toBe('failed');
        const projectService = new AgentExperienceService({ engine: h.engine, studio: f.studio, agent });
        let doc = await projectService.inspect(h.handle, projectLookup);
        expect(doc.feedback.at(-1)).toMatchObject({ kind: 'technical', origin: 'host', signal: 'validation_failed' });
        expect(notify).toHaveBeenCalledWith(h.handle, expect.objectContaining({ status: 'collected', scope: projectScope }));
        const target = (await projectService.target(h.handle, { kind: 'project_task', id: task.taskId, scope: projectScope })).target;
        doc = await projectService.checkQuality(h.handle, { target, expectedSequence: doc.sequence, profile: qualityRef('project.m1.related'), checkerId: 'project.validation' });
        expect(doc.feedback.at(-1)).toMatchObject({ origin: 'host_check', signal: 'verified_failure' });
        // A stored assertion is rechecked against actual authority at consumption.
        await projectService.repository.mutate(h.handle, projectScope, task.projectId, doc.sequence, next => { next.feedback.at(-1).signal = 'no_failure'; });
        expect((await projectService.inspect(h.handle, projectLookup)).feedback.at(-1).status).toBe('stale');
        doc = await projectService.inspect(h.handle, projectLookup);
        doc = await projectService.withdraw(h.handle, { ...projectLookup, id: doc.feedback[0].id, expectedSequence: doc.sequence });
        expect(await projectService.collect(h.handle, { kind: 'project_task', id: task.taskId, scope: projectScope })).toMatchObject({ status: 'already_collected' });
        await agent.resetOperations(h.handle, task.projectId, task.taskId);
        await agent.executeTool(h.handle, task.projectId, task.taskId, { name: 'atri_agent_project_save', args: { source: invalid, stepId: 's' } });
        await agent.prepareReview(h.handle, task.projectId, task.taskId);
        doc = await projectService.inspect(h.handle, projectLookup);
        expect(doc.feedback[0].status).toBe('withdrawn');
        expect(doc.feedback.at(-1)).toMatchObject({ kind: 'technical', origin: 'host', signal: 'validation_failed', status: 'active' });
        expect(new Set(doc.collections.map(marker => marker.sourceHash)).size).toBe(2);
        const isolated = await f.agent.createTask(h.handle, task.projectId, { intent: 'Isolated', baseRevision: created.revision.revision });
        await f.agent.setPlan(h.handle, task.projectId, isolated.taskId, { summary: 'Isolated', steps: [{ id: 'isolated', title: 'Isolated' }] });
        expect((await projectService.inspect(h.handle, projectLookup)).feedback.every(item => item.source.id !== isolated.taskId)).toBe(true);
    });
});

test('a context diagnosis cannot launch target extraction or incur a charge', async () => {
    const f = await evolutionFixture(makeTempFsEngineHarness);
    try {
        const input = { scope: f.scope, subject: f.subject }, doc = await f.service.experience.inspect(f.h.handle, input), batch = await f.service.experience.reflection(f.h.handle, input);
        await f.service.experience.diagnose(f.h.handle, { ...input, expectedSequence: doc.sequence, batchHash: batch.batchHash, rationale: 'Missing context',
            conditions: [], counterexamples: [], direction: 'undetermined', attribution: { loci: ['context'], intervention: 'engineering' } });
        const owner = await f.repository.owner(f.h.handle), state = await f.repository.get(f.h.handle, f.scope, f.subject);
        await expect(f.service.start(f.h.handle, { ...input, expectedSequence: state.sequence })).rejects.toThrow('intervention_unsupported');
        expect(await f.repository.owner(f.h.handle)).toEqual(owner);
    } finally { await f.h.cleanup(); }
});

test('a v1 migration pauses the existing queued job even when its feedback bytes are unchanged', async () => {
    const f = await evolutionFixture(makeTempFsEngineHarness);
    let finish;
    try {
        const input = { scope: f.scope, subject: f.subject }, doc = await f.service.experience.repository.get(f.h.handle, f.scope, f.subject);
        const legacy = { ...doc, schemaVersion: 1 }; delete legacy.collections;
        const key = { kind: K.agentExperience, handle: f.h.handle, scopeId: doc.scopeId };
        await f.h.engine.withTransaction(f.h.handle, tx => tx.putResource(key, { doc: legacy, integrity: hash(legacy) }));
        f.service.scheduler = { submit: () => ({ operationId: 'held', result: new Promise(resolve => { finish = resolve; }) }), cancel: jest.fn() };
        const state = await f.repository.get(f.h.handle, f.scope, f.subject);
        const queued = await f.service.start(f.h.handle, { ...input, expectedSequence: state.sequence });
        await f.service.experience.repository.mutate(f.h.handle, f.scope, f.subject, legacy.sequence, next => { next.retentionDays = 29; });
        const migrated = await f.service.experience.repository.get(f.h.handle, f.scope, f.subject), paused = await f.repository.get(f.h.handle, f.scope, f.subject);
        expect(migrated.feedback).toEqual(legacy.feedback);
        expect(paused.policy.mode).toBe('paused'); expect(paused.jobs.find(j => j.id === queued.jobId).status).toBe('invalidated');
        expect((await f.repository.owner(f.h.handle)).attempts).toHaveLength(0);
    } finally { finish?.({}); await f.h.cleanup(); }
});

test('the original compiler/provider/owner path binds model assessment to its settled charge', async () => {
    const response = { signal: 'unknown', claims: [], rationale: 'Insufficient semantic evidence' };
    let sends = 0;
    const f = await evolutionFixture(makeTempFsEngineHarness, 'project-strategy', { realEvaluator: true, fetchImpl: async () => {
        sends++;
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { content: JSON.stringify(response) }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }) };
    } });
    try {
        const state = await f.repository.get(f.h.handle, f.scope, f.subject), config = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId);
        const result = await f.evaluator.extract(f.h.handle, { id: 'assessment', scopeId: state.scopeId, domain: 'project', price: null }, config,
            new AbortController().signal, async () => {}, { kind: 'quality_assessment', profile: qualityRef('project.m1.related'), instruction: 'Return unknown when unsupported.' });
        expect(result.signal).toBe('unknown'); expect(result.producer.modelId).toBe(config.model.remoteModelId);
        const owner = await f.repository.owner(f.h.handle), charge = owner.attempts.find(a => a.id === result.producer.chargeId);
        expect(charge).toMatchObject({ status: 'reported', tokens: 20, requestHash: result.producer.requestHash, snapshotHash: result.producer.snapshotHash });
        expect(sends).toBe(1); expect(JSON.stringify(result)).not.toContain('fixture-secret');
    } finally { await f.h.cleanup(); }
});

test('legacy quality reports cannot gain independent pilot eligibility, and missing/changed dimensions fail closed', () => {
    const report = syntheticReport({ id: 'quality', domain: 'rp' }, { baseline: {}, candidate: {} }, { baseline: {}, candidate: {} });
    report.schemaVersion = 2;
    report.quality = qualityEnvelope('rp', selectCases({ purpose: 'evaluation', split: 'promotion' }).filter(c => c.entrance === 'rp'), 'promotion');
    expect(validateQualityReport(report)).toEqual(report.quality);
    expect(promotionDecision(report).reasons).toContain('source_unready');
    report.quality.cases[0].provenance.independence = 'established';
    expect(promotionDecision(report).reasons).toContain('quality_envelope_changed');
    delete report.pairs[0].judge.deltas.player_agency;
    expect(() => validateQualityReport(report)).toThrow('ungraded');
});

test('an unregistered pilot is rejected before the original evaluator can send', async () => {
    const evaluator = new EvolutionEvaluator({ host: {}, repository: {} });
    await expect(evaluator.compare('fixture', {}, {}, {}, null, null, undefined, undefined, { profileId: 'rp.m1.information' })).rejects.toThrow('source_unready');
});
