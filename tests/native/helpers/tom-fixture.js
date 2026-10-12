import { installAppraisalFixture } from './appraisal-fixture.js';
import { TOM_OUTPUT_SCHEMA, hypothesisStateSchema } from '../../../public/shared/native-tom-contract.js';

const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const string = maxLength => ({ type: 'string', maxLength });
export const tomCandidate = (f, depth = 1) => ({ significance: 'appraise', rationale: '仅根据阿岚已听到的澄清，提出阿岚自己的不确定解释。', updates: [], hypotheses: [
    { key: 'share-next', perspective: [f.otherActorId], text: '阿岚猜测沈墨可能愿意继续澄清，但这仍只是阿岚的推测。', confidence: 60,
        prediction: { itemId: 'behaviors:next', expected: 'share' }, sourceItemIds: ['events:contact'] },
    ...(depth === 2 ? [{ key: 'view-of-aran', perspective: [f.otherActorId, f.actorId], text: '阿岚猜测沈墨或许以为阿岚仍对传闻有所保留；沈墨的真实想法尚不明确。', confidence: 40,
        prediction: { itemId: '', expected: '' }, sourceItemIds: ['events:contact'] }] : []),
] });

export async function installTomFixture(h, { maxDepth = 1, maxNodes = 4, maxUpdates = 4, publicHypotheses = false, publicBehavior = true, promptBody = null, configure = null } = {}) {
    const f = await installAppraisalFixture(h, { promptBody, configure: setup => {
        const { contract, actorId, otherActorId } = setup, info = contract.informationRuntime;
        const behaviorSchema = object({ actor: string(64), target: string(64), text: string(2048), action: { ...string(128), enum: ['', 'share', 'withhold'] }, observed: { type: 'boolean' } });
        const behaviorInitial = { actor: actorId, target: otherActorId, text: '', action: '', observed: false };
        contract.lifecycleRuntime.domains.push({ id: 'behaviors', scopeId: 'session', schemaVersion: 1, recordSchema: behaviorSchema, initial: behaviorInitial,
            commands: [{ id: 'save', argsSchema: behaviorSchema, event: 'behavior.observed', assign: Object.fromEntries(Object.keys(behaviorInitial).map(key => [key, { formula: 'args.' + key }])) }],
            retention: { maxItems: 32, maxLogicalBytes: 65536, keepPinned: true, keepReferenced: true } });
        info.sources.push({ id: 'behaviors', kind: 'application', semantic: 'truth', scopeId: 'session', domainId: 'behaviors', actorField: 'actor', fields: [['text'], ['target'], ['action'], ['observed']] });
        const hypothesisPolicy = { id: 'author-tom', revision: 'v1', maxDepth, maxNodes, maxUpdates, behaviorSourceIds: ['behaviors'],
            targetField: 'target', outcomeField: 'action', observedField: 'observed', confidenceOnContradiction: 0 };
        const common = contract.lifecycleRuntime.domains.find(domain => domain.id === 'emotions').initial;
        const recordSchema = hypothesisStateSchema(), initial = { actor: actorId, key: 'default', target: otherActorId, perspective: [otherActorId], text: 'Author hypothesis baseline',
            confidence: 50, status: 'active', prediction: { itemId: '', expected: '' }, policy: { id: hypothesisPolicy.id, revision: hypothesisPolicy.revision },
            basis: common.basis, appraisal: common.appraisal };
        contract.lifecycleRuntime.domains.push({ id: 'hypotheses', scopeId: 'session', schemaVersion: 1, recordSchema, initial,
            commands: [{ id: 'save', argsSchema: recordSchema, event: 'hypothesis.saved', assign: Object.fromEntries(Object.keys(initial).map(key => [key, { formula: 'args.' + key }])) }],
            retention: { maxItems: 64, maxLogicalBytes: 262144, keepPinned: true, keepReferenced: true } });
        const source = { id: 'hypotheses', kind: 'application', semantic: 'theory_of_mind', scopeId: 'session', domainId: 'hypotheses', actorField: 'actor', statusField: 'status',
            fields: ['text', 'key', 'target', 'perspective', 'confidence', 'prediction'].map(field => [field]), hypothesisPolicy };
        info.sources.push(source, { ...source, id: 'public-hypotheses', fields: [['text']] });
        for (const view of info.views.filter(view => view.exposure.includes('context'))) view.sources = [...view.sources, 'behaviors', 'hypotheses', 'public-hypotheses'];
        const player = info.views.find(view => view.id === 'player');
        if (publicBehavior) player.sources.push('behaviors');
        if (publicHypotheses) player.sources.push('public-hypotheses');
        const variant = contract.taskRuntime.tasks[0].variants[0]; variant.outputSchema = TOM_OUTPUT_SCHEMA;
        variant.resultBinding.theory = { sourceId: 'hypotheses', domainId: 'hypotheses', commandId: 'save' };
        configure?.(setup);
    } });
    await f.write('behaviors', 'next', { text: '后续沟通尚无已观察行为。' });
    return f;
}
