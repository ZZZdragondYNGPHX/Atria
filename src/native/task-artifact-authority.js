import { assertJsonDeclaration } from '../../public/shared/native-values.js';
import { assertTaskValue } from '../../public/shared/native-task-contract.js';
import { projectInformation } from '../../public/shared/native-information-runtime.js';
import { hashNativeDocument } from './repositories/common.js';

function anchor(base) {
    return { sessionId: base.session.sessionId, packageVersionId: base.session.packageVersionId,
        branchId: base.revision.branchId, revisionId: base.revision.revisionId };
}
function dependencies(base, use) {
    let scans = 0;
    const views = use.viewIds.map(viewId => {
        const view = base.manifest.runtime.experienceContract.informationRuntime?.views.find(item => item.id === viewId);
        if (!view) throw new TypeError('Artifact dependency view unavailable');
        const value = projectInformation(base, viewId, { purpose: view.exposure.includes('context') ? 'context' : 'display', includeRollups: false,
            onScan: count => { scans += count; if (scans > 4096) throw new TypeError('Artifact dependency budget'); } });
        const { anchor: basis, ...content } = value;
        return { viewId, fingerprint: hashNativeDocument({ ...content, scopeEpochs: basis.scopeEpochs }) };
    });
    const scopeEpochs = Object.fromEntries(use.scopeIds.map(id => {
        const scope = base.states.atri_lifecycle?.scopes[id];
        if (scope?.status !== 'active') throw new TypeError('Artifact scope inactive');
        return [id, scope.epoch];
    }));
    return { views, scopeEpochs };
}

// Called by the trusted GenerationHost on its captured production snapshot.
// No model output or caller JSON can choose/replace these provenance fields.
export function captureTaskProduction(base, task, input) {
    if (!task.resultPolicy.uses?.length) return null;
    return assertJsonDeclaration({ schemaVersion: 1, anchor: anchor(base), input,
        taskDefinitionHash: hashNativeDocument(task),
        dependencies: Object.fromEntries(task.resultPolicy.uses.map(use => [use.id, dependencies(base, use)])),
    }, 'Task production', 131072);
}

export function readTaskArtifact(base, grant, invocationId, purpose) {
    const task = base.manifest.runtime.experienceContract.taskRuntime?.tasks.find(item => item.id === grant.taskId);
    const variant = task?.variants.find(item => item.id === grant.variantId);
    const use = task?.resultPolicy.uses?.find(item => item.id === grant.usageId && item.purpose === purpose);
    const record = base.states.atri_task_results?.records.find(item => item.invocationId === invocationId && item.kind === 'task');
    const production = record?.production;
    if (!use || !variant || !record || !production || !['draft', 'completed'].includes(record.status)
        || record.taskId !== task.id || record.variantId !== variant.id
        || record.definitionHash !== hashNativeDocument(task) || production.taskDefinitionHash !== record.definitionHash
        || record.normalizedResultHash !== hashNativeDocument(record.payload)
        || record.branchId !== base.revision.branchId || record.anchorRevisionId !== production.anchor.revisionId
        || Object.entries(anchor(base)).some(([key, value]) => key !== 'revisionId' && production.anchor[key] !== value)
        || (use.reuse === 'same_revision' && record.storedRevisionId !== base.revision.revisionId)
        || hashNativeDocument(production.dependencies[use.id]) !== hashNativeDocument(dependencies(base, use))
        || (use.cardinality === 'once' && (record.consumptions ?? []).some(item => item.usageId === use.id))) throw new TypeError('Task artifact consumption denied');
    return { value: assertTaskValue(record.payload, variant.outputSchema), record, use,
        evidence: { invocationId, taskId: task.id, variantId: variant.id, usageId: use.id, purpose,
            productionRevisionId: production.anchor.revisionId, resultHash: record.normalizedResultHash } };
}

// Read-only Context reuse consumes the original artifact grant. Candidate
// selection does not authorize an operation or replay a once/side-effect use.
export function decideTaskArtifactReuse(base, grant, invocationId, { bypass = false } = {}) {
    const decision = { schemaVersion: 1, object: 'task.artifact', match: 'exact', invocationId,
        taskId: grant.taskId, variantId: grant.variantId, usageId: grant.usageId,
        anchor: anchor(base), status: 'miss', reason: 'not_found' };
    if (bypass) return { decision: { ...decision, reason: 'manual_bypass' } };
    let artifact;
    try { artifact = readTaskArtifact(base, grant, invocationId, 'context'); } catch {
        return { decision: { ...decision, reason: 'dependency_or_authority_unavailable' } };
    }
    if (artifact.use.cardinality !== 'reusable') return { decision: { ...decision, reason: 'side_effect_use' } };
    return { artifact, decision: { ...decision, status: 'reused', reason: 'current_grant_proved',
        checks: ['identity', 'definition', 'normalized_result', 'branch', 'package', 'scope_epoch', 'dependency', 'cardinality'],
        evidence: artifact.evidence,
        dependencyFingerprint: hashNativeDocument(artifact.record.production.dependencies[artifact.use.id]) } };
}

export function markTaskArtifactConsumption(candidate, artifact, authorityId) {
    if (artifact.use.cardinality !== 'once') return;
    const state = candidate.states.atri_task_results;
    state.records = state.records.map(record => record.invocationId !== artifact.record.invocationId ? record : {
        ...record, consumptions: [...(record.consumptions ?? []), { usageId: artifact.use.id, authorityId,
            baseRevisionId: candidate.revision.revisionId, applicationRevisionId: null }],
    });
}
