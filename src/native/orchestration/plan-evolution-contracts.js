import { assertObject, assertCounter, assertDigest, assertPlanRef, assertSourceSelector, nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';
import { assertExactResourceRef } from '../model-prompt-runtime/contracts.js';
import { assertNativeId } from '../identity.js';
import { equalNativeDocuments, hashNativeDocument as hash } from '../repositories/common.js';

// Native strategies tighten limits or select an already declared exact route. Neither
// arbitrary paths nor capability/output/source/credential edits are proposals.
export const EVOLVABLE_PLAN_LIMITS = Object.freeze(['maxSteps', 'maxAttempts', 'maxReplans', 'maxReviews', 'maxDelegates', 'maxHandoffs',
    'maxEdgeVisits', 'maxLoopIterations', 'deadlineMs']);
export const planBindingIdentity = binding => ({ bindingId: binding.bindingId, sourceSelector: binding.sourceSelector, planRef: binding.planRef, version: binding.version });
export const planEvolutionCommandId = (operation, candidateId) => 'ocmd_' + hash({ operation: 'plan.evolution.' + operation, candidateId }).slice(0, 32);
export function assertPlanStrategyTarget(target) {
    assertObject(target, ['kind', 'bindingId', 'expectedBindingVersion', 'planRef', 'nodeId', 'fieldPath'], 'Plan strategy target');
    if (target.kind !== 'plan-strategy' || !(target.fieldPath === 'reviewPolicy.maxRounds' || target.fieldPath === 'routeRef'
        || EVOLVABLE_PLAN_LIMITS.some(field => target.fieldPath === 'limits.' + field))) throw new TypeError('Unsupported native Plan strategy field');
    assertDigest(target.bindingId, 'bindingId'); assertCounter(target.expectedBindingVersion, 'expectedBindingVersion');
    assertPlanRef(target.planRef); assertNativeId(target.nodeId, 'orchestrationNode'); return target;
}
export function assertPlanPromptTarget(target) {
    assertObject(target, ['kind', 'bindingId', 'expectedBindingVersion', 'planRef', 'nodeId', 'promptModuleRef'], 'Plan prompt target');
    if (target.kind !== 'plan-prompt') throw new TypeError('Invalid native Plan prompt target');
    assertDigest(target.bindingId, 'bindingId'); assertCounter(target.expectedBindingVersion, 'expectedBindingVersion');
    assertPlanRef(target.planRef); assertNativeId(target.nodeId, 'orchestrationNode');
    const ref = assertExactResourceRef(target.promptModuleRef, 'core.prompt-module');
    if (ref.scope !== 'library' || !equalNativeDocuments(ref, target.promptModuleRef)) throw new TypeError('Exact Library Prompt module required');
    return target;
}
export const assertPlanEvolutionTarget = target => target?.kind === 'plan-prompt' ? assertPlanPromptTarget(target) : assertPlanStrategyTarget(target);
export const planStrategyField = target => assertPlanStrategyTarget(target).fieldPath === 'reviewPolicy.maxRounds' ? 'maxRounds'
    : target.fieldPath === 'routeRef' ? 'routeRef' : target.fieldPath.slice('limits.'.length);
export const planStrategyMinimum = target => ['maxSteps', 'maxAttempts', 'deadlineMs', 'maxRounds'].includes(planStrategyField(target)) ? 1 : 0;
export function assertPlanRouteValue(value) {
    assertObject(value, ['scope', 'runtimeRouteId'], 'Plan route selection');
    if (value.scope !== 'player') throw new TypeError('Plan route selection requires an original player Route');
    assertNativeId(value.runtimeRouteId, 'runtimeRoute'); return value;
}
export function planNodeRouteChoices(definition, dependencyPins, nodeId) {
    const node = definition.nodes.find(node => node.nodeId === nodeId);
    if (!['agent', 'planner', 'judge', 'review'].includes(node?.kind) || !node.capabilities.includes('generation.send')) return [];
    const refs = nodeModelRoutePins(node, dependencyPins)
        .map(pin => assertPlanRouteValue(pin.resourceRef));
    return [...new Map(refs.map(ref => [hash(ref), ref])).values()];
}
function strategyOwner(definition, target) {
    assertPlanStrategyTarget(target);
    if (target.fieldPath !== 'reviewPolicy.maxRounds') return definition.limits;
    const node = definition.nodes.find(node => node.nodeId === target.nodeId);
    if (node?.kind !== 'review') throw new TypeError('Plan Review strategy requires the exact original Review node');
    return node.policy;
}
export const readPlanStrategyValue = (definition, target, dependencyPins = []) => {
    if (assertPlanStrategyTarget(target).fieldPath !== 'routeRef') return strategyOwner(definition, target)[planStrategyField(target)];
    const choices = planNodeRouteChoices(definition, dependencyPins, target.nodeId), node = definition.nodes.find(node => node.nodeId === target.nodeId);
    const pin = dependencyPins.find(pin => pin.pinId === node?.policy.agentPinId);
    if (choices.length < 2 || !choices.some(ref => equalNativeDocuments(ref, pin?.resourceRef))) throw new TypeError('Plan route strategy requires declared node alternatives');
    return pin.resourceRef;
};
export function applyPlanStrategyValue(definition, target, value, dependencyPins = []) {
    if (assertPlanStrategyTarget(target).fieldPath === 'routeRef') {
        assertPlanRouteValue(value); readPlanStrategyValue(definition, target, dependencyPins);
        const choices = planNodeRouteChoices(definition, dependencyPins, target.nodeId);
        if (!choices.some(ref => equalNativeDocuments(ref, value))) throw new TypeError('Plan route candidate is outside the original node pins');
        const node = definition.nodes.find(node => node.nodeId === target.nodeId);
        node.policy.agentPinId = dependencyPins.find(pin => pin.port === 'model' && node.dependencyPinIds.includes(pin.pinId) && equalNativeDocuments(pin.resourceRef, value)).pinId;
        return;
    }
    assertCounter(value, 'candidate strategy', planStrategyMinimum(target));
    strategyOwner(definition, target)[planStrategyField(target)] = value;
}
export const planDeclarationKey = target => hash({ bindingId: target.bindingId, nodeId: target.nodeId, kind: target.kind, ...(target.kind === 'plan-prompt' ? { promptModuleRef: target.promptModuleRef } : { fieldPath: target.fieldPath }) });
function assertBaseBinding(binding, target) {
    assertObject(binding, ['bindingId', 'sourceSelector', 'planRef', 'version'], 'Plan candidate Binding');
    assertSourceSelector(binding.sourceSelector); assertPlanRef(binding.planRef); assertCounter(binding.version, 'Binding version');
    if (binding.bindingId !== hash(binding.sourceSelector) || binding.bindingId !== target.bindingId || binding.version !== target.expectedBindingVersion
        || !equalNativeDocuments(binding.planRef, target.planRef)) throw new TypeError('Invalid Plan candidate source Binding');
}
export function assertPlanEvolutionMetadata(value) {
    assertObject(value, ['declarations', 'candidates'], 'Plan evolution');
    if (!Array.isArray(value.declarations) || value.declarations.length > 16 || !Array.isArray(value.candidates) || value.candidates.length > 16)
        throw new TypeError('Plan evolution capacity exceeded');
    const declarations = new Set(), candidates = new Set();
    for (const declaration of value.declarations) {
        assertObject(declaration, ['target', 'binding'], 'Plan declaration'); assertPlanEvolutionTarget(declaration.target);
        assertBaseBinding(declaration.binding, declaration.target);
        const key = planDeclarationKey(declaration.target);
        if (declarations.has(key)) throw new TypeError('Duplicate Plan declaration'); declarations.add(key);
    }
    for (const candidate of value.candidates) {
        assertObject(candidate, ['schemaVersion', 'candidateId', 'target', 'baseBinding', 'planRef', 'diff', 'declarationDigest', ...(candidate.target?.kind === 'plan-prompt' ? ['promptCandidateRef'] : [])], 'Plan candidate');
        const { candidateId, planRef, ...seed } = candidate;
        assertPlanEvolutionTarget(candidate.target); assertPlanRef(planRef); assertDigest(candidate.declarationDigest, 'declarationDigest');
        assertBaseBinding(candidate.baseBinding, candidate.target);
        assertObject(candidate.diff, ['field', 'before', 'after'], 'Plan strategy diff');
        const prompt = candidate.target.kind === 'plan-prompt';
        if (prompt) {
            assertObject(candidate.promptCandidateRef, ['presetId', 'candidateId'], 'Original Prompt candidate ref');
            assertNativeId(candidate.promptCandidateRef.presetId, 'promptProgram'); assertDigest(candidate.promptCandidateRef.candidateId, 'candidateId');
            for (const body of [candidate.diff.before, candidate.diff.after])
                if (typeof body !== 'string' || Buffer.byteLength(body, 'utf8') > 65536) throw new TypeError('Invalid Plan prompt body');
        } else if (candidate.target.fieldPath === 'routeRef') {
            assertPlanRouteValue(candidate.diff.before); assertPlanRouteValue(candidate.diff.after);
        } else {
            assertCounter(candidate.diff.before, 'before', planStrategyMinimum(candidate.target));
            assertCounter(candidate.diff.after, 'after', planStrategyMinimum(candidate.target));
        }
        if (candidate.schemaVersion !== 1 || candidateId !== hash(seed) || candidates.has(candidateId)
            || candidate.diff.field !== (prompt ? 'body' : candidate.target.fieldPath)
            || (prompt || candidate.target.fieldPath === 'routeRef' ? equalNativeDocuments(candidate.diff.after, candidate.diff.before) : candidate.diff.after >= candidate.diff.before)
            || planRef.planId !== candidate.target.planRef.planId || planRef.planRevisionId !== 'oprev_' + candidateId.slice(0, 32))
            throw new TypeError('Invalid native Plan candidate');
        candidates.add(candidateId);
    }
    return value;
}
