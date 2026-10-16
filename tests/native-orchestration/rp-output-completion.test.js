import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture, RP_MODEL_TEXT } from './helpers/rp-model-fixture.js';
import { RpOutputCompletionController } from '../../src/native/orchestration/rp-output-completion-controller.js';
import { NativeNarratorOrchestrationAuthority } from '../../src/native/orchestration/native-turn-orchestration.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { readRpOutput, rpOutputClaimId, rpOutputClosureId, rpOutputReceiptId } from '../../src/native/orchestration/rp-output-contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { checkedRecord } from '../../src/native/orchestration/plan-repository.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const configurePlan = plan => {
    plan.definition.nodes.find(node => node.kind === 'output').capabilities = ['chat.output'];
    plan.definition.capabilityCeiling = [...plan.definition.nodes[0].capabilities, 'chat.output'];
    Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
};
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;

describe.each(harnesses)('$name real RP output terminal proof', ({ make }) => {
    test('one original claim completes the Run and its historical facts survive legitimate edits, deletion and cold reopen', async () => {
        const f = await rpModelFixture(make, { configurePlan }); let cold;
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(root.status).toBe('completed'); expect(root.outputClaims).toEqual([result.output.outputClaimRef]);
            const facts = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(facts.claim.resultRef).toEqual(root.resultRefs[0]); expect(facts.output.status).toBe('completed'); expect(facts.published.record.payload).toBe(RP_MODEL_TEXT);
            expect(facts.domainReceipt.outputKey).toBe(result.output.outputKey); expect(facts.closure.effectIds).toEqual([result.effectId, result.output.outputEffectId].sort());
            let chat = await f.chats.get(f.h.handle, 'Actor', 'main'); chat.body[1].mes = 'Later user edit';
            await f.chats.save(f.h.handle, 'Actor', 'main', chat.header, chat.body, chat.integrity);
            expect((await f.authority.execution.runs.get(f.h.handle, root.runId)).status).toBe('completed');
            await f.chats.delete(f.h.handle, 'Actor', 'main');
            expect((await f.authority.execution.runs.get(f.h.handle, root.runId)).status).toBe('completed');
            await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            const observed = await cold.withTransaction(f.h.handle, async tx => {
                const stored = await checkedRecord(tx, { kind: K.orchestrationRun, handle: f.h.handle, runId: root.runId });
                return readRpOutput(tx, f.h.handle, stored.doc);
            });
            expect(observed.claim).toEqual(facts.claim); expect(f.requests).toHaveLength(1);
        } finally { await cold?.close(); await f.cleanup(); }
    });

    test('unknown original Model usage retains a committed Chat and settled output work without a terminal claim', async () => {
        const f = await rpModelFixture(make, { configurePlan, usage: false });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId), bank = await bankOf(f);
            expect(result.output.status).toBe('committed'); expect(result.output.runStatus).toBe('pending_output'); expect(result.output.outputClaimRef).toBeNull();
            expect(root.status).toBe('running'); expect(root.outputClaims).toEqual([]); expect(bank.attempts[0].status).toBe('unknown');
            expect(bank.localWork.find(row => row.kind === 'rp_output').status).toBe('settled');
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(3); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each(['saved', 'no_save'])('completion ACK %s only observes exact durable facts, including cold reopen', async ack => {
        const f = await rpModelFixture(make, { configurePlan }), transaction = f.h.engine.withTransaction.bind(f.h.engine); let injected = false, cold;
        const match = value => value?.denied === false && value.runStatus === 'completed' && value.outputClaimRef;
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const result = await transaction(handle, async tx => {
                const value = await callback(tx);
                if (!injected && match(value) && ack === 'no_save') { injected = true; throw new StorageCommitUnknownError(new Error('Before RP terminal commit')); }
                return value;
            }, ...options);
            if (!injected && match(result) && ack === 'saved') { injected = true; throw new StorageCommitUnknownError(new Error('After RP terminal commit')); }
            return result;
        };
        try {
            const outcome = await f.run().then(value => ({ value }), error => ({ error })); expect(injected).toBe(true); expect(outcome.error === undefined).toBe(ack === 'saved');
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.status).toBe(ack === 'saved' ? 'completed' : 'running'); expect(root.outputClaims).toHaveLength(ack === 'saved' ? 1 : 0);
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(3); expect(f.requests).toHaveLength(1);
            expect((await bankOf(f)).localWork.find(row => row.kind === 'rp_output').status).toBe('settled');
            await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            const observed = await cold.withTransaction(f.h.handle, async tx => {
                const stored = await checkedRecord(tx, { kind: K.orchestrationRun, handle: f.h.handle, runId: root.runId });
                return readRpOutput(tx, f.h.handle, stored.doc);
            });
            expect(observed !== null).toBe(ack === 'saved');
        } finally { f.h.engine.withTransaction = transaction; await cold?.close(); await f.cleanup(); }
    });

    test('the original Run CAS refuses isolated success or an invented claim before the real completion', async () => {
        const f = await rpModelFixture(make, { configurePlan }), complete = RpOutputCompletionController.prototype.complete;
        let checked = false, hookError;
        const verify = async root => {
            for (const claimed of [false, true]) {
                await expect(f.authority.execution.runs.control(f.h.handle, createNativeId('orchestrationCommand'), {
                    ...runGuard(root), operation: 'output.publish', detail: { forged: true, claimed } }, async ({ root }) => {
                    root.status = 'completed';
                    root.outputClaims = claimed ? [{ runId: root.runId, claimId: rpOutputClaimId(root) }] : [];
                    return { root, eventType: 'forged_rp_completion', reasonCode: null, outcome: {} };
                })).rejects.toThrow();
            }
        };
        RpOutputCompletionController.prototype.complete = async function (handle, request) {
            const root = await f.authority.execution.runs.get(handle, f.effects[0].runId);
            try { await verify(root); checked = true; } catch (error) { hookError = error; throw error; }
            return complete.call(this, handle, request);
        };
        try {
            const result = await f.run().catch(error => { throw hookError ?? error; }); expect(checked).toBe(true); expect(result.output.runStatus).toBe('completed');
            expect(f.requests).toHaveLength(1);
        } finally { RpOutputCompletionController.prototype.complete = complete; await f.cleanup(); }
    });

    test.each(['cancel', 'binding', 'input_edit', 'output_edit', 'chat_delete', 'relocated', 'new_input'])('%s at the final original bank closure await commits the lawful change before denying completion', async change => {
        const f = await rpModelFixture(make, { configurePlan }), observe = BudgetPort.prototype.observeEffectClosure;
        let injected = false, expectedVersion;
        BudgetPort.prototype.observeEffectClosure = async function (handle, input, options) {
            const value = await observe.call(this, handle, input, options);
            if (!injected) {
                injected = true;
                if (change === 'cancel') {
                    const root = await f.authority.execution.runs.get(handle, f.effects[0].runId);
                    await f.authority.execution.runs.cancel(handle, createNativeId('orchestrationCommand'), { ...runGuard(root), reasonCode: 'cancel_final_rp_output' });
                } else if (change === 'binding') {
                    const binding = await f.plans.getBinding(handle, f.sourceSelector); expectedVersion = binding.version + 1;
                    await f.plans.saveBinding(handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                } else if (change === 'chat_delete') await f.chats.delete(handle, 'Actor', 'main');
                else {
                    const chat = await f.chats.get(handle, 'Actor', 'main');
                    if (change === 'relocated') chat.header.chat_metadata.nativeControlId = '';
                    else if (change === 'input_edit') chat.body[1].mes = 'Lawful completion input edit';
                    else if (change === 'output_edit') chat.body[2].mes = 'Lawful completion output edit';
                    else chat.body.push({ name: 'User', is_user: true, mes: 'Next user turn', memory_os_source_id: 'rp-next-input' });
                    await f.chats.save(handle, 'Actor', 'main', chat.header, chat.body, chat.integrity);
                }
            }
            return value;
        };
        try {
            const failure = await f.run().then(() => null, error => error); expect(failure).not.toBeNull(); expect(injected).toBe(true);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId), chat = await f.chats.get(f.h.handle, 'Actor', 'main');
            const actual = change === 'cancel' ? root.cancelRequested : change === 'binding' ? (await f.plans.getBinding(f.h.handle, f.sourceSelector)).version
                : change === 'chat_delete' ? chat : change === 'relocated' ? chat.header.chat_metadata.nativeControlId
                    : change === 'input_edit' ? chat.body[1].mes : change === 'output_edit' ? chat.body[2].mes : chat.body.length;
            expect(actual).toEqual({ cancel: true, binding: expectedVersion, chat_delete: null, relocated: '', input_edit: 'Lawful completion input edit', output_edit: 'Lawful completion output edit', new_input: 4 }[change]);
            expect(root.outputClaims).toEqual([]); expect(root.status).not.toBe('completed'); expect(f.requests).toHaveLength(1);
            expect((await bankOf(f)).attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
        } finally { BudgetPort.prototype.observeEffectClosure = observe; await f.cleanup(); }
    });

    test('a post-write failure rolls back claim, closure, output settlement and terminal counters while preserving Chat and fees', async () => {
        const f = await rpModelFixture(make, { configurePlan }), runs = f.authority.execution.runs, control = runs.control.bind(runs); let injected = false;
        runs.control = (handle, id, body, reduce, ...rest) => control(handle, id, body, async args => {
            const result = await reduce(args);
            if (body.operation === 'output.publish') { injected = true; throw new Error('After RP terminal metadata writes'); }
            return result;
        }, ...rest);
        try {
            const failure = await f.run().then(() => null, error => error); expect(failure).not.toBeNull(); expect(injected).toBe(true);
            const root = await runs.get(f.h.handle, f.effects[0].runId); expect(root.status).toBe('running'); expect(root.outputClaims).toEqual([]);
            expect(await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).toBeNull();
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(3); expect(f.requests).toHaveLength(1);
            expect((await bankOf(f)).localWork.find(row => row.kind === 'rp_output').status).toBe('settled');
        } finally { runs.control = control; await f.cleanup(); }
    });

    test('honestly rehashed claim, closure, traversal or original domain facts cannot become a terminal proof', async () => {
        const f = await rpModelFixture(make, { configurePlan });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            const facts = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            const changes = [
                [{ kind: K.orchestrationRun, handle: f.h.handle, runId: root.runId }, doc => { doc.graph.outputContract.slot = 'foreign_slot'; }],
                [controlRecordKey(f.h.handle, root.runId, 'output', rpOutputClaimId(root)), doc => { doc.resultRef.resultId = createNativeId('orchestrationResult'); }],
                [controlRecordKey(f.h.handle, root.runId, 'receipt', rpOutputClosureId(root.runId)), doc => { doc.effectIds = [result.effectId]; }],
                [controlRecordKey(f.h.handle, root.runId, 'receipt', facts.receipt.traversalReceiptRef.receiptId), doc => { doc.nodeAttemptId = createNativeId('orchestrationAttempt'); }],
                [controlRecordKey(f.h.handle, root.runId, 'receipt', rpOutputReceiptId(root.runId)), doc => { doc.graphRevision++; }],
                [{ kind: K.rpRunControl, handle: f.h.handle, controlId: f.controlId }, doc => { doc.outputReceipts[result.output.outputKey].expectedIntegrity = 'honest-but-foreign'; }],
            ];
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                for (const [key, change] of changes) {
                    const saved = await tx.getResource(key), doc = structuredClone(saved.doc); change(doc);
                    try { await tx.putResource(key, { ...saved, doc, integrity: hash(doc) }); await expect(f.authority.execution.runs.get(f.h.handle, root.runId)).rejects.toThrow(); }
                    finally { await tx.putResource(key, saved); }
                }
            });
            expect((await f.authority.execution.runs.get(f.h.handle, root.runId)).status).toBe('completed'); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('copied, foreign or expired scopes and a claimed allow flag cannot authorize completion', async () => {
        const f = await rpModelFixture(make, { configurePlan }), complete = RpOutputCompletionController.prototype.complete;
        const authorize = NativeNarratorOrchestrationAuthority.prototype.authorizeRpOutputCompletion; let capture, hookError;
        const verify = async (controller, handle, request) => {
            for (const changed of [{ capture: {} }, { capture: structuredClone(request.capture) }, { ...request, allowed: true }])
                await expect(complete.call(controller, handle, changed)).rejects.toThrow();
            await expect(complete.call(controller, 'foreign', request)).rejects.toThrow();
            await expect(complete.call(new RpOutputCompletionController({ host: Object.create(f.host) }), handle, request)).rejects.toThrow();
            NativeNarratorOrchestrationAuthority.prototype.authorizeRpOutputCompletion = async function (...args) { return { ...await authorize.apply(this, args), allowed: false }; };
            try { await expect(complete.call(controller, handle, request)).rejects.toMatchObject({ code: 'native_rp_output_denied' }); }
            finally { NativeNarratorOrchestrationAuthority.prototype.authorizeRpOutputCompletion = authorize; }
        };
        RpOutputCompletionController.prototype.complete = async function (handle, request) {
            capture = request.capture;
            try { await verify(this, handle, request); } catch (error) { hookError = error; throw error; }
            return complete.call(this, handle, request);
        };
        try {
            const result = await f.run().catch(error => { throw hookError ?? error; }); expect(result.output.runStatus).toBe('completed');
            await expect(complete.call(new RpOutputCompletionController({ host: f.host }), f.h.handle, { capture })).rejects.toThrow();
            expect(f.requests).toHaveLength(1);
        } finally { RpOutputCompletionController.prototype.complete = complete; NativeNarratorOrchestrationAuthority.prototype.authorizeRpOutputCompletion = authorize; await f.cleanup(); }
    });

    test('a late bill recorded by the original bank before closure can complete the same Run without another Model or Chat send', async () => {
        const f = await rpModelFixture(make, { configurePlan, usage: false }), observe = BudgetPort.prototype.observeEffectClosure; let injected = false;
        BudgetPort.prototype.observeEffectClosure = async function (handle, input, options) {
            if (!injected) {
                injected = true; const control = await f.control.status(handle, f.controlId), [operationId, operation] = Object.entries(control.operations)[0];
                await f.control.settleCompute(handle, f.controlId, operationId, operation.compute.attempts[0].attemptId, { totalTokens: 20, inputTokens: 12, outputTokens: 8 });
            }
            return observe.call(this, handle, input, options);
        };
        try {
            const result = await f.run(); expect(injected).toBe(true); expect(result.output.runStatus).toBe('completed');
            expect((await bankOf(f)).attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(3); expect(f.requests).toHaveLength(1);
        } finally { BudgetPort.prototype.observeEffectClosure = observe; await f.cleanup(); }
    });

});
