import { contentSha256 } from './content-sha256.js';
import { fields } from './native-values.js';
import { hypothesisShapeValid, hypothesisObservation } from './native-tom-contract.js';

export const isCognitionSource = source => ['desire', 'intention', 'emotion', 'relationship', 'theory_of_mind'].includes(source?.semantic);
export const isAppraisalSource = source => ['emotion', 'relationship', 'theory_of_mind'].includes(source.semantic);
const statuses = semantic => ['emotion', 'relationship', 'theory_of_mind'].includes(semantic) ? ['active', 'withdrawn'] : semantic === 'desire' ? ['active', 'satisfied', 'abandoned'] : ['proposed', 'active', 'paused', 'cancelled', 'completed'];
const integer = value => Number.isSafeInteger(value) && value >= 0;
export const informationItemFingerprint = item => contentSha256(JSON.stringify(item));
const selectedFields = ['text', 'goalId', 'commitmentIds', 'priority', 'conflictKey', 'expiresAt'];

export function assertCognitionSource(source, domain) {
    if (isAppraisalSource(source)) {
        const properties = domain.recordSchema.properties;
        const types = source.semantic === 'theory_of_mind'
            ? { actor: 'string', key: 'string', target: 'string', perspective: 'array', text: 'string', confidence: 'integer', status: 'string', prediction: 'object', policy: 'object', basis: 'object', appraisal: 'object' }
            : { actor: 'string', target: 'string', dimension: 'string', level: 'integer', status: 'string', text: 'string', rationale: 'string', basis: 'object', appraisal: 'object' };
        if (source.semantic !== 'theory_of_mind' && (!Number.isSafeInteger(domain.initial.level) || domain.initial.level < (source.semantic === 'emotion' ? 0 : -100) || domain.initial.level > 100)) throw new TypeError('Appraisal requires a bounded declared baseline');
        if (source.actorField !== 'actor' || source.statusField !== 'status' || !source.fields.some(path => path.length === 1 && path[0] === 'text')
            || Object.entries(types)
                .some(([key, type]) => properties[key]?.type !== type || !domain.recordSchema.required?.includes(key))) throw new TypeError('Appraisal requires its declared cognitive state');
        return;
    }
    if (source.actorField !== 'actor' || source.statusField !== 'status'
        || selectedFields.some(field => !source.fields.some(path => path.length === 1 && path[0] === field))) throw new TypeError('Cognition requires exact actor/status and selected plan fields');
    const properties = domain.recordSchema.properties;
    const types = { text: 'string', actor: 'string', status: 'string', goalId: 'string', commitmentIds: 'array', priority: 'integer', conflictKey: 'string', expiresAt: 'integer', basis: 'object' };
    if (Object.entries(types).some(([key, type]) => properties[key]?.type !== type || !domain.recordSchema.required.includes(key))
        || properties.commitmentIds.items?.type !== 'string') throw new TypeError('Cognition requires declared typed plan fields');
}

export function assertCognitionValue(source, value) {
    if (isAppraisalSource(source)) {
        if (!statuses(source.semantic).includes(value.status) || !/^actor_[a-f0-9]{32}$/.test(value.actor)
            || (source.semantic === 'theory_of_mind' ? !hypothesisShapeValid(source, value)
                : (source.semantic === 'emotion' ? value.target !== '' : !/^actor_[a-f0-9]{32}$/.test(value.target) || value.target === value.actor)
                || typeof value.dimension !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(value.dimension)
                || !Number.isSafeInteger(value.level) || value.level < (source.semantic === 'emotion' ? 0 : -100) || value.level > 100
                || typeof value.rationale !== 'string' || value.rationale.length > 1024)
            || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 2048) throw new TypeError('Invalid appraisal state');
        const meta = value.appraisal;
        fields(meta, ['origin', 'invocationId', 'taskId', 'variantId', 'profileId', 'profileRevision', 'modelProfileId', 'modelProfileHash', 'requestSnapshotHash', 'previousHash', 'promptId', 'promptRevision', 'generationId', 'generationRevision'], 'Appraisal provenance');
        if (Object.values(meta).some(value => typeof value !== 'string' || !value || value.length > 128)
            || !['author', 'model'].includes(meta.origin)
            || ['modelProfileHash', 'requestSnapshotHash', 'previousHash'].some(key => !/^[a-f0-9]{64}$/.test(meta[key]))) throw new TypeError('Invalid appraisal provenance');
    } else {
        if (!statuses(source.semantic).includes(value.status) || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 12000
        || !/^actor_[a-f0-9]{32}$/.test(value.actor) || (value.goalId !== '' && !/^goal_[a-f0-9]{32}$/.test(value.goalId))
        || !integer(value.priority) || value.priority > 100 || typeof value.conflictKey !== 'string' || value.conflictKey.length > 128
        || !integer(value.expiresAt) || !Array.isArray(value.commitmentIds) || value.commitmentIds.length > 16
        || value.commitmentIds.some(id => typeof id !== 'string' || !id || id.length > 256) || new Set(value.commitmentIds).size !== value.commitmentIds.length) throw new TypeError('Invalid cognition record');
    }
    fields(value.basis, ['viewId', 'anchor', 'sourceRefs'], 'Cognition basis');
    const { anchor, sourceRefs } = value.basis;
    fields(anchor, ['sessionId', 'packageVersionId', 'revisionId', 'branchId', 'scopeEpochs'], 'Cognition anchor');
    if (typeof value.basis.viewId !== 'string' || !anchor || !Object.entries({ sessionId: 'ses', packageVersionId: 'pkgv', revisionId: 'rev', branchId: 'br' })
        .every(([key, prefix]) => new RegExp('^' + prefix + '_[a-f0-9]{32}$').test(anchor[key]))
        || !anchor.scopeEpochs || typeof anchor.scopeEpochs !== 'object' || Array.isArray(anchor.scopeEpochs)
        || Object.values(anchor.scopeEpochs).some(epoch => !integer(epoch))
        || !Array.isArray(sourceRefs) || !sourceRefs.length || sourceRefs.length > 16 || new Set(sourceRefs.map(ref => ref.itemId)).size !== sourceRefs.length) throw new TypeError('Invalid cognition basis');
    for (const ref of sourceRefs) {
        fields(ref, ['itemId', 'fingerprint'], 'Cognition source reference');
        if (typeof ref.itemId !== 'string' || !ref.itemId || ref.itemId.length > 256 || !/^[a-f0-9]{64}$/.test(ref.fingerprint)) throw new TypeError('Invalid cognition source reference');
    }
}

// Evaluate only the leaf items already granted to this exact consumer. A hash
// never authorizes a hidden source read, nor does selection perform an action.
export function projectCognitionItems(snapshot, projection, values) {
    const leaves = new Map(projection.items.filter(item => !isCognitionSource(item)).map(item => [item.id, item]));
    const fingerprints = new Map();
    const fingerprint = id => {
        if (!fingerprints.has(id)) fingerprints.set(id, informationItemFingerprint(leaves.get(id)));
        return fingerprints.get(id);
    };
    for (const item of projection.items.filter(isCognitionSource)) {
        const value = values.get(item.id), basis = value.basis;
        const current = ['sessionId', 'packageVersionId', 'branchId'].every(key => basis.anchor[key] === projection.anchor[key])
            && Object.entries(basis.anchor.scopeEpochs).every(([id, epoch]) => snapshot.states.atri_lifecycle.scopes[id]?.status === 'active' && snapshot.states.atri_lifecycle.scopes[id].epoch === epoch)
            && basis.sourceRefs.every(ref => leaves.has(ref.itemId) && fingerprint(ref.itemId) === ref.fingerprint)
            && (value.commitmentIds ?? []).every(id => leaves.get(id)?.semantic === 'open_loop');
        let status = ['paused', 'cancelled', 'abandoned', 'withdrawn'].includes(value.status) ? value.status
            : ['active', 'proposed'].includes(value.status) && value.expiresAt && snapshot.states.atri_lifecycle.logicalTime >= value.expiresAt ? 'expired' : !current ? 'stale' : value.status;
        item.cognition = { status, sourceCurrent: current, selection: status === 'active' && item.semantic === 'intention' ? 'current' : 'none' };
        if (item.semantic === 'theory_of_mind') {
            const source = snapshot.manifest.runtime.experienceContract.informationRuntime.sources.find(source => source.id === item.sourceId);
            const prediction = current && status === 'active' ? hypothesisObservation(source, value, leaves) : 'unknown';
            if (prediction === 'contradicted') {
                status = 'contradicted'; item.cognition.status = status;
                if (Object.hasOwn(item.data, 'confidence')) item.data.confidence = Math.min(value.confidence, source.hypothesisPolicy.confidenceOnContradiction);
            }
            item.cognition.prediction = prediction;
        }
    }
    const groups = new Map();
    for (const item of projection.items.filter(item => item.semantic === 'intention' && item.cognition.status === 'active' && item.data.conflictKey)) {
        const key = item.actorId + ':' + item.data.conflictKey;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    }
    for (const group of groups.values()) {
        const highest = Math.max(...group.map(item => item.data.priority)), tied = group.filter(item => item.data.priority === highest).length > 1;
        for (const item of group) item.cognition.selection = item.data.priority < highest ? 'deferred' : tied ? 'conflict' : 'current';
    }
}
