import { BudgetPort, sendAttemptId } from '../../src/native/orchestration/budget-port.js';
import { RpRunControl, rpOperationInput } from '../../src/native/rp-run-control.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { runFixture } from '../native/helpers/run-fixture.js';
import { prepareControllerOwnerRoot } from './fixtures.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

// Actual isolated SQL schemas/databases and the original three authorities.
// Usage is synthetic: this does not contact a Provider or demonstrate a bill.
const limits = { maxRequests: 2, maxTokens: 200 };
const ceiling = { maxRequests: 1, maxTokens: 150 };

async function domain(kind, h) {
    await prepareControllerOwnerRoot(h.dirs.root);
    attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
    if (kind === 'session') {
        const f = await runFixture(h, 'http://127.0.0.1:1/unused'), base = await f.begin();
        return { port: new BudgetPort({ sessionCore: f.core }), source: { domain: 'native_session', sessionId: base.session.sessionId },
            move: () => f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'New SQL source' }) };
    }
    if (kind === 'project') {
        const svc = services(h), src = projectSource(), project = await svc.studio.createProject(h.handle, src);
        const task = await svc.agent.createTask(h.handle, src.project.projectId, { intent: 'SQL budget authority', baseRevision: project.revision.revision });
        return { port: new BudgetPort({ projectAgent: svc.agent, projectRepository: svc.repository }), source: { domain: 'project', projectId: src.project.projectId, taskId: task.taskId },
            move: () => svc.agent.takeOver(h.handle, src.project.projectId, task.taskId) };
    }
    const chats = new ChatRepo({ engine: h.engine }), rpControl = new RpRunControl({ engine: h.engine });
    const at = { charDir: 'Actor', name: 'main', isGroup: false, groupId: null };
    await chats.save(h.handle, 'Actor', 'main', {}, [{ name: 'User', is_user: true, is_system: false, mes: 'Hi', swipe_id: 0, memory_os_source_id: 'sql-m1' }], null);
    const { controlId } = await rpControl.bind(h.handle, at), chat = await chats.get(h.handle, 'Actor', 'main');
    return { port: new BudgetPort({ rpControl }), source: { domain: 'rp_chat', controlId, source: { input: rpOperationInput(chat.body[0], 0), purpose: 'narration', outputSlot: 'assistant' } },
        move: async () => { const c = await chats.get(h.handle, 'Actor', 'main'); await chats.save(h.handle, 'Actor', 'main', c.header, [{ ...c.body[0], mes: 'Edited SQL input' }], c.integrity); } };
}

describe.each(CONTRACT_HARNESSES.filter(({ name }) => ['MysqlEngine', 'PgEngine'].includes(name)))('$name P3 original budget authorities', ({ make }) => {
    test.each(['session', 'project', 'rp_chat'])('%s: sibling CAS, single admission, transactional proof and source revocation', async kind => {
        const h = await make();
        try {
            const { port, source, move } = await domain(kind, h), authorityRef = await port.authorityFor(h.handle, source);
            const children = [createNativeId('orchestrationRun'), createNativeId('orchestrationRun')];
            const reserved = await Promise.allSettled(children.map(childRunId => port.reserveChild(h.handle, { authorityRef, parentReservationId: null, childRunId, ceiling, limits })));
            expect(reserved.filter(item => item.status === 'fulfilled')).toHaveLength(1);
            expect(reserved.find(item => item.status === 'rejected').reason.code).toBe('native_generation_budget_exhausted');
            const reservationId = reserved.find(item => item.status === 'fulfilled').value.reservationId, effectId = createNativeId('orchestrationEffect');
            const send = { requestId: 'sql-request', targetFingerprint: 'a'.repeat(64), inputFingerprint: 'b'.repeat(64), upperBound: 100 };
            const bank = port.sendBank(h.handle, { authorityRef, reservationId, limits, effectId, firstOrdinal: 0 });
            const first = await bank.admit(send);
            expect(first.budgetAttemptRef.attemptId).toBe(sendAttemptId(effectId, 0));
            const replay = port.sendBank(h.handle, { authorityRef, reservationId, limits, effectId, firstOrdinal: 0 });
            await expect(replay.admit(send)).rejects.toMatchObject({ code: 'native_orchestration_send_replayed' });
            await h.engine.withTransaction(h.handle, async tx => {
                await expect(port.verifyBudgetAttempt({ handle: h.handle, tx, root: { budgetAuthorityRef: authorityRef }, intent: { effectId }, budgetAttemptRef: first.budgetAttemptRef })).resolves.toEqual({ status: 'charged' });
                await expect(port.verifyBudgetAttempt({ handle: h.handle, tx, root: { budgetAuthorityRef: authorityRef }, intent: { effectId: createNativeId('orchestrationEffect') }, budgetAttemptRef: first.budgetAttemptRef })).rejects.toMatchObject({ code: 'native_orchestration_budget_attempt_invalid' });
            });
            await bank.settle(first.budgetAttemptRef.attemptId, null);
            expect(await port.observeAttempt(h.handle, first.budgetAttemptRef)).toMatchObject({ status: 'unknown', estimatedTokens: 100, reservationId });
            await expect(port.releaseUnused(h.handle, { authorityRef, reservationId })).rejects.toMatchObject({ code: 'native_generation_reservation_unsettled' });
            await move();
            await expect(bank.admit({ ...send, requestId: 'sql-stale' })).rejects.toMatchObject({ code: expect.not.stringMatching(/budget|replayed/) });
            await port.settleAttempt(h.handle, first.budgetAttemptRef, { totalTokens: 60 });
            await expect(port.releaseUnused(h.handle, { authorityRef, reservationId })).resolves.toMatchObject({ status: 'released', replayed: false });
        } finally { await h.engine.close?.(); await h.cleanup(); }
    });
});
