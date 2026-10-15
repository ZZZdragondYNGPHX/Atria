import { createOrchestrationAuthoringService } from '../../src/native/orchestration/authoring-service.js';
import { validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { RouteResolver } from '../../src/native/model-prompt-runtime/route-resolver.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { seedGenerationProfiles } from '../native/helpers/generation-fixture.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { validateModelCapability } from '../../src/native/orchestration/model-capability-authority.js';

const id = kind => createNativeId('orchestration' + kind);

const mechanisms = [['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]]
    .flatMap(([name, make]) => ['narrator', 'intent_resolver'].map(role => [name, role, make]));
describe.each(mechanisms)('%s original %s mechanism validation', (_name, role, make) => {
    let h, seeded, service, sends, route, modelResolver;
    beforeEach(async () => {
        h = await make(); await prepareControllerOwnerRoot(h.dirs.root);
        attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/no-send' }); sends = 0;
        const provider = createHttpGenerationProvider({ fetchImpl: async () => { sends++; throw new Error('Publication must not send'); } });
        modelResolver = new RouteResolver({ persistence: seeded.persistence, library: seeded.library, providers: { 'provider.openai-compatible': provider } });
        service = createOrchestrationAuthoringService(h.engine, { modelResolver });
        route = await seeded.persistence.getRuntimeRoute(h.handle, seeded.routes[0].runtimeRouteId);
        await seeded.persistence.saveRuntimeRoute(h.handle, { ...route, role: 'role.' + role, executionPolicy: { schemaVersion: 1,
            allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests: 2, maxTokens: 2048 } } });
        route = await seeded.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId);
    });
    afterEach(async () => { await h?.engine.close(); await h?.cleanup(); });
    function input() {
        const plan = planFixture(), output = plan.definition.nodes[0], nodeId = id('Node');
        plan.definition.nodes = [{ nodeId, kind: 'agent', label: 'Native ' + role, inputs: [], outputs: [{ name: 'text', type: 'text', required: false }],
            dependencyPinIds: ['narrator.route'], capabilities: ['generation.send'], policy: { agentPinId: 'narrator.route' } },
        { ...output, inputs: [{ name: 'text', type: 'text', required: true }] }];
        plan.definition.entryNodeIds = [nodeId]; plan.definition.capabilityCeiling = ['generation.send'];
        plan.definition.edges = [{ edgeId: id('Edge'), from: { nodeId, port: 'text' }, to: { nodeId: output.nodeId, port: 'text' }, condition: 'always', maxVisits: 1, loopBack: false }];
        plan.dependencyPins = [{ pinId: 'narrator.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, integrity: hash(route) }];
        return plan;
    }
    async function validate(value = input(), plans = service.plans) {
        const draft = await plans.create(h.handle, id('Command'), value);
        const expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
        return { expected, report: await plans.validate(h.handle, expected) };
    }
    test('exact original route and resources provide bounded mechanism evidence with no network or runtime grant', async () => {
        const { expected, report } = await validate();
        expect(report).toMatchObject({ status: 'valid', issues: [] });
        const plan = input(), mechanism = await validateModelCapability({ handle: h.handle, ...plan, resolver: modelResolver });
        expect(mechanism.issues).toEqual([]);
        expect(mechanism.evidence).toEqual([expect.objectContaining({ capability: 'generation.send',
            runtimePrincipal: role === 'intent_resolver' ? 'original_native_intent_resolver_required' : 'original_native_narrator_required' })]);
        await expect(service.plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) })).resolves.toHaveProperty('planRef');
        expect(sends).toBe(0);
        // No executable endpoint, budget admission, Source or Actor proof is
        // obtained by publishing a reusable Plan mechanism.
        expect(Object.keys(service)).toEqual(['plans', 'hostBootId']);
        expect(await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: 'atri_orchestration_run', handle: h.handle }))).toEqual([]);
    });
    test.each(['missing-resolver', 'unrecognized-capability', 'tools-ceiling', 'planner', 'unbound-ceiling'])('%s stays unknown and cannot publish', async problem => {
        const plan = input(); let plans = service.plans;
        if (problem === 'missing-resolver') plans = createOrchestrationAuthoringService(h.engine).plans;
        if (problem === 'unrecognized-capability') plan.definition.capabilityCeiling.push('tool.unknown');
        if (problem === 'tools-ceiling') plan.definition.capabilityCeiling.push('generation.tools');
        if (problem === 'planner') plan.definition.nodes[0].kind = 'planner';
        if (problem === 'unbound-ceiling') plan.definition.nodes[0].capabilities = [];
        const { expected, report } = await validate(plan, plans);
        expect(report.status).toBe('unknown');
        await expect(plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) })).rejects.toThrow();
        expect(sends).toBe(0);
    });
    test.each(['different-role', 'stale-route', 'fallback', 'unknown-provider', 'missing-resource', 'missing-budget'])('%s cannot invent a supported original role authority', async problem => {
        const plan = input();
        if (problem === 'different-role') {
            await seeded.persistence.saveRuntimeRoute(h.handle, { ...route, role: 'role.actor' });
            plan.dependencyPins[0].integrity = hash(await seeded.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId));
        }
        if (problem === 'stale-route') await seeded.persistence.saveRuntimeRoute(h.handle, { ...route, displayName: 'Changed' });
        if (problem === 'fallback') {
            const fallback = { ...route, runtimeRouteId: createNativeId('runtimeRoute') }; await seeded.persistence.saveRuntimeRoute(h.handle, fallback);
            route = { ...route, fallbackRouteRefs: [{ scope: 'player', runtimeRouteId: fallback.runtimeRouteId }] };
            await seeded.persistence.saveRuntimeRoute(h.handle, route); plan.dependencyPins[0].integrity = hash(await seeded.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId));
        }
        if (problem === 'unknown-provider') await seeded.persistence.saveConnectionProfile(h.handle, { ...seeded.connection, providerAdapter: 'provider.unregistered' });
        if (problem === 'missing-budget') {
            const { computeBudget: _budget, ...executionPolicy } = route.executionPolicy;
            await seeded.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy });
            plan.dependencyPins[0].integrity = hash(await seeded.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId));
        }
        if (problem === 'missing-resource') {
            const missing = { ...route, promptProgramRef: { ...route.promptProgramRef, revision: 'absent' } };
            await seeded.persistence.saveRuntimeRoute(h.handle, missing); plan.dependencyPins[0].integrity = hash(await seeded.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId));
        }
        const { expected, report } = await validate(plan);
        expect(['invalid', 'unknown']).toContain(report.status);
        await expect(service.plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) })).rejects.toThrow();
        expect(sends).toBe(0);
    });
    test('a caller role cannot replace the original pinned role or become a runtime principal', async () => {
        const plan = input();
        plan.definition.nodes[0].policy.role = 'role.' + role;
        await expect(validate(plan)).rejects.toThrow();
        const unsupported = { ...route, role: 'role.unknown' };
        await seeded.persistence.saveRuntimeRoute(h.handle, unsupported);
        delete plan.definition.nodes[0].policy.role;
        plan.dependencyPins[0].integrity = hash(await seeded.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId));
        const mechanism = await validateModelCapability({ handle: h.handle, ...plan, resolver: modelResolver, role: 'role.' + role });
        expect(mechanism.evidence).toEqual([]);
        expect(mechanism.issues).toEqual([expect.objectContaining({ severity: 'unknown' })]);
        expect(sends).toBe(0);
    });
    if (role === 'intent_resolver') test.each(['unknown', 'unsupported'])('original resolver tools %s evidence cannot publish', async state => {
        if (state === 'unknown') {
            await seeded.persistence.saveConnectionProfile(h.handle, { ...seeded.connection, providerAdapter: 'provider.raw-text' });
            modelResolver = new RouteResolver({ persistence: seeded.persistence, library: seeded.library,
                providers: { 'provider.raw-text': createHttpGenerationProvider({ format: 'raw-text', fetchImpl: async () => { sends++; throw new Error('Publication must not send'); } }) } });
            service = createOrchestrationAuthoringService(h.engine, { modelResolver });
        } else {
            await seeded.persistence.saveModelProfile(h.handle, { ...seeded.model, capabilities: [{ capability: 'generation.tools', state: 'unsupported',
                provenance: [{ kind: 'adapter-metadata', source: 'Actual model mechanism does not support tools' }] }] });
        }
        const { expected, report } = await validate();
        expect(report.status).toBe(state === 'unknown' ? 'unknown' : 'invalid');
        await expect(service.plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) })).rejects.toThrow();
        expect(sends).toBe(0);
    });
    test('original path/resource evidence changes validationDigest despite the same exact route reference', async () => {
        const { expected, report } = await validate();
        await seeded.persistence.saveConnectionProfile(h.handle, { ...seeded.connection, endpoint: 'http://127.0.0.1:2/changed-path' });
        const next = await service.plans.validate(h.handle, expected);
        expect(next.status).toBe('valid'); expect(next.dependencyDigest).not.toBe(report.dependencyDigest);
        await expect(service.plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) })).rejects.toThrow();
        expect(sends).toBe(0);
    });
});
