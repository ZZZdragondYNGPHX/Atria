import { modelPortFixture } from './model-port-fixture.js';
import { configureSessionOutput } from './session-output-fixture.js';
import { planFixture } from '../fixtures.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { createOrchestrationAuthoringService } from '../../../src/native/orchestration/authoring-service.js';
import { validationDigest } from '../../../src/native/orchestration/plan-repository.js';
import { RouteResolver } from '../../../src/native/model-prompt-runtime/route-resolver.js';
import { createResponsesGenerationProvider } from '../../../src/native/adapters/responses-generation-provider.js';
import { readAudienceSource } from '../../../src/native/orchestration/audience-source-contracts.js';

const id = kind => createNativeId('orchestration' + kind);
const port = (name, type, required = true) => ({ name, type, required });
const edge = (from, to, input) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: from.outputs[0].name },
    to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits: 1, loopBack: false });

/** Real original Host/Plan/Source/HTTP/Scheduler/quota and bank, with synthetic model bodies. */
export async function sessionDelegationFixture(make, { childSteps = 2, foreignActor = false, childRequests = childSteps, maxConcurrency = 1, childFailure = null, childUsage = true, upstreamAudience = null, parentRequests = null, configureChild = async () => {}, configureParent = async () => {}, responsePayload = null, responseUsage = null, responseStatus = null } = {}) {
    if (![1, 2].includes(childSteps)) throw new TypeError('This necessary fixture has one/two authored child tasks');
    let topology;
    const f = await modelPortFixture(make, {
        ...(responseStatus ? { responseStatus } : childFailure ? { responseStatus: () => childFailure === 'unknown' ? null : 503 } : {}),
        configurePlan: async args => {
            configureSessionOutput(args);
            const { plan, h, seeded, core, base } = args, narrator = plan.definition.nodes[0], output = plan.definition.nodes[1];
            const originalParentRoute = await seeded.persistence.getRuntimeRoute(h.handle, seeded.routes[0].runtimeRouteId);
            const parentRoute = { ...originalParentRoute,
                executionPolicy: { ...originalParentRoute.executionPolicy, schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId],
                    computeBudget: { maxRequests: parentRequests ?? childSteps + 2 + (upstreamAudience ? 1 : 0), maxTokens: 64000,
                        localWork: { maxJobs: 256, maxItems: 10000, maxInputBytes: 16777216 } } } };
            await seeded.persistence.saveRuntimeRoute(h.handle, parentRoute);
            plan.dependencyPins[0].integrity = hash(parentRoute);
            const actorA = { kind: 'actor', id: base.manifest.actors[0].actorId }, actorB = { kind: 'actor', id: base.manifest.actors[1].actorId };
            const sourcePin = async (pinId, audience) => {
                const resourceRef = { kind: 'native_information_context', anchor: 'run_source', sessionId: base.session.sessionId, audience };
                return { pinId, port: 'context', resourceRef, integrity: hash((await readAudienceSource(h.handle, resourceRef, core)).descriptor) };
            };
            const parentSource = await sourcePin('delegate.actor', actorA), finalSource = await sourcePin('narrator.source', { kind: 'narrator' });
            const childSource = await sourcePin('delegate.actor', foreignActor ? actorB : actorA);
            const childModel = { ...seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'session-delegated-distinct-model' };
            await seeded.persistence.saveModelProfile(h.handle, childModel);
            const childRoute = { ...parentRoute, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: childModel.modelProfileId },
                executionPolicy: { ...parentRoute.executionPolicy, allowedModelProfileIds: [childModel.modelProfileId],
                    computeBudget: { maxRequests: childRequests, maxTokens: 16000, localWork: { maxJobs: 128, maxItems: 5000, maxInputBytes: 8388608 } } } };
            await seeded.persistence.saveRuntimeRoute(h.handle, childRoute);
            const child = planFixture(), childOutput = child.definition.nodes[0];
            const children = Array.from({ length: childSteps }, (_, index) => ({ nodeId: id('Node'), kind: 'agent', label: 'Delegate child Actor A task ' + index,
                inputs: index ? [port('previous', 'text')] : [], outputs: [port('advice', 'text', false)],
                dependencyPinIds: ['child.model', childSource.pinId], capabilities: ['generation.send'],
                policy: { agentPinId: 'child.model', audiencePinId: childSource.pinId } }));
            childOutput.inputs = [port('result', 'text')]; childOutput.outputs = []; childOutput.capabilities = []; childOutput.dependencyPinIds = [];
            child.definition.nodes = [...children, childOutput]; child.definition.entryNodeIds = [children[0].nodeId];
            child.definition.edges = [...children.slice(1).map((node, index) => edge(children[index], node, 'previous')), edge(children.at(-1), childOutput, 'result')];
            child.definition.capabilityCeiling = ['generation.send'];
            child.definition.outputContract = { ...child.definition.outputContract, kind: 'result', ownerNodeId: childOutput.nodeId,
                slot: 'task_result', allowPartial: false, resultPolicy: { outputType: 'text', maxBytes: 65536 } };
            child.dependencyPins = [{ pinId: 'child.model', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: childRoute.runtimeRouteId }, integrity: hash(childRoute) }, childSource];
            Object.assign(plan.definition.limits, { maxSteps: 300, maxAttempts: 16, maxNodes: 16, maxEdges: 24, maxEdgeVisits: 32,
                maxDepth: 3, maxDelegates: 4, maxHandoffs: 4, maxConcurrency, deadlineMs: 300000 });
            child.definition.limits = { ...plan.definition.limits, maxSteps: 64, maxAttempts: childSteps + 1, maxNodes: childSteps + 1,
                maxEdges: childSteps, maxEdgeVisits: childSteps, maxDepth: 1, maxDelegates: 0, maxHandoffs: 0 };
            await configureChild(child, args);
            const resolver = new RouteResolver({ persistence: seeded.persistence, library: seeded.library,
                providers: { 'provider.openai-responses': createResponsesGenerationProvider() } });
            const { plans } = createOrchestrationAuthoringService(h.engine, { sessionCore: core, modelResolver: resolver });
            const draft = await plans.create(h.handle, id('Command'), child), expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
            const report = await plans.validate(h.handle, expected);
            if (report.status !== 'valid') throw new Error(JSON.stringify(report.issues));
            const { planRef: childPlanRef } = await plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) });
            const childRevision = await plans.getRevision(h.handle, childPlanRef);
            const delegator = { nodeId: id('Node'), kind: 'agent', label: 'Game source-scoped delegate parent', inputs: [], outputs: [port('advice', 'text', false)],
                dependencyPinIds: ['narrator.route', parentSource.pinId, 'delegate.child'], capabilities: ['generation.send', 'agent.delegate'],
                policy: { agentPinId: 'narrator.route', audiencePinId: parentSource.pinId, allowedPlanPinIds: ['delegate.child'] } };
            narrator.inputs = [port('advice', 'text')]; narrator.dependencyPinIds.push(finalSource.pinId); narrator.policy.audiencePinId = finalSource.pinId;
            plan.definition.nodes = [delegator, narrator, output]; plan.definition.entryNodeIds = [delegator.nodeId];
            plan.definition.edges = [edge(delegator, narrator, 'advice'), ...plan.definition.edges];
            let upstream;
            if (upstreamAudience) {
                const source = upstreamAudience === 'actor' ? parentSource : finalSource;
                upstream = { nodeId: id('Node'), kind: 'agent', label: 'Original upstream evidence producer', inputs: [], outputs: [port('advice', 'text', false)],
                    dependencyPinIds: ['narrator.route', source.pinId], capabilities: ['generation.send'],
                    policy: { agentPinId: 'narrator.route', audiencePinId: source.pinId } };
                delegator.inputs = [port('upstream', 'text')];
                plan.definition.nodes.unshift(upstream); plan.definition.entryNodeIds = [upstream.nodeId];
                plan.definition.edges.unshift(edge(upstream, delegator, 'upstream'));
            }
            plan.definition.capabilityCeiling.push('agent.delegate');
            plan.dependencyPins.push(parentSource, finalSource, { pinId: 'delegate.child', port: 'plan', resourceRef: childPlanRef, integrity: hash(childRevision) });
            topology = { delegator, upstream, narrator, output, child, children, childOutput, childPlanRef, parentSource, childSource, parentRoute, childRoute, actorA, actorB };
            await configureParent(plan, { ...args, plans }, topology);
        },
        responseBody: async ({ body, index }) => ({ id: 'delegate-fixture-' + index, status: 'completed', output: [{ id: 'message-' + index,
            type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text',
                text: responsePayload ? await responsePayload(body, index, topology) : body.model === 'session-delegated-distinct-model' ? 'DELEGATED_ADVICE_' + index : JSON.stringify(body.input).includes('Original upstream evidence producer')
                    ? 'ORIGINAL_UPSTREAM_EVIDENCE_BODY' : JSON.stringify(body.input).includes('Game source-scoped delegate parent')
                        ? 'PARENT_ACCEPTED_DELEGATE_ADVICE' : 'The NPC waits for the player choice.', annotations: [] }] }], ...((responseUsage ? await responseUsage(body, index, topology) : childUsage) ? { usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } } : {}) }),
    });
    return { ...f, get effectRef() { return f.effectRef; }, get authority() { return f.authority; }, get core() { return f.core; }, topology };
}
