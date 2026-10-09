import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { AgentExperienceService } from '../../src/native/agent-intelligence/experience-service.js';
import { AgentExperienceRepository, assertExperience, DAY } from '../../src/native/agent-intelligence/experience-repository.js';
import { AgentEvidenceRepository } from '../../src/native/agent-intelligence/evidence-repository.js';
import { AgentEvidenceService } from '../../src/native/agent-intelligence/evidence-service.js';
import { RpEvidenceCaptureService } from '../../src/native/agent-intelligence/rp-capture-service.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { FsEngine } from '../../src/storage/engines/fs-engine.js';
import { SqliteEngine } from '../../src/storage/engines/sqlite-engine.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';
import { services, projectSource } from './project-fixture.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { initStorage, getStorageEngine } from '../../src/storage/index.js';
import { encodeNativeResourceKey, decodeNativeResourceKey } from '../../src/storage/engines/native-resource-key.js';
import { MysqlTransaction } from '../../src/storage/engines/mysql-engine-transaction.js';
import { PgTransaction } from '../../src/storage/engines/postgres-engine-transaction.js';

const scope = { domain: 'rp_chat', charDir: 'Actor', name: 'feedback', isGroup: false, groupId: '' };
const budget = { maxSources: 4, maxBytes: 32768, maxScanMessages: 128 };
const messages = () => [{ memory_os_source_id: 'user', is_user: true, name: 'User', mes: 'A choice.', swipe_id: 0 },
    { memory_os_source_id: 'actor', is_user: false, name: 'Actor', mes: 'A reply.', swipe_id: 0 }];
const explicit = { kind: 'explicit', signal: 'correction', dimension: 'behavior', note: 'Leave my action open.' };
const weak = { kind: 'observation', signal: 'regenerate', dimension: 'general', note: '' };
const diagnosis = { rationale: 'A public hypothesis', conditions: ['Player action is unresolved'], counterexamples: ['Player already chose'], direction: 'prompt', attribution: { loci: ['prompt'], intervention: 'local_target' } };

// Both real local storage modes; no model or production data.
describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s feedback lifecycle', (_name, make) => {
    let h, chat, evidence, source, capture, service, target, now, reopened;
    beforeEach(async () => {
        h = await make(); now = 100000; chat = new ChatRepo({ engine: h.engine });
        source = new AgentEvidenceService({ chatRepo: chat }); evidence = new AgentEvidenceRepository({ engine: h.engine });
        capture = new RpEvidenceCaptureService({ repository: evidence, service: source });
        service = new AgentExperienceService({ engine: h.engine, chatRepo: chat, now: () => now });
        await chat.save(h.handle, scope.charDir, scope.name, {}, messages(), null);
        target = await captured('root');
    });
    afterEach(async () => { setReadOnly(false); jest.restoreAllMocks(); reopened?.close?.(); await h.cleanup(); });
    async function captured(run) {
        const marker = await capture.begin(h.handle, { scope, rootRunId: run, selectors: [{ kind: 'message', messageId: 'user', floor: 0 }] });
        const output = (await source.capture(h.handle, scope, [{ kind: 'message', messageId: 'actor', floor: 1 }], budget)).references[0];
        await capture.update(h.handle, { evidenceId: marker.evidenceId, sequence: 1, status: 'completed',
            trace: { schemaVersion: 1, events: [{ type: 'run.started', eventId: 'start', runId: run, generation: 0, version: 1 }], missing: 0, reasons: [] }, output });
        const record = await evidence.get(h.handle, marker.evidenceId);
        return { kind: 'evidence', id: record.evidenceId, integrity: hashNativeDocument(record), scope };
    }
    const lookup = (doc = { scope, subject: 'Actor' }) => ({ scope: doc.scope, subject: doc.subject });
    const submit = (feedback = explicit, expectedSequence = null, selected = target) => service.submit(h.handle, { target: selected, feedback, expectedSequence });
    const change = (doc, extra = {}) => ({ ...lookup(doc), expectedSequence: doc.sequence, id: doc.feedback[0].id, ...extra });
    async function diagnose(doc) {
        const batch = await service.reflection(h.handle, lookup(doc));
        return service.diagnose(h.handle, { ...lookup(doc), expectedSequence: doc.sequence, batchHash: batch.batchHash, ...diagnosis });
    }
    test('explicit preference and diagnosis persist across physical reopen; export does not expand source content', async () => {
        let doc = await submit(); doc = await diagnose(doc);
        h.engine.close?.(); reopened = new (h.kind === 'sqlite' ? SqliteEngine : FsEngine)({ directoriesByHandle: () => h.dirs });
        const restored = new AgentExperienceService({ engine: reopened, chatRepo: new ChatRepo({ engine: reopened }), now: () => now });
        const result = await restored.export(h.handle, lookup(doc));
        expect(result.experience.diagnoses[0]).toMatchObject({ origin: 'user_hypothesis', applicability: 'current' });
        expect(result.experience.feedback[0]).toMatchObject({ kind: 'explicit', origin: 'user', applicability: 'current' });
        expect(JSON.stringify(result)).not.toMatch(/A reply\.|A choice\.|providerState|conversation|Workspace/);
        expect(await restored.reflection(h.handle, lookup(doc))).toMatchObject({ status: 'idle', reason: 'batch_diagnosed', modelCalls: 0 });
    });
    test('one regenerate is weak, repetitions on one source cannot fake an aggregate', async () => {
        let doc = await submit(weak);
        for (let i = 0; i < 3; i++) doc = await submit(weak, doc.sequence);
        expect(await service.reflection(h.handle, lookup(doc))).toMatchObject({ status: 'idle', reason: 'insufficient_trigger' });
        expect(doc.feedback.every(item => item.kind === 'observation' && item.note === '')).toBe(true);
        for (const run of ['two', 'three']) doc = await submit(weak, doc.sequence, await captured(run));
        const batch = await service.reflection(h.handle, lookup(doc)); expect(batch.status).toBe('ready');
        await expect(service.diagnose(h.handle, { ...lookup(doc), expectedSequence: doc.sequence, batchHash: batch.batchHash, ...diagnosis })).rejects.toThrow('Weak observation');
        const lesson = await service.diagnose(h.handle, { ...lookup(doc), expectedSequence: doc.sequence, batchHash: batch.batchHash, ...diagnosis, direction: 'undetermined', attribution: { loci: ['unknown'], intervention: 'none' } });
        expect(lesson.diagnoses[0].direction).toBe('undetermined');
    });
    test('correct / withdraw revoke a diagnosis; delete purges all related diagnosis content', async () => {
        let doc = await diagnose(await submit());
        doc = await service.correct(h.handle, change(doc, { feedback: { ...explicit, note: 'New correction' } }));
        expect(doc.feedback[0].revision).toBe(1); expect(doc.diagnoses[0].status).toBe('stale');
        doc = await diagnose(doc);
        doc = await service.withdraw(h.handle, change(doc));
        expect(doc.feedback[0].status).toBe('withdrawn'); expect(doc.diagnoses.every(item => item.status === 'stale')).toBe(true);
        await expect(service.correct(h.handle, change(doc, { feedback: explicit }))).rejects.toThrow('Active explicit');
        doc = await service.delete(h.handle, change(doc)); expect(doc.feedback).toEqual([]); expect(doc.diagnoses).toEqual([]);
    });
    test('a diagnosis can be withdrawn and replaced without rewriting the original feedback', async () => {
        let doc = await diagnose(await submit());
        const feedback = doc.feedback;
        doc = await service.withdrawDiagnosis(h.handle, { ...lookup(doc), id: doc.diagnoses[0].id, expectedSequence: doc.sequence });
        expect(doc.feedback).toEqual(feedback);
        doc = await diagnose(doc);
        expect(doc.diagnoses).toHaveLength(2);
        doc = await service.deleteDiagnosis(h.handle, { ...lookup(doc), id: doc.diagnoses[0].id, expectedSequence: doc.sequence });
        expect(doc.diagnoses).toHaveLength(1); expect(doc.feedback).toEqual(feedback);
    });
    test('owner / character / chat / group message scopes do not share feedback', async () => {
        const doc = await submit();
        expect(await service.inspect(h.handle, { ...lookup(doc), subject: 'Other' })).toBeNull();
        expect(await service.inspect(h.handle, { scope: { ...scope, name: 'other' }, subject: doc.subject })).toBeNull();
        await expect(service.inspect('foreign', lookup(doc))).rejects.toThrow();
        await expect(submit(explicit, doc.sequence, { ...target, scope: { ...scope, charDir: 'Other' } })).rejects.toThrow();
        const group = { ...scope, isGroup: true, charDir: '', groupId: 'group-one' };
        await chat.save(h.handle, '', group.name, {}, messages(), null, { isGroup: true, groupId: group.groupId });
        const set = await source.capture(h.handle, group, [{ kind: 'message', messageId: 'actor', floor: 1 }], budget);
        let record = await evidence.begin(h.handle, { scope: group, rootRunId: 'group', origin: 'client_observation', sources: set });
        record = await evidence.update(h.handle, record.evidenceId, { sequence: 1, status: 'completed', trace: { schemaVersion: 1, events: [{ type: 'run.started', eventId: 'group', runId: 'group', generation: 0, version: 1 }], missing: 0, reasons: [] }, outputRef: set.references[0] }, 'client_observation');
        const grouped = await submit(explicit, null, { kind: 'evidence', id: record.evidenceId, integrity: hashNativeDocument(record), scope: group });
        expect(grouped.subject).toBe('message:actor');
    });
    test('CAS rejects stale edits and forged target / host classification / private fields', async () => {
        const doc = await submit();
        const results = await Promise.allSettled([service.withdraw(h.handle, change(doc)), service.delete(h.handle, change(doc))]);
        expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        expect(results.find(item => item.status === 'rejected').reason.name).toBe('ConflictError');
        await expect(submit({ ...explicit, kind: 'technical', signal: 'committed' })).rejects.toThrow('Host outcome');
        await expect(submit({ ...weak, note: 'I dislike this' })).rejects.toThrow();
        await expect(submit({ ...explicit, providerState: 'PRIVATE' })).rejects.toThrow();
        await expect(service.outcome(h.handle, { target, expectedSequence: null })).rejects.toThrow('Host outcome');
        await expect(submit(explicit, null, { ...target, integrity: '0'.repeat(64) })).rejects.toThrow('target_changed');
    });
    test('edit / variant invalidation is persisted and cannot revive after old chat content restore', async () => {
        const doc = await diagnose(await submit());
        const changed = messages(); changed[1].swipe_id = 1; changed[1].mes = 'Changed variant';
        await chat.save(h.handle, scope.charDir, scope.name, {}, changed, null);
        const stale = await service.inspect(h.handle, lookup(doc));
        expect(stale.feedback[0]).toMatchObject({ status: 'stale', applicability: 'incomplete' }); expect(stale.diagnoses[0].status).toBe('stale');
        await chat.save(h.handle, scope.charDir, scope.name, {}, messages(), null);
        expect((await service.inspect(h.handle, lookup(doc))).feedback[0].applicability).toBe('incomplete');
        expect((await service.reflection(h.handle, lookup(doc))).status).toBe('idle');
    });
    test('source deletes physically cascade and partial cleanup failure prevents original deletion', async () => {
        const doc = await diagnose(await submit());
        const mutate = jest.spyOn(AgentExperienceRepository.prototype, 'mutate').mockRejectedValueOnce(new Error('Cleanup failed'));
        await expect(evidence.delete(h.handle, target.id)).rejects.toThrow('Cleanup failed');
        expect(await evidence.get(h.handle, target.id)).not.toBeNull(); mutate.mockRestore();
        await evidence.delete(h.handle, target.id);
        const empty = await service.inspect(h.handle, lookup(doc)); expect(empty.feedback).toEqual([]); expect(empty.diagnoses).toEqual([]);
    });
    test('original chat deletion is reconciled to a physical purge at next consumption', async () => {
        const doc = await diagnose(await submit()); await chat.delete(h.handle, scope.charDir, scope.name);
        const view = await service.inspect(h.handle, lookup(doc));
        expect(view.feedback).toEqual([]); expect(view.diagnoses).toEqual([]);
    });
    test('retention filters under read-only, physically prunes when writable; extending policy cannot revive', async () => {
        let doc = await diagnose(await submit());
        doc = await service.retention(h.handle, { ...lookup(doc), expectedSequence: doc.sequence, days: 1 });
        const before = await service.repository.get(h.handle, doc.scope, doc.subject);
        now += DAY;
        setReadOnly(true);
        expect((await service.export(h.handle, lookup(doc))).experience.feedback).toEqual([]);
        expect(await service.repository.get(h.handle, doc.scope, doc.subject)).toEqual(before);
        await expect(service.purge(h.handle, { ...lookup(doc), expectedSequence: doc.sequence })).rejects.toThrow();
        setReadOnly(false);
        doc = await service.retention(h.handle, { ...lookup(doc), expectedSequence: doc.sequence, days: 365 });
        expect(doc.feedback).toEqual([]); expect(doc.diagnoses).toEqual([]);
        await expect(service.retention(h.handle, { ...lookup(doc), expectedSequence: doc.sequence, days: 366 })).rejects.toThrow();
        expect(await service.deleteScope(h.handle, { ...lookup(doc), expectedSequence: doc.sequence })).toEqual({ deleted: true });
    });
    test('capacity / corrupt / unknown schema fail closed; dump / restore retains typed resource', async () => {
        const doc = await submit(); const resourceKey = { kind: K.agentExperience, handle: h.handle, scopeId: doc.scopeId };
        const dump = await h.engine.dumpUser(h.handle);
        await h.engine.restoreUser(h.handle, dump);
        expect(await service.repository.get(h.handle, doc.scope, doc.subject)).toEqual(doc);
        expect(() => assertExperience({ ...doc, schemaVersion: 3 })).toThrow();
        expect(() => assertExperience({ ...doc, feedback: Array.from({ length: 257 }, (_, i) => ({ ...doc.feedback[0], id: 'feedback_' + i })) })).toThrow('capacity');
        expect(() => assertExperience({ ...doc, feedback: Array.from({ length: 140 }, (_, i) => ({ ...doc.feedback[0], id: 'feedback_' + i, note: 'x'.repeat(4096) })) })).toThrow('capacity');
        await h.engine.withTransaction(h.handle, async tx => { const value = await tx.getResource(resourceKey); value.doc.feedback[0].note = 'Corrupt'; await tx.putResource(resourceKey, value); });
        await expect(service.export(h.handle, lookup(doc))).rejects.toThrow('integrity');
    });
    test('Project consumer derives technical outcome from real validation and task deletion cleans content', async () => {
        const { studio, agent } = services(h); const project = projectSource();
        const created = await studio.createProject(h.handle, project);
        let task = await agent.createTask(h.handle, project.project.projectId, { intent: 'Rename', baseRevision: created.revision.revision });
        task = await agent.setPlan(h.handle, task.projectId, task.taskId, { summary: 'Rename', steps: [{ id: 'rename', title: 'Rename', impact: 'low' }] });
        await agent.executeTool(h.handle, task.projectId, task.taskId, { name: 'atri_agent_project_save', args: { source: { ...project, project: { ...project.project, displayName: 'New name' } }, stepId: 'rename' } });
        task = await agent.prepareReview(h.handle, task.projectId, task.taskId);
        const projectScope = { domain: 'project', projectId: task.projectId };
        const projectService = new AgentExperienceService({ engine: h.engine, studio, agent, now: () => now });
        const selected = { kind: 'project_task', id: task.taskId, scope: projectScope, integrity: hashNativeDocument(task) };
        let doc = await projectService.outcome(h.handle, { target: selected, expectedSequence: null });
        expect(doc.feedback[0]).toMatchObject({ kind: 'technical', signal: 'validated', origin: 'host' });
        doc = await projectService.outcome(h.handle, { target: selected, expectedSequence: doc.sequence }); expect(doc.feedback).toHaveLength(1);
        expect(await projectService.reflection(h.handle, lookup(doc))).toMatchObject({ status: 'idle' });
        doc = await projectService.submit(h.handle, { target: selected, expectedSequence: doc.sequence, feedback: explicit });
        expect((await projectService.inspect(h.handle, lookup(doc))).feedback[1].applicability).toBe('current');
        await agent.deleteTask(h.handle, task.projectId, task.taskId);
        expect((await projectService.inspect(h.handle, lookup(doc))).feedback).toEqual([]);
        await agent.deleteProjectTasks(h.handle, task.projectId);
        expect(await projectService.inspect(h.handle, lookup(doc))).toBeNull();
    });
    test('Project human revision invalidates diagnosis and cannot borrow a different project', async () => {
        const { studio, agent } = services(h); const project = projectSource(); const created = await studio.createProject(h.handle, project);
        const task = await agent.createTask(h.handle, project.project.projectId, { intent: 'Inspect', baseRevision: created.revision.revision });
        const projectService = new AgentExperienceService({ engine: h.engine, studio, agent, now: () => now });
        const selected = { kind: 'project_task', id: task.taskId, scope: { domain: 'project', projectId: task.projectId }, integrity: hashNativeDocument(task) };
        const doc = await projectService.submit(h.handle, { target: selected, feedback: explicit, expectedSequence: null });
        await studio.saveProjectSource(h.handle, task.projectId, { source: { ...project, project: { ...project.project, displayName: 'Human edit' } }, baseRevision: created.revision.revision });
        expect((await projectService.inspect(h.handle, lookup(doc))).feedback[0].applicability).toBe('incomplete');
        await expect(projectService.submit(h.handle, { target: { ...selected, scope: { domain: 'project', projectId: createNativeId('project') } }, feedback: explicit, expectedSequence: null })).rejects.toThrow();
    });
    test('Native feedback derives actor identity and branch change invalidates exact sources', async () => {
        const nativeScope = { domain: 'rp_session', sessionId: createNativeId('session') };
        const messageId = createNativeId('message'), variantId = createNativeId('variant'), actorId = createNativeId('actor');
        const snapshot = { session: { packageVersionId: createNativeId('packageVersion'), entryPointId: createNativeId('entryPoint') },
            revision: { branchId: createNativeId('branch'), revisionId: createNativeId('revision') },
            timeline: [{ messageId, activeVariantId: variantId, role: 'assistant', actorId, content: 'Private source body' }], states: {} };
        const sessionCore = { load: async () => structuredClone(snapshot) };
        const nativeSources = new AgentEvidenceService({ sessionCore });
        const set = await nativeSources.capture(h.handle, nativeScope, [{ kind: 'message', messageId }], budget);
        let record = await evidence.begin(h.handle, { scope: nativeScope, rootRunId: 'native', origin: 'host', sources: set });
        record = await evidence.update(h.handle, record.evidenceId, { sequence: 1, status: 'completed', trace: { schemaVersion: 1, events: [{ type: 'run.started', eventId: 'native', runId: 'native', generation: 0, version: 1 }], missing: 0, reasons: [] },
            outcome: { kind: 'turn', invocationId: 'invocation', branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId, messageId, variantId, receiptHash: 'a'.repeat(64) }, outputRef: set.references[0] }, 'host');
        const nativeService = new AgentExperienceService({ engine: h.engine, sessionCore, now: () => now });
        const selected = { kind: 'evidence', id: record.evidenceId, integrity: hashNativeDocument(record), scope: nativeScope };
        const doc = await nativeService.submit(h.handle, { target: selected, feedback: explicit, expectedSequence: null });
        expect(doc.subject).toBe(actorId);
        expect((await nativeService.inspect(h.handle, lookup(doc))).feedback[0].applicability).toBe('current');
        expect(await nativeService.inspect(h.handle, { ...lookup(doc), subject: createNativeId('actor') })).toBeNull();
        const failedSet = await nativeSources.capture(h.handle, nativeScope, [{ kind: 'message', messageId }], budget);
        let failure = await evidence.begin(h.handle, { scope: nativeScope, rootRunId: 'native-failed', origin: 'host', sources: failedSet });
        failure = await evidence.update(h.handle, failure.evidenceId, { sequence: 1, status: 'failed', trace: record.trace }, 'host');
        const outcome = await nativeService.outcome(h.handle, { target: { ...selected, id: failure.evidenceId, integrity: hashNativeDocument(failure) }, expectedSequence: null });
        expect(outcome.feedback[0]).toMatchObject({ kind: 'technical', signal: 'failed', status: 'active' });
        expect(await nativeService.reflection(h.handle, lookup(outcome))).toMatchObject({ status: 'ready', reason: 'explicit_or_failure_event' });
        snapshot.revision.branchId = createNativeId('branch');
        expect((await nativeService.inspect(h.handle, lookup(doc))).feedback[0].status).toBe('stale');
    });
    test('bounded source retention deletes old evidence with CAS, and keeps active Project Review', async () => {
        let doc = await submit(); doc = await service.retention(h.handle, { ...lookup(doc), expectedSequence: doc.sequence, days: 365 });
        now = Date.now() + 31 * DAY;
        const remove = service.evidence.delete.bind(service.evidence);
        jest.spyOn(service.evidence, 'delete').mockImplementationOnce(async (...args) => {
            const record = await evidence.get(h.handle, target.id);
            await evidence.update(h.handle, target.id, { sequence: record.sequence + 1, status: 'completed', trace: record.trace, outputRef: record.outputRef }, 'client_observation');
            return remove(...args);
        });
        expect(await service.purgeSources(h.handle, { scope, days: 30, limit: 1 })).toMatchObject({ deleted: 0, conflicts: 1 });
        expect(await evidence.get(h.handle, target.id)).not.toBeNull();
        expect(await service.purgeSources(h.handle, { scope, days: 30, limit: 1 })).toMatchObject({ deleted: 1, remaining: 0, modelCalls: 0 });
        expect(await evidence.get(h.handle, target.id)).toBeNull();
        expect((await service.repository.get(h.handle, doc.scope, doc.subject)).feedback).toEqual([]);
        const { studio, agent } = services(h); const project = projectSource(); const created = await studio.createProject(h.handle, project);
        let task = await agent.createTask(h.handle, project.project.projectId, { intent: 'Rename', baseRevision: created.revision.revision });
        task = await agent.setPlan(h.handle, task.projectId, task.taskId, { summary: 'Rename', steps: [{ id: 'rename', title: 'Rename', impact: 'low' }] });
        await agent.executeTool(h.handle, task.projectId, task.taskId, { name: 'atri_agent_project_save', args: { source: project, stepId: 'rename' } });
        task = await agent.prepareReview(h.handle, task.projectId, task.taskId);
        const projectService = new AgentExperienceService({ engine: h.engine, studio, agent, now: () => now });
        const policy = { scope: { domain: 'project', projectId: task.projectId }, days: 30, limit: 128 };
        expect(await projectService.purgeSources(h.handle, policy)).toMatchObject({ deleted: 0 });
        task = await agent.commit(h.handle, task.projectId, task.taskId);
        const sourceBefore = (await studio.getProject(h.handle, task.projectId)).source;
        expect(await projectService.purgeSources(h.handle, policy)).toMatchObject({ deleted: 1 });
        await expect(agent.getTask(h.handle, task.projectId, task.taskId)).rejects.toThrow();
        expect((await studio.getProject(h.handle, task.projectId)).source).toEqual(sourceBefore);
    });
    test('HTTP consumer authenticates, rejects owner/host forgery and exposes both entrypoints', async () => {
        initStorage({ mode: h.kind, directoriesByHandle: () => h.dirs });
        const app = express(); app.use(express.json()); app.use((req, _res, next) => { if (req.headers['x-owner']) req.user = { profile: { handle: req.headers['x-owner'] } }; next(); });
        const { studio, agent } = services(h);
        app.use(createNativeGenerationRouter(() => ({ persistence: { _engine: h.engine }, studio, agent })));
        expect((await request(app).post('/experience/submit').send({ target, feedback: explicit, expectedSequence: null })).status).toBe(401);
        const selectedTarget = await request(app).post('/experience/target').set('x-owner', h.handle).send({ kind: target.kind, id: target.id, scope });
        expect(selectedTarget.body.target).toEqual(target); expect(selectedTarget.body.subject).toBe('Actor');
        expect(JSON.stringify(selectedTarget.body)).not.toContain('A reply.');
        const result = await request(app).post('/experience/submit').set('x-owner', h.handle).send({ target, feedback: explicit, expectedSequence: null });
        expect(result.status).toBe(200); expect(result.headers['cache-control']).toContain('no-store');
        const view = await request(app).post('/experience/export').set('x-owner', h.handle).send(lookup(result.body));
        expect(view.body.experience.feedback[0].applicability).toBe('current');
        expect((await request(app).post('/experience/submit').set('x-owner', h.handle).send({ target, feedback: explicit, expectedSequence: 0, owner: 'other' })).status).toBe(400);
        expect((await request(app).post('/experience/submit').set('x-owner', h.handle).send({ target, feedback: explicit, expectedSequence: null })).status).toBe(409);
        const project = projectSource(), created = await studio.createProject(h.handle, project);
        const task = await agent.createTask(h.handle, project.project.projectId, { intent: 'Inspect', baseRevision: created.revision.revision });
        const selected = { kind: 'project_task', id: task.taskId, integrity: hashNativeDocument(task), scope: { domain: 'project', projectId: task.projectId } };
        expect((await request(app).post('/experience/submit').set('x-owner', h.handle).send({ target: selected, feedback: explicit, expectedSequence: null })).status).toBe(200);
        setReadOnly(true);
        expect((await request(app).post('/experience/withdraw').set('x-owner', h.handle).send(change(result.body))).status).toBe(503);
        getStorageEngine().close?.();
    });
});

test('experience key and generic SQL registration round-trip FS -> SQLite -> FS', async () => {
    const fs = await makeTempFsEngineHarness(), sql = await makeTempSqliteEngineHarness();
    try {
        const repo = new AgentExperienceRepository({ engine: fs.engine });
        const doc = await repo.mutate(fs.handle, scope, 'Actor', null, () => {});
        const key = { kind: K.agentExperience, handle: fs.handle, scopeId: doc.scopeId };
        expect(decodeNativeResourceKey(key.kind, key.handle, encodeNativeResourceKey(key))).toEqual(key);
        const stored = await fs.engine.withTransaction(fs.handle, tx => tx.getResource(key));
        await sql.engine.withTransaction(sql.handle, tx => tx.putResource(key, stored));
        const transferred = await sql.engine.withTransaction(sql.handle, tx => tx.getResource(key));
        await fs.engine.withTransaction(fs.handle, tx => tx.deleteResource(key));
        await fs.engine.withTransaction(fs.handle, tx => tx.putResource(key, transferred));
        expect(await repo.get(fs.handle, scope, 'Actor')).toEqual(doc);
        for (const tx of [new MysqlTransaction({ conn: {}, handle: fs.handle }), new PgTransaction({ client: {}, handle: fs.handle })]) expect(tx._handlers.has(K.agentExperience)).toBe(true);
    } finally { await fs.cleanup(); await sql.cleanup(); }
});
