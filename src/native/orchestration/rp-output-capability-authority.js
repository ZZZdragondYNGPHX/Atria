import { RpRunControl } from '../rp-run-control.js';
import { assertResultPolicy } from '../../../public/shared/native-orchestration-contracts.js';

/** Publication checks a finite original writer mechanism, never an output grant. */
export function validateRpOutputCapability({ definition, rpControl, engine }) {
    const evidence = [], issues = [], fieldPath = 'capabilityCeiling.chat.output';
    const nodes = definition.nodes.filter(node => node.capabilities.includes('chat.output'));
    let policy;
    try { policy = assertResultPolicy(definition.outputContract); } catch (error) { if (!(error instanceof TypeError)) throw error; }
    if (!(rpControl instanceof RpRunControl) || rpControl._engine !== engine) {
        issues.push({ code: 'native_orchestration_capability_authority_unavailable', severity: 'unknown', fieldPath });
    } else if (definition.outputContract.kind !== 'rp_narration' || definition.outputContract.slot !== 'assistant'
        || definition.outputContract.allowPartial || policy?.outputType !== 'text' || nodes.length !== 1
        || nodes[0].kind !== 'output' || nodes[0].nodeId !== definition.outputContract.ownerNodeId
        || !definition.nodes.some(node => node.kind === 'agent' && node.capabilities.includes('generation.send'))) {
        issues.push({ code: 'native_orchestration_rp_output_policy_invalid', severity: 'blocking', fieldPath });
    } else {
        evidence.push({ capability: 'chat.output', nodeId: nodes[0].nodeId, authority: 'original_rp_control_chat_repo',
            outputKind: 'rp_narration', slot: 'assistant', policy, runtimePrincipal: 'original_rp_narrator_output_required' });
    }
    return { evidence, issues };
}
