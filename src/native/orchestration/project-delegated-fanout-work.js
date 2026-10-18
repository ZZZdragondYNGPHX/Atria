import { withNativeProjectDelegatedFanout } from './native-project-generation-authority.js';
import { readProjectDelegatedFanoutCompletion } from './project-delegated-fanout-contracts.js';
import { runDelegatedFanout } from './delegated-fanout-work.js';

/** Original Project capture and typed proof; Controller orchestration is shared. */
export function runProjectDelegatedFanout(args) {
    return runDelegatedFanout({ ...args, runWorkers: withNativeProjectDelegatedFanout, readCompletion: readProjectDelegatedFanoutCompletion,
        resolveNode: node => args.state.child.resolveModel(node), controlKind: 'native_project_delegated_control', reasonPrefix: 'project' });
}
