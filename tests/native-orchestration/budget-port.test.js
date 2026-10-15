import { BudgetPort, sendAttemptId, localWorkAttemptId } from '../../src/native/orchestration/budget-port.js';
import { RpRunControl, rpOperationInput } from '../../src/native/rp-run-control.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { runFixture } from '../native/helpers/run-fixture.js';
import { prepareControllerOwnerRoot } from './fixtures.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

// Real original Session/Project/RP banks behind the V3 BudgetPort. Usage is
// synthetic; no Provider endpoint, GenerationHost send or real bill is exercised.
const localWork = { maxJobs: 1, maxItems: 2, maxInputBytes: 100 }, limits = { maxRequests: 4, maxTokens: 400, localWork };
const ceiling = { maxRequests: 3, maxTokens: 300, localWork };

async function domain(kind, h) {
    await prepareControllerOwnerRoot(h.dirs.root);
    attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
    if (kind === 'session') {
        const f = await runFixture(h, 'http://127.0.0.1:1/unused'), base = await f.begin();
        return { port: new BudgetPort({ sessionCore: f.core }), source: { domain: 'native_session', sessionId: base.session.sessionId, entryPointId: null },
            move: () => f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'New source' }) };
    }
    if (kind === 'project') {
        const svc = services(h), src = projectSource(), project = await svc.studio.createProject(h.handle, src);
        const task = await svc.agent.createTask(h.handle, src.project.projectId, { intent: 'Budget port', baseRevision: project.revision.revision });
        return { port: new BudgetPort({ projectAgent: svc.agent, projectRepository: svc.repository }), source: { domain: 'project', projectId: src.project.projectId, taskId: task.taskId },
            move: () => svc.agent.takeOver(h.handle, src.project.projectId, task.taskId) };
    }
    const chats = new ChatRepo({ engine: h.engine }), rpControl = new RpRunControl({ engine: h.engine }), at = { charDir: 'Actor', name: 'main', isGroup: false, groupId: null };
    await chats.save(h.handle, 'Actor', 'main', {}, [{ name: 'User', is_user: true, is_system: false, mes: 'Hi', swipe_id: 0, memory_os_source_id: 'm1' }], null);
    const { controlId } = await rpControl.bind(h.handle, at), chat = await chats.get(h.handle, 'Actor', 'main');
    return { port: new BudgetPort({ rpControl }), source: { domain: 'rp_chat', controlId, source: { input: rpOperationInput(chat.body[0], 0), purpose: 'narration', outputSlot: 'assistant' } },
        move: async () => { const c = await chats.get(h.handle, 'Actor', 'main'); await chats.save(h.handle, 'Actor', 'main', c.header, [{ ...c.body[0], mes: 'Edited' }], c.integrity); } };
}

describe.each([['FsEngine', makeTempFsEngineHarness], ['SqliteEngine', makeTempSqliteEngineHarness]])('%s V3 BudgetPort over original banks', (_name, make) => {
    test.each(['session', 'project', 'rp_chat'])('%s: child reservation, stable send identity, replay refusal, in-tx verification and settlement', async kind => {
        const h = await make();
        try {
            const { port, source, move } = await domain(kind, h);
            const authorityRef = await port.authorityFor(h.handle, source), childRunId = createNativeId('orchestrationRun'), effectId = createNativeId('orchestrationEffect');
            const reserved = await port.reserveChild(h.handle, { authorityRef, parentReservationId: null, childRunId, ceiling, limits });
            expect(reserved).toMatchObject({ reservationId: childRunId, status: 'held', replayed: false });
            const send = { requestId: 'req-1', targetFingerprint: 'a'.repeat(64), inputFingerprint: 'b'.repeat(64), upperBound: 100 };
            const bank = port.sendBank(h.handle, { authorityRef, reservationId: childRunId, limits, effectId, firstOrdinal: 0 });
            const first = await bank.admit(send);
            expect(first.budgetAttemptRef).toEqual({ authorityRef, effectId, providerSendOrdinal: 0, attemptId: sendAttemptId(effectId, 0), reservationId: childRunId });
            expect(bank.nextOrdinal()).toBe(1);
            // A restarted sender reusing ordinal 0 gets the original fact and no send permit.
            const restarted = port.sendBank(h.handle, { authorityRef, reservationId: childRunId, limits, effectId, firstOrdinal: 0 });
            await expect(restarted.admit(send)).rejects.toMatchObject({ code: 'native_orchestration_send_replayed' });
            const fallback = await bank.admit({ ...send, requestId: 'req-1-fallback', upperBound: 50 });
            expect(fallback.budgetAttemptRef.attemptId).toBe(sendAttemptId(effectId, 1));

            const root = { budgetAuthorityRef: authorityRef }, intent = { effectId };
            const expectedSend = { requestId: send.requestId, targetFingerprint: send.targetFingerprint, inputFingerprint: send.inputFingerprint };
            await h.engine.withTransaction(h.handle, async tx => {
                await expect(port.verifyBudgetAttempt({ handle: h.handle, tx, root, intent, budgetAttemptRef: first.budgetAttemptRef })).resolves.toEqual({ status: 'charged' });
                await expect(port.verifyBudgetAttempt({ handle: h.handle, tx, root, intent, budgetAttemptRef: first.budgetAttemptRef, expectedSend })).resolves.toEqual({ status: 'charged' });
                for (const field of ['requestId', 'targetFingerprint', 'inputFingerprint']) {
                    const changed = { ...expectedSend, [field]: field === 'requestId' ? 'another-request' : 'c'.repeat(64) };
                    await expect(port.verifyBudgetAttempt({ handle: h.handle, tx, root, intent, budgetAttemptRef: first.budgetAttemptRef, expectedSend: changed })).rejects.toMatchObject({ code: 'native_orchestration_budget_send_mismatch' });
                }
                await expect(port.verifyBudgetAttempt({ handle: h.handle, tx, root, intent: { effectId: createNativeId('orchestrationEffect') }, budgetAttemptRef: first.budgetAttemptRef })).rejects.toMatchObject({ code: 'native_orchestration_budget_attempt_invalid' });
                await expect(port.verifyBudgetAttempt({ handle: h.handle, tx, root, intent, budgetAttemptRef: { ...first.budgetAttemptRef, providerSendOrdinal: 7, attemptId: sendAttemptId(effectId, 7) } })).rejects.toMatchObject({ code: 'native_orchestration_budget_attempt_missing' });
                await expect(port.verifyBudgetAttempt({ handle: h.handle, tx, root: { budgetAuthorityRef: { ...authorityRef, operationId: 'f'.repeat(64) } }, intent, budgetAttemptRef: first.budgetAttemptRef })).rejects.toMatchObject({ code: 'native_orchestration_budget_authority_mismatch' });
            });

            const localId = localWorkAttemptId(effectId, 0);
            await port.chargeLocalWork(h.handle, { authorityRef, reservationId: childRunId, limits, effectId, localWorkOrdinal: 0,
                attempt: { attemptId: localId, requestId: 'local-1', targetFingerprint: 'd'.repeat(64), kind: 'context_build', estimatedItems: 1, estimatedInputBytes: 10 } });
            const localRef = { kind: 'local_work', authorityRef, effectId, localWorkOrdinal: 0, attemptId: localId, reservationId: childRunId };
            await h.engine.withTransaction(h.handle, async tx => {
                await expect(port.verifyBudgetAttempt({ handle: h.handle, tx, root, intent, budgetAttemptRef: localRef })).resolves.toEqual({ status: 'charged' });
                await expect(port.verifyBudgetAttempt({ handle: h.handle, tx, root, intent, budgetAttemptRef: localRef, expectedSend })).rejects.toMatchObject({ code: 'native_orchestration_budget_send_mismatch' });
            });
            await port.settleAttempt(h.handle, localRef, { wallMs: 0, cpuUserMicros: 0, cpuSystemMicros: 0, cpuScope: 'process', outcome: 'completed' });

            await bank.settle(first.budgetAttemptRef.attemptId, null);
            await move();
            await expect(bank.admit({ ...send, requestId: 'req-2' })).rejects.toMatchObject({ code: expect.not.stringMatching(/budget|replayed/) });
            expect(await port.observeAttempt(h.handle, first.budgetAttemptRef)).toMatchObject({ status: 'unknown', estimatedTokens: 100, reservationId: childRunId });
            await port.settleAttempt(h.handle, first.budgetAttemptRef, { totalTokens: 60 });
            await expect(port.releaseUnused(h.handle, { authorityRef, reservationId: childRunId })).rejects.toMatchObject({ code: 'native_generation_reservation_unsettled' });
            await bank.settle(fallback.budgetAttemptRef.attemptId, { totalTokens: 10 });
            await expect(port.releaseUnused(h.handle, { authorityRef, reservationId: childRunId })).resolves.toMatchObject({ status: 'released', replayed: false });
        } finally { await h.engine.close?.(); await h.cleanup(); }
    });
});

test('a source without an original bank is refused rather than given a private V3 ledger', async () => {
    const port = new BudgetPort({});
    for (const source of [{ domain: 'rp_chat', controlId: createNativeId('rpControl'), source: {} }, { domain: 'custom' }, null]) {
        await expect(port.authorityFor('u', source)).rejects.toMatchObject({ code: 'native_orchestration_budget_unavailable' });
    }
    expect(() => sendAttemptId(createNativeId('orchestrationEffect'), -1)).toThrow();
});
