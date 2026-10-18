import { expect, test } from '@jest/globals';
import { sessionFanoutPlannerFixture, sessionScopeTask } from './helpers/session-fanout-planner-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';
import { readSessionPlannerCompletion } from '../../src/native/orchestration/session-planner-contracts.js';
import { readAttempt, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { graphNodeResult, readGraphResultPublicationSnapshot } from '../../src/native/orchestration/graph-result-contracts.js';
import { readPlanRevision } from '../../src/native/orchestration/plan-repository.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';

test.each(CONTRACT_HARNESSES)('$name Game frozen scope Planner schedules reserved Agent DAG with charged sibling and original typed Join', async ({ make }) => {
    const f = await sessionFanoutPlannerFixture(make);
    let releaseSiblingStart, releaseSibling, reserved, hydrated, bankAtPatch;
    const siblingStarted = new Promise(resolve => { releaseSiblingStart = resolve; });
    const preferredStarted = new Promise(resolve => { releaseSibling = resolve; });
    const { planner, first, preferred, merge, sibling } = f.topology;
    f.onResponse(async () => {
        const nodeId = sessionScopeTask(f.requests.at(-1))?.nodeId;
        if (nodeId === sibling.nodeId) { releaseSiblingStart(); await preferredStarted; }
        if (nodeId === planner.nodeId) {
            await siblingStarted;
            const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            reserved = await f.h.engine.withTransaction(f.h.handle, async tx => {
                const attempts = await Promise.all(root.attemptRefs.map(id => readAttempt(tx, f.h.handle, root, id)));
                return attempts.find(item => item.doc.nodeId === preferred.nodeId).doc;
            });
            bankAtPatch = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        }
        if (nodeId === preferred.nodeId) {
            releaseSibling();
            const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            hydrated = await f.h.engine.withTransaction(f.h.handle, async tx => {
                const attempts = await Promise.all(root.attemptRefs.map(id => readAttempt(tx, f.h.handle, root, id)));
                return attempts.find(item => item.doc.nodeId === preferred.nodeId).doc;
            });
        }
    });
    try {
        const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('completed'); expect(root.graphRevision).toBe(1); expect(root.progress.patches).toBe(1); expect(root.outputClaims).toHaveLength(1);
        expect(f.requests).toHaveLength(6); expect(new Set(f.requests.slice(0, 2).map(body => sessionScopeTask(body).nodeId))).toEqual(new Set([planner.nodeId, sibling.nodeId]));
        expect(bankAtPatch.attempts).toHaveLength(2); expect(bankAtPatch.attempts.every(row => row.status === 'charged')).toBe(true);
        const order = f.requests.map(body => sessionScopeTask(body).nodeId);
        expect(order.indexOf(preferred.nodeId)).toBeLessThan(order.indexOf(first.nodeId)); expect(order.indexOf(first.nodeId)).toBeLessThan(order.indexOf(merge.nodeId));
        expect(f.requests.find(body => sessionScopeTask(body).nodeId === planner.nodeId).model).toBe('game-frozen-scope-planner');
        expect(f.requests.filter(body => body.model === 'game-frozen-scope-planner')).toHaveLength(1);
        expect(reserved.inputState).toBe('reserved'); expect(reserved.status).toBe('reserved'); expect(reserved.inputRefs).toBeNull(); expect(reserved.graphRevision).toBe(0);
        expect(hydrated.attemptId).toBe(reserved.attemptId); expect(hydrated.inputState).toBe('prepared'); expect(hydrated.graphRevision).toBe(1);
        expect(hydrated.reservationRef).toEqual(reserved.reservationRef); expect(hydrated.inputRefs[0].acceptedControlRefs).toHaveLength(1);
        expect(hydrated.inputRefs[0].acceptedGraphResultRefs).toEqual([]);
        for (const node of [planner, first, preferred, merge, sibling]) {
            const body = f.requests.find(body => sessionScopeTask(body).nodeId === node.nodeId), input = JSON.stringify(body.input);
            expect(input.includes('阿岚听说')).toBe(node !== sibling); expect(input.includes('沈墨怀疑')).toBe(node === sibling);
        }
        const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root)), joined = proof.published.fanoutCompletions[0];
        expect(joined.frame.branches.map(branch => branch.scopeNodeIds.length).sort()).toEqual([1, 4]); expect(joined.scopeAttempts).toHaveLength(5);
        expect(joined.providerEffects).toHaveLength(5); expect(joined.joinReceipt.acceptedResultRefs).toHaveLength(2);
        expect(proof.published.plannerCompletions).toHaveLength(1); expect(proof.closure.effectIds).toHaveLength(7);
        expect(new Set(proof.closure.effectIds).size).toBe(7);
        const planned = proof.published.plannerCompletions[0]; expect(planned.producer.resultRefs).toEqual([]); expect(planned.patch.appliedOperations).toEqual(f.topology.operations);
        expect(joined.scopeAttempts.find(item => item.attempt.attemptId === planned.producer.attemptId).results).toEqual([]);
        const siblingResult = proof.published.graphResults.find(item => item.producer.nodeId === sibling.nodeId);
        expect(siblingResult.producer.graphRevision).toBe(0); expect(siblingResult.receipt.graphRevision).toBe(1);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const graphSnapshot = await readGraphResultPublicationSnapshot(tx, f.h.handle, root, siblingResult.producer,
                siblingResult.receipt.graphRevision, siblingResult.receipt.decisionSeq);
            const plan = await readPlanRevision(tx, f.h.handle, root.planRef);
            const receipt = siblingResult.receipt;
            const args = { root, producer: siblingResult.producer, graphSnapshot, dependencyPins: plan.dependencyPins,
                proof: { runId: root.runId, receiptRef: receipt.modelReceiptRef, producerAttemptId: siblingResult.producer.attemptId,
                    epoch: siblingResult.producer.epoch, outputType: 'text', payloadHash: receipt.modelPayloadHash,
                    sourceBinding: root.sourceBinding, effectId: receipt.modelEffectId },
                text: siblingResult.record.payload, now: receipt.createdAt };
            expect(graphNodeResult(args)).toEqual(siblingResult.record);
            expect(() => graphNodeResult({ ...args, graphSnapshot: structuredClone(graphSnapshot) })).toThrow('Invalid Graph Result facts');
            graphSnapshot.graph.nodes.push({ ...graphSnapshot.graph.nodes.find(node => node.nodeId === sibling.nodeId), nodeId: 'caller_added_recipient' });
            graphSnapshot.graph.edges.push({ from: { nodeId: sibling.nodeId }, to: { nodeId: 'caller_added_recipient' } });
            expect(() => graphNodeResult(args)).toThrow('Invalid Graph Result facts');
        });
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(6); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state); expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, root.runId);
        expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold))).receipt).toEqual(proof.receipt);
        await f.authority.engine.withTransaction(f.h.handle, async tx => {
            const receiptId = 'oreceipt_' + hash({ kind: 'fanout_reservation', runId: cold.runId,
                producerAttemptId: reserved.reservationRef.producerAttemptId, nodeId: preferred.nodeId }).slice(0, 32);
            const key = controlRecordKey(f.h.handle, cold.runId, 'receipt', receiptId), row = await tx.getResource(key);
            expect(row.doc.graphRevision).toBe(0);
            const changed = { ...row.doc, graphRevision: 1 };
            try {
                await tx.putResource(key, { ...row, doc: changed, integrity: hash(changed) });
                await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow();
            } finally { await tx.putResource(key, row); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(proof.receipt);
            const publicationKey = controlRecordKey(f.h.handle, cold.runId, 'receipt', siblingResult.receipt.receiptId);
            const publication = await tx.getResource(publicationKey), changedPublication = { ...publication.doc, graphRevision: 0 };
            try {
                await tx.putResource(publicationKey, { ...publication, doc: changedPublication, integrity: hash(changedPublication) });
                await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow();
            } finally { await tx.putResource(publicationKey, publication); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(proof.receipt);
        });
        expect(f.requests).toHaveLength(6);
    } finally { releaseSiblingStart(); releaseSibling(); await f.cleanup(); }
}, 180000);

test.each(CONTRACT_HARNESSES)('$name Game paid scope Planner cannot reprioritize a queued member of another frozen branch', async ({ make }) => {
    const f = await sessionFanoutPlannerFixture(make, { crossBranchPriority: true, maxConcurrency: 1 });
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        expect(sessionScopeTask(f.requests[0]).nodeId).toBe(f.topology.planner.nodeId);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('blocked'); expect(root.graphRevision).toBe(0); expect(root.progress.patches).toBe(0); expect(root.outputClaims).toEqual([]);
        expect(root.pendingEffectRefs).toEqual([]);
        const facts = await f.h.engine.withTransaction(f.h.handle, async tx => {
            const attempts = (await Promise.all(root.attemptRefs.map(id => readAttempt(tx, f.h.handle, root, id)))).map(item => item.doc);
            const producer = attempts.find(item => item.nodeId === f.topology.planner.nodeId);
            const patchId = 'opatch_' + hash({ runId: root.runId, attemptId: producer.attemptId }).slice(0, 32);
            const failureId = 'oreceipt_' + hash({ kind: 'native_session_failure', runId: root.runId, attemptId: producer.attemptId }).slice(0, 32);
            return { attempts, producer, patch: (await tx.getResource(controlRecordKey(f.h.handle, root.runId, 'patch', patchId))).doc,
                failure: (await tx.getResource(controlRecordKey(f.h.handle, root.runId, 'receipt', failureId))).doc,
                intent: (await readEffect(tx, f.h.handle, root, producer.effectRefs[0])).doc,
                costs: await f.authority.execution.budgetPort.observeEffectClosure(f.h.handle, { authorityRef: root.budgetAuthorityRef, effectIds: producer.effectRefs }, { tx }),
                completion: await readSessionPlannerCompletion(tx, f.h.handle, root, producer.attemptId) };
        });
        expect(facts.patch.accepted).toBe(false); expect(facts.patch.issues.map(issue => issue.code)).toEqual(['native_orchestration_patch_denied']);
        expect(facts.patch.appliedOperations).toEqual([]); expect(facts.completion).toBeNull(); expect(facts.producer.resultRefs).toEqual([]);
        expect(facts.intent.status).toBe('confirmed'); expect(facts.failure.receiptKind).toBe('native_session_failure');
        expect(facts.failure.status).toBe('blocked'); expect(facts.failure.effectIds).toEqual(facts.producer.effectRefs);
        expect(facts.failure.costs).toEqual(facts.costs); expect(facts.failure.costs.closed).toBe(true);
        const deniedSibling = facts.attempts.find(item => item.nodeId === f.topology.sibling.nodeId);
        expect(deniedSibling.effectRefs).toEqual([]); expect(deniedSibling.resultRefs).toEqual([]); expect(root.nodeControl[f.topology.sibling.nodeId].priority).toBe(0);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe('settled');
        expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).timeline).toEqual(f.base.timeline);
        const count = f.requests.length; await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(count);
    } finally { await f.cleanup(); }
}, 120000);
