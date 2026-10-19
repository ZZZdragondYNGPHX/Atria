import { createOrchestrationAuthoringService } from '../../src/native/orchestration/authoring-service.js';
import { validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { validateRetrievalCapability } from '../../src/native/orchestration/retrieval-capability-authority.js';
import { NativeRetrievalPersistence } from '../../src/native/retrieval-persistence.js';
import { retrievalRef } from '../../public/scripts/native/retrieval-contracts.js';
import { RouteResolver } from '../../src/native/model-prompt-runtime/route-resolver.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { seedGenerationProfiles } from '../native/helpers/generation-fixture.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

const id = kind => createNativeId('orchestration' + kind);
describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s original Retrieval Profile Plan pins', (_name, make) => {
    let h, seeded, service, retrieval, profiles, sends;
    beforeEach(async () => {
        h = await make(); await prepareControllerOwnerRoot(h.dirs.root);
        attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/no-model-send' }); sends = 0;
        const route = await seeded.persistence.getRuntimeRoute(h.handle, seeded.routes[0].runtimeRouteId);
        await seeded.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { schemaVersion: 1,
            allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests: 4, maxTokens: 32000 } } });
        const provider = createHttpGenerationProvider({ fetchImpl: async () => { sends++; throw new Error('Validation must not send'); } });
        const modelResolver = new RouteResolver({ persistence: seeded.persistence, library: seeded.library, providers: { 'provider.openai-compatible': provider } });
        service = createOrchestrationAuthoringService(h.engine, { modelResolver }); retrieval = new NativeRetrievalPersistence({ engine: h.engine });
        profiles = ['embed', 'rerank'].map(mode => ({ retrievalProfileId: createNativeId('retrievalProfile'), revision: createNativeId('revision'), displayName: 'Private ' + mode,
            mode, source: mode === 'embed' ? 'openai' : 'custom', model: 'private-model-' + mode, endpoint: 'http://127.0.0.1:1/private-' + mode,
            secretRef: { secretId: 'unread-private-secret' }, headers: { 'User-Agent': 'Private test client' }, options: {} }));
        for (const profile of profiles) await retrieval.commit(h.handle, profile);
    });
    afterEach(async () => { await h?.engine.close(); await h?.cleanup(); });
    async function input(selected = profiles) {
        const plan = planFixture(), output = plan.definition.nodes[0], nodeId = id('Node');
        plan.definition.nodes = [{ nodeId, kind: 'agent', label: 'Original Memory consumer', inputs: [], outputs: [{ name: 'text', type: 'text', required: false }],
            dependencyPinIds: ['route', ...selected.map(profile => profile.mode)], capabilities: ['generation.send', 'memory.retrieve'], policy: { agentPinId: 'route' } },
        { ...output, inputs: [{ name: 'text', type: 'text', required: true }] }];
        plan.definition.entryNodeIds = [nodeId]; plan.definition.capabilityCeiling = ['generation.send', 'memory.retrieve'];
        plan.definition.edges = [{ edgeId: id('Edge'), from: { nodeId, port: 'text' }, to: { nodeId: output.nodeId, port: 'text' }, condition: 'always', maxVisits: 1, loopBack: false }];
        const route = await seeded.persistence.getRuntimeRoute(h.handle, seeded.routes[0].runtimeRouteId);
        plan.dependencyPins = [{ pinId: 'route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, integrity: hash(route) },
            ...selected.map(profile => ({ pinId: profile.mode, port: 'context', resourceRef: retrievalRef(profile), integrity: hash(profile) }))];
        return plan;
    }
    async function validate(plan) {
        const draft = await service.plans.create(h.handle, id('Command'), plan);
        const expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
        return { expected, report: await service.plans.validate(h.handle, expected) };
    }
    test.each(['embed', 'rerank', 'both'])('%s exact pins publish pure mechanism evidence with zero Secret/send/bank work', async selected => {
        const plan = await input(selected === 'both' ? profiles : profiles.filter(profile => profile.mode === selected));
        const result = await validateRetrievalCapability({ handle: h.handle, ...plan, retrieval });
        expect(result.issues).toEqual([]);
        expect(result.evidence).toHaveLength(selected === 'both' ? 2 : 1);
        expect(result.evidence.every(item => item.runtimePrincipal === 'original_native_context_retrieval_required')).toBe(true);
        const { expected, report } = await validate(plan); expect(report.status).toBe('valid');
        await expect(service.plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) })).resolves.toHaveProperty('planRef');
        const inspected = await service.dependencies.inspect(h.handle, { pinId: 'embed', port: 'context', resourceRef: retrievalRef(profiles[0]) });
        expect(inspected.integrity).toBe(hash(profiles[0]));
        const serialized = JSON.stringify({ report, inspected, result });
        for (const text of ['unread-private-secret', 'private-model-embed', 'private-embed', 'Private test client']) expect(serialized).not.toContain(text);
        expect(sends).toBe(0);
        expect(await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: 'atri_orchestration_run', handle: h.handle }))).toEqual([]);
    });
    test.each(['missing-pin', 'unowned-pin', 'wrong-port', 'wrong-integrity', 'missing-revision', 'extra-endpoint', 'extra-api-key', 'ambiguous-mode'])('%s cannot publish a retrieval capability', async problem => {
        const plan = await input();
        if (problem === 'missing-pin') { plan.dependencyPins = plan.dependencyPins.slice(0, 1); plan.definition.nodes[0].dependencyPinIds = ['route']; }
        if (problem === 'unowned-pin') plan.definition.nodes[0].dependencyPinIds = ['route'];
        if (problem === 'wrong-port') for (const pin of plan.dependencyPins.slice(1)) pin.port = 'evaluation';
        if (problem === 'wrong-integrity') plan.dependencyPins[1].integrity = hash('stale');
        if (problem === 'missing-revision') plan.dependencyPins[1].resourceRef.revision = createNativeId('revision');
        if (problem === 'extra-endpoint') plan.dependencyPins[1].resourceRef.endpoint = 'http://127.0.0.1:1/injected';
        if (problem === 'extra-api-key') plan.dependencyPins[1].resourceRef.apiKey = 'caller-cannot-supply';
        if (problem === 'ambiguous-mode') {
            plan.dependencyPins.push({ ...plan.dependencyPins[1], pinId: 'second-embed' }); plan.definition.nodes[0].dependencyPinIds.push('second-embed');
        }
        const { expected, report } = await validate(plan); expect(report.status).toBe('invalid');
        await expect(service.plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) })).rejects.toThrow(); expect(sends).toBe(0);
    });
    test('new Profile revision cannot silently replace an old exact pin', async () => {
        const plan = await input(), next = { ...profiles[0], revision: createNativeId('revision'), endpoint: 'http://127.0.0.1:1/new-endpoint' };
        await retrieval.commit(h.handle, next);
        expect((await validate(plan)).report.status).toBe('valid');
        plan.dependencyPins[1].resourceRef = retrievalRef(next);
        expect((await validate(plan)).report.status).toBe('invalid');
        plan.dependencyPins[1].integrity = hash(next);
        expect((await validate(plan)).report.status).toBe('valid'); expect(sends).toBe(0);
    });
    test.each(['transformers', 'webllm'])('%s lacks the scoped server Provider mechanism and remains unknown', async source => {
        const profile = { ...profiles[0], source, endpoint: '', revision: createNativeId('revision') };
        delete profile.secretRef; delete profile.headers;
        await retrieval.commit(h.handle, profile);
        const { expected, report } = await validate(await input([profile])); expect(report.status).toBe('unknown');
        await expect(service.plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) })).rejects.toThrow(); expect(sends).toBe(0);
    });
});
