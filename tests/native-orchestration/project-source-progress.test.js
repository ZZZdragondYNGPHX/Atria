import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectReadFixture, projectReadResponse, configureProjectToolPlan } from './helpers/project-tool-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { readProjectOwnedSource } from '../../src/native/orchestration/project-tool-receipts.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const plan = { summary: 'Owned Source progression', steps: [{ id: 'inspect', title: 'Inspect Project', impact: 'low' }] };
const fixture = make => projectReadFixture(make, { configurePlan: configureProjectToolPlan(['atri_agent_set_plan']), responseBody: () => {
    const response = projectReadResponse(); response.output[0].name = 'atri_agent_set_plan'; response.output[0].arguments = JSON.stringify(plan); return response;
} });

describe.each(harnesses)('$name Root-owned Project Source facts', ({ make }) => {
    test('only the exact original Root can follow its own durable receipt chain; original bank continuity grants no expired Model scope', async () => {
        const f = await fixture(make), service = f.authority.execution; let sibling;
        f.onRound(async () => {
            const root = await service.runs.get(f.h.handle, f.effects[0].runId);
            sibling = await service.runs.start(f.h.handle, createNativeId('orchestrationCommand'), { planRef: root.planRef,
                sourceRequest: root.sourceBinding.sourceRequest, retentionPolicyRef: root.retentionPolicyRef });
        });
        try {
            await f.run();
            const root = await service.runs.get(f.h.handle, f.effects[0].runId), other = await service.runs.get(f.h.handle, sibling.runId);
            const before = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            const fact = await f.h.engine.withTransaction(f.h.handle, tx => readProjectOwnedSource(tx, f.h.handle, root, { projectAgent: f.agent }));
            expect(fact).toMatchObject({ runId: root.runId, initialFingerprint: f.task.executionFingerprint, currentFingerprint: before.executionFingerprint,
                receiptRefs: [expect.objectContaining({ effectId: f.effects[1].effectId })] });
            expect((await service.sourcePort.revalidate(f.h.handle, root.sourceBinding, { root })).sourceProgress).toEqual(fact);
            await expect(service.sourcePort.revalidate(f.h.handle, root.sourceBinding)).rejects.toThrow('native_orchestration_source_stale');
            expect(other.sourceBinding.bindingDigest).toBe(root.sourceBinding.bindingDigest);
            await expect(service.sourcePort.revalidate(f.h.handle, other.sourceBinding, { root: other })).rejects.toThrow();
            await expect(service.budgetPort.assertCurrent(f.h.handle, root.budgetAuthorityRef)).resolves.toBeUndefined();
            await expect(f.authority.executeProjectRound({ host: f.roundArgs.host, handle: f.h.handle, roundToken: f.round.roundToken,
                source: { projectId: f.projectId, taskId: f.task.taskId, revision: f.task.baseRevision, projectAttemptId: before.attempts[0].attemptId },
                role: 'studio', messages: f.round.messages, tools: f.round.tools })).rejects.toThrow('native_orchestration_project_producer_denied');
            expect((await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId)).compute).toEqual(before.compute); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each(['task-edit', 'project-edit'])('a later original %s cannot be borrowed by Source or budget continuity', async change => {
        const f = await fixture(make), service = f.authority.execution;
        try {
            await f.run(); const root = await service.runs.get(f.h.handle, f.effects[0].runId);
            if (change === 'task-edit') await f.agent.setPlan(f.h.handle, f.projectId, f.task.taskId, { ...plan, summary: 'Independent Task plan' });
            else await f.writeProject();
            await expect(service.sourcePort.revalidate(f.h.handle, root.sourceBinding, { root })).rejects.toThrow();
            await expect(service.budgetPort.assertCurrent(f.h.handle, root.budgetAuthorityRef)).rejects.toThrow();
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts[0].calls).toHaveLength(1); expect(f.requests).toHaveLength(1);
            expect(change === 'task-edit' ? task.plan.summary : (await f.studio.observeRevision(f.h.handle, f.projectId)).revision)
                .not.toBe(change === 'task-edit' ? plan.summary : f.task.baseRevision);
        } finally { await f.cleanup(); }
    });

    test('missing Host confirmation or original cost rows cannot establish Source or original bank continuity', async () => {
        const f = await fixture(make), service = f.authority.execution;
        try {
            await f.run(); const root = await service.runs.get(f.h.handle, f.effects[0].runId);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const fact = await readProjectOwnedSource(tx, f.h.handle, root, { projectAgent: f.agent });
                const hostKey = controlRecordKey(f.h.handle, root.runId, 'receipt', fact.receiptRefs[0].hostReceiptRef.receiptId);
                const taskKey = { kind: K.projectAgentTask, handle: f.h.handle, projectId: f.projectId, taskId: f.task.taskId };
                for (const key of [hostKey, taskKey]) {
                    const saved = await tx.getResource(key);
                    try {
                        if (key === hostKey) await tx.deleteResource(key);
                        else { const doc = structuredClone(saved.doc); doc.compute.localWork = doc.compute.localWork.filter(row => row.kind !== 'project_tool');
                            await tx.putResource(key, { ...saved, doc, integrity: hash(doc) }); }
                        await expect(service.sourcePort.revalidate(f.h.handle, root.sourceBinding, { root, tx })).rejects.toThrow();
                        await expect(service.budgetPort.assertCurrent(f.h.handle, root.budgetAuthorityRef, { tx })).rejects.toThrow();
                    } finally { await tx.putResource(key, saved); }
                }
                expect(await readProjectOwnedSource(tx, f.h.handle, root, { projectAgent: f.agent })).toEqual(fact);
            });
        } finally { await f.cleanup(); }
    });
});
