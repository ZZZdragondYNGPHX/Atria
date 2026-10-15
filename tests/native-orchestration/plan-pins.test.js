import { createOrchestrationAuthoringService } from '../../src/native/orchestration/authoring-service.js';
import { readPlanRevision, validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { assertPlanDefinition } from '../../public/shared/native-orchestration-contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument, putMutable } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { seedGenerationProfiles } from '../native/helpers/generation-fixture.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

const command = () => createNativeId('orchestrationCommand');
const harnesses = CONTRACT_HARNESSES.filter(item => ['FsEngine', 'SqliteEngine'].includes(item.name) || process.env.ATRIA_TEST_PLAN_PINS_SQL === '1');

describe.each(harnesses)('$name original PlanRevision pin authority', ({ make }) => {
    let h, plans, leaf, pin;
    beforeEach(async () => {
        h = await make(); await prepareControllerOwnerRoot(h.dirs.root);
        attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        ({ plans } = createOrchestrationAuthoringService(h.engine));
        leaf = await publish(planFixture());
        const revision = await h.engine.withTransaction(h.handle, tx => readPlanRevision(tx, h.handle, leaf));
        pin = { pinId: 'child', port: 'plan', resourceRef: leaf, integrity: hashNativeDocument(revision) };
    });
    afterEach(async () => { await h?.engine.close(); await h?.cleanup(); });
    async function validate(fixture, owner = h.handle) {
        const created = await plans.create(owner, command(), fixture);
        const input = { planId: created.planId, expectedDraftVersion: created.draftVersion, expectedDefinitionHash: created.definitionHash };
        return { input, report: await plans.validate(owner, input) };
    }
    async function publish(fixture, owner = h.handle) {
        const { input, report } = await validate(fixture, owner);
        return (await plans.publish(owner, command(), { ...input, validationDigest: validationDigest(report) })).planRef;
    }
    const parent = selected => ({ ...planFixture(), dependencyPins: [selected] });
    function agent(routePin) {
        const fixture = parent(pin), output = fixture.definition.nodes[0], nodeId = createNativeId('orchestrationNode');
        fixture.definition.nodes.unshift({ nodeId, kind: 'agent', label: 'Declared delegation', inputs: [], outputs: [{ name: 'next', type: 'task.result', required: false }],
            dependencyPinIds: ['route', 'child'], capabilities: ['agent.delegate'], policy: { agentPinId: 'route', allowedPlanPinIds: ['child'] } });
        output.inputs = [{ name: 'in', type: 'task.result', required: true }];
        fixture.definition.edges.push({ edgeId: createNativeId('orchestrationEdge'), from: { nodeId, port: 'next' }, to: { nodeId: output.nodeId, port: 'in' }, condition: 'always', maxVisits: 1, loopBack: false });
        fixture.definition.entryNodeIds = [nodeId]; fixture.definition.capabilityCeiling = ['agent.delegate']; fixture.dependencyPins.push(routePin);
        return fixture;
    }

    test('real production authoring validates and publishes the same-owner immutable Plan pin', async () => {
        const planRef = await publish(parent(pin));
        const revision = await h.engine.withTransaction(h.handle, tx => readPlanRevision(tx, h.handle, planRef));
        expect(revision.dependencyPins).toEqual([pin]);
    });

    test.each(['missing', 'hash', 'integrity', 'foreign-author'])('%s child references cannot pass production publication', async problem => {
        const selected = structuredClone(pin);
        if (problem === 'missing') selected.resourceRef.planId = createNativeId('orchestrationPlan');
        if (problem === 'foreign-author') {
            const revision = await h.engine.withTransaction(h.handle, tx => readPlanRevision(tx, h.handle, leaf));
            const foreign = { ...revision, authorRef: { handle: 'foreign-owner' } };
            await h.engine.withTransaction(h.handle, tx => putMutable(tx, { kind: K.orchestrationRevision, handle: h.handle,
                planId: leaf.planId, planRevisionId: leaf.planRevisionId }, foreign));
            selected.integrity = hashNativeDocument(foreign);
        }
        if (problem === 'hash') selected.resourceRef.definitionHash = 'b'.repeat(64);
        if (problem === 'integrity') selected.integrity = 'b'.repeat(64);
        const { input, report } = await validate(parent(selected));
        expect(report.status).toBe('invalid');
        expect(report.issues.some(item => item.fieldPath === 'dependencyPins.child')).toBe(true);
        await expect(plans.publish(h.handle, command(), { ...input, validationDigest: validationDigest(report) })).rejects.toThrow();
    });

    test('a valid exact child pin does not turn an unavailable runtime capability into a grant', async () => {
        const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/unused' });
        const routePin = { pinId: 'route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId }, integrity: hashNativeDocument(seeded.routes[0]) };
        const { report } = await validate(agent(routePin));
        expect(report.status).toBe('unknown');
        expect(report.issues).toEqual([expect.objectContaining({ code: 'native_orchestration_capability_authority_unavailable', fieldPath: 'capabilityCeiling.agent.delegate' })]);
    });

    test('delegating node schemas require explicit listed Plan pins without defaults or wildcard matching', () => {
        const routePin = { pinId: 'route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: createNativeId('runtimeRoute') }, integrity: 'a'.repeat(64) };
        const fixture = agent(routePin), node = fixture.definition.nodes[0];
        expect(() => assertPlanDefinition(fixture.definition, fixture.dependencyPins)).not.toThrow();
        delete node.policy.allowedPlanPinIds;
        expect(() => assertPlanDefinition(fixture.definition, fixture.dependencyPins)).toThrow('allowedPlanPinIds');
        node.policy.allowedPlanPinIds = [];
        expect(() => assertPlanDefinition(fixture.definition, fixture.dependencyPins)).not.toThrow();
        node.policy.allowedPlanPinIds = ['child']; node.dependencyPinIds = ['route'];
        expect(() => assertPlanDefinition(fixture.definition, fixture.dependencyPins)).toThrow('exact Plan dependency pin');
        node.dependencyPinIds = ['route', 'child']; fixture.dependencyPins[0].port = 'model';
        expect(() => assertPlanDefinition(fixture.definition, fixture.dependencyPins)).toThrow('exact Plan dependency pin');
    });
});
