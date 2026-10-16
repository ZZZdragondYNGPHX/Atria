import { createOrchestrationAuthoringService } from '../../src/native/orchestration/authoring-service.js';
import { validationDigest, planDefinitionHash } from '../../src/native/orchestration/plan-repository.js';
import { validateDelegationCapability } from '../../src/native/orchestration/delegation-capability-authority.js';
import { RouteResolver } from '../../src/native/model-prompt-runtime/route-resolver.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash, putImmutable } from '../../src/native/repositories/common.js';
import { ORCHESTRATION_LIMIT_FIELDS } from '../../public/shared/native-orchestration-contracts.js';
import { seedGenerationProfiles } from '../native/helpers/generation-fixture.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

const id = kind => createNativeId('orchestration' + kind);
const pinOf = (child, pinId = 'child.plan') => ({ pinId, port: 'plan', resourceRef: child.planRef, integrity: hash(child.revision) });

function parentPlan(child = null) {
    const value = planFixture(), output = value.definition.nodes[0], nodeId = id('Node');
    value.definition.nodes = [{ nodeId, kind: 'router', label: 'Exact child selection', inputs: [], outputs: [{ name: 'result', type: 'json', required: false }],
        dependencyPinIds: child ? ['child.plan'] : [], capabilities: ['agent.delegate'],
        policy: { selection: 'first_success', allowedPlanPinIds: child ? ['child.plan'] : [] } },
    { ...output, inputs: [{ name: 'result', type: 'json', required: true }] }];
    value.definition.entryNodeIds = [nodeId]; value.definition.capabilityCeiling = ['agent.delegate'];
    value.definition.edges = [{ edgeId: id('Edge'), from: { nodeId, port: 'result' }, to: { nodeId: output.nodeId, port: 'result' }, condition: 'always', maxVisits: 1, loopBack: false }];
    value.dependencyPins = child ? [pinOf(child)] : [];
    return value;
}

async function fixture(make) {
    const h = await make(); await prepareControllerOwnerRoot(h.dirs.root);
    attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
    let plans = createOrchestrationAuthoringService(h.engine).plans;
    const validate = async value => {
        const draft = await plans.create(h.handle, id('Command'), value);
        const expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
        return { expected, report: await plans.validate(h.handle, expected) };
    };
    const publish = async value => {
        const { expected, report } = await validate(value);
        expect(report).toMatchObject({ status: 'valid', issues: [] });
        const { planRef } = await plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) });
        return { planRef, revision: await plans.getRevision(h.handle, planRef) };
    };
    // Negative persisted revisions are integrity-consistent originals read by
    // production authoring, not a permissive production publication adapter.
    const storedRevision = async (value, author = h.handle) => {
        const revision = { schemaVersion: 1, planId: id('Plan'), planRevisionId: id('Revision'), definition: value.definition,
            dependencyPins: value.dependencyPins, definitionHash: planDefinitionHash(value.definition, value.dependencyPins),
            authorRef: { handle: author }, validationDigest: 'a'.repeat(64), publishedAt: 1 };
        const planRef = { planId: revision.planId, planRevisionId: revision.planRevisionId, definitionHash: revision.definitionHash };
        await h.engine.withTransaction(h.handle, tx => putImmutable(tx, { kind: K.orchestrationRevision, handle: h.handle, planId: revision.planId, planRevisionId: revision.planRevisionId }, revision));
        return { planRef, revision };
    };
    return { h, validate, publish, storedRevision, get plans() { return plans; }, set plans(value) { plans = value; } };
}

describe.each([['FsEngine', makeTempFsEngineHarness], ['SqliteEngine', makeTempSqliteEngineHarness]])('%s exact delegation publication mechanism', (_name, make) => {
    let f;
    beforeEach(async () => { f = await fixture(make); });
    afterEach(async () => { await f?.h.engine.close(); await f?.h.cleanup(); });

    async function refused(value, status = 'invalid') {
        const { expected, report } = await f.validate(value);
        expect(report.status).toBe(status);
        await expect(f.plans.publish(f.h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) })).rejects.toMatchObject({ code: 'native_orchestration_validation_stale' });
        return report;
    }

    async function modelDiamond() {
        const seeded = await seedGenerationProfiles({ ...f.h, endpoint: 'http://127.0.0.1:1/no-send' });
        const provider = createHttpGenerationProvider({ fetchImpl: async () => { throw new Error('Publication must not send'); } });
        const resolver = new RouteResolver({ persistence: seeded.persistence, library: seeded.library, providers: { 'provider.openai-compatible': provider } });
        const original = await seeded.persistence.getRuntimeRoute(f.h.handle, seeded.routes[0].runtimeRouteId), routes = [];
        for (const name of ['leaf', 'left', 'right', 'root']) {
            const runtimeRouteId = createNativeId('runtimeRoute');
            await seeded.persistence.saveRuntimeRoute(f.h.handle, { ...original, runtimeRouteId, displayName: name, role: 'role.narrator',
                executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests: 2, maxTokens: 2048 } } });
            routes.push(await seeded.persistence.getRuntimeRoute(f.h.handle, runtimeRouteId));
        }
        f.plans = createOrchestrationAuthoringService(f.h.engine, { modelResolver: resolver }).plans;
        const build = (route, children = []) => {
            const value = parentPlan(), node = value.definition.nodes[0]; node.kind = 'agent';
            node.capabilities = ['generation.send', ...(children.length ? ['agent.delegate'] : [])];
            node.dependencyPinIds = ['model.route', ...children.map((_child, index) => 'child.' + index)];
            node.policy = { agentPinId: 'model.route', ...(children.length ? { allowedPlanPinIds: children.map((_child, index) => 'child.' + index) } : {}) };
            value.definition.capabilityCeiling = [...node.capabilities];
            value.dependencyPins = [{ pinId: 'model.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, integrity: hash(route) },
                ...children.map((child, index) => pinOf(child, 'child.' + index))];
            return value;
        };
        const leaf = await f.publish(build(routes[0])), left = await f.publish(build(routes[1], [leaf])), right = await f.publish(build(routes[2], [leaf]));
        const calls = [], originalResolve = resolver.resolve;
        resolver.resolve = function (args) { calls.push(args.routeRef.runtimeRouteId); return originalResolve.call(this, args); };
        return { seeded, routes, leaf, left, right, calls, build, value: build(routes[3], [left, right]) };
    }

    test('same-owner exact immutable child closure publishes without any Run, budget or runtime grant', async () => {
        const child = await f.publish(planFixture()), value = parentPlan(child), result = await f.publish(value);
        expect(result.revision.dependencyPins).toEqual([pinOf(child)]);
        const mechanism = await f.h.engine.withTransaction(f.h.handle, tx => validateDelegationCapability({ handle: f.h.handle, tx,
            ...value, validateChild: args => f.plans.validateDependencies(args) }));
        expect(mechanism.issues).toEqual([]);
        expect(mechanism.evidence).toContainEqual(expect.objectContaining({ capability: 'agent.delegate', authority: 'native_plan_revision',
            runtimePrincipal: 'original_native_delegation_required' }));
        expect(await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))).toEqual([]);
    });

    test('grandchild then child then parent publish through the same original recursive readers', async () => {
        const grandchild = await f.publish(planFixture()), child = await f.publish(parentPlan(grandchild));
        const parent = await f.publish(parentPlan(child));
        expect(parent.revision.definition.capabilityCeiling).toEqual(['agent.delegate']);
        expect(child.revision.dependencyPins[0].resourceRef).toEqual(grandchild.planRef);
    });

    test('empty allowed pins is a valid explicit no-delegation profile, while an unbound ceiling remains unknown', async () => {
        const closed = await f.publish(parentPlan());
        expect(closed.revision.definition.nodes[0].policy.allowedPlanPinIds).toEqual([]);
        const unbound = planFixture(); unbound.definition.capabilityCeiling = ['agent.delegate'];
        await refused(unbound, 'unknown');
    });

    test.each(['missing', 'unlisted', 'wrong-port'])('%s allowed exact Plan pin cannot publish', async problem => {
        const child = await f.publish(planFixture()), value = parentPlan(child);
        if (problem === 'missing') value.dependencyPins = [];
        if (problem === 'unlisted') value.definition.nodes[0].dependencyPinIds = [];
        if (problem === 'wrong-port') value.dependencyPins[0].port = 'tool';
        const report = await refused(value);
        expect(report.issues).toContainEqual(expect.objectContaining({ code: 'native_orchestration_graph_invalid' }));
    });

    test.each(['stale-integrity', 'missing-revision', 'foreign-owner', 'wrong-output', 'node-capability', 'root-capability'])('%s child authority cannot publish', async problem => {
        const leaf = planFixture();
        if (problem === 'wrong-output') leaf.definition.outputContract.kind = 'rp_narration';
        if (['node-capability', 'root-capability'].includes(problem)) leaf.definition.capabilityCeiling = ['tool.unsupported'];
        const child = problem === 'foreign-owner' ? await f.storedRevision(leaf, 'different-owner')
            : ['node-capability', 'root-capability'].includes(problem) ? await f.storedRevision(leaf) : await f.publish(leaf);
        const value = parentPlan(child);
        if (problem === 'stale-integrity') value.dependencyPins[0].integrity = 'b'.repeat(64);
        if (problem === 'missing-revision') value.dependencyPins[0].resourceRef.planRevisionId = id('Revision');
        if (problem === 'node-capability') value.definition.capabilityCeiling.push('tool.unsupported');
        if (problem === 'root-capability') value.definition.nodes[0].capabilities.push('tool.unsupported');
        const report = await refused(value);
        expect(report.issues).toContainEqual(expect.objectContaining({ severity: 'blocking' }));
    });

    test('every original logical limit is bounded by the delegating Plan limit', async () => {
        const child = await f.publish(planFixture());
        for (const field of ORCHESTRATION_LIMIT_FIELDS) {
            const value = parentPlan(child); value.definition.limits[field] = 9;
            // The original fixture deadline is 60000 and every other cap 10.
            const report = await refused(value);
            expect(report.issues).toContainEqual(expect.objectContaining({ code: 'native_orchestration_child_authority_invalid' }));
        }
    });

    test('unsupported root and recursively referenced child capabilities remain unknown', async () => {
        const leaf = planFixture(); leaf.definition.capabilityCeiling = ['tool.unsupported'];
        const child = await f.storedRevision(leaf), value = parentPlan(child);
        value.definition.capabilityCeiling.push('tool.unsupported'); value.definition.nodes[0].capabilities.push('tool.unsupported');
        const report = await refused(value, 'unknown');
        expect(report.issues).toContainEqual(expect.objectContaining({ severity: 'unknown', fieldPath:
            'nodes.' + value.definition.nodes[0].nodeId + '.policy.allowedPlanPinIds.child.plan.capabilityCeiling.tool.unsupported' }));
    });

    test('nested exact model dependency is revalidated against its current original route without network', async () => {
        const seeded = await seedGenerationProfiles({ ...f.h, endpoint: 'http://127.0.0.1:1/no-send' }); let sends = 0;
        const provider = createHttpGenerationProvider({ fetchImpl: async () => { sends++; throw new Error('Publication must not send'); } });
        const resolver = new RouteResolver({ persistence: seeded.persistence, library: seeded.library, providers: { 'provider.openai-compatible': provider } });
        const old = await seeded.persistence.getRuntimeRoute(f.h.handle, seeded.routes[0].runtimeRouteId);
        await seeded.persistence.saveRuntimeRoute(f.h.handle, { ...old, role: 'role.narrator', executionPolicy: { schemaVersion: 1,
            allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests: 2, maxTokens: 2048 } } });
        const route = await seeded.persistence.getRuntimeRoute(f.h.handle, old.runtimeRouteId);
        const parentRouteId = createNativeId('runtimeRoute');
        await seeded.persistence.saveRuntimeRoute(f.h.handle, { ...route, runtimeRouteId: parentRouteId, displayName: 'Independent parent route' });
        const parentRoute = await seeded.persistence.getRuntimeRoute(f.h.handle, parentRouteId);
        f.plans = createOrchestrationAuthoringService(f.h.engine, { modelResolver: resolver }).plans;
        const modelPlan = (selectedRoute = route) => {
            const value = parentPlan(), node = value.definition.nodes[0]; node.kind = 'agent';
            node.capabilities = ['generation.send']; node.dependencyPinIds = ['model.route']; node.policy = { agentPinId: 'model.route' };
            value.definition.capabilityCeiling = ['generation.send'];
            value.dependencyPins = [{ pinId: 'model.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: selectedRoute.runtimeRouteId }, integrity: hash(selectedRoute) }];
            return value;
        };
        const child = await f.publish(modelPlan()), value = modelPlan(parentRoute), node = value.definition.nodes[0];
        value.definition.capabilityCeiling.push('agent.delegate'); node.capabilities.push('agent.delegate');
        node.policy.allowedPlanPinIds = ['child.plan']; node.dependencyPinIds.push('child.plan'); value.dependencyPins.push(pinOf(child));
        const { expected, report } = await f.validate(value); expect(report.status).toBe('valid');
        await seeded.persistence.saveRuntimeRoute(f.h.handle, { ...route, displayName: 'Changed original route' });
        expect(await seeded.persistence.getRuntimeRoute(f.h.handle, parentRouteId)).toEqual(parentRoute);
        const stale = await f.plans.validate(f.h.handle, expected);
        await expect(f.plans.publish(f.h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) })).rejects.toThrow();
        expect(stale.status).toBe('invalid');
        expect(stale.issues).toContainEqual(expect.objectContaining({ code: 'native_orchestration_dependency_stale', fieldPath:
            'nodes.' + node.nodeId + '.policy.allowedPlanPinIds.child.plan.dependencyPins.model.route' }));
        expect(sends).toBe(0);
    });

    test('diamond closure checks each shared child dependency once per validation and never caches across calls', async () => {
        const d = await modelDiamond(), { expected, report } = await f.validate(d.value);
        expect(report.status).toBe('valid'); expect(d.calls).toHaveLength(4);
        expect(d.calls.filter(routeId => routeId === d.routes[0].runtimeRouteId)).toHaveLength(1);
        d.calls.length = 0;
        await f.plans.publish(f.h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) });
        expect(d.calls).toHaveLength(4); expect(d.calls.filter(routeId => routeId === d.routes[0].runtimeRouteId)).toHaveLength(1);
        const root = await f.plans.get(f.h.handle, expected.planId);
        const current = { planId: root.planId, expectedDraftVersion: root.draftVersion, expectedDefinitionHash: root.definitionHash };
        d.calls.length = 0;
        await d.seeded.persistence.saveRuntimeRoute(f.h.handle, { ...d.routes[0], displayName: 'Only shared leaf changed' });
        expect(await d.seeded.persistence.getRuntimeRoute(f.h.handle, d.routes[3].runtimeRouteId)).toEqual(d.routes[3]);
        const stale = await f.plans.validate(f.h.handle, current);
        await expect(f.plans.publish(f.h.handle, id('Command'), { ...current, validationDigest: validationDigest(stale) })).rejects.toThrow();
        expect(stale.status).toBe('invalid');
        expect(stale.issues).toContainEqual(expect.objectContaining({ code: 'native_orchestration_dependency_stale' }));
    });

    test('a later narrower parent edge cannot reuse the shared child report to raise its own ceiling', async () => {
        const d = await modelDiamond();
        // This integrity-consistent persisted negative must be checked even
        // after the legal left branch has populated the child's memo entry.
        const narrow = { definition: structuredClone(d.right.revision.definition), dependencyPins: structuredClone(d.right.revision.dependencyPins), viewState: { positions: {} } };
        narrow.definition.limits.maxSteps = d.leaf.revision.definition.limits.maxSteps - 1;
        const right = await f.storedRevision(narrow), value = d.build(d.routes[3], [d.left, right]);
        const report = await refused(value);
        expect(report.issues).toContainEqual(expect.objectContaining({ code: 'native_orchestration_child_authority_invalid', fieldPath:
            'nodes.' + value.definition.nodes[0].nodeId + '.policy.allowedPlanPinIds.child.1.nodes.' + narrow.definition.nodes[0].nodeId + '.policy.allowedPlanPinIds.child.0' }));
        // validate and the rejected publish each have a fresh memo; the legal
        // first branch resolves the shared leaf once in each independent call.
        expect(d.calls.filter(routeId => routeId === d.routes[0].runtimeRouteId)).toHaveLength(2);
    });
});
