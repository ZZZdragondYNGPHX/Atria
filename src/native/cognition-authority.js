import { isCognitionSource, assertCognitionValue, informationItemFingerprint } from '../../public/shared/native-cognition-runtime.js';
import { informationDefinition, projectInformation, assertInformationAnchor } from '../../public/shared/native-information-runtime.js';
import { hashNativeDocument } from './repositories/common.js';

// This guard runs inside the original Session publication. It does not publish,
// synthesize evidence, grant reads or adopt a model's World/Task claims.
export function validateCognitionTransition(base, candidate, { taskId = null, appraisalEvidence = null } = {}) {
    const def = informationDefinition(base);
    let scans = 0;
    const projections = new Map();
    for (const source of (def?.sources ?? []).filter(isCognitionSource)) {
        const old = new Map((base.states.atri_lifecycle.domains[source.domainId]?.records ?? []).map(record => [record.id, record.value]));
        for (const { id, value } of candidate.states.atri_lifecycle.domains[source.domainId]?.records ?? []) {
            if (old.has(id) && hashNativeDocument(old.get(id)) === hashNativeDocument(value)) continue;
            assertCognitionValue(source, value);
            const previous = old.get(id);
            if (!taskId && previous && ['paused', 'cancelled', 'abandoned', 'withdrawn'].includes(value.status)
                && hashNativeDocument({ ...previous, status: value.status }) === hashNativeDocument(value)) continue;
            if (['emotion', 'relationship'].includes(source.semantic)) {
                const { previousHash, ...evidence } = value.appraisal;
                if (taskId ? !appraisalEvidence || hashNativeDocument(evidence) !== hashNativeDocument(appraisalEvidence)
                    : value.appraisal.origin !== 'author') throw new TypeError('Appraisal provenance requires author or sealed Host adoption');
                const domain = base.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(domain => domain.id === source.domainId);
                if (previousHash !== hashNativeDocument(previous ?? domain.initial)) throw new TypeError('Appraisal old state changed');
            }
            const view = def.views.find(view => view.id === value.basis.viewId);
            const audienceMatches = taskId ? view?.audience === 'task' && view.taskId === taskId : view?.audience === 'actor';
            if (!audienceMatches || view.actorId !== value.actor || !view.exposure.includes('context')) throw new TypeError('Cognition update requires this Actor or exact Task context grant');
            if (previous && previous.actor !== value.actor) throw new TypeError('Cognition Actor is immutable');
            if (previous && ['emotion', 'relationship'].includes(source.semantic)
                && (previous.target !== value.target || previous.dimension !== value.dimension)) throw new TypeError('Appraisal subject is immutable');
            assertInformationAnchor(base, value.basis.anchor);
            if (!projections.has(view.id)) projections.set(view.id, projectInformation(base, view.id, { purpose: 'context', includeRollups: false,
                onScan: count => { scans += count; if (scans > 4096) throw new TypeError('Cognition source scan budget'); } }));
            const projection = projections.get(view.id);
            if (hashNativeDocument(value.basis.anchor) !== hashNativeDocument(projection.anchor)) throw new TypeError('Cognition exact source anchor required');
            if (projection.availability.some(actor => !actor.available)) throw new TypeError('Cognition Actor unavailable');
            const leaves = new Map(projection.items.filter(item => !isCognitionSource(item) && item.semantic !== 'rollup').map(item => [item.id, item]));
            if (value.basis.sourceRefs.some(ref => !leaves.has(ref.itemId) || informationItemFingerprint(leaves.get(ref.itemId)) !== ref.fingerprint)) throw new TypeError('Cognition source changed or denied');
            for (const itemId of value.commitmentIds ?? []) {
                const item = leaves.get(itemId), loop = def.sources.find(source => source.id === item?.sourceId);
                if (item?.semantic !== 'open_loop' || !loop.actorField
                    || base.states.atri_lifecycle.domains[loop.domainId]?.records.find(record => record.id === item.recordId)?.value[loop.actorField] !== value.actor
                    || !value.basis.sourceRefs.some(ref => ref.itemId === itemId)) throw new TypeError('Cognition commitment unavailable');
            }
            if (value.expiresAt && value.expiresAt <= base.states.atri_lifecycle.logicalTime + 1) throw new TypeError('Cognition intention already expired');
        }
    }
}
