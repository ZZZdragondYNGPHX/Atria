import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { seedControlActorAudiences } from './helpers/rp-control-audience-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { readAttemptInvalidation, controlRecordKey, attemptInvalidationId } from '../../src/native/orchestration/controller-common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';

const id = kind => createNativeId('orchestration' + kind);
const text = body => body.messages.flatMap(message => typeof message.content === 'string' ? [message.content] : message.content.map(part => part.text ?? '')).join('\n');
const port = (name, type) => ({ name, type, required: true });
const edge = (from, to, input, maxVisits = 1) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: 'response' },
    to: { nodeId: to.nodeId, port: input }, condition: 'success', maxVisits, loopBack: false });

async function fixture({ maxRequests = 9 } = {}) {
    let nodes, source, planners = 0, reviews = 0, a = 0, b = 0;
    const f = await rpModelFixture(makeTempSqliteEngineHarness, { configurePlan: async (plan, env) => {
        const [narrator, output] = plan.definition.nodes;
        const route = { ...env.route, executionPolicy: { ...env.route.executionPolicy, computeBudget: { ...env.route.executionPolicy.computeBudget,
            maxRequests, localWork: { ...env.route.executionPolicy.computeBudget.localWork, maxJobs: 96 } } } };
        await env.seeded.persistence.saveRuntimeRoute(env.h.handle, route);
        plan.dependencyPins[0].integrity = hash(await env.seeded.persistence.getRuntimeRoute(env.h.handle, route.runtimeRouteId));
        const make = async (kind, label, inputs) => {
            const connection = { ...env.seeded.connection, connectionProfileId: createNativeId('connectionProfile'), displayName: label };
            await env.seeded.persistence.saveConnectionProfile(env.h.handle, connection);
            const model = { ...env.seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'rp-redo-' + label,
                connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId } };
            await env.seeded.persistence.saveModelProfile(env.h.handle, model);
            const owned = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId },
                connectionProfileRef: model.connectionProfileRef, executionPolicy: { ...route.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
            await env.seeded.persistence.saveRuntimeRoute(env.h.handle, owned);
            const pinId = 'redo.' + label;
            plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: owned.runtimeRouteId }, integrity: hash(owned) });
            return { nodeId: id('Node'), kind, label, inputs, outputs: [port('response', kind === 'agent' ? 'text' : 'json')], dependencyPinIds: [pinId],
                capabilities: ['generation.send', ...kind === 'planner' ? ['graph.patch'] : []], policy: { agentPinId: pinId, ...kind === 'review' ? { maxRounds: 2 } : {} } };
        };
        const first = await make('agent', 'a', []), planner = await make('planner', 'planner', [port('seed', 'text')]);
        const second = await make('agent', 'b', [port('control', 'json')]);
        const review = await make('review', 'review', [port('a', 'text'), port('b', 'text'), port('control', 'json')]);
        narrator.inputs = [port('a', 'text'), port('b', 'text'), port('review', 'json')]; output.capabilities = ['chat.output'];
        plan.definition.nodes = [first, planner, second, review, narrator, output]; plan.definition.entryNodeIds = [first.nodeId];
        plan.definition.edges = [edge(first, planner, 'seed', 2), edge(planner, second, 'control', 2), edge(first, review, 'a', 2),
            edge(second, review, 'b', 2), edge(planner, review, 'control', 2), edge(first, narrator, 'a'), edge(second, narrator, 'b'),
            edge(review, narrator, 'review'), ...plan.definition.edges];
        plan.definition.capabilityCeiling = ['generation.send', 'graph.patch', 'chat.output'];
        plan.definition.graphChangePolicy = { allowedOperations: ['setPendingPriority', 'requestFinalize'], allowedNodeKinds: [] };
        Object.assign(plan.definition.limits, { maxNodes: 6, maxEdges: 9, maxSteps: 120, maxAttempts: 10, maxReviews: 2, maxEdgeVisits: 14 });
        Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
        source = await seedControlActorAudiences(plan, env); nodes = { first, planner, second, review, narrator };
        // Same Actor disclosure is explicitly authored before publication; the
        // original other Actor still exists as a negative canary in real Source.
        const removed = second.policy.audiencePinId;
        second.dependencyPinIds = second.dependencyPinIds.map(pin => pin === removed ? first.policy.audiencePinId : pin);
        second.policy.audiencePinId = first.policy.audiencePinId; plan.dependencyPins = plan.dependencyPins.filter(pin => pin.pinId !== removed);
    }, responsePayload: body => {
        const content = text(body), nodeId = content.match(/"task":\{"nodeId":"([^"]+)"/)?.[1];
        if (nodeId === nodes.first.nodeId) return 'RP_A_' + ++a;
        if (nodeId === nodes.planner.nodeId) return JSON.stringify({ operations: [++planners === 1
            ? { op: 'setPendingPriority', nodeId: nodes.second.nodeId, priority: 7 } : { op: 'requestFinalize' }] });
        if (nodeId === nodes.second.nodeId) return 'RP_B_' + ++b;
        if (nodeId === nodes.review.nodeId) {
            const raw = content.match(/"evidence":(\[[^\]]+\])/)?.[1];
            if (!raw) throw new Error('Missing actual Review evidence');
            const target = f.effects.findLast(effect => effect.proposal.inputRef.nodeId === nodes.first.nodeId)?.nodeAttemptId;
            if (!JSON.parse(raw).some(item => item.attemptId === target)) throw new Error('Original target is not actual typed Review evidence');
            const rerun = ++reviews === 1;
            return JSON.stringify({ decision: rerun ? 'rerun' : 'approve', reasonCode: rerun ? 'draft_incomplete' : 'quality_ready', targetAttemptIds: [target] });
        }
        if (nodeId !== nodes.narrator.nodeId) throw new Error('Unexpected real RP task');
        return 'RP_REVIEWED_A2_B2';
    } });
    return { ...f, nodes, source };
}

test('SQLite RP Review recomputes its completed pure Planner descendant without replaying the accepted old GraphPatch', async () => {
    const f = await fixture();
    try {
        const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
        expect(root.status).toBe('completed'); expect(root.graphRevision).toBe(2); expect(root.nodeControl[f.nodes.second.nodeId].priority).toBe(7);
        expect(root.progress).toMatchObject({ attempts: 10, patches: 2, reviews: 2, replans: 0, loopIterations: 0, edgeVisits: 14 });
        expect(f.requests.map(body => body.model)).toEqual(['rp-redo-a', 'rp-redo-planner', 'rp-redo-b', 'rp-redo-review',
            'rp-redo-a', 'rp-redo-planner', 'rp-redo-b', 'rp-redo-review', 'p4-fixture']);
        expect(f.requests.slice(0, 8).every(body => text(body).includes('A PRIVATE RUMOR') && !text(body).includes('B PRIVATE RUMOR'))).toBe(true);
        expect(text(f.requests[5])).toContain('RP_A_2'); expect(text(f.requests[5])).not.toContain('RP_A_1');
        expect(text(f.requests[6])).toContain('requestFinalize'); expect(text(f.requests[6])).not.toContain('setPendingPriority');
        for (const body of f.requests.slice(7)) {
            expect(text(body)).toContain('RP_A_2'); expect(text(body)).toContain('RP_B_2');
            expect(text(body)).not.toContain('RP_A_1'); expect(text(body)).not.toContain('RP_B_1');
        }
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const output = await readRpOutput(tx, f.h.handle, root), published = output.published;
            expect(published.plannerCompletions).toHaveLength(2); expect(published.reviewCompletions).toHaveLength(2); expect(published.graphResults).toHaveLength(4);
            expect(published.plannerCompletions.map(fact => fact.producer.attemptNumber)).toEqual([1, 2]);
            expect(published.plannerCompletions.map(fact => fact.patch.appliedOperations[0].op)).toEqual(['setPendingPriority', 'requestFinalize']);
            const firstReview = published.reviewCompletions[0], oldPlanner = published.plannerCompletions[0];
            const oldA = published.graphResults.find(fact => fact.producer.nodeId === f.nodes.first.nodeId && fact.producer.attemptNumber === 1);
            const oldB = published.graphResults.find(fact => fact.producer.nodeId === f.nodes.second.nodeId && fact.producer.attemptNumber === 1);
            expect(firstReview.review.targetAttemptIds).toEqual([oldA.producer.attemptId]);
            expect(firstReview.review.invalidatedAttemptIds).toEqual([oldA.producer.attemptId, oldPlanner.producer.attemptId, oldB.producer.attemptId].sort());
            expect((await readAttemptInvalidation(tx, f.h.handle, root, oldPlanner.producer)).reviewReceiptId).toBe(firstReview.review.receiptId);
            expect(output.closure.effectIds).toHaveLength(10);
            const key = controlRecordKey(f.h.handle, root.runId, 'receipt', attemptInvalidationId(root.runId, oldPlanner.producer.attemptId)), saved = await tx.getResource(key);
            const doc = { ...saved.doc, reviewIntegrity: '0'.repeat(64) };
            try { await tx.putResource(key, { ...saved, doc, integrity: hash(doc) }); await expect(readRpOutput(tx, f.h.handle, root)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readRpOutput(tx, f.h.handle, root)).claim).toEqual(output.claim);
        });
        const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
        expect(bank.limits.maxRequests).toBe(9); expect(bank.attempts).toHaveLength(9); expect(bank.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
        expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
        expect((await f.source.core.observe(f.h.handle, f.source.base.session.sessionId)).revision).toEqual(f.source.base.revision);
    } finally { await f.cleanup(); }
}, 180000);

test('RP Review retains every paid predecessor when its original remaining request limit cannot fund the Planner causal redo', async () => {
    const f = await fixture({ maxRequests: 8 });
    try {
        await expect(f.run()).rejects.toThrow('native_orchestration_review_rerun_budget_unavailable'); expect(f.requests).toHaveLength(4);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
        expect(root.status).toBe('blocked'); expect(root.graphRevision).toBe(1); expect(root.progress.attempts).toBe(4); expect(root.resultRefs).toHaveLength(2); expect(root.outputClaims).toEqual([]);
        const invalidations = await f.h.engine.withTransaction(f.h.handle, async tx => {
            const records = await tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: root.runId, recordType: 'receipt' });
            return records.filter(record => record.doc.receiptKind === 'attempt_invalidation');
        });
        expect(invalidations).toEqual([]);
        const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
        expect(bank.limits.maxRequests).toBe(8); expect(bank.attempts).toHaveLength(4); expect(bank.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
        expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        expect((await f.source.core.observe(f.h.handle, f.source.base.session.sessionId)).revision).toEqual(f.source.base.revision);
    } finally { await f.cleanup(); }
}, 90000);
