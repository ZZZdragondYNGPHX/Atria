import { modelPortFixture as fixture } from './helpers/model-port-fixture.js';
import { NativeNarratorOrchestrationAuthority } from '../../src/native/orchestration/native-turn-orchestration.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

const command = () => createNativeId('orchestrationCommand');
const exactSelector = f => ({ ...f.sourceSelector, entryPointId: f.base.session.entryPointId });
async function publish(f, change) {
    const input = structuredClone(f.plan); change(input);
    const root = await f.plans.create(f.h.handle, command(), input);
    const expected = { planId: root.planId, expectedDraftVersion: root.draftVersion, expectedDefinitionHash: root.definitionHash };
    const report = await f.plans.validate(f.h.handle, expected);
    expect(report.status).toBe('valid');
    return (await f.plans.publish(f.h.handle, command(), { ...expected, validationDigest: validationDigest(report) })).planRef;
}
const roots = f => f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s original Native Turn orchestration scope', (_name, make) => {
    test('exact entrypoint Binding wins over the Session default and stores only logical input metadata', async () => {
        const f = await fixture(make);
        try {
            const planRef = await publish(f, plan => { plan.definition.nodes[0].label = 'Exact entrypoint narrator'; });
            await f.plans.saveBinding(f.h.handle, command(), { sourceSelector: exactSelector(f), planRef, expectedVersion: null });
            f.input.routeRef = { scope: 'player', runtimeRouteId: f.route.runtimeRouteId };
            await f.start(); expect(f.requests).toHaveLength(1);
            const [{ doc: run }] = await roots(f);
            expect(run.planRef).toEqual(planRef); expect(run.status).not.toBe('completed'); expect(run.outputClaims).toEqual([]);
            const records = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: run.runId }));
            const effect = records.find(row => row.key.recordType === 'effect').doc;
            expect(effect).toMatchObject({ status: 'confirmed', inputRef: { kind: 'native_turn_intent', role: 'narrator', planRef,
                sourceRef: { revisionId: f.base.revision.revisionId, packageVersionId: f.base.session.packageVersionId } } });
            expect(effect.inputHash).toBe(hash(effect.inputRef));
            expect(JSON.stringify(records)).not.toMatch(/synthetic-model-secret|Synthetic native narrator response\.|system\.foundation|promptIr|contextPlan/);
            expect(records.some(row => ['request', 'result', 'output'].includes(row.key.recordType))).toBe(false);
        } finally { await f.cleanup(); }
    });

    test('an unsupported exact Binding cannot fall through to a valid default or charge a Provider', async () => {
        const f = await fixture(make);
        try {
            const planRef = await publish(f, plan => { plan.definition.graphChangePolicy = { allowedOperations: ['addNode'], allowedNodeKinds: ['agent'] }; });
            await f.plans.saveBinding(f.h.handle, command(), { sourceSelector: exactSelector(f), planRef, expectedVersion: null });
            await expect(f.start()).rejects.toMatchObject({ code: 'native_orchestration_turn_plan_unavailable' });
            expect(f.requests).toHaveLength(0); expect(await roots(f)).toHaveLength(0);
        } finally { await f.cleanup(); }
    });

    test.each(['project_review', 'agent_input'])('unsupported %s graph semantics cannot become a Native narrator permission', async scenario => {
        const f = await fixture(make);
        try {
            const planRef = await publish(f, plan => {
                if (scenario === 'project_review') plan.definition.outputContract.kind = 'project_review';
                else plan.definition.nodes[0].inputs = [{ name: 'unused', type: 'text', required: false }];
            });
            await f.plans.saveBinding(f.h.handle, command(), { sourceSelector: exactSelector(f), planRef, expectedVersion: null });
            await expect(f.start()).rejects.toMatchObject({ code: 'native_orchestration_turn_plan_unavailable' });
            expect(f.requests).toHaveLength(0); expect(await roots(f)).toHaveLength(0);
        } finally { await f.cleanup(); }
    });

    test('no Binding leaves original Native generation available without initializing a V3 execution authority', async () => {
        const f = await fixture(make);
        try {
            await f.h.engine.withTransaction(f.h.handle, tx => tx.deleteResource({ kind: K.orchestrationBinding, handle: f.h.handle, bindingId: hash(f.sourceSelector) }));
            // A resolver/Plan/ModelPort is intentionally absent. The original
            // Native path still owns this unbound Turn, not an old mode shim.
            f.host.turnOrchestration = new NativeNarratorOrchestrationAuthority({ engine: f.h.engine, sessionCore: f.core });
            expect((await f.start()).timeline.at(-1).content).toBe('Synthetic native narrator response.');
            expect(f.requests).toHaveLength(1); expect(await roots(f)).toHaveLength(0);
        } finally { await f.cleanup(); }
    });

    test.each(['binding', 'route'])('%s changes after pure preflight and before local work refuse the sealed selection', async change => {
        const f = await fixture(make);
        try {
            const prepare = f.authority.prepareNarrator.bind(f.authority);
            f.authority.prepareNarrator = async args => {
                if (change === 'binding') await f.plans.saveBinding(f.h.handle, command(), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: 0 });
                else await f.seeded.persistence.saveRuntimeRoute(f.h.handle, { ...f.route, displayName: 'Changed after source capture' });
                return prepare(args);
            };
            await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(0); expect(await roots(f)).toHaveLength(0);
        } finally { await f.cleanup(); }
    });

    test.each(['explicit', 'default'])('%s native route selection must match the Plan pin before Scheduler admission', async selection => {
        const f = await fixture(make);
        try {
            const other = { ...f.route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: 'Another original narrator',
                fallbackRouteRefs: selection === 'default' ? [{ scope: 'player', runtimeRouteId: f.route.runtimeRouteId }] : [] };
            await f.seeded.persistence.saveRuntimeRoute(f.h.handle, other);
            if (selection === 'explicit') f.input.routeRef = { scope: 'player', runtimeRouteId: other.runtimeRouteId };
            // The default case makes the pinned route a fallback of the other
            // route: Native selection has exactly one different root route.
            await expect(f.start()).rejects.toMatchObject({ code: 'native_orchestration_turn_route_mismatch' });
            expect(f.requests).toHaveLength(0); expect(await roots(f)).toHaveLength(0);
        } finally { await f.cleanup(); }
    });

    test.each(['foreign_scope', 'unknown_field'])('caller route %s cannot alter the original pinned resource domain', async scenario => {
        const f = await fixture(make);
        try {
            f.input.routeRef = { scope: 'player', runtimeRouteId: f.route.runtimeRouteId };
            if (scenario === 'foreign_scope') f.input.routeRef.scope = 'package';
            else f.input.routeRef.approved = true;
            await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(0); expect(await roots(f)).toHaveLength(0);
        } finally { await f.cleanup(); }
    });

    test.each(['stage', 'interpreter', 'narrator_task'])('%s-bound packages refuse before any Task producer runs', async scenario => {
        const f = await fixture(make, { changeContract: contract => {
            const task = contract.taskRuntime.tasks[0];
            task.executionClass = 'turn_blocking';
            if (scenario === 'stage') {
                task.resultPolicy = { resultClass: 'turn_context', sink: 'turn' };
                contract.lifecycleRuntime.workflows = [];
                contract.taskRuntime.turn.stages = ['summarize'];
            } else if (scenario === 'narrator_task') contract.taskRuntime.turn.narratorTaskId = 'summarize';
            else {
                task.resultPolicy = { resultClass: 'world_outcome_proposal', sink: 'proposal' };
                task.interpretation = { id: 'outcome', instruction: 'Semantic classification only', allowedEventTypes: ['healed'], confidenceThreshold: 0.7 };
                contract.taskRuntime.turn.policy = 'narrative-outcome'; contract.taskRuntime.turn.interpreterTaskId = 'summarize';
            }
        } });
        try {
            await expect(f.start()).rejects.toMatchObject({ code: 'native_orchestration_turn_scope_unavailable' });
            expect(f.requests).toHaveLength(0); expect(await roots(f)).toHaveLength(0);
        } finally { await f.cleanup(); }
    });

    test.each(['memory', 'input'])('caller %s cannot replace the frozen original input/audience', async scenario => {
        const f = await fixture(make);
        try {
            if (scenario === 'memory') f.input.hostMemoryEvidence = [{ content: 'UNTRUSTED MEMORY' }];
            else f.input.userInput = 'UNCOMMITTED PLAYER INPUT';
            await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(0); expect(await roots(f)).toHaveLength(0);
        } finally { await f.cleanup(); }
    });
});
