import { configureAgentGraph } from './rp-agent-graph-fixture.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';

export async function configureRetrievalAgentGraph(plan, args, shape = 'two-entries') {
    const next = { ...args.route, executionPolicy: { ...args.route.executionPolicy,
        computeBudget: { ...args.route.executionPolicy.computeBudget, maxRequests: 16 } } };
    await args.host.persistence.saveRuntimeRoute(args.h.handle, next);
    const route = await args.host.persistence.getRuntimeRoute(args.h.handle, next.runtimeRouteId);
    plan.dependencyPins[0].integrity = hash(route);
    await configureAgentGraph(plan, { ...args, route }, shape);
    const contextPins = plan.dependencyPins.filter(pin => pin.port === 'context').map(pin => pin.pinId);
    for (const node of plan.definition.nodes.filter(node => node.kind === 'agent'))
        node.dependencyPinIds = [...new Set([...node.dependencyPinIds, ...contextPins])];
    plan.definition.capabilityCeiling.push('memory.retrieve');
}
