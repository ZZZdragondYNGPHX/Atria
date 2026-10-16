import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectReadFixture } from './helpers/project-tool-fixture.js';
import { services } from '../agent-intelligence/project-fixture.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { readProjectToolReceipt } from '../../src/native/orchestration/project-tool-receipts.js';
import { executeNativeProjectTaskTool } from '../../src/native/orchestration/native-project-generation-authority.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));

describe.each(harnesses)('$name original Project durable tool receipt', ({ make }) => {
    test('recreated original services read exact history after scope expiry and later Project edits without restoring execution', async () => {
        const f = await projectReadFixture(make);
        try {
            await f.run();
            const agent = services(f.h).agent, root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            const read = () => f.h.engine.withTransaction(f.h.handle, tx => readProjectToolReceipt(tx, f.h.handle, root, f.effects[1].effectId,
                { projectAgent: agent, requireHostReceipt: true }));
            const before = await agent.observeTask(f.h.handle, f.projectId, f.task.taskId), fact = await read();
            expect(fact.receipt).toMatchObject({ runId: root.runId, effectId: f.effects[1].effectId, operationId: expect.any(String) });
            expect(fact).not.toHaveProperty('result'); expect(fact).not.toHaveProperty('permit');
            await expect(executeNativeProjectTaskTool(structuredClone(fact))).rejects.toThrow('native_orchestration_project_producer_denied');
            await f.writeProject(); expect(await read()).toEqual(fact);
            expect((await agent.observeTask(f.h.handle, f.projectId, f.task.taskId)).compute).toEqual(before.compute); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('rehashing changed Task, Model, Effect, Attempt, bank or Host receipt facts cannot manufacture a correlated proof', async () => {
        const f = await projectReadFixture(make);
        try {
            await f.run();
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId), read = tx => readProjectToolReceipt(tx, f.h.handle, root,
                f.effects[1].effectId, { projectAgent: f.agent, requireHostReceipt: true });
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const fact = await read(tx), taskKey = { kind: K.projectAgentTask, handle: f.h.handle, projectId: f.projectId, taskId: f.task.taskId };
                const cases = [
                    { key: taskKey, mutate: doc => { doc.attempts[0].calls[0].nativeReceipt.resultHash = '0'.repeat(64); } },
                    { key: taskKey, mutate: doc => { doc.attempts[0].calls[0].nativeReceipt.operationId = 'foreign-operation'; } },
                    { key: taskKey, mutate: doc => { const receipt = doc.attempts[0].calls[0].nativeReceipt; receipt.fromFingerprint = '0'.repeat(64); receipt.toFingerprint = receipt.fromFingerprint; } },
                    { key: taskKey, mutate: doc => { doc.compute.localWork = doc.compute.localWork.filter(row => row.kind !== 'project_tool'); } },
                    { key: controlRecordKey(f.h.handle, root.runId, 'effect', f.effects[1].effectId), mutate: doc => { doc.inputRef.call.args = { altered: true }; doc.inputHash = hash(doc.inputRef); } },
                    { key: controlRecordKey(f.h.handle, root.runId, 'effect', f.effects[0].effectId), mutate: doc => { doc.inputRef.projectAttemptId = 'foreign-attempt'; doc.inputHash = hash(doc.inputRef); } },
                    { key: controlRecordKey(f.h.handle, root.runId, 'attempt', root.attemptRefs[0]), mutate: doc => { doc.effectiveGrantDigest = '0'.repeat(64); } },
                    { key: controlRecordKey(f.h.handle, root.runId, 'receipt', fact.hostReceiptRef.receiptId), mutate: doc => { doc.domainReceiptRef.receiptHash = '0'.repeat(64); } },
                ];
                for (const { key, mutate } of cases) {
                    const saved = await tx.getResource(key), doc = structuredClone(saved.doc); mutate(doc);
                    try { await tx.putResource(key, { ...saved, doc, integrity: hash(doc) }); await expect(read(tx)).rejects.toThrow(); }
                    finally { await tx.putResource(key, saved); }
                }
                expect(await read(tx)).toEqual(fact);
                const foreign = structuredClone(root); foreign.sourceBinding.sourceRef.taskId = 'foreign-task';
                await expect(readProjectToolReceipt(tx, f.h.handle, foreign, f.effects[1].effectId, { projectAgent: f.agent })).rejects.toThrow();
            });
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('a missing Host ACK retains an observable original Task receipt without a Host confirmation or execution grant', async () => {
        const f = await projectReadFixture(make), observe = f.authority.execution.effects.observe.bind(f.authority.execution.effects);
        f.authority.execution.effects.observe = (handle, input) => {
            if (input.observation.reasonCode !== 'project_read_completed') return observe(handle, input);
            throw Object.assign(new Error('Synthetic missing Host confirmation'), { code: 'storage_commit_unknown' });
        };
        try {
            await expect(f.run()).rejects.toThrow('Synthetic missing Host confirmation');
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId), agent = services(f.h).agent;
            const fact = await f.h.engine.withTransaction(f.h.handle, tx => readProjectToolReceipt(tx, f.h.handle, root, f.effects[1].effectId, { projectAgent: agent }));
            expect(fact.hostReceiptRef).toBeNull(); expect(fact.receipt.effectId).toBe(f.effects[1].effectId);
            await expect(f.h.engine.withTransaction(f.h.handle, tx => readProjectToolReceipt(tx, f.h.handle, root, f.effects[1].effectId,
                { projectAgent: agent, requireHostReceipt: true }))).rejects.toThrow('native_orchestration_project_tool_receipt_invalid');
            expect((await agent.observeTask(f.h.handle, f.projectId, f.task.taskId)).attempts[0].calls).toHaveLength(1); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });
});
