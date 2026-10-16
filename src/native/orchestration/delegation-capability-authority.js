import { hashNativeDocument } from '../repositories/common.js';
import { readPlanRevision } from './plan-repository.js';
import { ORCHESTRATION_LIMIT_FIELDS } from '../../../public/shared/native-orchestration-contracts.js';

/** Exact immutable Plan closure evidence, never a delegation or audience grant. */
export async function validateDelegationCapability({ handle, tx, definition, dependencyPins, validateChild, ancestry = [], completedReports = new Map() }) {
    const evidence = [], issues = [], capability = 'agent.delegate';
    const nodes = definition.nodes.filter(node => node.capabilities.includes(capability));
    if (!nodes.length) issues.push({ code: 'native_orchestration_capability_authority_unavailable', severity: 'unknown', fieldPath: 'capabilityCeiling.agent.delegate' });
    for (const node of nodes) {
        const fieldPath = 'nodes.' + node.nodeId + '.policy.allowedPlanPinIds';
        if (!['agent', 'planner', 'judge', 'review', 'router'].includes(node.kind) || !Array.isArray(node.policy.allowedPlanPinIds)) {
            issues.push({ code: 'native_orchestration_delegation_dependency_invalid', severity: 'blocking', nodeId: node.nodeId, fieldPath });
            continue;
        }
        evidence.push({ capability, nodeId: node.nodeId, authority: 'native_plan_revision', allowedPlanPinIds: node.policy.allowedPlanPinIds,
            runtimePrincipal: 'original_native_delegation_required' });
        for (const pinId of node.policy.allowedPlanPinIds) {
            const pinPath = fieldPath + '.' + pinId;
            const pin = dependencyPins.find(item => item.pinId === pinId && item.port === 'plan' && node.dependencyPinIds.includes(pinId));
            if (!pin) {
                issues.push({ code: 'native_orchestration_delegation_dependency_invalid', severity: 'blocking', nodeId: node.nodeId, fieldPath: pinPath });
                continue;
            }
            let child;
            try { child = await readPlanRevision(tx, handle, pin.resourceRef); } catch (error) {
                if (!(error instanceof TypeError) && error.name !== 'NotFoundError' && error.code !== 'native_orchestration_revision_mismatch') throw error;
                issues.push({ code: 'native_orchestration_delegation_dependency_invalid', severity: 'blocking', nodeId: node.nodeId, fieldPath: pinPath });
                continue;
            }
            const integrity = hashNativeDocument(child), identity = hashNativeDocument(pin.resourceRef);
            if (integrity !== pin.integrity) {
                issues.push({ code: 'native_orchestration_dependency_stale', severity: 'blocking', nodeId: node.nodeId, fieldPath: 'dependencyPins.' + pinId });
                continue;
            }
            if (child.definition.outputContract.kind !== 'result'
                || child.definition.capabilityCeiling.some(item => !definition.capabilityCeiling.includes(item) || !node.capabilities.includes(item))
                || ORCHESTRATION_LIMIT_FIELDS.some(field => child.definition.limits[field] > definition.limits[field])) {
                issues.push({ code: 'native_orchestration_child_authority_invalid', severity: 'blocking', nodeId: node.nodeId, fieldPath: pinPath });
                continue;
            }
            if (ancestry.includes(identity)) {
                issues.push({ code: 'native_orchestration_delegation_dependency_cycle', severity: 'blocking', nodeId: node.nodeId, fieldPath: pinPath });
                continue;
            }
            if (typeof validateChild !== 'function') {
                issues.push({ code: 'native_orchestration_capability_authority_unavailable', severity: 'unknown', nodeId: node.nodeId, fieldPath: pinPath });
                continue;
            }
            // Immutable identity/current integrity and this parent's ceiling
            // were checked on every edge. Only the child's own completed
            // dependency report is reusable within this one validation call.
            const cacheKey = hashNativeDocument({ planRef: pin.resourceRef, integrity });
            let result = completedReports.get(cacheKey);
            if (!result) {
                result = await validateChild({ handle, tx, definition: child.definition, dependencyPins: child.dependencyPins }, [...ancestry, identity], completedReports);
                completedReports.set(cacheKey, result);
            }
            evidence.push({ capability, nodeId: node.nodeId, pinId, planRef: pin.resourceRef, integrity, definitionHash: child.definitionHash,
                dependencyDigest: result.dependencyDigest, status: result.status });
            if (result.status !== 'valid') issues.push({ code: 'native_orchestration_child_dependency_unavailable',
                severity: result.status === 'invalid' ? 'blocking' : 'unknown', nodeId: node.nodeId, fieldPath: pinPath });
            issues.push(...result.issues.map(issue => ({ ...issue, fieldPath: pinPath + '.' + issue.fieldPath })));
        }
    }
    return { evidence, issues };
}
