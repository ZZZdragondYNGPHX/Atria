import { modelPortFixture } from './helpers/model-port-fixture.js';
import { jest } from '@jest/globals';
import { toolCompletionFixture } from './helpers/tool-completion-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { createNativeId } from '../../src/native/identity.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';

import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { SourcePort } from '../../src/native/orchestration/source-port.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { SessionRepo } from '../../src/native/repositories/session-repo.js';
import { withRuntimeWrite } from '../../src/native/model-prompt-runtime/runtime-write.js';
import { installFixture } from '../native/helpers/session-fixture.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { prepareControllerOwnerRoot } from './fixtures.js';

if (process.env.ATRIA_TEST_DOMAIN_SAME_SCOPE_SQL === '1') jest.setTimeout(60000);

async function boundaryFixture(make) {
    const h = await make();
    try {
        await prepareControllerOwnerRoot(h.dirs.root); attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const f = await installFixture(h), base = await f.core.create(h.handle, f.start);
        const port = new SourcePort({ sessionCore: f.core, budgetPort: new BudgetPort({ sessionCore: f.core }) });
        const { sourceBinding } = await port.capture(h.handle, { domain: 'native_session', sessionId: base.session.sessionId,
            branchId: base.revision.branchId, revisionId: base.revision.revisionId });
        return { h, core: f.core, repo: f.core.runs.repo, base, port, sourceBinding };
    } catch (error) { await h.engine.close(); await h.cleanup(); throw error; }
}

// Same-ALS legitimate domain writes at the final bank-await boundary. This is
// not an external concurrent request. A failed Native finalizer alone cannot
// prove that ModelPort withheld its already-confirmed, ephemeral response body.
describe.each(CONTRACT_HARNESSES.filter(({ name }) => process.env.ATRIA_TEST_DOMAIN_SAME_SCOPE_SQL === '1' || ['FsEngine', 'SqliteEngine'].includes(name)))('$name domain consumption same-scope', ({ make }) => {
    test('pure boundary creation and invocation use the actual Runtime then Session writers, including an instrumented repository', async () => {
        const f = await boundaryFixture(make), { h, repo } = f;
        const observe = f.core.observe, withRunLock = repo.withRunLock;
        let releaseRuntime, releaseSession, runtimeWork, sessionWork, runtimeFollower, pending, entered = 0, followerEntered = false;
        try {
            let sessionEntered, runtimeEntered;
            const sessionStarted = new Promise(resolve => { sessionEntered = resolve; }), runtimeStarted = new Promise(resolve => { runtimeEntered = resolve; });
            const sessionHeld = new Promise(resolve => { releaseSession = resolve; }), runtimeHeld = new Promise(resolve => { releaseRuntime = resolve; });
            sessionWork = SessionRepo.prototype.withRunLock.call(repo, h.handle, f.base.session.sessionId, async () => { sessionEntered(); await sessionHeld; });
            await sessionStarted;
            runtimeWork = withRuntimeWrite(h.handle, async () => { runtimeEntered(); await runtimeHeld; });
            await runtimeStarted;
            f.core.observe = () => { throw new Error('A pure boundary must not read Session payload'); };
            repo.withRunLock = () => { throw new Error('A wrapper cannot replace the original domain writer'); };
            const boundary = f.port.consumptionBoundary(h.handle, f.sourceBinding, { engine: h.engine });
            expect(typeof boundary).toBe('function');
            pending = boundary(() => { entered++; return 'original-domain-result'; });
            await new Promise(resolve => setImmediate(resolve)); expect(entered).toBe(0);
            releaseRuntime(); await runtimeWork;
            await new Promise(resolve => setImmediate(resolve)); expect(entered).toBe(0);
            runtimeFollower = withRuntimeWrite(h.handle, () => { followerEntered = true; });
            await new Promise(resolve => setImmediate(resolve)); expect(followerEntered).toBe(false);
            releaseSession(); await sessionWork;
            await expect(pending).resolves.toBe('original-domain-result'); expect(entered).toBe(1);
            await runtimeFollower; expect(followerEntered).toBe(true);
        } finally {
            releaseRuntime?.(); releaseSession?.(); await Promise.allSettled([runtimeWork, sessionWork, runtimeFollower, pending].filter(Boolean));
            f.core.observe = observe; repo.withRunLock = withRunLock; await h.engine.close(); await h.cleanup();
        }
    });

    test('foreign engine, split original core, fake repository and unsupported body domains cannot create a boundary', async () => {
        const f = await boundaryFixture(make);
        try {
            const mismatched = new SourcePort({ sessionCore: f.core, budgetPort: new BudgetPort({ sessionCore: {} }) });
            const fakeCore = { runs: { repo: { _engine: f.h.engine, withRunLock: (_handle, _id, operation) => operation() } } };
            const fake = new SourcePort({ sessionCore: fakeCore, budgetPort: new BudgetPort({ sessionCore: fakeCore }) });
            for (const rejected of [
                () => f.port.consumptionBoundary(f.h.handle, f.sourceBinding, { engine: { withTransaction: f.h.engine.withTransaction.bind(f.h.engine) } }),
                () => mismatched.consumptionBoundary(f.h.handle, f.sourceBinding, { engine: f.h.engine }),
                () => fake.consumptionBoundary(f.h.handle, f.sourceBinding, { engine: f.h.engine }),
                () => f.port.consumptionBoundary(f.h.handle, { ...f.sourceBinding, sourceAuthority: 'project' }, { engine: f.h.engine }),
                () => f.port.consumptionBoundary(f.h.handle, { ...f.sourceBinding, sourceAuthority: 'rp_chat' }, { engine: f.h.engine }),
            ]) expect(rejected).toThrow('native_orchestration_consumption_authority_unavailable');
        } finally { await f.h.engine.close(); await f.h.cleanup(); }
    });

    test.each(['source', 'binding'])('Model %s changes after final bank validation cannot return body or lose original facts', async change => {
        const f = await modelPortFixture(make), service = f.authority.execution;
        const original = service.budgetPort.assertCurrent.bind(service.budgetPort), generate = f.port.generate.bind(f.port);
        const marker = 'Same-scope source revocation after final bank validation.';
        let injected = false, sameTransaction = false, before, after, confirmed, domainWrite, bodiesReturned = 0;
        try {
            f.port.generate = async (...args) => {
                const result = await generate(...args);
                if (result.generated?.response?.text) bodiesReturned++;
                return result;
            };
            service.budgetPort.assertCurrent = async (...args) => {
                const result = await original(...args);
                if (!f.effectRef || injected) return result;
                await service.runs.engine.withTransaction(f.h.handle, async tx => {
                    const root = await service.runs.get(f.h.handle, f.effectRef.runId);
                    const effect = await readEffect(tx, f.h.handle, root, f.effectRef.effectId);
                    if (effect.doc.status !== 'confirmed') return;
                    injected = true; before = root; confirmed = await f.observe();
                    if (change === 'source') domainWrite = await f.core.appendTimeline(f.h.handle, f.base.session.sessionId,
                        { role: 'user', content: marker }, { expectedRevisionId: f.base.revision.revisionId });
                    else domainWrite = await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), {
                        sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: 0 });
                    await service.runs.engine.withTransaction(f.h.handle, async observedTx => {
                        sameTransaction = observedTx === tx; after = await service.runs.get(f.h.handle, root.runId);
                        const observedDomain = change === 'source' ? (await f.core.observe(f.h.handle, f.base.session.sessionId)).revision
                            : (await f.plans.getBinding(f.h.handle, f.sourceSelector)).version;
                        expect(observedDomain).toEqual(change === 'source' ? domainWrite.revision : 1);
                    });
                });
                return result;
            };
            const result = await f.start().then(value => ({ status: 'fulfilled', value }), error => ({ status: 'rejected', error }));
            expect(injected).toBe(true); expect(sameTransaction).toBe(true); expect(confirmed.outcome).toBe('confirmed');
            expect(after.stateVersion).toBe(before.stateVersion); expect(f.requests).toHaveLength(1);
            const control = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            const charged = control.operations[before.budgetAuthorityRef.operationId].compute;
            expect(charged.attempts).toHaveLength(1); expect(charged.attempts[0].status).toBe('settled');
            await f.cold();
            expect((await f.observe()).outcome).toBe('confirmed');
            const coldReceipt = await f.authority.execution.runs.engine.withTransaction(f.h.handle, tx => tx.getResource(controlRecordKey(f.h.handle, before.runId, 'receipt', confirmed.receiptRef.receiptId)));
            expect(coldReceipt.doc).toMatchObject({ outcome: 'confirmed', effectId: f.effectRef.effectId });
            expect((await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[before.budgetAuthorityRef.operationId].compute).toEqual(charged);
            const cold = await f.core.observe(f.h.handle, f.base.session.sessionId);
            const retainedDomain = change === 'source' ? cold.timeline.some(item => item.content === marker)
                : (await f.authority.plans.getBinding(f.h.handle, f.sourceSelector)).version;
            expect(retainedDomain).toBe(change === 'source' ? true : 1);
            expect(bodiesReturned).toBe(0);
            expect(result).toMatchObject({ status: 'rejected', error: { code: expect.stringMatching(/consume|consumption/) } });
            expect(cold.timeline.some(item => item.content === 'Synthetic native narrator response.')).toBe(false);
        } finally { service.budgetPort.assertCurrent = original; await f.cleanup(); }
    });

    // Real Skill files/banks/controllers; the shared fixture explicitly uses
    // controlled authorization Ports, not a production Skill grant producer.
    test.each(['skill_read', 'skill_files'])('%s source changes after final bank validation cannot return its body', async kind => {
        const f = await toolCompletionFixture(make, kind), service = f.exec;
        const original = service.budgetPort.assertCurrent.bind(service.budgetPort);
        const sessionId = f.root.budgetAuthorityRef.sessionId, marker = 'Same-scope Skill source revocation.';
        let injected = false, sameTransaction = false, before, after, confirmed, domainWrite;
        try {
            service.budgetPort.assertCurrent = async (...args) => {
                const result = await original(...args);
                if (injected) return result;
                await service.runs.engine.withTransaction(f.h.handle, async tx => {
                    const root = await service.runs.get(f.h.handle, f.root.runId);
                    const effect = await readEffect(tx, f.h.handle, root, f.effectId);
                    if (effect.doc.status !== 'confirmed') return;
                    injected = true; before = root; confirmed = await f.observe();
                    const base = await f.core.observe(f.h.handle, sessionId);
                    domainWrite = await f.core.appendTimeline(f.h.handle, sessionId, { role: 'user', content: marker }, { expectedRevisionId: base.revision.revisionId });
                    await service.runs.engine.withTransaction(f.h.handle, async observedTx => {
                        sameTransaction = observedTx === tx; after = await service.runs.get(f.h.handle, root.runId);
                        expect((await f.core.observe(f.h.handle, sessionId)).revision).toEqual(domainWrite.revision);
                    });
                });
                return result;
            };
            const result = await f.start().then(value => ({ status: 'fulfilled', value }), error => ({ status: 'rejected', error }));
            expect(injected).toBe(true); expect(sameTransaction).toBe(true); expect(confirmed.outcome).toBe('confirmed');
            expect(after.stateVersion).toBe(before.stateVersion); expect(f.calls).toEqual([]);
            const charged = (await f.core.runs.status(f.h.handle, sessionId)).operations[before.budgetAuthorityRef.operationId].compute;
            expect(charged.attempts).toEqual([]); expect(charged.localWork.length).toBeGreaterThan(1);
            expect(charged.localWork.every(row => row.status === 'settled' && row.usage?.outcome === 'completed')).toBe(true);
            await f.cold();
            expect((await f.observe()).outcome).toBe('confirmed');
            const coldReceipt = await f.exec.runs.engine.withTransaction(f.h.handle, tx => tx.getResource(controlRecordKey(f.h.handle, before.runId, 'receipt', confirmed.receiptRef.receiptId)));
            expect(coldReceipt.doc).toMatchObject({ outcome: 'confirmed', effectId: f.effectId });
            expect((await f.core.runs.status(f.h.handle, sessionId)).operations[before.budgetAuthorityRef.operationId].compute).toEqual(charged);
            const cold = await f.core.observe(f.h.handle, sessionId);
            expect(cold.timeline.some(item => item.content === marker)).toBe(true);
            expect(cold.timeline.some(item => item.content === 'Synthetic native narrator response.')).toBe(false);
            expect(result).toMatchObject({ status: 'rejected', error: { code: expect.stringMatching(/consume|consumption/) } });
        } finally { service.budgetPort.assertCurrent = original; await f.cleanup(); }
    });
});
