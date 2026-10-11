import { afterEach, expect, test } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FsEngine } from '../../src/storage/engines/fs-engine.js';
import { SqliteEngine } from '../../src/storage/engines/sqlite-engine.js';
import { createNativeId } from '../../src/native/identity.js';
import express from 'express';
import supertest from 'supertest';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { AgentGoalService } from '../../src/native/agent-intelligence/goal-service.js';
import { AgentGoalRepository } from '../../src/native/agent-intelligence/goal-repository.js';
import { assertGoal } from '../../src/native/agent-intelligence/goal-contracts.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';

afterEach(() => setReadOnly(false));
const criterion = selector => ({ criterionId: 'result', description: 'Exact desired result', selector, path: ['status'], equals: 'completed' });
const user = { kind: 'user', actorId: null }, budget = { maxRequests: 2, maxTokens: 64000 };
async function fixture(make) {
    const h = await make(), installed = await installFixture(h), session = await installed.core.create(h.handle, installed.start);
    const p = services(h), source = projectSource(), project = await p.studio.createProject(h.handle, source);
    const task = await p.agent.createTask(h.handle, source.project.projectId, { intent: 'Exact desired result', baseRevision: project.revision.revision });
    const chatRepo = new ChatRepo({ engine: h.engine });
    await chatRepo.save(h.handle, 'actor', 'goal-chat', {}, [{ mes: 'An earlier response', is_user: false }], null);
    const service = new AgentGoalService({ engine: h.engine, sessionCore: installed.core, studio: p.studio, chatRepo });
    return { ...h, ...p, installed, session, project, task, chatRepo, service,
        input: { subject: user, scope: { domain: 'project', projectId: source.project.projectId }, intent: 'Exact desired result',
            criteria: [criterion({ kind: 'task', taskId: task.taskId })], invariants: [], budget } };
}

for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`S11 ${kind} actual second owner cannot read or enumerate the first owner's Goal`, async () => {
        const h = await fixture(make), otherRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-goal-owner-'));
        let engine;
        try {
            const goal = await h.service.create(h.handle, h.input);
            const dirs = Object.fromEntries(Object.entries(h.dirs).map(([key, value]) => [key, path.join(otherRoot, path.relative(h.dirs.root, value))]));
            engine = new (kind === 'fs' ? FsEngine : SqliteEngine)({ directoriesByHandle: handle => handle === h.handle ? h.dirs : dirs });
            const reader = new AgentGoalService({ engine });
            expect(await reader.get(h.handle, { goalId: goal.goalId })).toEqual(goal);
            expect(await reader.list('other-owner')).toEqual([]);
            await expect(reader.get('other-owner', { goalId: goal.goalId })).rejects.toMatchObject({ name: 'NotFoundError' });
            expect(await reader.get(h.handle, { goalId: goal.goalId })).toEqual(goal);
        } finally { await engine?.close(); await h.cleanup(); fs.rmSync(otherRoot, { recursive: true, force: true }); }
    }, 60000);

    test(`S11 ${kind} rejects absent Actor/invalid scope and actual branch change prevents resume`, async () => {
        const h = await fixture(make);
        try {
            const scope = { domain: 'rp_session', sessionId: h.session.session.sessionId };
            const criteria = [criterion({ kind: 'message', messageId: h.session.timeline[0].messageId })];
            await expect(h.service.create(h.handle, { ...h.input, scope: { domain: 'invented' } })).rejects.toThrow('Unsupported');
            await expect(h.service.create(h.handle, { ...h.input, scope, criteria, budget: null, subject: { kind: 'actor', actorId: createNativeId('actor') } }))
                .rejects.toThrow('Actor unavailable');
            expect(await h.service.list(h.handle)).toEqual([]);
            const goal = await h.service.create(h.handle, { ...h.input, scope, criteria });
            const paused = await h.service.control(h.handle, { goalId: goal.goalId, expectedSequence: 0, action: 'pause' });
            const next = await h.installed.core.forkBranch(h.handle, scope.sessionId, { expectedRevisionId: h.session.revision.revisionId });
            expect(next.revision.branchId).not.toBe(goal.anchor.branchId);
            await expect(h.service.control(h.handle, { goalId: goal.goalId, expectedSequence: 1, action: 'resume' })).rejects.toMatchObject({ code: 'goal_scope_stale' });
            expect(await h.service.get(h.handle, { goalId: goal.goalId })).toEqual(paused);
        } finally { await h.cleanup(); }
    }, 60000);

    test(`S11 ${kind} Goal survives fresh Node and user controls without completing a Task or changing its bank`, async () => {
        const h = await fixture(make);
        try {
            const before = await h.agent.getTask(h.handle, h.input.scope.projectId, h.task.taskId);
            const goal = await h.service.create(h.handle, h.input);
            const child = `import {${kind === 'fs' ? 'FsEngine' : 'SqliteEngine'}} from ${JSON.stringify(new URL(`../../src/storage/engines/${kind === 'fs' ? 'fs' : 'sqlite'}-engine.js`, import.meta.url).href)};
                import {AgentGoalService} from ${JSON.stringify(new URL('../../src/native/agent-intelligence/goal-service.js', import.meta.url).href)};
                const dirs=JSON.parse(process.env.ATRIA_GOAL_TEST_DIRS),engine=new ${kind === 'fs' ? 'FsEngine' : 'SqliteEngine'}({directoriesByHandle:()=>dirs});
                console.log(JSON.stringify(await new AgentGoalService({engine}).get(${JSON.stringify(h.handle)}, {goalId:${JSON.stringify(goal.goalId)}}))); engine.close?.();`;
            const cold = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', child],
                { encoding: 'utf8', env: { ...process.env, ATRIA_GOAL_TEST_DIRS: JSON.stringify(h.dirs) } }));
            expect(cold).toEqual(goal);
            const paused = await h.service.control(h.handle, { goalId: goal.goalId, expectedSequence: 0, action: 'pause' });
            const resumed = await h.service.control(h.handle, { goalId: goal.goalId, expectedSequence: 1, action: 'resume' });
            const cancelled = await h.service.control(h.handle, { goalId: goal.goalId, expectedSequence: 2, action: 'cancel' });
            expect([paused.status, resumed.status, cancelled.status]).toEqual(['paused', 'active', 'cancelled']);
            expect(cancelled.budget).toEqual(budget); expect(cancelled.evidence).toEqual([]);
            expect(await h.agent.getTask(h.handle, h.input.scope.projectId, h.task.taskId)).toEqual(before);
            await expect(h.service.control(h.handle, { goalId: goal.goalId, expectedSequence: 3, action: 'resume' })).rejects.toMatchObject({ code: 'goal_terminal' });
        } finally { await h.cleanup(); }
    }, 60000);

    test(`S11 ${kind} actual Native user/Actor and ordinary chat scopes stay separate`, async () => {
        const h = await fixture(make);
        try {
            const scope = { domain: 'rp_session', sessionId: h.session.session.sessionId };
            const selector = { kind: 'message', messageId: h.session.timeline[0].messageId };
            const native = await h.service.create(h.handle, { ...h.input, scope, criteria: [criterion(selector)] });
            const actorId = h.session.manifest.actors[0].actorId;
            const actor = await h.service.create(h.handle, { ...h.input, scope, subject: { kind: 'actor', actorId }, budget: null, criteria: [criterion(selector)] });
            const chat = await h.service.create(h.handle, { ...h.input,
                scope: { domain: 'rp_chat', charDir: 'actor', name: 'goal-chat', isGroup: false, groupId: '' },
                criteria: [criterion({ kind: 'message', messageId: 'future-exact-message', floor: 1 })] });
            expect(native.anchor.branchId).toBe(h.session.revision.branchId);
            expect(actor.subject.actorId).toBe(actorId); expect(actor.budget).toBeNull();
            expect(chat.scope.domain).toBe('rp_chat');
            expect(await h.service.list(h.handle)).toHaveLength(3);
            await expect(h.service.create(h.handle, { ...h.input, scope, subject: { kind: 'actor', actorId } })).rejects.toThrow('cannot borrow');
        } finally { await h.cleanup(); }
    }, 60000);

    test(`S11 ${kind} integrity CAS prevents competing lifecycle writes and readonly blocks them`, async () => {
        const h = await fixture(make);
        try {
            const goal = await h.service.create(h.handle, h.input);
            const competing = await Promise.allSettled(['pause', 'cancel'].map(action => h.service.control(h.handle, { goalId: goal.goalId, expectedSequence: 0, action })));
            expect(competing.filter(row => row.status === 'fulfilled')).toHaveLength(1);
            expect(competing.filter(row => row.status === 'rejected')).toHaveLength(1);
            const current = await h.service.get(h.handle, { goalId: goal.goalId });
            setReadOnly(true);
            await expect(h.service.create(h.handle, h.input)).rejects.toMatchObject({ code: 'storage_read_only' });
            expect(await h.service.get(h.handle, { goalId: goal.goalId })).toEqual(current);
            setReadOnly(false);
            const repository = new AgentGoalRepository({ engine: h.engine });
            await expect(repository.save(h.handle, { ...current, sequence: current.sequence + 1 }, hashNativeDocument(goal)))
                .rejects.toMatchObject({ code: 'goal_write_conflict' });
            await expect(repository.save(h.handle, { ...current, sequence: current.sequence + 1, budget: { ...budget, maxRequests: 32 } }, hashNativeDocument(current)))
                .rejects.toMatchObject({ code: 'goal_definition_conflict' });
        } finally { await h.cleanup(); }
    }, 60000);

    test(`S11 ${kind} authenticated HTTP refuses model completion, owner override and stale control`, async () => {
        const h = await fixture(make);
        try {
            const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
            const host = { persistence: { _engine: h.engine }, sessionCore: h.installed.core, studio: h.studio };
            app.use(createNativeGenerationRouter(() => host, () => h.chatRepo));
            const created = await supertest(app).post('/goals/create').send(h.input);
            expect(created.status).toBe(200); expect(created.headers['cache-control']).toBe('private, no-store');
            for (const extra of [{ owner: 'other' }, { status: 'completed' }, { todo: 'done' }, { schemaVersion: 999 }]) {
                expect((await supertest(app).post('/goals/create').send({ ...h.input, ...extra })).status).toBe(400);
            }
            expect((await supertest(app).post('/goals/control').send({ goalId: created.body.goalId, expectedSequence: 0, action: 'completed' })).status).toBe(400);
            const stale = await supertest(app).post('/goals/control').send({ goalId: created.body.goalId, expectedSequence: 9, action: 'pause' });
            expect(stale.status).toBe(409); expect(stale.body.error).toBe('goal_sequence_conflict');
            expect((await supertest(app).post('/goals/list').send({})).body).toHaveLength(1);
            const anonymous = express(); anonymous.use(express.json()); anonymous.use(createNativeGenerationRouter(() => host, () => h.chatRepo));
            expect((await supertest(anonymous).post('/goals/create').send(h.input)).status).toBe(401);
            expect(() => assertGoal({ ...created.body, schemaVersion: 999 })).toThrow('schema');
        } finally { await h.cleanup(); }
    }, 60000);
}

test('S11 FS file backup preserves Goal metadata in a fresh engine', async () => {
    const h = await fixture(makeTempFsEngineHarness), root = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-goal-backup-'));
    try {
        const goal = await h.service.create(h.handle, h.input);
        fs.cpSync(h.dirs.root, root, { recursive: true });
        const dirs = Object.fromEntries(Object.entries(h.dirs).map(([key, value]) => [key, path.join(root, path.relative(h.dirs.root, value))]));
        const engine = new FsEngine({ directoriesByHandle: () => dirs });
        expect(await new AgentGoalService({ engine }).get(h.handle, { goalId: goal.goalId })).toEqual(goal);
        await engine.close();
    } finally { await h.cleanup(); fs.rmSync(root, { recursive: true, force: true }); }
}, 60000);

test('S11 SQLite actual dump/restore preserves Goal without creating a completion or new budget', async () => {
    const h = await fixture(makeTempSqliteEngineHarness), destination = await makeTempSqliteEngineHarness();
    try {
        const goal = await h.service.create(h.handle, h.input);
        await destination.engine.restoreUser(destination.handle, await h.engine.dumpUser(h.handle));
        expect(await new AgentGoalService({ engine: destination.engine }).get(destination.handle, { goalId: goal.goalId })).toEqual(goal);
    } finally { await h.cleanup(); await destination.cleanup(); }
}, 60000);
