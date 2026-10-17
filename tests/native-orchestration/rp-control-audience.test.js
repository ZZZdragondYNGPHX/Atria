import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { configurePlannerGraph } from './helpers/rp-planner-fixture.js';
import { configureJudge } from './helpers/rp-judge-fixture.js';
import { seedControlActorAudiences } from './helpers/rp-control-audience-fixture.js';
import { readRpPlannerCompletion } from '../../src/native/orchestration/rp-planner-contracts.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';

jest.setTimeout(120000);
const currentRoot = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))[0].doc);
const bank = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
const requestText = request => request.messages.flatMap(message => typeof message.content === 'string'
    ? [message.content] : message.content.map(part => part.text ?? '')).join('\n');
const task = (node, audience) => '"task":' + JSON.stringify({ nodeId: node.nodeId, label: node.label, audience });

describe.each(CONTRACT_HARNESSES)('$name real RP independent Actor control consumers', ({ make }) => {
    test('a scoped Planner applies the original GraphPatch before separate Actor drafts and one authorized Narrator output', async () => {
        let source, nodes;
        const f = await rpModelFixture(make, { memorySettings: { enabled: true, recallEnabled: true },
            configurePlan: async (plan, env) => {
                nodes = await configurePlannerGraph(plan, env);
                source = await seedControlActorAudiences(plan, env);
            }, responsePayload: (_body, ordinal) => [JSON.stringify({ operations: [{ op: 'requestFinalize' }] }),
                'RESULT_A_PRIVATE', 'RESULT_B_PRIVATE', 'Final scoped planned prose'][ordinal - 1] });
        try {
            const result = await f.run(), root = await currentRoot(f);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(4);
            for (const [index, node] of [nodes.planner, ...nodes.drafts, nodes.narrator].entries()) {
                expect(requestText(f.requests[index])).toContain(task(node, index === 3 ? { kind: 'narrator' }
                    : { kind: 'actor', id: index === 2 ? source.actorB : source.actorA }));
            }
            const [planner, a, b, narrator] = f.requests.map(request => JSON.stringify(request));
            for (const input of [planner, a]) {
                expect(input).toContain('A PRIVATE RUMOR'); expect(input).not.toContain('B PRIVATE RUMOR');
                expect(input).not.toContain('NARRATOR ONLY MEMORY'); expect(input).not.toContain('Original RP context');
                expect(input).toContain('Original RP input');
            }
            expect(planner).toContain('native_rp_graph_planner'); expect(planner).toContain('requestFinalize');
            expect(b).toContain('B PRIVATE RUMOR'); expect(b).not.toContain('A PRIVATE RUMOR');
            expect(b).not.toContain('NARRATOR ONLY MEMORY'); expect(b).not.toContain('RESULT_A_PRIVATE');
            expect(narrator).toContain('NARRATOR ONLY MEMORY'); expect(narrator).toContain('RESULT_A_PRIVATE');
            expect(narrator).not.toContain('RESULT_B_PRIVATE'); expect(narrator).toContain('reference-only');
            expect(root).toMatchObject({ status: 'completed', graphRevision: 1 });
            expect(root.resultRefs).toHaveLength(3); expect(root.outputClaims).toHaveLength(1); expect(root.planRef).toEqual(f.planRef);
            const patch = await f.h.engine.withTransaction(f.h.handle, tx => readRpPlannerCompletion(tx, f.h.handle, root));
            expect(patch.producer.nodeId).toBe(nodes.planner.nodeId);
            expect(patch.patch).toMatchObject({ accepted: true, previousGraphRevision: 0, newGraphRevision: 1, requests: { finalize: true, replan: false } });
            expect(patch.patch.appliedOperations).toEqual([{ op: 'requestFinalize' }]);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.graphResults.map(item => item.receipt.graphRevision)).toEqual([1, 1]);
            expect(output.closure.effectIds).toHaveLength(5);
            const paid = await bank(f); expect(paid.attempts).toHaveLength(4);
            expect(paid.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
            const chat = await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name);
            expect(chat.body).toHaveLength(3); expect(chat.body.at(-1).mes).toBe('Final scoped planned prose');
            expect((await source.core.observe(f.h.handle, source.base.session.sessionId)).revision).toEqual(source.base.revision);
        } finally { await f.cleanup(); }
    });

    test('an Actor Judge cannot read another Actor candidate and is rejected before Judge HTTP without losing either paid Result', async () => {
        let source, candidates;
        const f = await rpModelFixture(make, { memorySettings: { enabled: true, recallEnabled: true },
            configurePlan: async (plan, env) => {
                await configureJudge(plan, env);
                candidates = plan.definition.entryNodeIds.map(id => plan.definition.nodes.find(node => node.nodeId === id));
                source = await seedControlActorAudiences(plan, env);
            }, responsePayload: (_body, ordinal) => ordinal === 1 ? 'CANDIDATE_A_PRIVATE' : 'CANDIDATE_B_PRIVATE' });
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_consumption_stale');
            expect(f.requests).toHaveLength(2);
            for (const [index, node] of candidates.entries()) {
                expect(requestText(f.requests[index])).toContain(task(node, { kind: 'actor', id: index ? source.actorB : source.actorA }));
            }
            const [a, b] = f.requests.map(request => JSON.stringify(request));
            expect(a).toContain('A PRIVATE RUMOR'); expect(a).not.toContain('B PRIVATE RUMOR');
            expect(b).toContain('B PRIVATE RUMOR'); expect(b).not.toContain('A PRIVATE RUMOR');
            expect(b).not.toContain('CANDIDATE_A_PRIVATE');
            for (const input of [a, b]) expect(input).not.toContain('NARRATOR ONLY MEMORY');
            const root = await currentRoot(f);
            expect(root.resultRefs).toHaveLength(2); expect(root.outputClaims).toEqual([]); expect(root.graphRevision).toBe(0);
            const paid = await bank(f); expect(paid.attempts).toHaveLength(2);
            expect(paid.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
            expect((await source.core.observe(f.h.handle, source.base.session.sessionId)).revision).toEqual(source.base.revision);
        } finally { await f.cleanup(); }
    });
});
