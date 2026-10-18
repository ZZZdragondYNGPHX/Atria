import { expect, test } from '@jest/globals';
import { sessionDelegatedPlannerFixture } from './helpers/session-delegated-planner-fixture.js';
import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';
import { readTaskLocalOutput } from '../../src/native/orchestration/task-local-output-contracts.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { checkedRecord } from '../../src/native/orchestration/plan-repository.js';
import { handoffReturnReceiptId } from '../../src/native/orchestration/handoff-return-contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

const rootsOf = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle })).map(row => row.doc));
const bankOf = async (f, root) => (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;

test('SQLite Game child published Planner self-return reaches original pure Agent TaskLocalOutput and sole parent narration', async () => {
    const f = await sessionDelegatedPlannerFixture(makeTempSqliteEngineHarness);
    try {
        const result = await f.start(), roots = await rootsOf(f), child = roots.find(root => root.parentRef), parent = roots.find(root => !root.parentRef);
        expect(parent.status).toBe('completed'); expect(parent.outputClaims).toHaveLength(1); expect(child.status).toBe('completed');
        expect(f.requests).toHaveLength(5); expect(f.requests.map(body => body.model)).toEqual([f.plannerModelId, f.plannerModelId,
            'session-delegated-distinct-model', f.seeded.model.remoteModelId, f.seeded.model.remoteModelId]);
        expect(JSON.stringify(f.requests[2].input)).toContain('requestFinalize'); expect(JSON.stringify(f.requests[3].input)).toContain('CHILD_CONTROL_TERMINAL_ADVICE');
        expect(JSON.stringify(f.requests[4].input)).toContain('PARENT_ACCEPTED_CHILD_CONTROL');
        for (const body of f.requests.slice(0, 4)) { expect(JSON.stringify(body.input)).toContain('阿岚听说'); expect(JSON.stringify(body.input)).not.toContain('沈墨怀疑'); }
        expect(child.graphRevision).toBe(2); expect(child.progress).toMatchObject({ attempts: 4, patches: 2, replans: 1, loopIterations: 1 });
        expect(child.progress.edgeVisitCounts[f.loop.edgeId]).toBe(1); expect(child.resultRefs).toHaveLength(1); expect(child.outputClaims).toHaveLength(1);
        const local = await f.h.engine.withTransaction(f.h.handle, tx => readTaskLocalOutput(tx, f.h.handle, child));
        expect(local.publication.graphHistory.planners).toHaveLength(2); expect(local.publication.graphHistory.effects).toHaveLength(3); expect(local.publication.graphHistory.loopIterations).toBe(1);
        const bank = await bankOf(f, parent); expect(bank.attempts).toHaveLength(5); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(bank.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(3);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released' })]);
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state); expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        const original = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, parent));
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, parent.runId);
        expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold))).receipt).toEqual(original.receipt);
        await f.authority.engine.withTransaction(f.h.handle, async tx => {
            const second = local.publication.graphHistory.planners[1].producer, key = controlRecordKey(f.h.handle, child.runId, 'attempt', second.attemptId), stored = await tx.getResource(key);
            const inputRefs = [second.inputRefs[0], ...child.parentRef.inputRefs], changed = { ...stored.doc, inputRefs, inputDigest: hash(inputRefs) };
            try { await tx.putResource(key, { ...stored, doc: changed, integrity: hash(changed) }); await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow(); }
            finally { await tx.putResource(key, stored); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(original.receipt);
        });
        expect(f.requests).toHaveLength(5);
    } finally { await f.cleanup(); }
}, 180000);

test('Game child replan stays within its original held bank and records the exact budget rejection', async () => {
    const f = await sessionDelegatedPlannerFixture(makeTempSqliteEngineHarness, { childRequests: 2 });
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        const roots = await rootsOf(f), child = roots.find(root => root.parentRef), parent = roots.find(root => !root.parentRef);
        expect(child.status).toBe('blocked'); expect(parent.status).toBe('blocked'); expect(child.graphRevision).toBe(0); expect(child.outputClaims).toEqual([]); expect(parent.outputClaims).toEqual([]);
        const patches = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: child.runId, recordType: 'patch' }));
        expect(patches.map(row => row.doc)).toEqual([expect.objectContaining({ accepted: false, issues: [{ code: 'native_orchestration_graph_budget_unavailable' }] })]);
        const bank = await bankOf(f, parent); expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe('settled');
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released' })]);
    } finally { await f.cleanup(); }
}, 90000);

test('Game child graph.patch must be an explicitly published parent Node capability intersection', async () => {
    let report, before;
    await expect(sessionDelegatedPlannerFixture(makeTempSqliteEngineHarness, { parentGrant: false, onParent: async (plan, { plans, h, core, base }) => {
        const draft = await plans.create(h.handle, createNativeId('orchestrationCommand'), plan);
        report = await plans.validate(h.handle, { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash });
        before = { roots: await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: h.handle })),
            operations: (await core.runs.status(h.handle, base.session.sessionId))?.operations ?? {} };
    } })).rejects.toThrow('native_orchestration_validation_stale');
    expect(report.status).toBe('invalid'); expect(report.issues).toContainEqual(expect.objectContaining({ code: 'native_orchestration_child_authority_invalid', severity: 'blocking' }));
    expect(before).toEqual({ roots: [], operations: {} });
}, 60000);

test.each(['source', 'unknown'])('Game child Planner %s preserves real paid facts and never resumes or replays', async kind => {
    const f = await sessionDelegatedPlannerFixture(makeTempSqliteEngineHarness, { unknown: kind === 'unknown' });
    if (kind === 'source') f.onResponse(async () => { if (f.requests.length === 2) await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Withdraw child Planner original Source.' }); });
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(kind === 'unknown' ? 3 : 2);
        const roots = await rootsOf(f), child = roots.find(root => root.parentRef), parent = roots.find(root => !root.parentRef);
        expect(child.status).toBe(kind === 'unknown' ? 'reconciling' : 'blocked'); expect(parent.status).toBe(kind === 'unknown' ? 'reconciling' : 'blocked');
        expect(child.graphRevision).toBe(kind === 'unknown' ? 2 : 1); expect(child.progress.loopIterations).toBe(1);
        expect(child.outputClaims).toEqual([]); expect(parent.outputClaims).toEqual([]); expect(child.resultRefs).toEqual([]);
        const bank = await bankOf(f, parent); expect(bank.attempts.map(row => row.status)).toEqual(kind === 'unknown' ? ['settled', 'settled', 'unknown'] : ['settled', 'settled']);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: kind === 'unknown' ? 'held' : 'released' })]);
        expect(await f.h.engine.withTransaction(f.h.handle, tx => checkedRecord(tx, controlRecordKey(f.h.handle, parent.runId, 'receipt', handoffReturnReceiptId(child.runId))))).toBeNull();
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(kind === 'unknown' ? 3 : 2);
    } finally { await f.cleanup(); }
}, 120000);
