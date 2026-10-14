import { afterEach, expect, jest, test } from '@jest/globals';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { AgentGoalService } from '../../src/native/agent-intelligence/goal-service.js';
import { AgentGoalRepository } from '../../src/native/agent-intelligence/goal-repository.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';
import { sourceContent } from '../../public/scripts/agents/memory/source-provenance.js';
import express from 'express';
import supertest from 'supertest';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { EvidenceSourceError } from '../../src/native/agent-intelligence/contracts.js';

afterEach(() => setReadOnly(false));
const budget = { maxRequests: 2, maxTokens: 64000 };
const criterion = (selector, path, equals, criterionId = 'result') => ({ criterionId, description: 'Exact authoritative result', selector, path, equals });
async function fixture(make) {
    const h = await make(), installed = await installFixture(h), session = await installed.core.create(h.handle, installed.start);
    const p = services(h), source = projectSource(), project = await p.studio.createProject(h.handle, source);
    const chatRepo = new ChatRepo({ engine: h.engine });
    await chatRepo.save(h.handle, 'actor', 'goal-chat', {}, [{ memory_os_source_id: 'exact-output', mes: 'Fixed deliverable', swipe_id: 0 }], null);
    const service = new AgentGoalService({ engine: h.engine, sessionCore: installed.core, studio: p.studio, agent: p.agent, chatRepo });
    const input = { subject: { kind: 'user', actorId: null }, scope: { domain: 'project', projectId: source.project.projectId },
        intent: 'Rename the actual Project', criteria: [criterion({ kind: 'project_field', path: ['project', 'displayName'] }, ['fieldValue'], 'Desired name')], invariants: [], budget };
    return { ...h, ...p, installed, session, source, project, chatRepo, service, input };
}
const evaluate = (h, doc) => h.service.evaluate(h.handle, { goalId: doc.goalId, expectedSequence: doc.sequence });
async function rename(h, name) {
    const current = await h.studio.getProject(h.handle, h.source.project.projectId);
    await h.studio.saveProjectSource(h.handle, h.source.project.projectId, { source: { ...current.source, project: { ...current.source.project, displayName: name } },
        baseRevision: current.revision.revision, origin: { kind: 'human', id: 'goal-user' } });
}

for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`S12 ${kind} actual HTTP criteria require both formal Task receipt and current Project outcome`, async () => {
        const h = await fixture(make);
        try {
            const task = await h.agent.createTask(h.handle, h.source.project.projectId, { intent: h.input.intent, baseRevision: h.project.revision.revision });
            await h.agent.setPlan(h.handle, h.source.project.projectId, task.taskId, { summary: 'Rename actual Project', steps: [{ id: 'rename', title: 'Rename', impact: 'low' }] });
            const goal = await h.service.create(h.handle, { ...h.input, criteria: [...h.input.criteria,
                criterion({ kind: 'task', taskId: task.taskId }, ['status'], 'completed', 'formal')] });
            const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
            app.use(createNativeGenerationRouter(() => ({ persistence: { _engine: h.engine }, sessionCore: h.installed.core, studio: h.studio, agent: h.agent }), () => h.chatRepo));
            const before = await supertest(app).post('/goals/evaluate').send({ goalId: goal.goalId, expectedSequence: 0 });
            expect(before.status).toBe(200); expect(before.body.status).toBe('waiting');
            const next = structuredClone(h.source); next.project.displayName = 'Desired name';
            await h.agent.executeTool(h.handle, h.source.project.projectId, task.taskId, { name: 'atri_agent_project_save', args: { source: next, stepId: 'rename' } });
            await h.agent.prepareReview(h.handle, h.source.project.projectId, task.taskId);
            expect((await supertest(app).post('/goals/evaluate').send({ goalId: goal.goalId, expectedSequence: 1 })).body.status).toBe('waiting');
            const committed = await h.agent.commit(h.handle, h.source.project.projectId, task.taskId);
            expect(committed.changeSets).toHaveLength(1);
            const after = await supertest(app).post('/goals/evaluate').send({ goalId: goal.goalId, expectedSequence: 2 });
            expect(after.status).toBe(200); expect(after.body.status).toBe('completed');
            expect(after.body.evidence[0].references).toHaveLength(2);
            expect((await supertest(app).post('/goals/evaluate').send({ goalId: goal.goalId, expectedSequence: 3, status: 'completed' })).status).toBe(400);
            expect(after.body.budget).toEqual(budget);
        } finally { await h.cleanup(); }
    }, 60000);

    test(`S12 ${kind} missing, denied and unavailable evidence retain their distinct failures`, async () => {
        const h = await fixture(make);
        try {
            const scope = { domain: 'rp_chat', charDir: 'actor', name: 'goal-chat', isGroup: false, groupId: '' };
            const goal = await h.service.create(h.handle, { ...h.input, scope, criteria: [criterion({ kind: 'message', messageId: 'exact-output', floor: 0 }, ['sourceContent'], sourceContent({ mes: 'Fixed deliverable', swipe_id: 0 }))] });
            const completed = await evaluate(h, goal);
            const readMany = h.service.sources.rp.readMany.bind(h.service.sources.rp);
            h.service.sources.rp.readMany = jest.fn(async () => { throw new EvidenceSourceError('denied', 'source_denied'); });
            const denied = await h.service.get(h.handle, { goalId: goal.goalId });
            expect(denied.status).toBe('blocked'); expect(denied.blockers[0].code).toBe('source_denied');
            h.service.sources.rp.readMany = jest.fn(async () => { throw new Error('Private I/O details'); });
            const unavailable = await h.service.get(h.handle, { goalId: goal.goalId });
            expect(unavailable.status).toBe('blocked'); expect(unavailable.blockers[0].code).toBe('source_authority_failed');
            expect(JSON.stringify(unavailable)).not.toContain('Private I/O details');
            h.service.sources.rp.readMany = readMany;
            const chat = await h.chatRepo.get(h.handle, 'actor', 'goal-chat');
            await h.chatRepo.save(h.handle, 'actor', 'goal-chat', {}, [], chat.integrity);
            const missing = await evaluate(h, completed);
            expect(missing.status).toBe('stale'); expect(missing.blockers[0].code).toBe('message_deleted');
            expect(missing.budget).toEqual(budget);
        } finally { await h.cleanup(); }
    }, 60000);

    test(`S12 ${kind} model attempt completion cannot satisfy the actual Project property; formal authoring can`, async () => {
        const h = await fixture(make);
        try {
            const goal = await h.service.create(h.handle, h.input);
            const task = await h.agent.createTask(h.handle, h.source.project.projectId, { intent: h.input.intent, baseRevision: h.project.revision.revision });
            const started = await h.agent.beginGeneration(h.handle, h.source.project.projectId, task.taskId, { expectedSequence: task.sequence });
            await h.agent.finishGeneration(h.handle, h.source.project.projectId, task.taskId, { attemptId: started.attempts.at(-1).attemptId,
                status: 'completed', conversation: [...task.conversation, { role: 'assistant', content: 'I changed the name and completed the Goal.' }] });
            const waiting = await evaluate(h, goal);
            expect(waiting.status).toBe('waiting'); expect(waiting.progress[0].status).toBe('unmet');
            await rename(h, 'Desired name');
            const completed = await evaluate(h, waiting);
            expect(completed.status).toBe('completed'); expect(completed.progress[0].status).toBe('satisfied');
            expect(completed.evidence[0].references[0].selector.kind).toBe('project_field');
            expect(JSON.stringify(completed.evidence)).not.toContain('Desired name');
            expect(completed.budget).toEqual(budget);
            await rename(h, 'Reverted name');
            setReadOnly(true);
            const stale = await h.service.get(h.handle, { goalId: goal.goalId });
            expect(stale.status).toBe('stale');
            expect((await new AgentGoalRepository({ engine: h.engine }).get(h.handle, goal.goalId)).status).toBe('completed');
            setReadOnly(false);
            const persisted = await evaluate(h, completed);
            expect(persisted.status).toBe('waiting'); expect(persisted.budget).toEqual(budget);
        } finally { await h.cleanup(); }
    }, 60000);

    test(`S12 ${kind} selected RP physical output is verified, changed variant revokes it, Actor desire stays blocked`, async () => {
        const h = await fixture(make);
        try {
            const scope = { domain: 'rp_chat', charDir: 'actor', name: 'goal-chat', isGroup: false, groupId: '' };
            const goal = await h.service.create(h.handle, { ...h.input, scope, criteria: [criterion({ kind: 'message', messageId: 'exact-output', floor: 0 }, ['sourceContent'], sourceContent({ mes: 'Fixed deliverable', swipe_id: 0 }))] });
            const completed = await evaluate(h, goal);
            expect(completed.status).toBe('completed');
            const chat = await h.chatRepo.get(h.handle, 'actor', 'goal-chat');
            await h.chatRepo.save(h.handle, 'actor', 'goal-chat', {}, [{ memory_os_source_id: 'exact-output', mes: 'Different result', swipe_id: 1 }], chat.integrity);
            expect((await h.service.get(h.handle, { goalId: goal.goalId })).status).toBe('stale');
            const actor = await h.service.create(h.handle, { ...h.input,
                scope: { domain: 'rp_session', sessionId: h.session.session.sessionId }, subject: { kind: 'actor', actorId: h.session.manifest.actors[0].actorId }, budget: null,
                criteria: [criterion({ kind: 'message', messageId: h.session.timeline[0].messageId }, ['content'], h.session.timeline[0].content)] });
            const blocked = await evaluate(h, actor);
            expect(blocked.status).toBe('blocked'); expect(blocked.blockers[0].code).toBe('actor_goal_completion_unavailable');
        } finally { await h.cleanup(); }
    }, 60000);

    test(`S12 ${kind} real fork after precheck cannot use new-branch proof to complete the old Goal`, async () => {
        const h = await fixture(make);
        try {
            const goal = await h.service.create(h.handle, { ...h.input, scope: { domain: 'rp_session', sessionId: h.session.session.sessionId },
                criteria: [criterion({ kind: 'message', messageId: h.session.timeline[0].messageId }, ['content'], h.session.timeline[0].content)] });
            const capture = h.service.sources.capture.bind(h.service.sources);
            h.service.sources.capture = jest.fn(async (...args) => {
                await deriveSaveRoute(h, h.session.session.sessionId, h.session.revision.revisionId);
                return capture(...args);
            });
            const result = await evaluate(h, goal);
            expect(result.status).toBe('stale'); expect(result.blockers[0].code).toBe('goal_scope_stale');
            expect((await new AgentGoalRepository({ engine: h.engine }).get(h.handle, goal.goalId)).status).toBe('stale');
        } finally { await h.cleanup(); }
    }, 60000);

    test(`S12 ${kind} source change at metadata publication cannot return a current completion`, async () => {
        const h = await fixture(make);
        try {
            const goal = await h.service.create(h.handle, { ...h.input, scope: { domain: 'rp_session', sessionId: h.session.session.sessionId },
                criteria: [criterion({ kind: 'message', messageId: h.session.timeline[0].messageId }, ['content'], h.session.timeline[0].content)] });
            const save = h.service.repository.save.bind(h.service.repository);
            h.service.repository.save = jest.fn(async (...args) => {
                const saved = await save(...args);
                await deriveSaveRoute(h, h.session.session.sessionId, h.session.revision.revisionId);
                return saved;
            });
            const result = await evaluate(h, goal);
            expect(result.status).toBe('stale'); expect(result.blockers[0].code).toBe('goal_scope_stale');
            expect((await h.service.get(h.handle, { goalId: goal.goalId })).status).toBe('stale');
            expect(result.budget).toEqual(budget);
        } finally { await h.cleanup(); }
    }, 60000);

    test(`S12 ${kind} fixed invariants block success and paused/cancelled evaluations cannot reactivate`, async () => {
        const h = await fixture(make);
        try {
            const selector = { kind: 'project_field', path: ['project', 'displayName'] };
            const goal = await h.service.create(h.handle, { ...h.input, criteria: [criterion(selector, ['fieldValue'], h.source.project.displayName)],
                invariants: [criterion(selector, ['fieldValue'], 'Unmet invariant', 'guard')] });
            const blocked = await evaluate(h, goal);
            expect(blocked.status).toBe('blocked'); expect(blocked.progress[0].status).toBe('satisfied');
            expect(blocked.blockers[0].code).toBe('goal_invariants_unmet');
            const paused = await h.service.control(h.handle, { goalId: goal.goalId, expectedSequence: 1, action: 'pause' });
            expect(await evaluate(h, paused)).toEqual(paused);
            const cancelled = await h.service.control(h.handle, { goalId: goal.goalId, expectedSequence: paused.sequence, action: 'cancel' });
            expect(await evaluate(h, cancelled)).toEqual(cancelled);
        } finally { await h.cleanup(); }
    }, 60000);
}

async function deriveSaveRoute(h, sessionId, expectedRevisionId) {
    const save = await h.installed.core.createSavePoint(h.handle, sessionId, { expectedRevisionId, displayName: 'Goal branch-isolation fixture' });
    return h.installed.core.restoreSavePoint(h.handle, sessionId, save.saveId, { expectedRevisionId });
}
