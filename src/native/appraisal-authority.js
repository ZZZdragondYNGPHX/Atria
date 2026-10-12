import { informationDefinition, projectInformation } from '../../public/shared/native-information-runtime.js';
import { isCognitionSource, informationItemFingerprint } from '../../public/shared/native-cognition-runtime.js';
import { hashNativeDocument } from './repositories/common.js';
import { appraisalTargets } from '../../public/shared/native-appraisal-contract.js';
import { prepareHypothesisCommands } from './tom-authority.js';

const proofs = new WeakMap();
const domains = base => base.manifest.runtime.experienceContract.lifecycleRuntime.domains;
const snapshotHash = (base, binding, actor) => hashNativeDocument(appraisalTargets(binding).map(kind => {
    const domain = domains(base).find(domain => domain.id === binding[kind].domainId);
    return { domain: domain.id, initial: domain.initial, records: base.states.atri_lifecycle.domains[domain.id].records.filter(record => record.value.actor === actor) };
}));

// Only metadata hashes leave this authority. No private target state is inserted
// into a model's Context unless its original Information fields grant that read.
export function captureAppraisalEvent(base, task, variant, input) {
    const binding = variant.resultBinding;
    if (binding?.kind !== 'cognition.appraise') return null;
    const view = informationDefinition(base)?.views.find(view => view.id === binding.viewId);
    if (view?.audience !== 'task' || view.taskId !== task.id || !view.actorId || !view.exposure.includes('context')) throw new TypeError('Appraisal Task view denied');
    const projection = projectInformation(base, view.id, { purpose: 'context', includeRollups: false });
    if (projection.availability.some(item => !item.available)) return { eligible: false, reason: 'actor_unavailable' };
    const event = projection.items.find(item => item.id === input.eventItemId);
    if (!event || !binding.eventSourceIds.includes(event.sourceId) || isCognitionSource(event)) return { eligible: false, reason: 'event_unavailable' };
    return { eligible: event.data[binding.eventGate.field] === binding.eventGate.equals, reason: 'event_gate', actor: view.actorId, viewId: view.id,
        anchor: { sessionId: base.session.sessionId, packageVersionId: base.session.packageVersionId, branchId: base.revision.branchId },
        actorHash: hashNativeDocument(base.manifest.actors.find(actor => actor.actorId === view.actorId)),
        eventItemId: event.id, eventFingerprint: informationItemFingerprint(event), taskHash: hashNativeDocument(task), profileHash: hashNativeDocument(binding.profile),
        ...(binding.theory ? { hypothesisPolicyHash: hashNativeDocument(informationDefinition(base).sources.find(source => source.id === binding.theory.sourceId).hypothesisPolicy),
            hypothesisBehaviorHash: hashNativeDocument(projection.items.filter(item => informationDefinition(base).sources.find(source => source.id === binding.theory.sourceId).hypothesisPolicy.behaviorSourceIds.includes(item.sourceId))) } : {}),
        stateHash: snapshotHash(base, binding, view.actorId), scopeEpochs: projection.anchor.scopeEpochs };
}

export function appraisalEventCurrent(base, queued, task, variant) {
    const current = captureAppraisalEvent(base, task, variant, queued.input);
    if (!current?.eligible) return { status: current?.reason === 'event_gate' ? 'skip' : 'pending', reason: current?.reason ?? 'event_unavailable' };
    return hashNativeDocument(current) === hashNativeDocument(queued.appraisalEvent)
        ? { status: 'current', event: current } : { status: 'pending', reason: 'appraisal_event_or_state_stale' };
}

// An opaque Host capability seals real delivery and exact model/configuration.
// Caller JSON cannot replace the model/profile, sources, Actor or old state.
export function prepareAppraisalDelivery(core, handle, base, task, variant, record, requestSnapshot) {
    if (variant.resultBinding?.kind !== 'cognition.appraise') return null;
    const queued = base.states.atri_lifecycle.outbox.find(item => item.invocationId === record.invocationId);
    if (!queued || appraisalEventCurrent(base, queued, task, variant).status !== 'current' || record.deliveryReceipt?.kind !== 'model_delivery'
        || record.requestSnapshotHash !== hashNativeDocument(requestSnapshot) || !requestSnapshot.diagnostics?.effectiveConfig?.model) throw new TypeError('Appraisal delivery unavailable');
    const binding = variant.resultBinding, model = requestSnapshot.diagnostics.effectiveConfig.model;
    const token = Object.freeze({});
    proofs.set(token, { core, handle, baseRevisionId: base.revision.revisionId, taskId: task.id, variantId: variant.id, recordHash: hashNativeDocument(record),
        evidence: { origin: 'model', invocationId: record.invocationId, taskId: task.id, variantId: variant.id,
            profileId: binding.profile.id, profileRevision: binding.profile.revision, modelProfileId: requestSnapshot.modelProfileId,
            modelProfileHash: hashNativeDocument(model), requestSnapshotHash: record.requestSnapshotHash,
            promptId: record.promptProgramRef.resourceId, promptRevision: record.promptProgramRef.revision,
            generationId: record.generationProfileRef.resourceId, generationRevision: record.generationProfileRef.revision } });
    return token;
}

export function consumeAppraisalDelivery(token, core, handle, base, task, variant, record) {
    const proof = token && proofs.get(token);
    if (!proof || proof.core !== core || proof.handle !== handle || proof.baseRevisionId !== base.revision.revisionId || proof.taskId !== task.id
        || proof.variantId !== variant.id || proof.recordHash !== hashNativeDocument(record)) throw new TypeError('Appraisal Host delivery proof required');
    proofs.delete(token);
    return proof.evidence;
}

const contains = (value, target) => value === target || Boolean(value && typeof value === 'object' && Object.values(value).some(value => contains(value, target)));

// Each candidate is checked against its own source selection and original
// domain command. Rejected candidates produce a bounded receipt, no state write.
export async function prepareAppraisalCommands(base, task, variant, queued, record, applyCommand) {
    if (appraisalEventCurrent(base, queued, task, variant).status !== 'current') throw new TypeError('Appraisal event or state stale');
    const binding = variant.resultBinding, payload = record.payload, profile = binding.profile;
    const view = projectInformation(base, binding.viewId, { purpose: 'context', includeRollups: false });
    const leaves = new Map(view.items.filter(item => !isCognitionSource(item) && item.semantic !== 'rollup').map(item => [item.id, item]));
    if (payload.significance === 'none' && (payload.updates.length || payload.hypotheses?.length)) throw new TypeError('No-change appraisal has updates');
    const decisions = [], used = new Set();
    for (let index = 0; index < payload.updates.length; index++) {
        const update = payload.updates[index];
        let code = null;
        const dimensions = update.kind === 'emotion' ? profile.emotionDimensions : profile.relationshipDimensions;
        if (!dimensions.includes(update.dimension) || Math.abs(update.delta) > profile.maxDelta || !update.text.trim()) code = 'appraisal_profile_rejected';
        if (!Array.isArray(update.sourceItemIds) || !update.sourceItemIds.includes(queued.appraisalEvent.eventItemId) || new Set(update.sourceItemIds).size !== update.sourceItemIds.length
            || update.sourceItemIds.some(id => !leaves.has(id))) code = 'appraisal_source_denied';
        const cited = update.sourceItemIds.map(id => leaves.get(id)).filter(Boolean);
        if (update.kind === 'emotion' ? update.target !== '' : update.target === view.availability[0].actorId
            || !base.manifest.actors.some(actor => actor.actorId === update.target) || !cited.some(item => contains(item.data, update.target))) code = 'appraisal_target_denied';
        const actor = view.availability[0].actorId, key = update.kind + ':' + update.dimension + ':' + update.target;
        if (used.has(key)) code = 'appraisal_duplicate_target';
        const target = binding[update.kind], domain = domains(base).find(domain => domain.id === target.domainId);
        const recordId = 'cog-' + hashNativeDocument({ actor, target: update.target, dimension: update.dimension }).slice(0, 48);
        const previous = base.states.atri_lifecycle.domains[domain.id].records.find(record => record.id === recordId)?.value;
        const level = (previous?.level ?? domain.initial.level) + update.delta;
        if (!Number.isSafeInteger(level) || level < (update.kind === 'emotion' ? 0 : -100) || level > 100) code = 'appraisal_level_rejected';
        if (code) { decisions.push({ index, kind: update.kind, status: 'rejected', code }); continue; }
        const value = { actor, target: update.target, dimension: update.dimension, level, status: 'active', text: update.text, rationale: payload.rationale,
            basis: { viewId: binding.viewId, anchor: view.anchor, sourceRefs: cited.map(item => ({ itemId: item.id, fingerprint: informationItemFingerprint(item) })) },
            appraisal: { ...record.appraisalEvidence, previousHash: hashNativeDocument(previous ?? domain.initial) } };
        try {
            await applyCommand({ kind: 'app.command', domainId: domain.id, commandId: target.commandId, recordId, args: value });
            used.add(key);
            decisions.push({ index, kind: update.kind, status: 'applied', code: null, domainId: domain.id, recordId });
        } catch { decisions.push({ index, kind: update.kind, status: 'rejected', code: 'appraisal_command_rejected' }); }
    }
    decisions.push(...await prepareHypothesisCommands(base, binding, queued, record, view, leaves, applyCommand));
    return { kind: 'authority', decision: 'cognition.appraise', baseRevisionId: base.revision.revisionId,
        significance: payload.significance, decisions, applied: decisions.filter(decision => decision.status === 'applied').length };
}
