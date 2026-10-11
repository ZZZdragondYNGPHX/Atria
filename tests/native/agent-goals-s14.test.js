import { afterEach, expect, test } from '@jest/globals';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { GoalContinuationService } from '../../src/native/agent-intelligence/goal-continuation.js';
import { sourceContent } from '../../public/scripts/agents/memory/source-provenance.js';
import { goalContextMessage } from '../../public/shared/agent-goal-context.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';
import express from 'express';
import supertest from 'supertest';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { loadRunGoalContext } from '../../public/scripts/agents/orchestrator/goal-context.js';
import { configureEvidenceCapture, startRun, clearCurrentRun } from '../../public/scripts/agents/orchestrator/run-state/store.js';

afterEach(() => { setReadOnly(false); configureEvidenceCapture(null); clearCurrentRun(); });
const limits = { maxRequests: 2, maxTokens: 64000 };
const user = { kind: 'user', actorId: null };
const criterion = (selector, path, equals) => ({ criterionId: 'result', description: 'Exact saved outcome', selector, path, equals });
async function fixture(make) {
    const h = await make(), installed = await installFixture(h), session = await installed.core.create(h.handle, installed.start);
    const chatRepo = new ChatRepo({ engine: h.engine });
    await chatRepo.save(h.handle, 'actor', 'goal-chat', {}, [{ memory_os_source_id: 'before', mes: 'Earlier turn', is_user: true }], null);
    const host = { persistence: { _engine: h.engine }, sessionCore: installed.core };
    const service = new GoalContinuationService({ host, chatRepo });
    const scope = { domain: 'rp_chat', charDir: 'actor', name: 'goal-chat', isGroup: false, groupId: '' };
    const input = { subject: user, scope, intent: 'Reach the explicit saved output', budget: limits, invariants: [],
        criteria: [criterion({ kind: 'message', messageId: 'goal-result', floor: 1 }, ['sourceContent'], sourceContent({ mes: 'Exact saved output' }))] };
    return { ...h, host, installed, session, chatRepo, service, input };
}
for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`S14 ${kind} original RP Run context uses frozen evidence scope and rejects switched Run`, async () => {
        const h = await fixture(make);
        try {
            const goal = await h.service.goals.create(h.handle, h.input);
            configureEvidenceCapture(() => ({ view: () => ({ scope: h.input.scope }) }));
            const runId = startRun({ mode: 'agenda', chatKey: 'fixed-chat' });
            const loaded = await loadRunGoalContext(runId, (_action, input) => h.service.goals.context(h.handle, input));
            expect(loaded.goals.map(row => row.goalId)).toEqual([goal.goalId]);
            await expect(loadRunGoalContext(runId, async (_action, input) => {
                const result = await h.service.goals.context(h.handle, input); clearCurrentRun(); return result;
            })).rejects.toThrow('Goal context run changed');
            expect(await loadRunGoalContext(runId, () => { throw new Error('Must not fetch after run changed'); })).toBeNull();
        } finally { await h.cleanup(); }
    }, 60000);
    test(`S14 ${kind} RP explicit events complete only from a later saved source and retain duplicate identity`, async () => {
        const h = await fixture(make);
        try {
            const goal = await h.service.goals.create(h.handle, h.input);
            const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
            app.use(createNativeGenerationRouter(() => h.host, () => h.chatRepo));
            const waiting = await supertest(app).post('/goals/wake').send({ goalId: goal.goalId, eventId: 'run-one' }).expect(200);
            expect(waiting.body.status).toBe('waiting'); expect(waiting.body.progress[0].status).toBe('unknown');
            expect(waiting.body.lastEvent.eventId).toBe('run-one');
            const before = await h.chatRepo.get(h.handle, 'actor', 'goal-chat');
            await h.chatRepo.save(h.handle, 'actor', 'goal-chat', {}, [...before.body, { memory_os_source_id: 'goal-result', mes: 'Exact saved output' }], before.integrity);
            const restored = new GoalContinuationService({ host: h.host, chatRepo: h.chatRepo });
            const completed = await restored.wake(h.handle, { goalId: goal.goalId, eventId: 'run-two' });
            expect(completed.status).toBe('completed'); expect(completed.evidence[0].references[0].selector.messageId).toBe('goal-result');
            expect(completed.budget).toEqual(limits); expect(completed.execution).toBeUndefined();
            expect(await restored.wake(h.handle, { goalId: goal.goalId, eventId: 'run-two' })).toEqual(completed);
            const context = await restored.goals.context(h.handle, { scope: h.input.scope });
            expect(context.goals[0].status).toBe('completed'); expect(goalContextMessage(context)).toBeNull();
        } finally { await h.cleanup(); }
    }, 60000);

    test(`S14 ${kind} current Native projection excludes Actor desires and real fork makes user goals stale`, async () => {
        const h = await fixture(make);
        try {
            const scope = { domain: 'rp_session', sessionId: h.session.session.sessionId };
            const criteria = [criterion({ kind: 'message', messageId: h.session.timeline[0].messageId }, ['content'], 'Future exact output')];
            const goal = await h.service.goals.create(h.handle, { ...h.input, scope, criteria });
            const actor = await h.service.goals.create(h.handle, { ...h.input, scope, criteria, budget: null,
                subject: { kind: 'actor', actorId: h.session.manifest.actors[0].actorId }, intent: 'Hidden actor desire' });
            const context = await h.service.goals.context(h.handle, { scope });
            expect(context.goals.map(row => row.goalId)).toEqual([goal.goalId]);
            const message = goalContextMessage(context); expect(message.role).toBe('user'); expect(message.content).toContain(goal.intent);
            expect(message.content).not.toContain(actor.intent);
            await expect(h.service.wake(h.handle, { goalId: actor.goalId, eventId: 'actor-event' })).rejects.toMatchObject({ code: 'goal_execution_unavailable' });
            await h.installed.core.forkBranch(h.handle, scope.sessionId, { expectedRevisionId: h.session.revision.revisionId });
            const stale = await h.service.goals.context(h.handle, { scope });
            expect(stale.goals[0].status).toBe('stale'); expect(goalContextMessage(stale)).toBeNull();
            expect((await h.service.goals.repository.get(h.handle, goal.goalId)).status).toBe('active');
        } finally { await h.cleanup(); }
    }, 60000);

    test(`S14 ${kind} readonly, paused and cancelled events preserve the original Goal without execution`, async () => {
        const h = await fixture(make);
        try {
            const goal = await h.service.goals.create(h.handle, h.input);
            const paused = await h.service.control(h.handle, { goalId: goal.goalId, expectedSequence: 0, action: 'pause' });
            expect(await h.service.wake(h.handle, { goalId: goal.goalId, eventId: 'paused-event' })).toEqual(paused);
            setReadOnly(true);
            expect((await h.service.goals.context(h.handle, { scope: h.input.scope })).readOnly).toBe(true);
            await expect(h.service.control(h.handle, { goalId: goal.goalId, expectedSequence: paused.sequence, action: 'resume' })).rejects.toMatchObject({ code: 'storage_read_only' });
            setReadOnly(false);
            const resumed = await h.service.control(h.handle, { goalId: goal.goalId, expectedSequence: paused.sequence, action: 'resume' });
            const cancelled = await h.service.control(h.handle, { goalId: goal.goalId, expectedSequence: resumed.sequence, action: 'cancel' });
            expect(await h.service.wake(h.handle, { goalId: goal.goalId, eventId: 'cancelled-event' })).toEqual(cancelled);
            expect((await h.service.goals.repository.get(h.handle, goal.goalId)).lastEvent).toBeUndefined();
        } finally { await h.cleanup(); }
    }, 60000);
}
