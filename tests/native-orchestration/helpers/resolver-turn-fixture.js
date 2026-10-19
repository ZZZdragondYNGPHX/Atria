import { modelPortFixture } from './model-port-fixture.js';
import { runFixture } from '../../native/helpers/run-fixture.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';

// Real original Session/Package/Plan/Host/Responses lease and resolver selection.
// Only the upstream HTTP response is synthetic. No authority rules are copied.
export async function resolverTurnFixture(make, { changeSource = () => {}, configurePlan = async () => {}, responseBody = null, ...options } = {}) {
    let selection, resolverRoute, resolverNodeId, resolverEdgeId, resolverRouteId;
    const fixture = await modelPortFixture(make, { ...options, createSource: async h => {
        const original = await runFixture(h, 'http://127.0.0.1:1/unused', changeSource);
        let snapshot = await original.begin();
        snapshot = await original.core.appendTimeline(h.handle, snapshot.session.sessionId, { role: 'user', content: 'Update the note.' });
        selection = original.selection;
        resolverRouteId = original.seeded.routes.find(route => route.role === 'role.intent_resolver').runtimeRouteId;
        return { ...original, snapshot };
    }, responseBody: async args => responseBody ? responseBody({ ...args, selection }) : {
        id: 'resolver-native-response-' + args.index, status: 'completed',
        output: args.body.tools?.length ? [{ id: 'resolver-native-function', type: 'function_call', status: 'completed',
            call_id: 'resolver-call', name: 'atri_transaction_0', arguments: JSON.stringify(selection.input) }]
            : [{ id: 'resolver-narrator-message', type: 'message', status: 'completed', role: 'assistant',
                content: [{ type: 'output_text', text: 'Synthetic native narrator response.', annotations: [] }] }],
        usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 },
    }, configurePlan: async args => {
        const { h, seeded, plan, route, narratorNodeId } = args;
        await seeded.persistence.saveModelProfile(h.handle, { ...seeded.model, capabilities: [{ capability: 'generation.tools', state: 'supported',
            provenance: [{ kind: 'user-override', source: 'Synthetic test model tools capability' }] }] });
        await seeded.persistence.saveRuntimeRoute(h.handle, { ...route, runtimeRouteId: resolverRouteId, role: 'role.intent_resolver', displayName: 'Original intent resolver', requirements: ['generation.tools'] });
        resolverRoute = await seeded.persistence.getRuntimeRoute(h.handle, resolverRouteId);
        resolverNodeId = createNativeId('orchestrationNode'); resolverEdgeId = createNativeId('orchestrationEdge');
        const narrator = plan.definition.nodes.find(node => node.nodeId === narratorNodeId);
        narrator.inputs = [{ name: 'selection', type: 'json', required: true }];
        plan.definition.nodes.unshift({ nodeId: resolverNodeId, kind: 'agent', label: 'Original intent resolver', inputs: [],
            outputs: [{ name: 'selection', type: 'json', required: true }], dependencyPinIds: ['resolver.route'], capabilities: ['generation.send'], policy: { agentPinId: 'resolver.route' } });
        plan.definition.entryNodeIds = [resolverNodeId];
        plan.definition.edges.unshift({ edgeId: resolverEdgeId, from: { nodeId: resolverNodeId, port: 'selection' }, to: { nodeId: narratorNodeId, port: 'selection' },
            condition: 'always', maxVisits: 1, loopBack: false });
        plan.dependencyPins.push({ pinId: 'resolver.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: resolverRouteId }, integrity: hash(resolverRoute) });
        await configurePlan({ ...args, resolverRoute, resolverNodeId, resolverEdgeId });
    } });
    // runFixture also seeds its unbound Narrator. The original native explicit
    // selector chooses this Plan's exact route; Resolver has one original root.
    fixture.input.routeRef = { scope: 'player', runtimeRouteId: fixture.route.runtimeRouteId };
    return Object.assign(fixture, { selection, resolverRoute, resolverNodeId, resolverEdgeId });
}
