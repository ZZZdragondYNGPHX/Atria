import { assertPromptProgram } from '../../src/native/model-prompt-runtime/contracts.js';
import express from 'express';
import supertest from 'supertest';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { makeTempFsEngineHarness as make } from '../storage/harness/contract-harness.js';
import { projectReviewFixture } from './helpers/project-review-fixture.js';
import { projectToolCapability } from '../../src/native/orchestration/project-tool-contracts.js';
import { sessionDelegationFixture } from './helpers/session-delegation-fixture.js';
import { configureAgentGraph } from './helpers/rp-agent-graph-fixture.js';
import { modelPortFixture } from './helpers/model-port-fixture.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { backgroundModelFixture } from './helpers/background-model-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

const sentinel = 'This exact Program belongs to the selected Node, independently of its Route.';
async function selectProgram({ plan, seeded, h, selectedNode = null, text = sentinel, pinId = 'node.program' }) {
    const module = { ...seeded.module, promptModuleId: createNativeId('promptModule'), revision: 'node', body: text };
    const moduleRef = { scope: 'library', resourceType: 'core.prompt-module', resourceId: module.promptModuleId, revision: module.revision };
    const program = { ...seeded.prompt, promptProgramId: createNativeId('promptProgram'), revision: 'node', stages: [{ stageId: 'stage.main', moduleRefs: [moduleRef] }] };
    for (const [type, resource] of [['core.prompt-module', module], ['core.prompt-program', program]]) await seeded.library.commit(h.handle, type, resource);
    const ref = { scope: 'library', resourceType: 'core.prompt-program', resourceId: program.promptProgramId, revision: program.revision };
    const stored = await seeded.library.getExact(h.handle, ref);
    plan.dependencyPins.push({ pinId, port: 'model', resourceRef: ref, integrity: hash(stored.snapshot) });
    const node = selectedNode ?? plan.definition.nodes.find(node => node.kind === 'agent');
    node.dependencyPinIds.push(pinId); node.policy.promptPinId = pinId;
}
const cases = [
    ['Session', () => modelPortFixture(make, { configurePlan: selectProgram }), f => f.start()],
    ['Project', () => projectModelFixture(make, { configurePlan: selectProgram }), f => f.run()],
    ['RP', () => rpModelFixture(make, { configurePlan: (plan, args) => selectProgram({ ...args, plan }) }), f => f.run()],
    ['background', () => backgroundModelFixture(make, { configurePlan: selectProgram }), f => f.run()],
];
test.each(cases)('%s publishes an exact Node Program and sends it through original ModelPort without changing the Route default', async (_domain, fixture, run) => {
    const f = await fixture();
    try {
        const persistence = f.host.persistence;
        const route = await persistence.getRuntimeRoute(f.h.handle, (f.route ?? f.routes[0]).runtimeRouteId);
        await run(f);
        expect(f.requests).toHaveLength(1); expect(JSON.stringify(f.requests[0])).toContain(sentinel);
        expect(JSON.stringify(f.requests[0])).not.toContain('Use the selected Native facts. Produce a concise response.');
        expect(await persistence.getRuntimeRoute(f.h.handle, (f.route ?? f.routes[0]).runtimeRouteId)).toEqual(route);
    } finally { await f.cleanup(); }
}, 60000);


test('collaborating RP nodes on their own routes compile their own exact Programs', async () => {
    const f = await rpModelFixture(make, { configurePlan: async (plan, args) => {
        await configureAgentGraph(plan, args, 'one-draft');
        for (const [index, node] of plan.definition.nodes.filter(node => node.kind === 'agent').entries())
            await selectProgram({ ...args, plan, selectedNode: node, text: 'Only Node ' + index + ' Program instructions.', pinId: 'node.program.' + index });
    } });
    try {
        await f.run(); expect(f.requests).toHaveLength(2);
        expect(JSON.stringify(f.requests[0])).toContain('Only Node 0 Program instructions.');
        expect(JSON.stringify(f.requests[0])).not.toContain('Only Node 1 Program instructions.');
        expect(JSON.stringify(f.requests[1])).toContain('Only Node 1 Program instructions.');
        expect(JSON.stringify(f.requests[1])).not.toContain('Only Node 0 Program instructions.');
    } finally { await f.cleanup(); }
}, 60000);

test('a delegated Session child keeps its Program through the original child Run and ModelPort', async () => {
    const f = await sessionDelegationFixture(make, { childSteps: 1, configureChild: (plan, args) => selectProgram({ ...args, plan }) });
    try {
        await f.start(); expect(f.requests).toHaveLength(3);
        const child = f.requests.find(request => request.model === 'session-delegated-distinct-model');
        expect(JSON.stringify(child)).toContain(sentinel);
        expect(f.requests.filter(request => request.model !== 'session-delegated-distinct-model').every(request => !JSON.stringify(request).includes(sentinel))).toBe(true);
    } finally { await f.cleanup(); }
}, 60000);


test('Project workers retain independent Programs while sharing the original Task operation', async () => {
    const f = await projectReviewFixture(make, { outputContract: true, configurePlan: async args => {
        const { plan } = args, graph = plan.definition, original = graph.nodes[0], output = graph.nodes[1];
        const workers = [];
        for (const [index, name] of ['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review'].entries()) {
            const tool = plan.dependencyPins.find(pin => pin.port === 'tool' && pin.resourceRef.name === name);
            const worker = { ...structuredClone(original), nodeId: index ? createNativeId('orchestrationNode') : original.nodeId, label: 'Worker ' + index,
                inputs: index ? [{ name: 'previous', type: 'json', required: true }] : [],
                dependencyPinIds: [original.policy.agentPinId, tool.pinId], capabilities: ['generation.send', projectToolCapability(name)] };
            workers.push(worker);
            await selectProgram({ ...args, selectedNode: worker, text: 'Exact Project Worker ' + index + ' instructions.', pinId: 'worker.program.' + index });
        }
        graph.nodes = [...workers, output]; graph.edges = workers.map((worker, index) => ({ edgeId: createNativeId('orchestrationEdge'),
            from: { nodeId: worker.nodeId, port: worker.outputs[0].name }, to: { nodeId: workers[index + 1]?.nodeId ?? output.nodeId,
                port: index < workers.length - 1 ? 'previous' : output.inputs[0].name }, condition: 'success', maxVisits: 1, loopBack: false }));
        graph.limits.maxLoopIterations = 0;
    } });
    try {
        await f.run(); expect(f.requests).toHaveLength(3);
        for (let index = 0; index < 3; index++) {
            const wire = JSON.stringify(f.requests[index]);
            expect(wire).toContain('Exact Project Worker ' + index + ' instructions.');
            expect(wire).not.toContain('Exact Project Worker ' + ((index + 1) % 3) + ' instructions.');
        }
        expect((await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId)).status).toBe('review');
    } finally { await f.cleanup(); }
}, 60000);

test('a Node Program remains selected across the original V3 model fallback and keeps both charged attempts', async () => {
    const f = await modelPortFixture(make, { responseStatus: count => count === 1 ? 503 : 200, configurePlan: async args => {
        const { seeded, h, route, plan } = args;
        const fallback = { ...route, runtimeRouteId: createNativeId('runtimeRoute') };
        await seeded.persistence.saveRuntimeRoute(h.handle, fallback);
        const primary = { ...route, fallbackRouteRefs: [{ scope: 'player', runtimeRouteId: fallback.runtimeRouteId }] };
        await seeded.persistence.saveRuntimeRoute(h.handle, primary);
        plan.dependencyPins[0].integrity = hash(primary);
        plan.dependencyPins.push({ pinId: 'fallback.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: fallback.runtimeRouteId }, integrity: hash(fallback) });
        plan.definition.nodes[0].dependencyPinIds.push('fallback.route');
        await selectProgram(args);
    } });
    try {
        await f.start(); expect(f.requests).toHaveLength(2);
        expect(f.requests.every(request => JSON.stringify(request).includes(sentinel))).toBe(true);
        const operations = Object.values((await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations);
        expect(operations.find(operation => operation.compute).compute.attempts).toHaveLength(2);
    } finally { await f.cleanup(); }
}, 60000);


test('Used By exposes the original exact Plan pin as a consumer for adoption', async () => {
    const f = await projectModelFixture(make, { configurePlan: selectProgram });
    try {
        const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: f.h.handle } }; next(); });
        app.use(createNativeGenerationRouter(() => f.host));
        const ref = f.plan.dependencyPins.find(pin => pin.pinId === 'node.program').resourceRef;
        const result = await supertest(app).post('/resources/used-by').send(ref).expect(200);
        expect(result.body).toContainEqual(expect.objectContaining({ owner: 'Agents', edge: expect.objectContaining({ kind: 'plan-pin-exact' }),
            node: expect.objectContaining({ resourceId: f.planRef.planId, metadata: expect.objectContaining({ exactRef: ref, pinId: 'node.program' }) }) }));
        expect(f.requests).toEqual([]);
    } finally { await f.cleanup(); }
}, 30000);


test('archiving a published Plan preserves its original Binding, ModelPort send and usage', async () => {
    const f = await modelPortFixture(make, { configurePlan: selectProgram });
    try {
        const root = await f.plans.get(f.h.handle, f.planRef.planId);
        const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector);
        await f.plans.archive(f.h.handle, createNativeId('orchestrationCommand'), { planId: root.planId,
            expectedDraftVersion: root.draftVersion, expectedDefinitionHash: root.definitionHash, archived: true });
        expect(await f.plans.getBinding(f.h.handle, f.sourceSelector)).toEqual(binding);
        await f.start(); expect(f.requests).toHaveLength(1); expect(JSON.stringify(f.requests[0])).toContain(sentinel);
        const operations = Object.values((await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations);
        expect(operations.find(operation => operation.compute).compute.attempts).toHaveLength(1);
    } finally { await f.cleanup(); }
}, 60000);


test('Project Node Program reads its exact Project-owned closure through publication and original send', async () => {
    let program, ref;
    const f = await projectModelFixture(make, {
        configureSource: async ({ source }) => {
            const projectId = source.project.projectId;
            const module = { schemaVersion: 1, promptModuleId: createNativeId('promptModule'), revision: 'r1', displayName: 'Project body',
                target: 'system.foundation', stages: ['stage.main'], body: 'This Program is owned by the original Project.' };
            const moduleRef = { scope: 'project', projectId, resourceType: 'core.prompt-module', resourceId: module.promptModuleId, revision: module.revision };
            program = { schemaVersion: 1, promptProgramId: createNativeId('promptProgram'), revision: 'r1', displayName: 'Project Program', stages: [{ stageId: 'stage.main', moduleRefs: [moduleRef] }] };
            ref = { scope: 'project', projectId, resourceType: 'core.prompt-program', resourceId: program.promptProgramId, revision: program.revision };
            source.resources = [{ resourceType: 'core.prompt-module', resource: module }, { resourceType: 'core.prompt-program', resource: program }];
        },
        configurePlan: async ({ plan }) => {
            plan.dependencyPins.push({ pinId: 'project.program', port: 'model', resourceRef: ref, integrity: hash(assertPromptProgram(program)) });
            plan.definition.nodes[0].dependencyPinIds.push('project.program'); plan.definition.nodes[0].policy.promptPinId = 'project.program';
        },
    });
    try { await f.run(); expect(f.requests).toHaveLength(1); expect(JSON.stringify(f.requests[0])).toContain('This Program is owned by the original Project.'); }
    finally { await f.cleanup(); }
}, 60000);
