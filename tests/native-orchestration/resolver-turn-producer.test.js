import { jest } from '@jest/globals';
import { resolverTurnFixture } from './helpers/resolver-turn-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { checkedRecord } from '../../src/native/orchestration/plan-repository.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';

if (process.env.ATRIA_TEST_RESOLVER_TURN_SQL === '1') jest.setTimeout(60_000);

const operation = async f => (await f.core.runs.status(f.h.handle, f.base.session.sessionId))?.operations[hash({ lane: 'turn',
    anchor: { branchId: f.base.revision.branchId, revisionId: f.base.revision.revisionId } })] ?? null;
const durable = snapshot => ({ revision: snapshot.revision, states: snapshot.states, timeline: snapshot.timeline });

describe.each(CONTRACT_HARNESSES.filter(({ name }) => process.env.ATRIA_TEST_RESOLVER_TURN_SQL === '1' || ['FsEngine', 'SqliteEngine'].includes(name)))('$name original sealed intent resolver and narrator', ({ make }) => {
    test('two real HTTP responses share the original Turn quotas and Run while only the original finalizer commits World', async () => {
        const f = await resolverTurnFixture(make), commit = jest.spyOn(f.core._sessions, 'commitSnapshot');
        const before = { revision: f.base.revision, states: f.base.states, timeline: f.base.timeline };
        const atSend = [];
        try {
            f.onResponse(async () => {
                const current = await f.core.observe(f.h.handle, f.base.session.sessionId);
                atSend.push({ revision: current.revision, states: current.states, timeline: current.timeline });
            });
            const result = await f.start();
            expect(f.requests).toHaveLength(2); expect(atSend).toEqual([before, before]);
            expect(f.requests[0].tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'atri_transaction_0' })]));
            expect(f.requests[1].tools).toBeUndefined();
            expect(JSON.stringify(f.requests[0])).toContain('Update the note.');
            expect(JSON.stringify(f.requests[0])).not.toContain('validators');
            expect(JSON.stringify(f.requests[1])).toContain('updated');
            expect(result.states.atri_lifecycle.domains.notes.records[0].value.text).toBe('updated');
            expect(result.timeline.at(-1).content).toBe('Synthetic native narrator response.');
            expect(commit).toHaveBeenCalledTimes(1);
            const control = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            const op = control.operations[hash({ lane: 'turn', anchor: { branchId: f.base.revision.branchId, revisionId: f.base.revision.revisionId } })];
            expect(op).toMatchObject({ total: 2, attempts: { intent_resolver: 1, narrator: 1 } });
            expect(op.compute.attempts).toHaveLength(2);
            expect(op.compute.attempts.map(row => row.generationQuotaRef.role)).toEqual(['intent_resolver', 'narrator']);
            expect(op.compute.attempts.every(row => row.status === 'settled')).toBe(true);
            const service = f.authority.execution, root = await service.runs.get(f.h.handle, f.effectRef.runId);
            expect(root.attemptRefs).toHaveLength(2);
            expect(root.progress.edgeVisitCounts[f.resolverEdgeId]).toBe(1);
            const attempts = await service.runs.engine.withTransaction(f.h.handle, tx => Promise.all(root.attemptRefs.map(id => checkedRecord(tx, controlRecordKey(f.h.handle, root.runId, 'attempt', id)))));
            expect(attempts.find(item => item.doc.nodeId === f.resolverNodeId)?.doc.status).toBe('completed');
            expect(await f.observe()).toMatchObject({ outcome: 'confirmed' });
            expect((await f.start()).revision).toEqual(result.revision); expect(f.requests).toHaveLength(2);
            expect(commit).toHaveBeenCalledTimes(1);
        } finally { commit.mockRestore(); await f.cleanup(); }
    });

    test.each(['resolver', 'narrator'])('a smaller %s route cap tightens the single original Turn bank instead of granting two independent allowances', async smaller => {
        const f = await resolverTurnFixture(make, {
            changeRoute: route => ({ ...route, executionPolicy: { ...route.executionPolicy,
                computeBudget: { ...route.executionPolicy.computeBudget, maxRequests: smaller === 'narrator' ? 1 : 4 } } }),
            configurePlan: async ({ seeded, h, plan, resolverRoute }) => {
                await seeded.persistence.saveRuntimeRoute(h.handle, { ...resolverRoute, executionPolicy: { ...resolverRoute.executionPolicy,
                    computeBudget: { ...resolverRoute.executionPolicy.computeBudget, maxRequests: smaller === 'resolver' ? 1 : 4 } } });
                plan.dependencyPins.find(pin => pin.pinId === 'resolver.route').integrity = hash(await seeded.persistence.getRuntimeRoute(h.handle, resolverRoute.runtimeRouteId));
            },
        });
        try {
            await expect(f.start()).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
            expect(f.requests).toHaveLength(1);
            const original = await operation(f);
            expect(original).toMatchObject({ total: 1, attempts: { intent_resolver: 1 }, compute: { limits: { maxRequests: 1 } } });
            expect(original.compute.attempts).toHaveLength(1);
            expect(original.compute.attempts[0]).toMatchObject({ status: 'settled', generationQuotaRef: { role: 'intent_resolver' } });
            expect(durable(await f.core.observe(f.h.handle, f.base.session.sessionId))).toEqual(durable(f.base));
            const effects = await f.authority.execution.runs.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: 'atri_orchestration_run', handle: f.h.handle }));
            expect(effects).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each(['unknown_tool', 'wrong_input', 'multiple_calls', 'malformed_json'])('resolver %s cannot become a Native transaction or send Narrator', async fault => {
        const f = await resolverTurnFixture(make, { responseBody: ({ selection }) => {
            const call = { id: 'invalid-resolver-function', type: 'function_call', status: 'completed', call_id: 'invalid-resolver-call',
                name: fault === 'unknown_tool' ? 'unregistered_transaction' : 'atri_transaction_0',
                arguments: fault === 'malformed_json' ? '[' : JSON.stringify(fault === 'wrong_input' ? { ...selection.input, amount: 100000 } : selection.input) };
            return { id: 'invalid-resolver-response', status: 'completed', output: fault === 'multiple_calls' ? [call, { ...call, id: 'second-function', call_id: 'second-call' }] : [call],
                usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } };
        } });
        try {
            await expect(f.start()).rejects.toThrow();
            expect(f.requests).toHaveLength(1);
            const original = await operation(f);
            expect(original.total).toBe(1); expect(original.attempts).toEqual({ intent_resolver: 1 });
            expect(original.compute.attempts).toHaveLength(1);
            expect(durable(await f.core.observe(f.h.handle, f.base.session.sessionId))).toEqual(durable(f.base));
            // The original service rejects undeclared calls and malformed
            // JSON before returning a validated response to ModelPort.
            const expectedOutcome = ['unknown_tool', 'malformed_json'].includes(fault) ? 'unknown' : 'confirmed';
            expect((await f.observe()).outcome).toBe(expectedOutcome);
            const requests = f.requests.length; await f.cold();
            expect((await f.observe()).outcome).toBe(expectedOutcome);
            expect(f.requests).toHaveLength(requests);
        } finally { await f.cleanup(); }
    });

    test('a JSON copy of the original resolver quota proof refuses before HTTP or an original charge', async () => {
        const f = await resolverTurnFixture(make), original = f.authority.executeResolver.bind(f.authority);
        try {
            f.authority.executeResolver = args => original({ ...args, quotaProof: structuredClone(args.quotaProof) });
            await expect(f.start()).rejects.toMatchObject({ code: 'native_generation_budget_lane_denied' });
            expect(f.requests).toHaveLength(0);
            const op = await operation(f);
            // Native first records the user's immutable source fingerprint;
            // that identity is neither a model admission nor a quota charge.
            expect(op).toMatchObject({ total: 0, attempts: {} }); expect(op.compute).toBeUndefined();
            expect(durable(await f.core.observe(f.h.handle, f.base.session.sessionId))).toEqual(durable(f.base));
        } finally { await f.cleanup(); }
    });

    test('a new invocation reuses the original retained selection without another resolver send or charge', async () => {
        const f = await resolverTurnFixture(make), original = f.authority.executeNarrator.bind(f.authority);
        const interruption = new Error('Synthetic interruption after the original resolver, before Narrator preparation');
        try {
            f.authority.executeNarrator = async () => { throw interruption; };
            await expect(f.start()).rejects.toBe(interruption);
            expect(f.requests).toHaveLength(1); expect(f.requests[0].tools?.length).toBeGreaterThan(0);
            expect(await operation(f)).toMatchObject({ total: 1, attempts: { intent_resolver: 1 } });
            expect(durable(await f.core.observe(f.h.handle, f.base.session.sessionId))).toEqual(durable(f.base));
            const originalReceipt = await f.observe(); expect(originalReceipt.outcome).toBe('confirmed');
            f.authority.executeNarrator = original; f.input.invocationId += ':resume';
            const result = await f.start();
            expect(f.requests).toHaveLength(2); expect(f.requests[1].tools).toBeUndefined();
            expect(result.timeline.at(-1).content).toBe('Synthetic native narrator response.');
            expect(await operation(f)).toMatchObject({ total: 2, attempts: { intent_resolver: 1, narrator: 1 } });
            const service = f.authority.execution, root = await service.runs.get(f.h.handle, f.effectRef.runId);
            const records = await service.runs.engine.withTransaction(f.h.handle, tx => Promise.all(root.attemptRefs.map(id => checkedRecord(tx, controlRecordKey(f.h.handle, root.runId, 'attempt', id)))));
            const reused = records.find(record => record.doc.nodeId === f.resolverNodeId)?.doc;
            expect(reused).toMatchObject({ status: 'completed', reasonCode: 'original_selection_reused', effectRefs: [], resultRefs: [] });
            expect(root.progress.edgeVisitCounts[f.resolverEdgeId]).toBe(1);
        } finally { await f.cleanup(); }
    });
});
