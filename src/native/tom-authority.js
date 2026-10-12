import { isCognitionSource, informationItemFingerprint } from '../../public/shared/native-cognition-runtime.js';
import { hypothesisShapeValid } from '../../public/shared/native-tom-contract.js';
import { hashNativeDocument } from './repositories/common.js';

const contains = (value, target) => value === target || Boolean(value && typeof value === 'object' && Object.values(value).some(value => contains(value, target)));
const definition = base => base.manifest.runtime.experienceContract.informationRuntime;
const leavesOf = projection => new Map(projection.items.filter(item => !isCognitionSource(item) && item.semantic !== 'rollup').map(item => [item.id, item]));

export function validateHypothesisEvidence(base, source, value, projection, previous, records) {
    if (!hypothesisShapeValid(source, value)) throw new TypeError('Hypothesis depth, subject or policy denied');
    if (previous && (previous.key !== value.key || hashNativeDocument(previous.perspective) !== hashNativeDocument(value.perspective))) throw new TypeError('Hypothesis subject is immutable');
    const owned = records.filter(record => record.value.actor === value.actor);
    if (owned.length > source.hypothesisPolicy.maxNodes || owned.filter(record => record.value.key === value.key).length > 1) throw new TypeError('Hypothesis node capacity');
    const leaves = leavesOf(projection), cited = value.basis.sourceRefs.map(ref => leaves.get(ref.itemId));
    if (cited.some(item => !item)) throw new TypeError('Hypothesis source denied');
    if (value.perspective.some(id => !base.manifest.actors.some(actor => actor.actorId === id)
        || (id !== value.actor && !cited.some(item => contains(item.data, id))))) throw new TypeError('Hypothesis subject must be visible in this Package');
    if (value.prediction.itemId) {
        const policy = source.hypothesisPolicy, item = leaves.get(value.prediction.itemId);
        const behavior = definition(base).sources.find(source => source.id === item?.sourceId);
        const domain = base.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(domain => domain.id === behavior?.domainId);
        if (!item || !policy.behaviorSourceIds.includes(item.sourceId) || item.semantic !== 'truth' || item.data[policy.targetField] !== value.target
            || typeof item.data[policy.observedField] !== 'boolean' || typeof item.data[policy.outcomeField] !== 'string'
            || !domain?.recordSchema.properties[policy.outcomeField].enum.includes(value.prediction.expected)) throw new TypeError('Hypothesis prediction requires an authorized typed behavior');
    }
}

// No recursive expansion or reads of a target Actor's mind. These are bounded
// components of the original shared pass, published by the original commands.
export async function prepareHypothesisCommands(base, binding, queued, record, view, leaves, applyCommand) {
    if (!binding.theory) return [];
    const source = definition(base).sources.find(source => source.id === binding.theory.sourceId), policy = source.hypothesisPolicy;
    const domain = base.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(domain => domain.id === binding.theory.domainId);
    const actor = view.availability[0].actorId;
    const staged = structuredClone(base.states.atri_lifecycle.domains[domain.id].records);
    const decisions = [], used = new Set();
    for (let index = 0; index < record.payload.hypotheses.length; index++) {
        const update = record.payload.hypotheses[index];
        const previousRecord = staged.find(item => item.value.actor === actor && item.value.key === update.key);
        const recordId = previousRecord?.id ?? 'cog-' + hashNativeDocument({ actor, key: update.key }).slice(0, 48);
        let code = null;
        const cited = update.sourceItemIds.map(id => leaves.get(id)).filter(Boolean);
        const value = { actor, key: update.key, target: update.perspective[0], perspective: update.perspective, text: update.text, confidence: update.confidence, status: 'active',
            prediction: update.prediction, policy: { id: policy.id, revision: policy.revision },
            basis: { viewId: binding.viewId, anchor: view.anchor, sourceRefs: cited.map(item => ({ itemId: item.id, fingerprint: informationItemFingerprint(item) })) },
            appraisal: { ...record.appraisalEvidence, previousHash: hashNativeDocument(previousRecord?.value ?? domain.initial) } };
        const candidate = staged.filter(item => item.id !== recordId).concat([{ id: recordId, value }]);
        if (index >= policy.maxUpdates) code = 'hypothesis_update_limit';
        else if (used.has(update.key)) code = 'hypothesis_duplicate_key';
        else if (!update.text.trim() || !update.sourceItemIds.includes(queued.appraisalEvent.eventItemId)
            || new Set(update.sourceItemIds).size !== update.sourceItemIds.length || cited.length !== update.sourceItemIds.length) code = 'hypothesis_source_denied';
        else {
            try { validateHypothesisEvidence(base, source, value, view, previousRecord?.value, candidate); } catch { code = 'hypothesis_evidence_or_capacity_denied'; }
        }
        if (!code) {
            try {
                await applyCommand({ kind: 'app.command', domainId: domain.id, commandId: binding.theory.commandId, recordId, args: value });
                staged.splice(0, staged.length, ...candidate); used.add(update.key);
            } catch { code = 'hypothesis_command_rejected'; }
        }
        decisions.push({ index: record.payload.updates.length + index, kind: 'theory_of_mind', status: code ? 'rejected' : 'applied', code,
            ...(code ? {} : { domainId: domain.id, recordId }) });
    }
    return decisions;
}
