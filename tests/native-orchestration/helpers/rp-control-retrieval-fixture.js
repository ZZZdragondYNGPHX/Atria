import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';

/** Declare the same original Profiles and sufficient original Route allowances
 * before Plan publication. Never adjusts an already charged operation. */
export async function configureControlRetrieval(plan, args) {
    const pins = plan.dependencyPins.filter(pin => pin.port === 'context').map(pin => pin.pinId);
    for (const node of plan.definition.nodes.filter(node => node.kind !== 'output')) {
        node.capabilities = ['generation.send', 'memory.retrieve'];
        node.dependencyPinIds = [...new Set([...node.dependencyPinIds, ...pins])];
    }
    plan.definition.capabilityCeiling.push('memory.retrieve');
    for (const pin of plan.dependencyPins.filter(pin => pin.port === 'model')) {
        const route = await args.host.persistence.getRuntimeRoute(args.h.handle, pin.resourceRef.runtimeRouteId);
        await args.host.persistence.saveRuntimeRoute(args.h.handle, { ...route, executionPolicy: { ...route.executionPolicy,
            computeBudget: { ...route.executionPolicy.computeBudget, maxRequests: 16,
                localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs: 48 } } } });
        pin.integrity = hash(await args.host.persistence.getRuntimeRoute(args.h.handle, route.runtimeRouteId));
    }
}
