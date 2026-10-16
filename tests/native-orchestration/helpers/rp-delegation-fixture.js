import { rpModelFixture } from './rp-model-fixture.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { validationDigest } from '../../../src/native/orchestration/plan-repository.js';
import { planFixture } from '../fixtures.js';

const id = kind => createNativeId('orchestration' + kind);

function textPlan(route, { delegatePin = null } = {}) {
    const plan = planFixture(), output = plan.definition.nodes[0], nodeId = id('Node');
    plan.definition.nodes = [{ nodeId, kind: 'agent', label: delegatePin ? 'RP parent' : 'RP isolated child', inputs: [],
        outputs: [{ name: 'response', type: 'text', required: false }], dependencyPinIds: ['rp.model', ...(delegatePin ? ['rp.child'] : [])],
        capabilities: ['generation.send', ...(delegatePin ? ['agent.delegate'] : [])],
        policy: { agentPinId: 'rp.model', ...(delegatePin ? { allowedPlanPinIds: ['rp.child'] } : {}) } },
    { ...output, inputs: [{ name: 'response', type: 'text', required: true }] }];
    plan.definition.entryNodeIds = [nodeId]; plan.definition.capabilityCeiling = plan.definition.nodes[0].capabilities;
    plan.definition.edges = [{ edgeId: id('Edge'), from: { nodeId, port: 'response' }, to: { nodeId: output.nodeId, port: 'response' },
        condition: 'always', maxVisits: 1, loopBack: false }];
    plan.definition.limits.maxSteps = 50; plan.definition.limits.maxConcurrency = 1;
    plan.definition.outputContract.resultPolicy = { outputType: 'text', maxBytes: 65536 };
    plan.dependencyPins = [{ pinId: 'rp.model', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, integrity: hash(route) },
        ...(delegatePin ? [{ pinId: 'rp.child', port: 'plan', resourceRef: delegatePin.planRef, integrity: hash(delegatePin.revision) }] : [])];
    return plan;
}

async function publish(plans, handle, plan) {
    const draft = await plans.create(handle, id('Command'), plan);
    const expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
    const report = await plans.validate(handle, expected);
    if (report.status !== 'valid') throw new Error(JSON.stringify(report.issues));
    return (await plans.publish(handle, id('Command'), { ...expected, validationDigest: validationDigest(report) })).planRef;
}

/** Real RP/HTTP/Scheduler fixture. Authored caps are explicit test policy. */
export async function rpDelegationFixture(make, options = {}) {
    const f = await rpModelFixture(make, options);
    try {
        const parentRoute = await f.persistence.getRuntimeRoute(f.h.handle, f.input.routeRef.runtimeRouteId);
        const draftRoute = { ...parentRoute, runtimeRouteId: createNativeId('runtimeRoute'),
            executionPolicy: { ...parentRoute.executionPolicy, computeBudget: { maxRequests: 1, maxTokens: 50000,
                localWork: { maxJobs: 16, maxItems: 5000, maxInputBytes: 8388608 } } } };
        options.configureChildRoute?.(draftRoute);
        await f.persistence.saveRuntimeRoute(f.h.handle, draftRoute);
        const childRoute = await f.persistence.getRuntimeRoute(f.h.handle, draftRoute.runtimeRouteId);
        const childPlan = textPlan(childRoute); options.configureChildPlan?.(childPlan);
        const childPlanRef = await publish(f.plans, f.h.handle, childPlan);
        const childRevision = await f.plans.getRevision(f.h.handle, childPlanRef);
        const parentPlan = textPlan(parentRoute, { delegatePin: { planRef: childPlanRef, revision: childRevision } });
        const planRef = await publish(f.plans, f.h.handle, parentPlan);
        const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector);
        await f.plans.saveBinding(f.h.handle, id('Command'), { sourceSelector: f.sourceSelector, planRef, expectedVersion: binding.version });
        return { ...f, planRef, childPlanRef, parentPlan, childPlan, parentRoute, childRoute };
    } catch (error) { await f.cleanup(); throw error; }
}
