import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { projectReadFixture, projectReadResponse, configureProjectToolPlan } from './helpers/project-tool-fixture.js';
import { services } from '../agent-intelligence/project-fixture.js';
import { readProjectRoundReceipt } from '../../src/native/orchestration/project-round-contracts.js';
import { inspectNativeProjectRoundCompletion } from '../../src/native/orchestration/native-project-generation-authority.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const plan = { summary: 'Original round proof', steps: [{ id: 'inspect', title: 'Inspect original Project' }] };
const fixture = (make, kind = 'plain') => kind === 'plain' ? projectModelFixture(make) : projectReadFixture(make, kind === 'read' ? {} : {
    configurePlan: configureProjectToolPlan(['atri_agent_set_plan']), responseBody: () => {
        const response = projectReadResponse(); response.output[0].name = 'atri_agent_set_plan'; response.output[0].arguments = JSON.stringify(plan); return response;
    } });
const read = async f => {
    const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
    return f.h.engine.withTransaction(f.h.handle, tx => readProjectRoundReceipt(tx, f.h.handle, root, root.attemptRefs[0], { projectAgent: services(f.h).agent }));
};

describe.each(harnesses)('$name original Project round completion', ({ make }) => {
    test.each(['plain', 'read', 'plan'])('%s finishes exactly the original public conversation and stores a correlated Host receipt', async kind => {
        const f = await fixture(make, kind);
        const finish = f.authority.finishProjectRound.bind(f.authority); let finishArgs;
        f.authority.finishProjectRound = args => { finishArgs = args; return finish(args); };
        try {
            await f.run(); const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId), fact = await read(f);
            expect(fact.receipt).toMatchObject({ receiptKind: 'project_round', projectAttemptId: task.attempts[0].attemptId,
                conversationLength: task.conversation.length, round: 0, toFingerprint: task.executionFingerprint });
            expect(task.attempts[0].status).toBe('completed'); expect(fact.receipt.toolReceiptRefs).toHaveLength(kind === 'plain' ? 0 : 1);
            await expect(inspectNativeProjectRoundCompletion(structuredClone(fact.receipt), { host: f.roundArgs.host, handle: f.h.handle, runId: fact.receipt.runId }))
                .rejects.toThrow('native_orchestration_project_round_completion_required');
            await expect(finish(finishArgs)).rejects.toThrow('native_orchestration_project_round_finish_denied');
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('a modified public transcript cannot be saved as the actual Model completion', async () => {
        const f = await fixture(make), finish = f.authority.finishProjectRound.bind(f.authority);
        f.authority.finishProjectRound = args => finish({ ...args, input: { ...args.input, conversation: [...args.input.conversation,
            { role: 'assistant', content: 'Injected reply without original Model provenance' }] } });
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_project_round_conversation_changed');
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.conversation).toEqual(f.task.conversation); expect(task.attempts[0].status).toBe('started'); expect(await read(f)).toBeNull();
            expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } }); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each([false, true])('original generation writer ACK saved=%s is only observed, never repeated as failed or completed', async saved => {
        const f = await fixture(make, 'plan'), save = f.repository.save.bind(f.repository); let writes = 0;
        f.repository.save = async (handle, next, ...args) => {
            if (next.attempts.some(attempt => attempt.kind === 'generation' && attempt.status === 'completed')) {
                writes++;
                if (saved) await save(handle, next, ...args);
                throw Object.assign(new Error('Synthetic lost original round ACK'), { code: 'storage_commit_unknown' });
            }
            return save(handle, next, ...args);
        };
        try {
            const result = await f.run().then(value => ({ value }), error => ({ error })); expect(Boolean(result.error)).toBe(!saved); expect(writes).toBe(1);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts[0].status).toBe(saved ? 'completed' : 'started'); expect(task.attempts[0].calls).toHaveLength(1);
            expect(Boolean(await read(f))).toBe(saved); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each([false, true])('Host round receipt ACK saved=%s never repeats the original Task generation writer', async saved => {
        const f = await fixture(make), runs = f.authority.execution.runs, control = runs.control.bind(runs); let attempts = 0;
        runs.control = async (handle, commandId, body, ...args) => {
            if (body.operation !== 'project.round.finish') return control(handle, commandId, body, ...args);
            attempts++;
            if (saved) await control(handle, commandId, body, ...args);
            throw Object.assign(new Error('Synthetic lost Host round ACK'), { code: 'storage_commit_unknown' });
        };
        try {
            const result = await f.run().then(value => ({ value }), error => ({ error })); expect(Boolean(result.error)).toBe(!saved); expect(attempts).toBe(1);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts[0].status).toBe('completed'); expect(Boolean(await read(f))).toBe(saved); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('rehashed round metadata, original Task transcript, Model payload or original bill cannot replace the correlated completion', async () => {
        const f = await fixture(make);
        try {
            await f.run(); const runs = f.authority.execution.runs, root = await runs.get(f.h.handle, f.effects[0].runId), fact = await read(f);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const check = () => readProjectRoundReceipt(tx, f.h.handle, root, root.attemptRefs[0], { projectAgent: f.agent });
                const taskKey = { kind: K.projectAgentTask, handle: f.h.handle, projectId: f.projectId, taskId: f.task.taskId };
                const cases = [
                    { key: controlRecordKey(f.h.handle, root.runId, 'receipt', fact.receipt.receiptId), mutate: doc => { doc.conversationDigest = '0'.repeat(64); } },
                    { key: controlRecordKey(f.h.handle, root.runId, 'receipt', fact.receipt.receiptId), mutate: doc => { doc.modelPayloadHash = '0'.repeat(64); } },
                    { key: taskKey, mutate: doc => { doc.conversation.at(-1).content = 'Rehashed invented assistant'; } },
                    { key: taskKey, mutate: doc => { doc.compute.attempts = []; } },
                    { key: controlRecordKey(f.h.handle, root.runId, 'receipt', fact.receipt.modelReceiptRef.receiptId), mutate: doc => { doc.dispatchEvidence.reference.resultPayloadHash = '0'.repeat(64); } },
                ];
                for (const { key, mutate } of cases) {
                    const saved = await tx.getResource(key), doc = structuredClone(saved.doc); mutate(doc);
                    try { await tx.putResource(key, { ...saved, doc, integrity: hash(doc) }); await expect(check()).rejects.toThrow(); }
                    finally { await tx.putResource(key, saved); }
                }
                expect(await check()).toEqual(fact);
            });
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });
});
