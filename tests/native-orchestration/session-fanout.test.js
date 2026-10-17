import { readAttempt } from '../../src/native/orchestration/controller-common.js';
import { expect, test } from '@jest/globals';
import { sessionFanoutFixture } from './helpers/session-fanout-fixture.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness, CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';

// Real original Host/Controller/Source/permits/bank/domain writer; HTTP replies
// are synthetic and make no semantic model-quality claim.
const engines = [['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness], ...CONTRACT_HARNESSES.filter(item => ['MysqlEngine', 'PgEngine'].includes(item.name)).map(item => [item.name, item.make])];

test.each(engines)('%s Game published Fanout/Join drives real concurrent Actor workers and one original Narrator', async (_name, make) => {
    const f = await sessionFanoutFixture(make); let release, started = 0;
    const simultaneous = new Promise(resolve => { release = resolve; });
    f.onResponse(async () => { if (f.requests.length > 2) return; started++; if (started === 2) release(); await simultaneous; });
    try {
        const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(started).toBe(2); expect(f.requests).toHaveLength(3); expect(root.status).toBe('completed'); expect(root.outputClaims).toHaveLength(1);
        expect(JSON.stringify(f.requests[0])).not.toContain('GAME_ADVICE_'); expect(JSON.stringify(f.requests[1])).not.toContain('GAME_ADVICE_');
        const actors = f.requests.slice(0, 2).map(JSON.stringify);
        const alan = actors.find(body => body.includes('Game branch 0:0')), shen = actors.find(body => body.includes('Game branch 0:1'));
        expect(alan).toContain('阿岚听说'); expect(alan).not.toContain('沈墨怀疑');
        expect(shen).toContain('沈墨怀疑'); expect(shen).not.toContain('阿岚听说');
        expect(JSON.stringify(f.requests[2])).toContain('reference-only');
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state); expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
        expect(proof.published.fanoutCompletions).toHaveLength(1); expect(proof.published.fanoutCompletions[0].joinReceipt.acceptedResultRefs).toHaveLength(2);
        expect(proof.closure.effectIds).toHaveLength(4);
        const operation = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId];
        expect(operation.compute.attempts).toHaveLength(3); expect(operation.compute.attempts.every(item => item.status === 'settled')).toBe(true);
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, root.runId);
        expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold))).receipt).toEqual(proof.receipt);
        expect(f.requests).toHaveLength(3);
    } finally { release(); await f.cleanup(); }
}, 120000);

test('Game multiple published Fanout groups compose with a later Agent DAG and structured Review', async () => {
    const f = await sessionFanoutFixture(makeTempFsEngineHarness, { groups: 2, review: true });
    try {
        const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('completed'); expect(f.requests).toHaveLength(8); expect(root.progress.reviews).toBe(1); expect(root.outputClaims).toHaveLength(1);
        const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
        expect(proof.published.fanoutCompletions).toHaveLength(2); expect(proof.published.reviewCompletions).toHaveLength(1);
        expect(JSON.stringify(f.requests[4])).toContain('GAME_ADVICE_'); expect(JSON.stringify(f.requests[5])).toContain('GAME_SYNTHESIS');
        expect(JSON.stringify(f.requests[6])).toContain('GAME_REVIEW_DRAFT'); expect(JSON.stringify(f.requests[7])).toContain('GAME_REVIEW_DRAFT');
        expect(proof.closure.effectIds).toHaveLength(9); expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
    } finally { await f.cleanup(); }
}, 180000);


test.each(engines)('%s Game concurrent child permits share the original Turn bank and cannot fund an extra Narrator send', async (_name, make) => {
    const f = await sessionFanoutFixture(make, { maxRequests: 2 });
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(2);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.outputClaims).toEqual([]);
        const operation = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId];
        expect(operation.compute.attempts).toHaveLength(2); expect(operation.compute.attempts.every(item => item.status === 'settled')).toBe(true);
        const current = await f.core.observe(f.h.handle, f.base.session.sessionId);
        expect(current.timeline).toEqual(f.base.timeline); expect(current.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
    } finally { await f.cleanup(); }
}, 120000);

test.each(engines)('%s Game real concurrent Fanout stops consuming when the captured original Source advances', async (_name, make) => {
    const f = await sessionFanoutFixture(make); let withdrawn = false;
    f.onResponse(async () => { if (withdrawn) return; withdrawn = true;
        await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Human withdrawal while the real group is running.' }); });
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests.length).toBeGreaterThanOrEqual(1); expect(f.requests.length).toBeLessThanOrEqual(2);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId); expect(root.outputClaims).toEqual([]);
        const operation = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId];
        expect(operation.compute.attempts).toHaveLength(f.requests.length); expect(operation.compute.attempts.every(item => item.status === 'settled')).toBe(true);
        const current = await f.core.observe(f.h.handle, f.base.session.sessionId);
        expect(current.timeline.at(-1).content).toBe('Human withdrawal while the real group is running.');
        expect(current.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        const count = f.requests.length; await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(count);
    } finally { await f.cleanup(); }
}, 120000);


test.each(engines)('%s Game original count-quorum Join cancels an unsent sibling and accepts only its selected Result', async (_name, make) => {
    const f = await sessionFanoutFixture(make, { strategy: 'count-quorum', maxConcurrency: 1 });
    try {
        await f.start(); const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(f.requests).toHaveLength(2); expect(root.status).toBe('completed'); expect(root.outputClaims).toHaveLength(1);
        const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
        const joined = proof.published.fanoutCompletions[0];
        expect(joined.joinReceipt.policy).toBe('count-quorum'); expect(joined.joinReceipt.acceptedResultRefs).toHaveLength(1);
        expect(joined.allMembers.map(item => item.attempt.status).sort()).toEqual(['cancelled', 'completed']);
        expect(joined.allMembers.find(item => item.attempt.status === 'cancelled').attempt.effectRefs).toEqual([]);
        expect(proof.closure.effectIds).toHaveLength(3);
        const operation = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId];
        expect(operation.compute.attempts).toHaveLength(2); expect(operation.compute.attempts.every(item => item.status === 'settled')).toBe(true);
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, root.runId);
        expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold))).receipt).toEqual(proof.receipt);
        expect(f.requests).toHaveLength(2);
    } finally { await f.cleanup(); }
}, 120000);

test('Game original fail-fast frame cancels the unsent sibling after a known paid rejection and publishes no narration', async () => {
    const f = await sessionFanoutFixture(makeTempFsEngineHarness, { failurePolicy: 'fail_fast', rejectFirst: true, maxConcurrency: 1 });
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId); expect(root.outputClaims).toEqual([]); expect(root.status).toBe('failed');
        const members = await f.h.engine.withTransaction(f.h.handle, async tx => {
            const rows = []; for (const id of root.attemptRefs) rows.push((await readAttempt(tx, f.h.handle, root, id)).doc); return rows;
        });
        expect(members.filter(item => item.status === 'cancelled')).toHaveLength(1);
        expect(members.filter(item => item.status === 'failed')).toHaveLength(3);
        const operation = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId];
        expect(operation.compute.attempts).toHaveLength(1); expect(operation.compute.attempts[0].status).toBe('settled');
        expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).timeline).toEqual(f.base.timeline);
    } finally { await f.cleanup(); }
}, 120000);
