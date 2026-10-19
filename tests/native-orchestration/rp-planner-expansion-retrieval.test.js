import { contextRetrievalFixture } from './helpers/context-retrieval-fixture.js';
import { configurePlannerExpansion, plannerTaskFromRequest } from './helpers/rp-planner-fixture.js';
import { configureControlRetrieval } from './helpers/rp-control-retrieval-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { readRpPlannerCompletion } from '../../src/native/orchestration/rp-planner-contracts.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';

const setup = (make, { chosen = true, loop = false, mutate = null, ...options } = {}) => contextRetrievalFixture(make, { embedding: true, ...options,
    afterPlan: async (plan, args) => {
        await configurePlannerExpansion(plan, args, { loop }); await configureControlRetrieval(plan, args); plan.definition.limits.maxSteps = 160;
    }, responsePayload: (body, ordinal) => {
        if (loop && ordinal === 1) return JSON.stringify({ operations: [{ op: 'requestReplan' }] });
        if (ordinal !== (loop ? 2 : 1)) return chosen && ordinal === (loop ? 3 : 2) ? 'DYNAMIC_ADVISORY_PRIVATE' : 'Final narration.';
        const template = structuredClone(plannerTaskFromRequest(body).nodeTemplates[0]); mutate?.(template);
        return JSON.stringify({ operations: [...chosen ? [{ op: 'addNode', node: template.node }, ...template.edges.map(edge => ({ op: 'addEdge', edge }))] : [], { op: 'requestFinalize' }] });
    } });
const rootOf = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))[0].doc);
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;

describe.each(CONTRACT_HARNESSES)('$name original RP expansion retrieval', ({ make }) => {
    test.each([false, true])('Host template chosen=%s retains exact owned retrieval pins and sparse original fees', async chosen => {
        const f = await setup(make, { chosen }); let cold;
        try {
            const result = await f.run({ floor: 2 }), root = await rootOf(f), bank = await bankOf(f), models = chosen ? 3 : 2;
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(models); expect(f.calls).toHaveLength(models + 1);
            expect(bank.attempts).toHaveLength(models * 2 + 1); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(JSON.stringify(f.calls)).not.toContain('FUTURE FORBIDDEN MEMORY');
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.retrievalCompletions).toHaveLength(models + 1); expect(output.closure.effectIds).toHaveLength(models * 2 + 2);
            expect(JSON.stringify(f.requests.at(-1)).includes('DYNAMIC_ADVISORY_PRIVATE')).toBe(chosen);
            const template = plannerTaskFromRequest(f.requests[0]).nodeTemplates[0];
            expect(template.node.capabilities).toEqual(['generation.send', 'memory.retrieve']);
            expect(template.node.dependencyPinIds).toEqual(['rp.route', 'memory.embed']);
            expect(root.graph.nodes.some(node => node.nodeId === template.node.nodeId)).toBe(chosen);
            await f.chats.delete(f.h.handle, 'Actor', 'main'); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            const planner = await cold.withTransaction(f.h.handle, tx => readRpPlannerCompletion(tx, f.h.handle, root));
            const intentKey = controlRecordKey(f.h.handle, root.runId, 'effect', planner.modelEffectId);
            await cold.withTransaction(f.h.handle, async tx => {
                const row = await tx.getResource(intentKey), doc = structuredClone(row.doc);
                doc.inputRef.graphTemplates[0].node.dependencyPinIds = ['rp.route']; doc.inputHash = hash(doc.inputRef);
                await putMutable(tx, intentKey, doc, { expectedIntegrity: row.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow();
            expect(f.calls).toHaveLength(models + 1);
        } finally { await cold?.close(); await f.cleanup(); }
    }, 180000);

    test('replan then dynamic Draft compiles against its original accepted revision and all rounds close fees', async () => {
        const f = await setup(make, { loop: true });
        try {
            const result = await f.run({ floor: 2 }), root = await rootOf(f);
            expect(result.output.runStatus).toBe('completed'); expect(root.graphRevision).toBe(2); expect(f.requests).toHaveLength(4); expect(f.calls).toHaveLength(5);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.graphResults[0].producer.graphRevision).toBe(2); expect(output.published.retrievalCompletions).toHaveLength(5);
            expect(output.closure.effectIds).toHaveLength(10);
        } finally { await f.cleanup(); }
    }, 180000);

    test('dynamic Draft owns both exact retrieval Profiles and all optional Rerank fees close with its Result', async () => {
        const f = await setup(make, { reranking: true });
        try {
            const result = await f.run({ floor: 2 }), root = await rootOf(f), bank = await bankOf(f);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(3);
            expect(f.calls.filter(row => row.endpoint === '/v1/embeddings')).toHaveLength(4);
            expect(f.calls.filter(row => row.endpoint === '/v1/rerank')).toHaveLength(3); expect(bank.attempts).toHaveLength(10);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.graphResults[0].retrievalCompletions).toHaveLength(2);
            expect(output.published.retrievalCompletions).toHaveLength(7); expect(output.closure.effectIds).toHaveLength(11);
            expect(plannerTaskFromRequest(f.requests[0]).nodeTemplates[0].node.dependencyPinIds).toEqual(['rp.route', 'memory.embed', 'memory.rerank']);
        } finally { await f.cleanup(); }
    }, 180000);

    test.each(['remove-context-pin', 'remove-memory-capability'])('%s in Model JSON cannot redefine the Host template or authorize a partial graph', async problem => {
        const f = await setup(make, { mutate: template => {
            if (problem === 'remove-context-pin') template.node.dependencyPinIds = ['rp.route'];
            else template.node.capabilities = ['generation.send'];
        } });
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow('native_orchestration_planner_patch_rejected');
            expect(f.requests).toHaveLength(1); expect(f.calls).toHaveLength(2);
            const root = await rootOf(f), bank = await bankOf(f); expect(root.graphRevision).toBe(0); expect(root.graph.nodes).toHaveLength(3);
            expect(root.outputClaims).toEqual([]); expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        } finally { await f.cleanup(); }
    }, 120000);

    test('unknown dynamic Draft retrieval retains the accepted original graph and earlier fees without resend', async () => {
        const f = await setup(make, { providerUsage: (_body, ordinal) => ordinal === 3 ? null : { total_tokens: 7 } });
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow(); const root = await rootOf(f), bank = await bankOf(f);
            expect(root.graphRevision).toBe(1); expect(root.graph.nodes).toHaveLength(4); expect(root.outputClaims).toEqual([]);
            expect(f.requests).toHaveLength(1); expect(f.calls).toHaveLength(3); expect(bank.attempts).toHaveLength(4); expect(bank.attempts.at(-1).status).toBe('unknown');
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(await bankOf(f)).toEqual(bank); expect(f.calls).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 120000);
});
