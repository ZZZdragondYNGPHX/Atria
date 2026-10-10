import { afterEach, expect, jest, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { Readable } from 'node:stream';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness, makeMultiHandleFsEngine } from '../storage/harness/contract-harness.js';
import { services, projectSource } from './project-fixture.js';
import { ProjectAgentService } from '../../src/native/project-agent.js';
import { ProjectTaskRepository, assertProjectTask } from '../../src/native/agent-intelligence/project-task-repository.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';
import { createNativeStudioRouter } from '../../src/endpoints/native-studio.js';
import { runNativeStudioAgentTask } from '../../public/scripts/native/studio-agent.js';

const cleanups = [];
afterEach(async () => { setReadOnly(false); for (const fn of cleanups.splice(0)) await fn(); });
async function fixture(make = makeTempFsEngineHarness) {
    const h = await make(); cleanups.push(h.cleanup);
    const { studio, agent, repository } = services(h), source = projectSource(), projectId = source.project.projectId;
    const created = await studio.createProject(h.handle, source);
    const task = await agent.createTask(h.handle, projectId, { intent: 'Bounded authoring', baseRevision: created.revision.revision });
    const update = action => agent.strategyCandidates(h.handle, projectId, task.taskId, action);
    const declare = async (allowedFields = ['maxRepairRounds']) => update({ type: 'declare', allowedFields, expectedSequence: (await agent.getTask(h.handle, projectId, task.taskId)).sequence });
    const prepare = async () => update({ type: 'prepare', field: 'maxRepairRounds', value: 1, expectedSequence: (await agent.getTask(h.handle, projectId, task.taskId)).sequence });
    const candidate = async () => (await update({ type: 'inspect' })).candidates.at(-1);
    return { h, studio, agent, repository, source, projectId, task, update, declare, prepare, candidate };
}

test.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s original task CAS/reopen consumes one exact parameter; rollback/reapply reconcile; no other task changes', async (_name, make) => {
    const f = await fixture(make); await f.declare(); await f.prepare(); const c = await f.candidate();
    await f.prepare(); expect((await f.update({ type: 'inspect' })).candidates).toHaveLength(1);
    const old = await f.agent.getContext(f.h.handle, f.projectId, f.task.taskId);
    const next = await f.update({ type: 'apply', candidateId: c.candidateId });
    expect(next.maxRepairRounds).toBe(1); expect(next.strategyVersionId).toBe(c.candidateId);
    const reopened = new ProjectAgentService({ studio: f.studio, repository: new ProjectTaskRepository({ engine: f.h.engine }), maxRepairRounds: 2 });
    const context = await reopened.getContext(f.h.handle, f.projectId, f.task.taskId);
    expect(context.policy).toMatchObject({ maxRepairRounds: 1, strategyVersionId: c.candidateId, humanReviewRequired: true, silentRebase: false });
    expect(context.tools).toEqual(old.tools); expect(old.policy.maxRepairRounds).toBe(2);
    expect((await reopened.strategyCandidates(f.h.handle, f.projectId, f.task.taskId, { type: 'check', candidateId: c.candidateId })).alreadyApplied).toBe(true);
    expect((await f.update({ type: 'apply', candidateId: c.candidateId })).sequence).toBe(next.sequence);
    await f.declare([]);
    await expect(f.update({ type: 'apply', candidateId: c.candidateId })).rejects.toThrow('conflict');
    const reverted = await f.update({ type: 'rollback', candidateId: c.candidateId });
    expect(reverted.maxRepairRounds).toBe(2); expect(reverted.strategyVersionId).toBeUndefined();
    expect((await f.update({ type: 'rollback', candidateId: c.candidateId })).sequence).toBe(reverted.sequence);
    const other = await f.agent.createTask(f.h.handle, f.projectId, { intent: 'Other task', baseRevision: f.task.baseRevision });
    expect(other.maxRepairRounds).toBe(2); expect(other.strategyVersionId).toBeUndefined();
});

test.each(['plan', 'generation', 'takeover', 'project', 'cap', 'redeclare'])('%s drift prevents applying or rolling back the frozen task', async mode => {
    const f = await fixture(); await f.declare(); await f.prepare(); const c = await f.candidate();
    if (mode === 'plan') await f.agent.setPlan(f.h.handle, f.projectId, f.task.taskId, { summary: 'Plan', steps: [{ id: 's', title: 'Step' }] });
    if (mode === 'generation') await f.agent.beginGeneration(f.h.handle, f.projectId, f.task.taskId, { expectedSequence: (await f.agent.getTask(f.h.handle, f.projectId, f.task.taskId)).sequence });
    if (mode === 'takeover') await f.agent.takeOver(f.h.handle, f.projectId, f.task.taskId);
    if (mode === 'project') {
        const source = structuredClone(f.source); source.project.displayName = 'Human edit';
        await f.studio.saveProjectSource(f.h.handle, f.projectId, { source, baseRevision: f.task.baseRevision, origin: { kind: 'human', id: 'fixture' } });
    }
    if (mode === 'cap') f.agent._maxRepairRounds = 3;
    if (mode === 'redeclare') await f.declare();
    await expect(f.update({ type: 'apply', candidateId: c.candidateId })).rejects.toThrow('conflict');
    expect((await f.agent.getTask(f.h.handle, f.projectId, f.task.taskId)).maxRepairRounds).toBe(2);
});

test('original server policy blocks first invalid repair at candidate limit, keeps Review/Commit guards and refuses in-flight rollback', async () => {
    const f = await fixture(); await f.declare(); await f.prepare(); const c = await f.candidate(); await f.update({ type: 'apply', candidateId: c.candidateId });
    await f.agent.setPlan(f.h.handle, f.projectId, f.task.taskId, { summary: 'Rename', steps: [{ id: 's', title: 'Rename' }] });
    const invalid = structuredClone(f.source); invalid.project.projectId = 'invalid';
    await f.agent.executeTool(f.h.handle, f.projectId, f.task.taskId, { name: 'atri_agent_project_save', args: { source: invalid, stepId: 's' } });
    const stopped = await f.agent.prepareReview(f.h.handle, f.projectId, f.task.taskId);
    expect(stopped.status).toBe('blocked'); expect(stopped.repairRound).toBe(1); expect(stopped.maxRepairRounds).toBe(1);
    await expect(f.agent.commit(f.h.handle, f.projectId, f.task.taskId)).rejects.toThrow();
    await expect(f.update({ type: 'rollback', candidateId: c.candidateId })).rejects.toThrow('conflict');
    expect((await f.studio.getRevision(f.h.handle, f.projectId)).revision).toBe(f.task.baseRevision);
});

test.each(['before', 'after'])('task save failure %s commit reloads actual authority and never duplicates activation', async mode => {
    const f = await fixture(); await f.declare(); await f.prepare(); const c = await f.candidate();
    const original = f.repository.save.bind(f.repository);
    const spy = jest.spyOn(f.repository, 'save').mockImplementationOnce(async (...args) => {
        if (mode === 'after') await original(...args);
        throw new Error('Lost task save');
    });
    await expect(f.update({ type: 'apply', candidateId: c.candidateId })).rejects.toThrow('Lost task save'); spy.mockRestore();
    const before = await f.update({ type: 'check', candidateId: c.candidateId }); expect(before.alreadyApplied).toBe(mode === 'after');
    const result = await f.update({ type: 'apply', candidateId: c.candidateId });
    const again = await f.update({ type: 'apply', candidateId: c.candidateId }); expect(again.sequence).toBe(result.sequence);
});

test('competing repository candidates use task queue and CAS; wrong scope and deletion revoke versions', async () => {
    const f = await fixture(); await f.declare(); await f.prepare(); const c = await f.candidate();
    await f.declare(); await f.prepare(); const newer = await f.candidate();
    const other = new ProjectAgentService({ studio: f.studio, repository: new ProjectTaskRepository({ engine: f.h.engine }), maxRepairRounds: 2 });
    const result = await Promise.allSettled([f.update({ type: 'apply', candidateId: c.candidateId }), other.strategyCandidates(f.h.handle, f.projectId, f.task.taskId, { type: 'apply', candidateId: newer.candidateId })]);
    expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    await expect(f.agent.strategyCandidates('foreign', f.projectId, f.task.taskId, { type: 'inspect' })).rejects.toThrow();
    await f.agent.deleteTask(f.h.handle, f.projectId, f.task.taskId);
    await expect(f.update({ type: 'inspect' })).rejects.toThrow();
});

test('malformed, protected, same-ID rewritten and missing versions reject; finite capacity and server guard remain', async () => {
    const f = await fixture(); await f.declare(); await f.prepare(); const c = await f.candidate();
    const task = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
    for (const mutation of [v => { v.schemaVersion = 9; }, v => { v.candidates[0].desired.intent = 'overwrite'; },
        v => { v.candidates[0].diff.after = 2; v.candidates[0].desired.maxRepairRounds = 2; }, v => { v.activeVersionId = 'missing'; }]) {
        const bad = structuredClone(task); mutation(bad.strategyVersions); expect(() => assertProjectTask(bad)).toThrow();
    }
    for (const value of [0, 3, 1.5]) await expect(f.update({ type: 'prepare', expectedSequence: task.sequence, field: 'maxRepairRounds', value })).rejects.toThrow();
    await expect(f.update({ type: 'declare', expectedSequence: task.sequence, allowedFields: ['humanReviewRequired'] })).rejects.toThrow();
    await expect(f.update({ type: 'prepare', expectedSequence: task.sequence, field: 'maxRepairRounds', value: 1, owner: 'foreign' })).rejects.toThrow();
    await expect(f.update({ type: 'prepare', expectedSequence: 0, field: 'maxRepairRounds', value: 1 })).rejects.toThrow('conflict');
    for (let i = 1; i < 16; i++) { await f.declare(); await f.prepare(); }
    await f.declare(); await expect(f.prepare()).rejects.toThrow('capacity');
    expect((await f.update({ type: 'inspect' })).candidates).toHaveLength(16);
    expect((await f.agent.getTask(f.h.handle, f.projectId, f.task.taskId)).maxRepairRounds).toBe(2);
    expect(hashNativeDocument(c.base)).not.toBe(hashNativeDocument(c.desired));
});

test('SQLite original user dump/restore carries candidate definitions and active task value', async () => {
    const f = await fixture(makeTempSqliteEngineHarness); await f.declare(); await f.prepare(); const c = await f.candidate(); await f.update({ type: 'apply', candidateId: c.candidateId });
    const chunks = []; for await (const chunk of await f.h.engine.dumpUser(f.h.handle)) chunks.push(chunk);
    await f.h.engine.withTransaction(f.h.handle, tx => tx.deleteResource({ kind: 'atri_project_agent_task', handle: f.h.handle, projectId: f.projectId, taskId: f.task.taskId }));
    await f.h.engine.restoreUser(f.h.handle, Readable.from(Buffer.concat(chunks)));
    expect((await f.update({ type: 'check', candidateId: c.candidateId })).alreadyApplied).toBe(true);
});

test('HTTP uses authenticated owner, rejects spoof fields, is no-store and reads only in read-only mode', async () => {
    const f = await fixture(async () => { const h = await makeTempFsEngineHarness(); return { ...h, engine: makeMultiHandleFsEngine({ root: h.dataRoot }).engine }; });
    const app = express(); app.use(express.json()); app.use((req, _res, next) => { if (req.headers['x-user']) req.user = { profile: { handle: req.headers['x-user'] } }; next(); });
    app.use(createNativeStudioRouter(() => ({ studio: f.studio, agent: f.agent })));
    const url = `/projects/${f.projectId}/agent/tasks/${f.task.taskId}/strategy-candidates`;
    await request(app).post(url).send({ type: 'inspect' }).expect(401);
    await request(app).post(url).set('x-user', 'other').send({ type: 'inspect' }).expect(404);
    await request(app).post(url).set('x-user', f.h.handle).send({ type: 'declare', expectedSequence: f.task.sequence, allowedFields: ['maxRepairRounds'], owner: 'other' }).expect(400);
    await f.declare(); await f.prepare(); const c = await f.candidate();
    setReadOnly(true);
    const checked = await request(app).post(url).set('x-user', f.h.handle).send({ type: 'check', candidateId: c.candidateId }).expect(200);
    expect(checked.headers['cache-control']).toContain('no-store');
    await request(app).post(url).set('x-user', f.h.handle).send({ type: 'apply', candidateId: c.candidateId }).expect(503);
    await request(app).post(url).set('x-user', f.h.handle).send({ type: 'rollback', candidateId: c.candidateId }).expect(503);
});

test('original Studio loop sees exact task strategy; once generation starts manual rollback cannot change its policy', async () => {
    const f = await fixture(); await f.declare(); await f.prepare(); const c = await f.candidate(); await f.update({ type: 'apply', candidateId: c.candidateId });
    const oldFetch = globalThis.fetch;
    let sends = 0;
    const onSend = async () => {
        sends++; await expect(f.update({ type: 'rollback', candidateId: c.candidateId })).rejects.toThrow('conflict');
        expect((await f.agent.getContext(f.h.handle, f.projectId, f.task.taskId)).policy.strategyVersionId).toBe(c.candidateId);
    };
    globalThis.fetch = async (url, options = {}) => {
        const body = options.body ? JSON.parse(options.body) : {}; let value;
        if (url === '/api/skills?scope=all') value = [];
        else if (url === '/api/native/extensions/settings') value = { value: { skills: {} } };
        else if (url === '/api/native/generation/execute') {
            await onSend();
            value = { response: { assistantText: 'Bounded reply', toolCalls: [] } };
        } else if (url.endsWith('/context')) value = await f.agent.getContext(f.h.handle, f.projectId, f.task.taskId);
        else if (url.endsWith('/resume')) value = await f.agent.resumeTask(f.h.handle, f.projectId, f.task.taskId);
        else if (url.endsWith('/generation/begin')) value = await f.agent.beginGeneration(f.h.handle, f.projectId, f.task.taskId, body);
        else if (url.endsWith('/generation/finish')) value = await f.agent.finishGeneration(f.h.handle, f.projectId, f.task.taskId, body);
        else if (url.endsWith('/preflight')) value = await f.studio.preflightProject(f.h.handle, f.projectId, body);
        else if (url.endsWith('/' + f.task.taskId)) value = await f.agent.getTask(f.h.handle, f.projectId, f.task.taskId);
        else throw new Error('Unexpected fixture request ' + url);
        return { ok: true, json: async () => value };
    };
    try {
        const result = await runNativeStudioAgentTask({ projectId: f.projectId, taskId: f.task.taskId });
        expect(result.task.maxRepairRounds).toBe(1); expect(result.task.strategyVersionId).toBe(c.candidateId); expect(sends).toBe(1);
    } finally { globalThis.fetch = oldFetch; }
});
