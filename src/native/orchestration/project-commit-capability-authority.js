import { ProjectAgentService } from '../project-agent.js';

/** Publication evidence only. The actual user request, review, current Source
 * and one-use Effect approval remain independent runtime requirements. */
export function validateProjectCommitCapability({ definition, dependencyPins, projectAgent }) {
    const capability = 'project.commit';
    const nodes = definition.nodes.filter(node => node.capabilities.includes(capability));
    const valid = projectAgent instanceof ProjectAgentService && nodes.length > 0 && nodes.every(node => node.kind === 'effect'
        && node.dependencyPinIds.includes(node.policy.actionPinId)
        && dependencyPins.some(pin => pin.pinId === node.policy.actionPinId && pin.port === 'project'
            && pin.resourceRef.kind === 'native_project_commit'));
    return { evidence: [{ capability, status: valid ? 'available' : 'invalid' }], issues: valid ? [] : [
        { code: 'native_orchestration_project_commit_pin_required', severity: 'blocking', fieldPath: 'capabilityCeiling.' + capability },
    ] };
}
