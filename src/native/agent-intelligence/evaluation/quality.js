import { hashNativeDocument as hash } from '../../repositories/common.js';
import { fields, text } from '../contracts.js';

const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const definitions = {
    'rp.m1.information': { domain: 'rp', unit: 'scene', dimensions: ['player_agency', 'promise_application', 'knowledge_boundary', 'continuity', 'actor_voice', 'narrative_response'] },
    'project.m1.related': { domain: 'project', unit: 'task', dimensions: ['intent_completion', 'conflict_handling', 'repair_quality', 'related_completion', 'preservation', 'status_accuracy'] },
    'legacy.rp_agency': { domain: 'rp', unit: 'turn', dimensions: ['player_agency'] },
    'legacy.rp_memory': { domain: 'rp', unit: 'turn', dimensions: ['promise_application', 'knowledge_boundary'] },
    'legacy.rp_variant': { domain: 'rp', unit: 'turn', dimensions: ['continuity'] },
    'legacy.project_authoring': { domain: 'project', unit: 'task', dimensions: ['intent_completion'] },
    'legacy.project_conflict': { domain: 'project', unit: 'task', dimensions: ['conflict_handling'] },
    'legacy.project_repair': { domain: 'project', unit: 'task', dimensions: ['repair_quality'] },
};
export const QUALITY_PROFILES = freeze(Object.fromEntries(Object.entries(definitions).map(([profileId, definition]) => {
    const body = { schemaVersion: 1, profileId, ...definition, criticalDimensions: [...definition.dimensions], unknown: 'reject', na: 'predeclared_optional_only' };
    return [profileId, { ...body, revision: hash(body) }];
})));
export const QUALITY_REVISION = hash(QUALITY_PROFILES);
export function qualityProfile(ref, domain) {
    fields(ref, ['profileId', 'revision'], 'Quality profile');
    const profile = QUALITY_PROFILES[ref.profileId];
    if (!profile || profile.revision !== ref.revision || profile.domain !== domain) throw new TypeError('Quality profile identity changed');
    return profile;
}
export const qualityRef = profileId => {
    const profile = QUALITY_PROFILES[profileId];
    if (!profile) throw new TypeError('Unknown quality profile');
    return { profileId, revision: profile.revision };
};
export function assertAttribution(value, direction) {
    fields(value, ['loci', 'support', 'intervention', 'legacy'], 'Diagnosis attribution');
    if (!Array.isArray(value.loci) || !value.loci.length || value.loci.length > 3 || new Set(value.loci).size !== value.loci.length
        || value.loci.some(v => !['prompt', 'context', 'state', 'runtime', 'evaluator', 'model', 'unknown'].includes(v))
        || !['unverified', 'reproduced', 'rule_verified'].includes(value.support) || typeof value.legacy !== 'boolean'
        || !['local_target', 'engineering', 'none'].includes(value.intervention)) throw new TypeError('Invalid diagnosis attribution');
    if (value.intervention !== 'local_target' && direction !== 'undetermined'
        || value.intervention === 'local_target' && direction === 'undetermined'
        || !value.legacy && value.intervention === 'local_target' && value.loci.some(v => v !== 'prompt')) throw new TypeError('Diagnosis intervention is unsupported');
    return value;
}
export const legacyAttribution = direction => ({ loci: ['unknown'], support: 'unverified', intervention: direction === 'undetermined' ? 'none' : 'local_target', legacy: true });
export function assertAssessment(value, domain, origin, signal) {
    fields(value, ['profile', 'purpose', 'claims', 'producer'], 'Assessment');
    const profile = qualityProfile(value.profile, domain);
    if (!['ordinary', 'development'].includes(value.purpose) || !['model_assessment', 'host_check'].includes(origin)
        || !['suspected_failure', 'verified_failure', 'no_failure', 'unknown'].includes(signal)
        || origin === 'model_assessment' && signal === 'verified_failure') throw new TypeError('Invalid assessment provenance/verdict');
    if (!Array.isArray(value.claims) || value.claims.length > 4 || signal !== 'unknown' && !value.claims.length) throw new TypeError('Invalid assessment claims');
    for (const claim of value.claims) {
        fields(claim, ['dimension', 'sourceHash', 'quote'], 'Assessment claim');
        if (!profile.dimensions.includes(claim.dimension) || !/^[a-f0-9]{64}$/.test(claim.sourceHash)) throw new TypeError('Invalid assessment dimension/source');
        text(claim.quote, 'Evidence quote'); if (claim.quote.length > 512) throw new TypeError('Evidence quote exceeds limit');
    }
    if (origin === 'model_assessment') {
        fields(value.producer, ['modelId', 'configurationHash', 'requestHash', 'snapshotHash', 'chargeId'], 'Assessment producer');
        text(value.producer.modelId, 'Observed model'); text(value.producer.chargeId, 'Charge identity');
        for (const name of ['configurationHash', 'requestHash', 'snapshotHash']) if (!/^[a-f0-9]{64}$/.test(value.producer[name])) throw new TypeError('Invalid assessment execution hash');
    } else {
        fields(value.producer, ['checkerId', 'revision'], 'Fixed checker');
        if (value.producer.checkerId !== 'project.validation' || value.producer.revision !== hash('project.validation:failed/passed:v1')
            || domain !== 'project' || value.claims.some(c => c.dimension !== 'repair_quality')) throw new TypeError('Unknown fixed quality checker');
    }
    return value;
}
export function qualityEnvelope(domain, cases, split) {
    return { schemaVersion: 1, registryRevision: QUALITY_REVISION, domain, split,
        cases: cases.map(entry => ({ caseId: entry.caseId, caseRevision: entry.caseRevision,
            profile: qualityRef('legacy.' + entry.caseId.replace(/_[dp]1$/, '')),
            provenance: { origin: 'historical_synthetic', groupId: 'legacy:' + entry.caseId.replace(/_[dp]1$/, ''), independence: 'not_established' } })) };
}
export function validateQualityReport(report) {
    const quality = report.quality;
    if (!quality || quality.schemaVersion !== 1 || quality.registryRevision !== QUALITY_REVISION || quality.domain !== report.domain
        || !['development', 'promotion'].includes(quality.split) || !Array.isArray(quality.cases)) throw new TypeError('Quality envelope missing or changed');
    fields(quality, ['schemaVersion', 'registryRevision', 'domain', 'split', 'cases'], 'Quality envelope');
    if (!quality.cases.length || quality.cases.length > 3 || new Set(quality.cases.map(c => c.caseId)).size !== quality.cases.length
        || report.pairs.some(p => !quality.cases.some(c => c.caseId === p.case.caseId))) throw new TypeError('Quality case coverage changed');
    for (const item of quality.cases) {
        fields(item, ['caseId', 'caseRevision', 'profile', 'provenance'], 'Quality case');
        const profile = qualityProfile(item.profile, report.domain);
        const pairs = report.pairs.filter(p => p.case.caseId === item.caseId);
        if (!pairs.length || pairs.some(p => p.case.caseRevision !== item.caseRevision || p.case.split !== quality.split
            || !profile.criticalDimensions.every(d => p.case.behaviorDimensions.includes(d) && Number.isInteger(p.judge?.deltas?.[d])))) throw new TypeError('Required quality dimension ungraded');
    }
    return quality;
}

// Domain profiles are available for assessment; pilot sources are not invented
// here. F2 registers reviewed fixtures in the original fixed catalogue.
export function requirePilotSources(profileId) {
    if (!QUALITY_PROFILES[profileId] || profileId.startsWith('legacy.')) throw new TypeError('Unknown pilot quality profile');
    throw new TypeError('source_unready');
}
