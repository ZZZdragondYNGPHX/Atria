import { expect, test } from '@jest/globals';
import { modelPortFixture } from './helpers/model-port-fixture.js';
import { configureSessionOutput } from './helpers/session-output-fixture.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { readAudienceSource } from '../../src/native/orchestration/audience-source-contracts.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';

const id = kind => createNativeId('orchestration' + kind);
async function setup(make, { change = () => {}, usage = true, runSource = false } = {}) {
    return modelPortFixture(make, { usage, configurePlan: async args => {
        configureSessionOutput(args);
        const { plan, h, core, base } = args, narrator = plan.definition.nodes[0], actorIds = base.manifest.actors.map(actor => actor.actorId);
        const workers = actorIds.map((actorId, index) => ({ nodeId: id('Node'), kind: 'agent', label: 'Actor ' + index + ' independent source analysis', inputs: [],
            outputs: [{ name: 'advice', type: 'text', required: false }], dependencyPinIds: ['narrator.route', 'audience.' + index], capabilities: ['generation.send'],
            policy: { agentPinId: 'narrator.route', audiencePinId: 'audience.' + index } }));
        narrator.inputs = workers.map((_, index) => ({ name: 'advice' + index, type: 'text', required: true }));
        narrator.dependencyPinIds.push('audience.narrator'); narrator.policy.audiencePinId = 'audience.narrator';
        for (const [index, audience] of [...actorIds.map(actorId => ({ kind: 'actor', id: actorId })), { kind: 'narrator' }].entries()) {
            const sourceRef = { kind: 'native_information_context', sessionId: base.session.sessionId,
                ...(runSource ? { anchor: 'run_source' } : { branchId: base.revision.branchId, revisionId: base.revision.revisionId }), audience };
            const source = await readAudienceSource(h.handle, sourceRef, core);
            plan.dependencyPins.push({ pinId: index === actorIds.length ? 'audience.narrator' : 'audience.' + index, port: 'context', resourceRef: sourceRef, integrity: hash(source.descriptor) });
        }
        plan.definition.nodes.unshift(...workers); plan.definition.entryNodeIds = workers.map(node => node.nodeId);
        plan.definition.edges.unshift(...workers.map((node, index) => ({ edgeId: id('Edge'), from: { nodeId: node.nodeId, port: 'advice' },
            to: { nodeId: narrator.nodeId, port: 'advice' + index }, condition: 'success', maxVisits: 1, loopBack: false })));
        await change(args);
    }, responseBody: async ({ index }) => ({ id: 'native-response-' + index, status: 'completed', output: [{ id: 'message-' + index, type: 'message', status: 'completed', role: 'assistant',
        content: [{ type: 'output_text', text: ['Actor zero advisory marker', 'Actor one private advisory marker', 'The NPC waits for the player decision.'][index % 3], annotations: [] }] }],
    ...(usage ? { usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } } : {}) }) });
}

test.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s Game authored Actor DAG uses independent original views, typed Results, one Narrator and original terminal receipt', async (_name, make) => {
    const f = await setup(make);
    try {
        const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(f.requests).toHaveLength(3); expect(root.status).toBe('completed'); expect(root.outputClaims).toHaveLength(1); expect(root.resultRefs).toHaveLength(3);
        expect(JSON.stringify(f.requests[0])).toContain('阿岚听说'); expect(JSON.stringify(f.requests[0])).not.toContain('沈墨怀疑');
        expect(JSON.stringify(f.requests[1])).toContain('沈墨怀疑'); expect(JSON.stringify(f.requests[1])).not.toContain('阿岚听说');
        expect(JSON.stringify(f.requests[1])).not.toContain('Actor zero advisory marker');
        expect(JSON.stringify(f.requests[2])).toContain('Actor zero advisory marker');
        expect(JSON.stringify(f.requests[2])).not.toContain('Actor one private advisory marker');
        expect(JSON.stringify(f.requests[2])).toContain('reference-only');
        expect(result.timeline.at(-1).content).toBe('The NPC waits for the player decision.');
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state);
        expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        expect(result.timeline.filter(item => item.role === 'assistant')).toHaveLength(f.base.timeline.filter(item => item.role === 'assistant').length + 1);
        const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
        expect(proof.published.graphResults).toHaveLength(2);
        for (const item of proof.published.graphResults) expect(item.record.envelope.sourceRefs[2]).toMatchObject({ kind: 'native_information_context', sourceRef: { audience: { kind: 'actor' } } });
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(item => item.status === 'settled')).toBe(true);
        await f.cold();
        const cold = await f.authority.execution.runs.get(f.h.handle, root.runId);
        expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold))).receipt).toEqual(proof.receipt);
        expect(f.requests).toHaveLength(3);
    } finally { await f.cleanup(); }
}, 60000);

test('Game graph refuses a stale Actor Source before first Provider send or Run admission', async () => {
    const f = await setup(makeTempFsEngineHarness);
    try {
        await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Human advances the original Source' });
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(0);
        expect(await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))).toHaveLength(0);
    } finally { await f.cleanup(); }
}, 30000);

test('Game collaboration stops after lawful Source withdrawal during the first paid Actor request', async () => {
    const f = await setup(makeTempFsEngineHarness); let changed = false;
    try {
        f.onResponse(async () => {
            if (changed) return; changed = true;
            await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Human input wins during Actor analysis' });
        });
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.outputClaims).toEqual([]);
        expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).timeline.at(-1).content).toBe('Human input wins during Actor analysis');
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe('settled');
    } finally { await f.cleanup(); }
}, 30000);

test('Game collaboration keeps unknown usage and the one formal output without a terminal claim or replay', async () => {
    const f = await setup(makeTempFsEngineHarness, { usage: false });
    try {
        const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(result.timeline.at(-1).content).toBe('The NPC waits for the player decision.');
        expect(root.status).toBe('running'); expect(root.outputClaims).toEqual([]); expect(f.requests).toHaveLength(3);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(item => item.status === 'unknown')).toBe(true);
        expect((await f.start()).revision).toEqual(result.revision); expect(f.requests).toHaveLength(3);
    } finally { await f.cleanup(); }
}, 60000);


test.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s Game Run-source Actor policy reuses one published Plan across two real turns and cold reads exact captures', async (_name, make) => {
    const f = await setup(make, { runSource: true });
    try {
        await f.start();
        const first = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'The player chooses the second turn.' });
        const nextBase = await f.core.observe(f.h.handle, f.base.session.sessionId);
        f.input.revisionId = nextBase.revision.revisionId; f.input.invocationId = 'sealed-narrator-second';
        const result = await f.start(), second = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(f.requests).toHaveLength(6); expect(first.runId).not.toBe(second.runId);
        expect(first.planRef).toEqual(second.planRef); expect(second.planRef).toEqual(f.planRef);
        expect(first.status).toBe('completed'); expect(second.status).toBe('completed');
        expect(second.sourceBinding.sourceRef.revisionId).toBe(nextBase.revision.revisionId);
        expect(second.sourceBinding.sourceRef.revisionId).not.toBe(first.sourceBinding.sourceRef.revisionId);
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state);
        expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        const proofs = [];
        for (const root of [first, second]) {
            const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root)); proofs.push(proof.receipt);
            for (const item of proof.published.graphResults) {
                const context = item.record.envelope.sourceRefs[2], capture = item.producer.inputRefs[0].audienceCapture;
                expect(context.sourceRef).toMatchObject(root.sourceBinding.sourceRef);
                expect(context.sourceRef).toEqual(capture.sourceRef); expect(capture.policyRef.anchor).toBe('run_source');
                expect(capture.policyIntegrity).toBe(context.integrity); expect(capture.integrity).toMatch(/^[a-f0-9]{64}$/);
            }
        }
        await f.cold();
        for (const [index, previous] of [first, second].entries()) {
            const root = await f.authority.execution.runs.get(f.h.handle, previous.runId);
            expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root))).receipt).toEqual(proofs[index]);
        }
        expect(f.requests).toHaveLength(6);
    } finally { await f.cleanup(); }
}, 100000);

test('Game Run-source policy captures a current new revision but still rejects withdrawal during its first paid Actor send', async () => {
    const f = await setup(makeTempFsEngineHarness, { runSource: true }); let changed = false;
    try {
        await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'A valid newer turn Source.' });
        const base = await f.core.observe(f.h.handle, f.base.session.sessionId); f.input.revisionId = base.revision.revisionId;
        f.onResponse(async () => { if (changed) return; changed = true;
            await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Human input withdraws this captured Source.' }); });
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.outputClaims).toEqual([]); expect(root.sourceBinding.sourceRef.revisionId).toBe(base.revision.revisionId);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe('settled');
    } finally { await f.cleanup(); }
}, 40000);


test('Game Run-source policy does not preserve a withdrawn original Actor availability grant into a new Run', async () => {
    const f = await setup(makeTempFsEngineHarness, { runSource: true });
    try {
        const base = await f.write('availability', 'main', { available: false });
        f.input.revisionId = base.revision.revisionId;
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(0);
        expect(await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))).toHaveLength(0);
    } finally { await f.cleanup(); }
}, 30000);
