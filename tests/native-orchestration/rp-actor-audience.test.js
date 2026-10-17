import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES, makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { configureAgentGraph } from './helpers/rp-agent-graph-fixture.js';
import { sessionFixture, services } from '../native/helpers/session-fixture.js';
import { informationFixture } from '../native/helpers/information-fixture.js';
import { buildAtriaPackageContainer, createNativeId } from '../../src/native/index.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { readAudienceSource } from '../../src/native/orchestration/audience-source-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { configureReview } from './helpers/rp-review-fixture.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { createSkillRepository } from '../../src/skills/repository.js';
import { ExtensionsStore } from '../../src/native/extensions-store.js';
import { skillEntryKey } from '../../public/shared/extension-contract.js';

jest.setTimeout(120000);

async function actorFixture(make, change, shape = 'dag', responsePayload = null) {
    let state;
    const fixture = await rpModelFixture(make, { memorySettings: { enabled: true, recallEnabled: true },
        responsePayload: responsePayload ?? (body => { const text = JSON.stringify(body); return text.includes('NARRATOR ONLY MEMORY') ? 'Final prose' : text.includes('A PRIVATE RUMOR') ? 'RESULT_A' : 'RESULT_B'; }),
        configurePlan: async (plan, env) => {
            if (shape === 'review') await configureReview(plan, env);
            else await configureAgentGraph(plan, env, 'two-entries');
            if (shape === 'fanout') {
                const [a, b, narrator, output] = plan.definition.nodes;
                const fanout = { nodeId: createNativeId('orchestrationNode'), kind: 'fanout', label: 'Actor perspectives', inputs: [],
                    outputs: [{ name: 'task', type: 'task.result', required: false }], dependencyPinIds: [], capabilities: [], policy: { maxConcurrency: 2, failurePolicy: 'continue' } };
                const join = { nodeId: createNativeId('orchestrationNode'), kind: 'join', label: 'Authorized references',
                    inputs: ['a', 'b'].map(name => ({ name, type: 'text', required: true })), outputs: [{ name: 'joined', type: 'text', required: false }],
                    dependencyPinIds: [], capabilities: [], policy: { strategy: 'all-success', quorum: 2, deadlineMs: 60000 } };
                for (const node of [a, b]) node.inputs = [{ name: 'task', type: 'task.result', required: true }];
                narrator.inputs = [{ name: 'joined', type: 'text', required: true }];
                const edge = (from, out, to, input) => ({ edgeId: createNativeId('orchestrationEdge'), from: { nodeId: from.nodeId, port: out }, to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits: 1, loopBack: false });
                plan.definition.nodes = [fanout, a, b, join, narrator, output]; plan.definition.entryNodeIds = [fanout.nodeId];
                plan.definition.edges = [edge(fanout, 'task', a, 'task'), edge(fanout, 'task', b, 'task'), edge(a, 'response', join, 'a'), edge(b, 'response', join, 'b'),
                    edge(join, 'joined', narrator, 'joined'), edge(narrator, 'response', output, 'response')];
                plan.definition.limits.maxConcurrency = 2;
            }
            const f = { ...sessionFixture(), ...services(env.h) }, actorA = f.manifest.actors[0].actorId, actorB = createNativeId('actor');
            f.manifest.actors.push({ actorId: actorB, displayName: 'Other Actor' });
            f.manifest.entryPoints[0].actorIds.push(actorB);
            const contract = informationFixture(actorA, f.worldId);
            contract.informationRuntime.actors.push({ id: actorB, scopeId: 'session', availability: { domainId: 'availability', recordId: 'main', field: 'available' } });
            contract.informationRuntime.views.push({ ...contract.informationRuntime.views[1], id: 'actor-b', actorId: actorB });
            f.manifest.runtime = { experienceContract: contract };
            const { archive } = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map(), assetPayloads: new Map() });
            await f.packageInstaller.install(env.h.handle, archive);
            let base = await f.core.create(env.h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
            let serial = 0;
            const write = async (domainId, recordId, overrides) => {
                base = await f.core.applyLifecycleCommand(env.h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 'audience-' + ++serial,
                    action: { kind: 'app.command', domainId, recordId, commandId: 'save', args: {
                        ...contract.lifecycleRuntime.domains.find(domain => domain.id === domainId).initial, ...overrides } } }, { expectedRevisionId: base.revision.revisionId });
                return base;
            };
            await write('availability', 'main', { available: true });
            await write('beliefs', 'a', { actor: actorA, text: 'A PRIVATE RUMOR', status: 'believed', channel: 'rumor' });
            await write('beliefs', 'b', { actor: actorB, text: 'B PRIVATE RUMOR', status: 'believed', channel: 'rumor' });
            await write('memories', 'a', { actor: actorA, text: 'NARRATOR ONLY MEMORY' });
            const nodes = plan.definition.nodes.filter(node => ['agent', 'planner', 'judge', 'review'].includes(node.kind));
            const terminal = plan.definition.edges.find(edge => edge.to.nodeId === plan.definition.outputContract.ownerNodeId).from.nodeId;
            const refs = [];
            for (const [index, node] of nodes.entries()) {
                const ref = { kind: 'native_information_context', sessionId: base.session.sessionId, branchId: base.revision.branchId,
                    revisionId: base.revision.revisionId, audience: node.nodeId === terminal ? { kind: 'narrator' } : { kind: 'actor', id: node.kind === 'review' || !index ? actorA : actorB } };
                const pinId = 'audience.' + index;
                plan.dependencyPins.push({ pinId, port: 'context', resourceRef: ref, integrity: hash((await readAudienceSource(env.h.handle, ref, env.host.sessionCore)).descriptor) });
                node.dependencyPinIds.push(pinId); node.policy.audiencePinId = pinId; refs.push(ref);
            }
            state = { f, refs, actorA, actorB, write, getBase: () => base };
            await change?.(plan, env, state);
        } });
    return { ...fixture, ...state };
}

describe.each(CONTRACT_HARNESSES)('$name real RP independent Actor audiences', ({ make }) => {
    test.each(['dag', 'fanout'])('two roles compile separate Information views and %s successors reauthorize Result content', async shape => {
        const f = await actorFixture(make, undefined, shape);
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            const [a, b] = f.requests.slice(0, 2).map(request => JSON.stringify(request)).sort((a, b) => Number(b.includes('A PRIVATE RUMOR')) - Number(a.includes('A PRIVATE RUMOR')));
            const narrator = JSON.stringify(f.requests[2]);
            expect(a).toContain('A PRIVATE RUMOR'); expect(a).not.toContain('B PRIVATE RUMOR');
            expect(b).toContain('B PRIVATE RUMOR'); expect(b).not.toContain('A PRIVATE RUMOR');
            for (const request of [a, b]) {
                expect(request).not.toContain('NARRATOR ONLY MEMORY'); expect(request).not.toContain('Original RP context');
                expect(request).toContain('Original RP input');
            }
            expect(narrator).toContain('NARRATOR ONLY MEMORY'); expect(narrator).toContain('RESULT_A');
            expect(narrator).not.toContain('RESULT_B'); expect(narrator).toContain('reference-only');
            // Both advisory Results and the one final Narrator Result remain
            // durable; the final publication must not erase its predecessors.
            expect(root.status).toBe('completed'); expect(root.resultRefs).toHaveLength(3);
            const chat = await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name);
            expect(chat.body).toHaveLength(3); expect(chat.body.at(-1).mes).toBe('Final prose');
            expect((await f.f.core.observe(f.h.handle, f.refs[0].sessionId)).revision).toEqual(f.getBase().revision);
        } finally { await f.cleanup(); }
    });

    test('Actor source revision changes during a paid response reject consumption, retain fees, and publish no prose', async () => {
        const f = await actorFixture(make);
        f.onResponse(async () => { await f.write('availability', 'main', { available: false }); });
        try {
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
            const control = await f.control.status(f.h.handle, f.controlId);
            expect(Object.values(control.operations)[0].compute.attempts).toHaveLength(1);
            expect(Object.values(control.operations)[0].compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            const roots = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(roots[0].doc.resultRefs).toEqual([]); expect(roots[0].doc.outputClaims).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test('a pinned view never grants another owner read access', async () => {
        const f = await actorFixture(make);
        try { await expect(readAudienceSource('foreign-owner', f.refs[0], f.host.sessionCore)).rejects.toThrow(); expect(f.requests).toHaveLength(0); }
        finally { await f.cleanup(); }
    });
});

test('RP role-scoped structured Review redoes only the pure draft and preserves all paid history', async () => {
    const f = await actorFixture(makeTempFsEngineHarness, undefined, 'review', (_body, n) => [
        'DRAFT_A_PRIVATE', JSON.stringify({ decision: 'rerun', reasonCode: 'draft_incomplete' }), 'DRAFT_B_REVISED',
        JSON.stringify({ decision: 'approve', reasonCode: 'quality_ready' }), 'Final prose',
    ][n - 1]);
    try {
        const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
        expect(f.requests).toHaveLength(5); expect(root.progress.reviews).toBe(2); expect(root.outputClaims).toHaveLength(1);
        expect(JSON.stringify(f.requests[1])).toContain('DRAFT_A_PRIVATE');
        expect(JSON.stringify(f.requests[2])).not.toContain('DRAFT_A_PRIVATE'); expect(JSON.stringify(f.requests[2])).toContain('draft_incomplete');
        expect(JSON.stringify(f.requests[4])).toContain('DRAFT_B_REVISED'); expect(JSON.stringify(f.requests[4])).not.toContain('DRAFT_A_PRIVATE');
        for (const request of f.requests.slice(0, 4)) {
            expect(JSON.stringify(request)).toContain('A PRIVATE RUMOR'); expect(JSON.stringify(request)).not.toContain('NARRATOR ONLY MEMORY');
        }
        const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
        expect(bank.attempts).toHaveLength(5); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
        expect(output.published.graphResults.map(item => item.record.payload)).toEqual(['DRAFT_A_PRIVATE', 'DRAFT_B_REVISED']);
        expect(output.published.producer.inputRefs[0].acceptedGraphResultRefs).toEqual([output.published.graphResults[1].receipt.resultRef]);
    } finally { await f.cleanup(); }
});

test('a Review audience cannot approve an unreadable draft through a reference-only placeholder', async () => {
    const f = await actorFixture(makeTempFsEngineHarness, async (plan, env, state) => {
        const reviewer = plan.definition.nodes.find(node => node.kind === 'review');
        const pin = plan.dependencyPins.find(pin => pin.pinId === reviewer.policy.audiencePinId);
        pin.resourceRef.audience.id = state.actorB;
        pin.integrity = hash((await readAudienceSource(env.h.handle, pin.resourceRef, env.host.sessionCore)).descriptor);
    }, 'review', () => 'DRAFT_A_PRIVATE');
    try {
        await expect(f.run()).rejects.toThrow('native_orchestration_consumption_stale');
        expect(f.requests).toHaveLength(1);
        expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        expect(Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute.attempts)
            .toMatchObject([{ status: 'settled', usage: { totalTokens: 20 } }]);
    } finally { await f.cleanup(); }
});

async function useRunSourcePolicies(plan, env) {
    for (const pin of plan.dependencyPins.filter(pin => pin.resourceRef.kind === 'native_information_context')) {
        const ref = pin.resourceRef;
        delete ref.branchId; delete ref.revisionId; ref.anchor = 'run_source';
        pin.integrity = hash((await readAudienceSource(env.h.handle, ref, env.host.sessionCore)).descriptor);
    }
}

test('an unchanged published RP role policy binds each new Run to its current original Source', async () => {
    const f = await actorFixture(makeTempFsEngineHarness, useRunSourcePolicies);
    try {
        const first = await f.run();
        await f.write('beliefs', 'a', { actor: f.actorA, text: 'A REVISED RUMOR', status: 'believed', channel: 'rumor' });
        const chat = await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name);
        await f.chats.save(f.h.handle, f.locator.charDir, f.locator.name, chat.header,
            [...chat.body, { name: 'User', is_user: true, mes: 'Next authorized brief', memory_os_source_id: 'rp-next' }], chat.integrity);
        const second = await f.run({ floor: 3, requestId: 'next-rp-policy' });
        expect(first.runId).not.toBe(second.runId); expect(f.requests).toHaveLength(6);
        expect(JSON.stringify(f.requests[0])).toContain('A PRIVATE RUMOR');
        expect(JSON.stringify(f.requests[3])).toContain('A REVISED RUMOR');
        expect(JSON.stringify(f.requests[3])).not.toContain('A PRIVATE RUMOR');
        expect((await f.plans.getBinding(f.h.handle, f.sourceSelector)).planRef).toEqual(f.planRef);
        const operations = Object.values((await f.control.status(f.h.handle, f.controlId)).operations);
        expect(operations).toHaveLength(2); expect(operations.map(op => op.compute.attempts.length)).toEqual([3, 3]);
        expect(operations.every(op => op.compute.attempts.every(row => row.status === 'settled'))).toBe(true);
    } finally { await f.cleanup(); }
});

test('a reusable role policy never adopts an advanced Source into an already running RP', async () => {
    const f = await actorFixture(makeTempFsEngineHarness, useRunSourcePolicies);
    f.onResponse(async () => { await f.write('availability', 'main', { available: false }); });
    try {
        await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        expect(Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute.attempts)
            .toMatchObject([{ status: 'settled', usage: { totalTokens: 20 } }]);
    } finally { await f.cleanup(); }
});

async function addNarratorSkill(f) {
    const repository = createSkillRepository(f.h.dirs.root), extensions = new ExtensionsStore({ engine: f.h.engine });
    const scope = { kind: 'character', characterFile: 'Actor.png' };
    const body = '---\nname: audience-guide\ndescription: Narrator instructions\n---\nNARRATOR_SCOPED_SKILL: preserve the player decision.';
    await repository.install({ scope, payload: { files: [{ path: 'SKILL.md', content: body }] } });
    const before = await extensions.settings(f.h.handle);
    await extensions.saveSettings(f.h.handle, { ...before.value, skills: {
        [skillEntryKey({ scope, name: 'audience-guide' })]: { paths: { narrative: 'always' } },
    } }, before.revision);
    f.host.skillRepository = () => repository; f.host.extensions = extensions;
    return { repository, scope, body };
}

test('independent Actor contexts exclude Chat Skills while the original Narrator keeps its own exact always Skill', async () => {
    const f = await actorFixture(makeTempFsEngineHarness);
    try {
        await addNarratorSkill(f);
        const result = await f.run();
        expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(3);
        expect(JSON.stringify(f.requests[0])).not.toContain('NARRATOR_SCOPED_SKILL');
        expect(JSON.stringify(f.requests[1])).not.toContain('NARRATOR_SCOPED_SKILL');
        expect(JSON.stringify(f.requests[2])).toContain('NARRATOR_SCOPED_SKILL');
        const facts = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
        expect(facts.attempts).toHaveLength(3); expect(facts.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(facts.localWork.filter(row => row.kind === 'skill_load')).toHaveLength(1);
    } finally { await f.cleanup(); }
});

test('Skill drift during an audience-pinned Narrator response withholds prose and preserves all three paid sends', async () => {
    const f = await actorFixture(makeTempFsEngineHarness);
    try {
        const skill = await addNarratorSkill(f);
        f.onResponse(async () => {
            if (f.requests.length !== 3) return;
            await skill.repository.install({ scope: skill.scope, conflictStrategy: 'replace', payload: {
                files: [{ path: 'SKILL.md', content: skill.body + '\nChanged while Narrator was running.' }],
            } });
        });
        await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_skill_source_stale' });
        expect(f.requests).toHaveLength(3);
        expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        const facts = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
        expect(facts.attempts).toHaveLength(3); expect(facts.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(facts.localWork.filter(row => row.kind === 'skill_load')).toHaveLength(1);
    } finally { await f.cleanup(); }
});
