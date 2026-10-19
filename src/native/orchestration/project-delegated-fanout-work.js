import { withNativeProjectDelegatedFanout } from './native-project-generation-authority.js';
import { readProjectDelegatedFanoutCompletion } from './project-delegated-fanout-contracts.js';
import { runDelegatedFanout } from './delegated-fanout-work.js';
import { inspectProjectFanoutCostClosure } from './project-fanout-contracts.js';
import { projectFanoutReplan } from './project-fanout-planner-contracts.js';

/** Original Project capture and typed proof; Controller orchestration is shared. */
export function runProjectDelegatedFanout(args) {
    const delegation = model => model.delegatedSelection ?? args.state.child.resolveDelegation(model.node);
    return runDelegatedFanout({ ...args, runWorkers: withNativeProjectDelegatedFanout, readCompletion: readProjectDelegatedFanoutCompletion,
        resolveNode: async node => ({ ...await args.state.child.resolveModel(node), delegatedSelection: args.state.child.resolveDelegation(node) }),
        resolveResources: async model => [...new Set((await Promise.all([model, ...delegation(model)?.resourceProfiles ?? []]
            .map(profile => args.state.host.executionResources(args.state.handle, profile.resolved.route)))).flat())],
        requestsForNode: model => 1 + (delegation(model)?.ceiling.maxRequests ?? 0),
        inspectClosure: input => inspectProjectFanoutCostClosure({ ...input, service: args.service, handle: args.state.handle }),
        replan: input => projectFanoutReplan({ ...input, service: args.service, handle: args.state.handle,
            requestsForNode: node => 1 + (args.state.child.resolveDelegation(node)?.ceiling.maxRequests ?? 0) }),
        controlKind: 'native_project_delegated_control', reasonPrefix: 'project' });
}
