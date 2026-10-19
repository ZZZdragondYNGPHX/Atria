import { jest } from '@jest/globals';
import { contextRetrievalFixture } from './helpers/context-retrieval-fixture.js';
import { configurePlanner, configurePlannerLoop, configurePlannerGraph } from './helpers/rp-planner-fixture.js';
import { configureControlRetrieval } from './helpers/rp-control-retrieval-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { readRpPlannerCompletion } from '../../src/native/orchestration/rp-planner-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { createNativeId } from '../../src/native/identity.js';
import { ModelPort } from '../../src/native/orchestration/model-port.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';

const finalize = JSON.stringify({ operations: [{ op: 'requestFinalize' }] });
const replan = JSON.stringify({ operations: [{ op: 'requestReplan' }] });
const setup = (make, { shape = 'plain', ...options } = {}) => contextRetrievalFixture(make, { embedding: true, ...options,
    responsePayload: (_body, ordinal) => (shape === 'loop' ? [replan, finalize, 'Final narration.']
        : shape === 'graph-loop' ? [replan, finalize, 'DRAFT_A', 'DRAFT_B', 'Final narration.']
            : shape === 'graph' ? [finalize, 'DRAFT_A', 'DRAFT_B', 'Final narration.'] : [finalize, 'Final narration.'])[ordinal - 1],
    afterPlan: async (plan, args) => {
        await ({ plain: configurePlanner, loop: configurePlannerLoop, graph: configurePlannerGraph, 'graph-loop': (plan, args) => configurePlannerGraph(plan, args, { loop: true }) })[shape](plan, args);
        await configureControlRetrieval(plan, args); plan.definition.limits.maxSteps = 160;
    } });
const rootOf = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))[0].doc);
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;

describe.each(CONTRACT_HARNESSES)('$name original RP Planner retrieval', ({ make }) => {
    test.each([['plain', 2, 1], ['loop', 3, 2], ['graph', 4, 1], ['graph-loop', 5, 2]])('%s uses each original Model revision and closes every accepted Planner and retrieval fee', async (shape, models, revisions) => {
        const f = await setup(make, { shape }); let cold;
        try {
            const result = await f.run({ floor: 2 }), root = await rootOf(f), bank = await bankOf(f);
            expect(result.output.runStatus).toBe('completed'); expect(root.graphRevision).toBe(revisions);
            expect(f.requests).toHaveLength(models); expect(f.calls).toHaveLength(models + 1);
            expect(JSON.stringify(f.calls)).not.toContain('FUTURE FORBIDDEN MEMORY');
            expect(bank.attempts).toHaveLength(models * 2 + 1); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            const { output, planner } = await f.h.engine.withTransaction(f.h.handle, async tx => ({
                output: await readRpOutput(tx, f.h.handle, root), planner: await readRpPlannerCompletion(tx, f.h.handle, root) }));
            expect(planner.history).toHaveLength(revisions); expect(planner.history.map(item => item.producer.graphRevision)).toEqual(Array.from({ length: revisions }, (_, index) => index));
            expect(planner.history.map(item => item.retrievalCompletions.length)).toEqual(revisions === 1 ? [2] : [2, 1]);
            expect(output.published.retrievalCompletions).toHaveLength(models + 1); expect(output.closure.effectIds).toHaveLength(models * 2 + 2);
            await f.chats.delete(f.h.handle, 'Actor', 'main'); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            const child = planner.history[0].retrievalCompletions[0];
            await cold.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'effect', child.effectId), row = await tx.getResource(key), doc = structuredClone(row.doc);
                doc.inputRef.contextForEffectId = createNativeId('orchestrationEffect'); doc.inputHash = hash(doc.inputRef);
                await putMutable(tx, key, doc, { expectedIntegrity: row.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpPlannerCompletion(tx, f.h.handle, root))).rejects.toThrow();
            expect(f.requests).toHaveLength(models); expect(f.calls).toHaveLength(models + 1);
        } finally { await cold?.close(); await f.cleanup(); }
    }, 180000);

    test('optional Rerank remains independently metered on both sides of the original Patch', async () => {
        const f = await setup(make, { reranking: true });
        try {
            const result = await f.run({ floor: 2 }), root = await rootOf(f), bank = await bankOf(f);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(2);
            expect(f.calls.filter(item => item.endpoint === '/v1/embeddings')).toHaveLength(3);
            expect(f.calls.filter(item => item.endpoint === '/v1/rerank')).toHaveLength(2); expect(bank.attempts).toHaveLength(7);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.retrievalCompletions).toHaveLength(5); expect(output.closure.effectIds).toHaveLength(8);
        } finally { await f.cleanup(); }
    }, 120000);

    test('unknown second Planner retrieval retains first accepted Patch and all fees without resend or Narrator', async () => {
        const f = await setup(make, { shape: 'loop', providerUsage: (_body, ordinal) => ordinal === 3 ? null : { total_tokens: 7 } });
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow(); const root = await rootOf(f), bank = await bankOf(f);
            expect(root.graphRevision).toBe(1); expect(root.outputClaims).toEqual([]); expect(f.requests).toHaveLength(1); expect(f.calls).toHaveLength(3);
            expect(bank.attempts).toHaveLength(4); expect(bank.attempts.at(-1).status).toBe('unknown');
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(await bankOf(f)).toEqual(bank); expect(f.calls).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 120000);

    // Each revision has one Planner proof inspection; withdrawal there denies the Narrator.
    test.each([[0, 1], [1, 1]])('Memory withdrawal at Planner proof revision=%s ordinal=%s preserves independent facts without authorizing Narrator', async (revision, proofOrdinal) => {
        const f = await setup(make), original = ModelPort.prototype.inspectResultCompletion; let changed = false, seen = 0;
        const spy = jest.spyOn(ModelPort.prototype, 'inspectResultCompletion').mockImplementation(async function (handle, request) {
            const proof = await original.call(this, handle, request);
            if (!changed && f.requests.length === 1 && f.h.engine.hasActiveTransaction(handle) && (await rootOf(f)).graphRevision === revision && ++seen === proofOrdinal) {
                changed = true; const repo = new SettingsRepo({ engine: f.h.engine }), settings = await repo.get(handle);
                settings.atri_capabilities.memory_graph.recallEnabled = false; await repo.save(handle, settings);
            }
            return proof;
        });
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(changed).toBe(true); expect(f.requests).toHaveLength(1); expect(f.calls).toHaveLength(2);
            expect((await new SettingsRepo({ engine: f.h.engine }).get(f.h.handle)).atri_capabilities.memory_graph.recallEnabled).toBe(false);
            const root = await rootOf(f); expect(root.graphRevision).toBe(revision); expect(root.outputClaims).toEqual([]);
        } finally { spy.mockRestore(); await f.cleanup(); }
    }, 120000);
});
