import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentExperienceService } from '../../src/native/agent-intelligence/experience-service.js';
import { AgentEvidenceRepository } from '../../src/native/agent-intelligence/evidence-repository.js';
import { AgentEvidenceService } from '../../src/native/agent-intelligence/evidence-service.js';
import { RpEvidenceCaptureService } from '../../src/native/agent-intelligence/rp-capture-service.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { DAY } from '../../src/native/agent-intelligence/experience-repository.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { services, projectSource } from './project-fixture.js';
import { analyzeLearningFiles, analyzeLearningExports, assertLearningExport } from '../../src/native/agent-intelligence/learning-trajectory.js';

const scope = { domain: 'rp_chat', charDir: 'Actor', name: 'learning', isGroup: false, groupId: '' };
const messages = () => [{ memory_os_source_id: 'user', is_user: true, mes: 'PRIVATE INPUT', swipe_id: 0 },
    { memory_os_source_id: 'actor', is_user: false, mes: 'PRIVATE OUTPUT', swipe_id: 0 }];
const feedback = { kind: 'explicit', signal: 'correction', dimension: 'behavior', note: 'PRIVATE FEEDBACK' };
describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s learning metadata', (_name, make) => {
    let h, chat, service, evidence, target, now, doc;
    beforeEach(async () => {
        h = await make(); now = 100000;
        chat = new ChatRepo({ engine: h.engine });
        const source = new AgentEvidenceService({ chatRepo: chat });
        evidence = new AgentEvidenceRepository({ engine: h.engine });
        const capture = new RpEvidenceCaptureService({ repository: evidence, service: source });
        service = new AgentExperienceService({ engine: h.engine, chatRepo: chat, now: () => now });
        await chat.save(h.handle, scope.charDir, scope.name, {}, messages(), null);
        const marker = await capture.begin(h.handle, { scope, rootRunId: 'learning', selectors: [{ kind: 'message', messageId: 'user', floor: 0 }] });
        const output = (await source.capture(h.handle, scope, [{ kind: 'message', messageId: 'actor', floor: 1 }], { maxSources: 4, maxBytes: 32768, maxScanMessages: 128 })).references[0];
        await capture.update(h.handle, { evidenceId: marker.evidenceId, sequence: 1, status: 'completed', trace: { schemaVersion: 1,
            events: [{ type: 'run.started', eventId: 'start', runId: 'learning', generation: 0, version: 1 }], missing: 0, reasons: [] }, output });
        const record = await evidence.get(h.handle, marker.evidenceId);
        target = { kind: 'evidence', id: record.evidenceId, integrity: hashNativeDocument(record), scope };
        doc = await service.submit(h.handle, { target, feedback, expectedSequence: null });
    });
    afterEach(async () => { jest.restoreAllMocks(); await h.cleanup(); });
    const request = value => ({ scope: value.scope, subject: value.subject, expectedSequence: value.sequence, purpose: 'offline-analysis' });
    const change = value => ({ scope: value.scope, subject: value.subject, expectedSequence: value.sequence, id: value.feedback[0].id });
    test('real persistent RP export is metadata only and file consumer uses missing coverage', async () => {
        const restored = new AgentExperienceService({ engine: h.engine, chatRepo: new ChatRepo({ engine: h.engine }), now: () => now });
        const result = await restored.exportLearning(h.handle, request(doc));
        expect(result.records).toHaveLength(1);
        expect(result.records[0]).toMatchObject({ preference: { origin: 'user' }, reward: null, missing: ['outcome', 'receipt', 'reward'] });
        expect(JSON.stringify(result)).not.toMatch(/PRIVATE|rootRunId|trace|note|mes/);
        const directory = await mkdtemp(join(tmpdir(), 'atria-learning-'));
        try {
            const file = join(directory, 'export.json'); await writeFile(file, JSON.stringify(result));
            expect(await analyzeLearningFiles([file])).toMatchObject({ records: 1, derivedLabels: 0, coverage: { preference: 1, reward: 0 } });
            await writeFile(file, JSON.stringify({ ...result, schemaVersion: 2 }));
            await expect(analyzeLearningFiles([file])).rejects.toThrow();
        } finally { await rm(directory, { recursive: true, force: true }); }
    });
    test('owner, purpose, sequence and unknown caller fields fail closed', async () => {
        await expect(service.exportLearning('other', request(doc))).rejects.toThrow();
        for (const extra of [{ purpose: 'training' }, { expectedSequence: null }, { expectedSequence: doc.sequence + 1 }, { owner: h.handle }])
            await expect(service.exportLearning(h.handle, { ...request(doc), ...extra })).rejects.toThrow();
    });
    test('correction stays in the same family split; withdrawal and deletion remove labels', async () => {
        const before = await service.exportLearning(h.handle, request(doc));
        doc = await service.correct(h.handle, { ...change(doc), feedback: { ...feedback, signal: 'prefer' } });
        const after = await service.exportLearning(h.handle, request(doc));
        const report = analyzeLearningExports([before, after]);
        expect(report.records).toBe(2);
        expect(Object.values(report.splits).filter(ids => ids.length)).toHaveLength(1);
        doc = await service.withdraw(h.handle, change(doc));
        expect((await service.exportLearning(h.handle, request(doc))).records).toEqual([]);
        doc = await service.delete(h.handle, change(doc));
        expect((await service.exportLearning(h.handle, request(doc))).records).toEqual([]);
    });
    test('deleted source purges the next export and old expected sequence is rejected', async () => {
        await evidence.delete(h.handle, target.id, target.integrity);
        await expect(service.exportLearning(h.handle, request(doc))).rejects.toThrow();
        doc = await service.inspect(h.handle, { scope, subject: doc.subject });
        expect((await service.exportLearning(h.handle, request(doc))).records).toEqual([]);
    });
    test('source edit and expiry cannot export old labels', async () => {
        const edited = messages(); edited[1].mes = 'CHANGED';
        await chat.save(h.handle, scope.charDir, scope.name, {}, edited, null);
        await expect(service.exportLearning(h.handle, request(doc))).rejects.toThrow();
        doc = await service.inspect(h.handle, { scope, subject: doc.subject });
        expect((await service.exportLearning(h.handle, request(doc))).records).toEqual([]);
        now += 31 * DAY;
        await expect(service.exportLearning(h.handle, request(doc))).rejects.toThrow();
    });
    test('feedback mutation during the original source read rejects mixed result', async () => {
        const original = service._target.bind(service);
        jest.spyOn(service, '_target').mockImplementationOnce(async (...args) => {
            const target = await original(...args); await service.withdraw(h.handle, change(doc)); return target;
        });
        await expect(service.exportLearning(h.handle, request(doc))).rejects.toThrow('learning_sequence_conflict');
    });
    test('late source change is rejected after projection', async () => {
        const original = service._target.bind(service);
        jest.spyOn(service, '_target').mockImplementationOnce(async (...args) => {
            const target = await original(...args); const edited = messages(); edited[1].mes = 'CHANGED';
            await chat.save(h.handle, scope.charDir, scope.name, {}, edited, null); return target;
        });
        await expect(service.exportLearning(h.handle, request(doc))).rejects.toThrow('learning_source_changed');
    });
    test('real original Project task export keeps derived observation separate from preference', async () => {
        const { studio, agent } = services(h), created = await studio.createProject(h.handle, projectSource());
        const task = await agent.createTask(h.handle, created.project.projectId, { intent: 'PRIVATE INTENT', baseRevision: created.revision.revision });
        const project = new AgentExperienceService({ engine: h.engine, studio, agent, now: () => now });
        const pscope = { domain: 'project', projectId: task.projectId };
        const pdoc = await project.submit(h.handle, { target: { kind: 'project_task', id: task.taskId, integrity: hashNativeDocument(task), scope: pscope },
            feedback: { kind: 'observation', signal: 'regenerate', dimension: 'general', note: '' }, expectedSequence: null });
        const exported = await project.exportLearning(h.handle, request(pdoc));
        expect(exported.records[0]).toMatchObject({ action: { kind: 'project_task' }, label: { derived: true, origin: 'client_observation' }, preference: null });
        expect(JSON.stringify(exported)).not.toContain('PRIVATE INTENT');
        expect(analyzeLearningExports([exported]).derivedLabels).toBe(1);
        const forged = structuredClone(exported); forged.records[0].label.origin = 'user';
        const { integrity, ...content } = forged; forged.integrity = hashNativeDocument(content);
        expect(() => assertLearningExport(forged)).toThrow('origin mismatch');
    });
});
