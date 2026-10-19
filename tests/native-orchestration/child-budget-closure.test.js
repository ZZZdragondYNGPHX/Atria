import { jest } from '@jest/globals';
import { BudgetPort, localWorkAttemptId, sendAttemptId } from '../../src/native/orchestration/budget-port.js';
import { inspectComputeChildClosure, reserveComputeChild, admitComputeAttempt, chargeLocalWork, settleComputeAttempt, settleLocalWork, releaseComputeChild } from '../../public/shared/native-compute-budget.js';
import { RpRunControl, rpOperationInput } from '../../src/native/rp-run-control.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { runFixture } from '../native/helpers/run-fixture.js';
import { prepareControllerOwnerRoot } from './fixtures.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

const sql = process.env.ATRIA_TEST_CHILD_CLOSURE_SQL === '1';
const harnesses = CONTRACT_HARNESSES.filter(({ name }) => sql || ['FsEngine', 'SqliteEngine'].includes(name));
if (sql) jest.setTimeout(60000);

const limits = { maxRequests: 8, maxTokens: 800, localWork: { maxJobs: 8, maxItems: 40, maxInputBytes: 4000 } };
const ceiling = { maxRequests: 3, maxTokens: 300, localWork: { maxJobs: 3, maxItems: 12, maxInputBytes: 1200 } };
const usage = { totalTokens: 20 };
const localUsage = { wallMs: 1, cpuUserMicros: 0, cpuSystemMicros: 0, cpuScope: 'process', outcome: 'completed' };
const send = { requestId: 'closure-send', targetFingerprint: 'a'.repeat(64), inputFingerprint: 'b'.repeat(64), upperBound: 30 };

// Real original banks, synthetic usage. No Model, Result, return grant or bill.
async function domain(kind, h) {
    await prepareControllerOwnerRoot(h.dirs.root);
    attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
    if (kind === 'session') {
        const f = await runFixture(h, 'http://127.0.0.1:1/unused', fixture => {
                fixture.contract.capabilities = fixture.contract.capabilities.filter(item => item.id !== 'generation-budget');
                delete fixture.contract.generationBudget;
            }), base = await f.begin(), anchor = { branchId: base.revision.branchId, revisionId: base.revision.revisionId };
        return { port: new BudgetPort({ sessionCore: f.core }), source: { domain: 'native_session', sessionId: base.session.sessionId, entryPointId: null },
            rawReserve: input => f.core.runs.reserveComputeChild(h.handle, base, anchor, limits, input),
            rawAdmit: (attempt, reservationId) => f.core.runs.admitCompute(h.handle, base, anchor, limits, attempt, { reservationId }),
            move: () => f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'New source' }) };
    }
    if (kind === 'project') {
        const svc = services(h), src = projectSource(), project = await svc.studio.createProject(h.handle, src);
        const task = await svc.agent.createTask(h.handle, src.project.projectId, { intent: 'Closure', baseRevision: project.revision.revision });
        return { port: new BudgetPort({ projectAgent: svc.agent, projectRepository: svc.repository }), source: { domain: 'project', projectId: src.project.projectId, taskId: task.taskId },
            rawReserve: input => svc.agent.reserveComputeChild(h.handle, src.project.projectId, task.taskId, task.baseRevision, limits, input, task.executionFingerprint),
            rawAdmit: (attempt, reservationId) => svc.agent.admitGeneration(h.handle, src.project.projectId, task.taskId, task.baseRevision, limits, attempt, task.executionFingerprint, { reservationId }),
            move: () => svc.agent.takeOver(h.handle, src.project.projectId, task.taskId) };
    }
    const chats = new ChatRepo({ engine: h.engine }), control = new RpRunControl({ engine: h.engine });
    await chats.save(h.handle, 'Actor', 'main', {}, [{ is_user: true, is_system: false, mes: 'Hi', memory_os_source_id: 'm1' }], null);
    const { controlId } = await control.bind(h.handle, { charDir: 'Actor', name: 'main', isGroup: false, groupId: null });
    const chat = await chats.get(h.handle, 'Actor', 'main'), source = { input: rpOperationInput(chat.body[0], 0), purpose: 'narration', outputSlot: 'assistant' };
    return { port: new BudgetPort({ rpControl: control }), source: { domain: 'rp_chat', controlId, source },
        rawReserve: input => control.reserveComputeChild(h.handle, controlId, source, limits, input),
        rawAdmit: (attempt, reservationId) => control.admitCompute(h.handle, controlId, source, limits, attempt, { reservationId }),
        move: async () => { const c = await chats.get(h.handle, 'Actor', 'main'); await chats.save(h.handle, 'Actor', 'main', c.header, [{ ...c.body[0], mes: 'Edited' }], c.integrity); } };
}

async function fixture(make, kind, run) {
    const h = await make();
    try {
        const f = await domain(kind, h), authorityRef = await f.port.authorityFor(h.handle, f.source);
        const reservationId = createNativeId('orchestrationRun');
        const reserve = (childRunId = reservationId, parentReservationId = null, allocation = ceiling) => f.port.reserveChild(h.handle,
            { authorityRef, parentReservationId, childRunId, ceiling: allocation, limits });
        const input = { authorityRef, reservationId, expectedParentReservationId: null, expectedCeiling: ceiling };
        const observe = (changed = {}) => h.engine.withTransaction(h.handle, tx => f.port.observeChildClosure(h.handle, { ...input, ...changed }, { tx }));
        await run({ ...f, h, authorityRef, reservationId, reserve, input, observe });
    } finally { await h.engine.close?.(); await h.cleanup(); }
}

describe.each(harnesses)('$name original child budget closure', ({ make }) => {
    describe.each(['session', 'project', 'rp_chat'])('%s', kind => {
        test('charged/unknown model and local remain open; lost release ACK is observed after source moves', () => fixture(make, kind, async f => {
            await f.reserve();
            const effectId = createNativeId('orchestrationEffect'), bank = f.port.sendBank(f.h.handle,
                { authorityRef: f.authorityRef, reservationId: f.reservationId, limits, effectId, firstOrdinal: 0 });
            const admitted = await bank.admit(send), attemptId = bank.nextLocalWorkAttemptId();
            await bank.chargeLocalWork(limits, { attemptId, requestId: 'local', targetFingerprint: 'c'.repeat(64), kind: 'context_build', estimatedItems: 1, estimatedInputBytes: 10 });
            expect(await f.observe()).toMatchObject({ status: 'held', closed: false, overrun: false });
            await bank.settle(admitted.budgetAttemptRef.attemptId, null); await bank.settleLocalWork(attemptId, null);
            expect((await f.observe()).budgetAttemptRefs).toEqual(expect.arrayContaining([
                admitted.budgetAttemptRef, { kind: 'local_work', authorityRef: f.authorityRef, effectId, localWorkOrdinal: 0, attemptId, reservationId: f.reservationId },
            ]));
            await expect(f.port.releaseUnused(f.h.handle, f.input)).rejects.toMatchObject({ code: 'native_generation_reservation_unsettled' });
            await f.move();
            // Historical observation/settlement has no active producer/source requirement.
            await bank.settle(admitted.budgetAttemptRef.attemptId, usage);
            expect((await f.observe()).closed).toBe(false);
            await bank.settleLocalWork(attemptId, { ...localUsage, outcome: 'failed' });
            expect((await f.observe()).closed).toBe(false); // Still held, never auto-release.
            // Fault injection is a caller ACK loss after the actual bank commit.
            await expect((async () => { await f.port.releaseUnused(f.h.handle, f.input); throw new Error('injected_release_ack_lost'); })()).rejects.toThrow('injected_release_ack_lost');
            const observed = await f.observe();
            expect(observed).toMatchObject({ status: 'released', closed: true, overrun: false });
            expect(await f.observe()).toEqual(observed);
        }));

        test('held descendants prevent closure; exact subtree excludes siblings and root work', () => fixture(make, kind, async f => {
            await f.reserve();
            const nested = createNativeId('orchestrationRun'), sibling = createNativeId('orchestrationRun');
            const nestedCeiling = { maxRequests: 1, maxTokens: 100, localWork: { maxJobs: 1, maxItems: 2, maxInputBytes: 100 } };
            await f.reserve(nested, f.reservationId, nestedCeiling);
            const before = await f.observe();
            expect(before.reservationRefs).toHaveLength(2); expect(before.closed).toBe(false);
            await expect(f.port.releaseUnused(f.h.handle, f.input)).rejects.toMatchObject({ code: 'native_generation_reservation_unsettled' });
            await f.reserve(sibling);
            const effectId = createNativeId('orchestrationEffect');
            await f.port.admitAttempt(f.h.handle, { authorityRef: f.authorityRef, reservationId: sibling, limits, effectId, providerSendOrdinal: 0, ...send });
            await f.port.admitAttempt(f.h.handle, { authorityRef: f.authorityRef, reservationId: null, limits, effectId, providerSendOrdinal: 1, ...send });
            expect(await f.observe()).toEqual(before);
            const nestedSend = await f.port.admitAttempt(f.h.handle, { authorityRef: f.authorityRef, reservationId: nested, limits, effectId, providerSendOrdinal: 2, ...send });
            await f.port.settleAttempt(f.h.handle, nestedSend.budgetAttemptRef, null);
            await expect(f.port.releaseUnused(f.h.handle, { authorityRef: f.authorityRef, reservationId: nested })).rejects.toMatchObject({ code: 'native_generation_reservation_unsettled' });
            await f.port.settleAttempt(f.h.handle, nestedSend.budgetAttemptRef, usage);
            const localId = localWorkAttemptId(effectId, 0);
            await f.port.chargeLocalWork(f.h.handle, { authorityRef: f.authorityRef, reservationId: nested, limits, effectId, localWorkOrdinal: 0,
                attempt: { attemptId: localId, requestId: 'nested-local', targetFingerprint: send.targetFingerprint, kind: 'prompt_compile', estimatedItems: 1, estimatedInputBytes: 10 } });
            await f.port.settleLocalWork(f.h.handle, f.authorityRef, localId, null);
            expect((await f.observe()).closed).toBe(false);
            await expect(f.port.releaseUnused(f.h.handle, { authorityRef: f.authorityRef, reservationId: nested })).rejects.toMatchObject({ code: 'native_generation_reservation_unsettled' });
            await f.port.settleLocalWork(f.h.handle, f.authorityRef, localId, localUsage);
            await f.port.releaseUnused(f.h.handle, { authorityRef: f.authorityRef, reservationId: nested });
            await f.port.releaseUnused(f.h.handle, f.input);
            const after = await f.observe();
            expect(after.closed).toBe(true); expect(after.budgetAttemptRefs).toEqual(expect.arrayContaining([nestedSend.budgetAttemptRef,
                { kind: 'local_work', authorityRef: f.authorityRef, effectId, localWorkOrdinal: 0, attemptId: localId, reservationId: nested }]));
            expect(after.budgetAttemptRefs).toHaveLength(2);
            expect(after.snapshotDigest).not.toBe(before.snapshotDigest);
        }));

        test('requires the active original transaction and exact selector; observation writes nothing', () => fixture(make, kind, async f => {
            await expect(f.observe()).rejects.toMatchObject({ code: 'native_orchestration_child_budget_unavailable' });
            await f.reserve();
            await expect(f.port.observeChildClosure(f.h.handle, f.input)).rejects.toMatchObject({ code: 'native_orchestration_budget_transaction_required' });
            let expired;
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                expired = tx;
                const forwarding = new Proxy(tx, { get(target, key) {
                    const value = Reflect.get(target, key, target);
                    return typeof value === 'function' ? value.bind(target) : value;
                } });
                await expect(f.port.observeChildClosure(f.h.handle, f.input, { tx: forwarding }))
                    .rejects.toMatchObject({ code: 'native_orchestration_budget_transaction_required' });
                const put = tx.putResource, remove = tx.deleteResource;
                tx.putResource = tx.deleteResource = () => { throw new Error('closure_must_not_write'); };
                try { expect((await f.port.observeChildClosure(f.h.handle, f.input, { tx })).closed).toBe(false); }
                finally { tx.putResource = put; tx.deleteResource = remove; }
            });
            await expect(f.port.observeChildClosure(f.h.handle, f.input, { tx: { getResource() {} } })).rejects.toMatchObject({ code: 'native_orchestration_budget_transaction_required' });
            await expect(f.port.observeChildClosure(f.h.handle, f.input, { tx: expired })).rejects.toMatchObject({ code: 'native_orchestration_budget_transaction_required' });
            await expect(f.observe({ expectedCeiling: { ...ceiling, maxTokens: 299 } })).rejects.toMatchObject({ code: 'native_orchestration_budget_reservation_mismatch' });
            await expect(f.observe({ expectedParentReservationId: createNativeId('orchestrationRun') })).rejects.toMatchObject({ code: 'native_orchestration_budget_reservation_mismatch' });
            await expect(f.observe({ reservationId: createNativeId('orchestrationRun') })).rejects.toMatchObject({ code: 'native_orchestration_child_budget_unavailable' });
        }));

        test('refuses a foreign original consumer and a legacy row without typed provenance', () => fixture(make, kind, async f => {
            const foreign = createNativeId('orchestrationRun');
            await f.rawReserve({ reservationId: foreign, parentReservationId: null, consumerId: 'foreign-consumer', limits: ceiling });
            await expect(f.observe({ reservationId: foreign })).rejects.toMatchObject({ code: 'native_orchestration_budget_reservation_mismatch' });
            await f.reserve();
            const effectId = createNativeId('orchestrationEffect');
            await f.rawAdmit({ attemptId: sendAttemptId(effectId, 0), requestId: send.requestId, targetFingerprint: send.targetFingerprint,
                inputFingerprint: send.inputFingerprint, estimatedTokens: 30 }, f.reservationId);
            await expect(f.observe()).rejects.toMatchObject({ code: 'native_orchestration_budget_attempt_invalid' });
        }));

        test('released overrun retains original actual rows and is never closed', () => fixture(make, kind, async f => {
            await f.reserve();
            const effectId = createNativeId('orchestrationEffect');
            const admitted = await f.port.admitAttempt(f.h.handle, { authorityRef: f.authorityRef, reservationId: f.reservationId, limits, effectId, providerSendOrdinal: 0, ...send });
            await f.port.settleAttempt(f.h.handle, admitted.budgetAttemptRef, { totalTokens: 301 });
            await f.port.releaseUnused(f.h.handle, f.input);
            expect(await f.observe()).toMatchObject({ status: 'released', closed: false, overrun: true });
            expect(await f.port.observeAttempt(f.h.handle, admitted.budgetAttemptRef)).toMatchObject({ status: 'settled', usage: { totalTokens: 301 } });
        }));
    });
});

test('shared child inspector returns defensive original facts and rejects corrupted typed provenance', () => {
    const holder = {}, reservationId = createNativeId('orchestrationRun'), effectId = createNativeId('orchestrationEffect');
    reserveComputeChild(holder, limits, { reservationId, consumerId: reservationId, parentReservationId: null, limits: ceiling });
    const attemptId = sendAttemptId(effectId, 0), localId = localWorkAttemptId(effectId, 0);
    admitComputeAttempt(holder, limits, { attemptId, requestId: 'send', targetFingerprint: send.targetFingerprint, inputFingerprint: send.inputFingerprint,
        estimatedTokens: 30, orchestration: { kind: 'provider_send', effectId, ordinal: 0 } }, { reservationId });
    chargeLocalWork(holder, limits, { attemptId: localId, requestId: 'local', targetFingerprint: send.targetFingerprint,
        kind: 'context_build', estimatedItems: 1, estimatedInputBytes: 10, orchestration: { kind: 'local_work', effectId, ordinal: 0 } }, { reservationId });
    settleComputeAttempt(holder, attemptId, usage); settleLocalWork(holder, localId, localUsage); releaseComputeChild(holder, reservationId);
    const before = structuredClone(holder), observed = inspectComputeChildClosure(holder, reservationId);
    observed.reservation.status = 'held'; observed.modelAttempts[0].usage.totalTokens = 0;
    expect(holder).toEqual(before);
    for (const field of ['effectId', 'ordinal', 'kind']) {
        const corrupted = structuredClone(holder);
        corrupted.compute.attempts[0].orchestration[field] = field === 'effectId' ? createNativeId('orchestrationEffect') : field === 'ordinal' ? 1 : 'local_work';
        expect(() => inspectComputeChildClosure(corrupted, reservationId)).toThrow('native_generation_budget_invalid');
    }
});
