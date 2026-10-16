import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectReviewFixture } from './helpers/project-review-fixture.js';
import { readProjectReviewOutput, projectReviewId } from '../../src/native/orchestration/project-review-output-contracts.js';
import { readAttempt, controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { RunObservationService } from '../../src/native/orchestration/run-observation-service.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));

describe.each(harnesses)('$name original Project Review output', ({ make }) => {
    test('original Review, all round costs and actual Graph output complete one Root without committing the Project', async () => {
        const f = await projectReviewFixture(make, { outputContract: true });
        try {
            await f.run();
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.status).toBe('completed'); expect(root.outputClaims).toHaveLength(1); expect(root.resultRefs).toHaveLength(1);
            expect(root.attemptRefs).toHaveLength(4); expect(root.progress.loopIterations).toBe(2); expect(root.progress.edgeVisits).toBe(3);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const facts = await readProjectReviewOutput(tx, f.h.handle, root);
                expect(facts.claim.status).toBe('committed'); expect(facts.published.record.payload.kind).toBe('native_project_review');
                expect(facts.receipt.costs.closed).toBe(true); expect(facts.receipt.costs.effectIds).toHaveLength(6);
                expect(facts.receipt.costs.budgetAttemptRefs.filter(ref => ref.kind !== 'local_work')).toHaveLength(3);
                const output = (await readAttempt(tx, f.h.handle, root, root.attemptRefs.at(-1))).doc;
                expect(output.status).toBe('completed'); expect(output.resultRefs).toEqual(root.resultRefs); expect(output.effectRefs).toEqual([]);
            });
            const task = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            expect(task.status).toBe('review'); expect(task.commitIntent).toBeNull(); expect(task.changeSets).toEqual([]);
            expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true);
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
            expect(f.requests).toHaveLength(3);
            const observations = new RunObservationService({ engine: f.h.engine, projectAgent: f.agent, studio: f.studio, pollMs: 0 });
            const snapshot = await observations.observe(f.h.handle, { runId: root.runId, cursor: null, limit: 1 });
            expect(snapshot.payload.costs).toMatchObject({ status: 'settled', closed: true, modelAttempts: 3, knownTotalTokens: 60, unknownAttempts: 0 });
            expect(snapshot.payload.attempts).toHaveLength(1); expect(snapshot.payload.hasMore.attempts).toBe(true);
            const first = await observations.details(f.h.handle, { runId: root.runId, collection: 'attempts', cursor: null, limit: 2 });
            const second = await observations.details(f.h.handle, { runId: root.runId, collection: 'attempts', cursor: first.cursor, limit: 2 });
            expect([...first.items, ...second.items].map(item => item.attemptId)).toEqual(root.attemptRefs); expect(second.cursor).toBeNull();
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['result.publish', 'output.publish'])('%s ACK loss only observes saved facts and never repeats original domain work', async phase => {
        // Test both persistence outcomes with the actual transaction boundary.
        for (const saved of [false, true]) {
            const f = await projectReviewFixture(make, { outputContract: true }), runs = f.authority.execution.runs;
            const transaction = f.h.engine.withTransaction.bind(f.h.engine);
            let injected = false;
            // Match the outer source-control transaction, not a nested CAS
            // whose apparent ACK still precedes physical persistence.
            const matches = value => phase === 'result.publish' ? value?.value?.outcome?.resultRef : value?.value?.outcome?.claimRef;
            f.h.engine.withTransaction = async (handle, callback, ...options) => {
                const value = await transaction(handle, async tx => {
                    const result = await callback(tx);
                    if (!injected && matches(result) && !saved) {
                        injected = true; throw new StorageCommitUnknownError(new Error('Before original Review metadata persistence'));
                    }
                    return result;
                }, ...options);
                if (!injected && matches(value) && saved) {
                    injected = true; throw new StorageCommitUnknownError(new Error('After original Review metadata persistence'));
                }
                return value;
            };
            try {
                const result = await f.run().then(value => ({ value }), error => ({ error }));
                expect(injected).toBe(true); expect(Boolean(result.error)).toBe(!saved);
                const root = await runs.get(f.h.handle, f.effects[0].runId);
                expect(root.status).toBe(saved ? 'completed' : 'running'); expect(root.outputClaims).toHaveLength(saved ? 1 : 0);
                expect((await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId)).status).toBe('review');
                expect(f.requests).toHaveLength(3);
            } finally { f.h.engine.withTransaction = transaction; await f.cleanup(); }
        }
    }, 120000);

    test.each(['binding', 'cancel'])('%s changes during final closure persist and refuse terminal metadata', async change => {
        const f = await projectReviewFixture(make, { outputContract: true }), bank = f.authority.execution.budgetPort;
        const observe = bank.observeEffectClosure.bind(bank); let changed = false, nextVersion;
        bank.observeEffectClosure = async (...args) => {
            const costs = await observe(...args), root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            const output = root.graph.nodes.find(node => node.kind === 'output');
            const last = (await f.h.engine.withTransaction(f.h.handle, tx => readAttempt(tx, f.h.handle, root, root.attemptRefs.at(-1)))).doc;
            if (!changed && last.nodeId === output.nodeId && last.status === 'running') {
                changed = true;
                if (change === 'binding') {
                    const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector); nextVersion = binding.version + 1;
                    await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), {
                        sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                } else await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), {
                    ...runGuard(root), reasonCode: 'original_project_review_cancel' });
            }
            return costs;
        };
        try {
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.outputClaims).toEqual([]);
            const changedValue = change === 'binding' ? (await f.plans.getBinding(f.h.handle, f.sourceSelector)).version
                : root.cancelRequested;
            expect(changedValue).toEqual({ binding: nextVersion, cancel: true }[change]);
            expect((await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).compute.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(f.requests).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 60000);

    test('terminal failure rolls back all output metadata and keeps the original human Review and charges', async () => {
        const f = await projectReviewFixture(make, { outputContract: true }), runs = f.authority.execution.runs, control = runs.control.bind(runs);
        runs.control = (handle, commandId, input, apply, ...options) => control(handle, commandId, input, async frame => {
            const value = await apply(frame);
            if (input.operation === 'output.publish') throw new Error('After original Review terminal writes');
            return value;
        }, ...options);
        try {
            await expect(f.run()).rejects.toThrow('After original Review terminal writes');
            const root = await runs.get(f.h.handle, f.effects[0].runId);
            expect(root.status).toBe('blocked'); expect(root.outputClaims).toEqual([]);
            expect(await f.h.engine.withTransaction(f.h.handle, tx => tx.getResource(controlRecordKey(f.h.handle, root.runId, 'output', projectReviewId('claim', root.runId))))).toBeNull();
            expect((await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId)).status).toBe('review');
            expect(f.requests).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 60000);

    test('historical proof rejects rehashed foreign results, traversal, claims, commands and missing original charges', async () => {
        const f = await projectReviewFixture(make, { outputContract: true });
        try {
            await f.run(); const runs = f.authority.execution.runs, root = await runs.get(f.h.handle, f.effects[0].runId);
            const facts = await f.h.engine.withTransaction(f.h.handle, tx => readProjectReviewOutput(tx, f.h.handle, root));
            const changes = [
                [controlRecordKey(f.h.handle, root.runId, 'result', root.resultRefs[0].resultId), doc => { doc.payload.taskId = 'foreign-task'; }],
                [controlRecordKey(f.h.handle, root.runId, 'output', facts.claim.claimId), doc => { doc.consumerRef.kind = 'rp_output'; }],
                [controlRecordKey(f.h.handle, root.runId, 'receipt', facts.receipt.receiptId), doc => { doc.costs.budgetAttemptRefs = []; }],
                [controlRecordKey(f.h.handle, root.runId, 'receipt', facts.receipt.traversalReceiptRef.receiptId), doc => { doc.nodeAttemptId = createNativeId('orchestrationAttempt'); }],
                [{ kind: K.projectAgentTask, handle: f.h.handle, projectId: f.projectId, taskId: f.task.taskId }, doc => { doc.compute.attempts.pop(); }],
            ];
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const commands = await tx.listResources({ kind: K.orchestrationCommand, handle: f.h.handle });
                for (const command of commands.filter(row => row.doc.target === root.runId && row.doc.operation === 'runs.control.output.publish'))
                    changes.push([{ kind: K.orchestrationCommand, handle: f.h.handle, commandId: command.doc.commandId }, doc => { doc.outcome.claimRef.claimId = 'oclaim_' + hash('foreign').slice(0, 32); }]);
                for (const [key, mutate] of changes) {
                    const saved = await tx.getResource(key), doc = structuredClone(saved.doc); mutate(doc);
                    try { await tx.putResource(key, { ...saved, doc, integrity: hash(doc) }); await expect(runs.get(f.h.handle, root.runId)).rejects.toThrow(); }
                    finally { await tx.putResource(key, saved); }
                }
            });
            await f.writeProject();
            expect((await runs.get(f.h.handle, root.runId)).status).toBe('completed');
            expect(f.requests).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 60000);
});
