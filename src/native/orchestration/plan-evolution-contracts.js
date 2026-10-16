import { assertObject, assertCounter, assertDigest, assertPlanRef, assertSourceSelector } from '../../../public/shared/native-orchestration-contracts.js';
import { assertNativeId } from '../identity.js';
import { hashNativeDocument as hash } from '../repositories/common.js';

// First native strategy targets only tighten explicit Plan limits. Neither
// arbitrary paths nor capability/output/source/credential edits are proposals.
export const EVOLVABLE_PLAN_LIMITS = Object.freeze(['maxSteps', 'maxAttempts', 'maxReplans', 'maxReviews', 'maxDelegates', 'maxHandoffs',
    'maxEdgeVisits', 'maxLoopIterations', 'deadlineMs']);
export const planBindingIdentity = binding => ({ bindingId: binding.bindingId, sourceSelector: binding.sourceSelector, planRef: binding.planRef, version: binding.version });
export const planEvolutionCommandId = (operation, candidateId) => 'ocmd_' + hash({ operation: 'plan.evolution.' + operation, candidateId }).slice(0, 32);
export function assertPlanStrategyTarget(target) {
    assertObject(target, ['kind', 'bindingId', 'expectedBindingVersion', 'planRef', 'nodeId', 'fieldPath'], 'Plan strategy target');
    if (target.kind !== 'plan-strategy' || !EVOLVABLE_PLAN_LIMITS.some(field => target.fieldPath === 'limits.' + field)) throw new TypeError('Unsupported native Plan strategy field');
    assertDigest(target.bindingId, 'bindingId'); assertCounter(target.expectedBindingVersion, 'expectedBindingVersion');
    assertPlanRef(target.planRef); assertNativeId(target.nodeId, 'orchestrationNode'); return target;
}
export const planStrategyField = target => assertPlanStrategyTarget(target).fieldPath.slice('limits.'.length);
export const planDeclarationKey = target => hash({ bindingId: target.bindingId, nodeId: target.nodeId, fieldPath: target.fieldPath });
function assertBaseBinding(binding, target) {
    assertObject(binding, ['bindingId', 'sourceSelector', 'planRef', 'version'], 'Plan candidate Binding');
    assertSourceSelector(binding.sourceSelector); assertPlanRef(binding.planRef); assertCounter(binding.version, 'Binding version');
    if (binding.bindingId !== hash(binding.sourceSelector) || binding.bindingId !== target.bindingId || binding.version !== target.expectedBindingVersion
        || hash(binding.planRef) !== hash(target.planRef)) throw new TypeError('Invalid Plan candidate source Binding');
}
export function assertPlanEvolutionMetadata(value) {
    assertObject(value, ['declarations', 'candidates'], 'Plan evolution');
    if (!Array.isArray(value.declarations) || value.declarations.length > 16 || !Array.isArray(value.candidates) || value.candidates.length > 16)
        throw new TypeError('Plan evolution capacity exceeded');
    const declarations = new Set(), candidates = new Set();
    for (const declaration of value.declarations) {
        assertObject(declaration, ['target', 'binding'], 'Plan declaration'); assertPlanStrategyTarget(declaration.target);
        assertBaseBinding(declaration.binding, declaration.target);
        const key = planDeclarationKey(declaration.target);
        if (declarations.has(key)) throw new TypeError('Duplicate Plan declaration'); declarations.add(key);
    }
    for (const candidate of value.candidates) {
        assertObject(candidate, ['schemaVersion', 'candidateId', 'target', 'baseBinding', 'planRef', 'diff', 'declarationDigest'], 'Plan candidate');
        const { candidateId, planRef, ...seed } = candidate;
        assertPlanStrategyTarget(candidate.target); assertPlanRef(planRef); assertDigest(candidate.declarationDigest, 'declarationDigest');
        assertBaseBinding(candidate.baseBinding, candidate.target);
        assertObject(candidate.diff, ['field', 'before', 'after'], 'Plan strategy diff');
        assertCounter(candidate.diff.before, 'before'); assertCounter(candidate.diff.after, 'after');
        if (candidate.schemaVersion !== 1 || candidateId !== hash(seed) || candidates.has(candidateId)
            || candidate.diff.field !== candidate.target.fieldPath || candidate.diff.after >= candidate.diff.before
            || planRef.planId !== candidate.target.planRef.planId || planRef.planRevisionId !== 'oprev_' + candidateId.slice(0, 32))
            throw new TypeError('Invalid native Plan candidate');
        candidates.add(candidateId);
    }
    return value;
}
