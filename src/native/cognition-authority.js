import { isCognitionSource, isAppraisalSource, assertCognitionValue, assertCognitionBasis, informationItemFingerprint } from '../../public/shared/native-cognition-runtime.js';
import { hasInformationBasis, isManagedMemory, assertMemoryValue } from '../../public/shared/native-memory-contract.js';
import { informationDefinition, projectInformation, assertInformationAnchor } from '../../public/shared/native-information-runtime.js';
import { hashNativeDocument } from './repositories/common.js';
import { validateHypothesisEvidence } from './tom-authority.js';

// This guard runs inside the original Session publication. It does not publish,
// synthesize evidence, grant reads or adopt a model's World/Task claims.
export function validateCognitionTransition(base, candidate, { taskId = null, appraisalEvidence = null } = {}) {
    const def = informationDefinition(base);
    let scans = 0;
    const projections = new Map();
    for (const source of (def?.sources ?? []).filter(source => isCognitionSource(source) || hasInformationBasis(source))) {
        const old = new Map((base.states.atri_lifecycle.domains[source.domainId]?.records ?? []).map(record => [record.id, record.value]));
        for (const { id, value } of candidate.states.atri_lifecycle.domains[source.domainId]?.records ?? []) {
            if (old.has(id) && hashNativeDocument(old.get(id)) === hashNativeDocument(value)) continue;
            if (isCognitionSource(source)) assertCognitionValue(source, value);
            else assertCognitionBasis(value);
            if (isManagedMemory(source)) {
                assertMemoryValue(source, value);
                if (value.recordedAt > base.states.atri_lifecycle.clocks[source.memoryPolicy.clockId]) throw new TypeError('Memory time is in the future');
            }
            const previous = old.get(id);
            if (!taskId && previous && ['paused', 'cancelled', 'abandoned', 'withdrawn'].includes(value.status)
                && hashNativeDocument({ ...previous, status: value.status }) === hashNativeDocument(value)) continue;
            if (isAppraisalSource(source)) {
                if (source.semantic === 'relationship' && !base.manifest.actors.some(actor => actor.actorId === value.target)) throw new TypeError('Appraisal relationship target is outside this Package');
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
            if (previous && isManagedMemory(source) && (previous.role !== value.role || previous.recordedAt !== value.recordedAt)) throw new TypeError('Memory protection and historical time are immutable');
            if (previous && ['emotion', 'relationship'].includes(source.semantic)
                && (previous.target !== value.target || previous.dimension !== value.dimension)) throw new TypeError('Appraisal subject is immutable');
            assertInformationAnchor(base, value.basis.anchor);
            if (!projections.has(view.id)) projections.set(view.id, projectInformation(base, view.id, { purpose: 'context', includeRollups: false,
                onScan: count => { scans += count; if (scans > 4096) throw new TypeError('Cognition source scan budget'); } }));
            const projection = projections.get(view.id);
            if (hashNativeDocument(value.basis.anchor) !== hashNativeDocument(projection.anchor)) throw new TypeError('Cognition exact source anchor required');
            if (projection.availability.some(actor => !actor.available)) throw new TypeError('Cognition Actor unavailable');
            const mayUseCognition = ['desire', 'intention'].includes(source.semantic) || source.causalBasis;
            const leaves = new Map(projection.items.filter(item => item.semantic !== 'rollup' && (mayUseCognition || !isCognitionSource(item)))
                .filter(item => !item.cognition || item.actorId === value.actor && item.cognition.status === 'active' && (item.semantic !== 'intention' || item.cognition.selection === 'current'))
                .filter(item => !item.memory || item.actorId === value.actor && item.memory.status === 'active' && item.memory.applicability === 'applicable' && ['willing', 'reluctant'].includes(item.memory.use))
                .filter(item => !item.causality || item.causality.sourceCurrent).map(item => [item.id, item]));
            if (value.basis.sourceRefs.some(ref => !leaves.has(ref.itemId) || informationItemFingerprint(leaves.get(ref.itemId)) !== ref.fingerprint)) throw new TypeError('Cognition source changed or denied');
            const derived = item => isCognitionSource(item) || hasInformationBasis(def.sources.find(source => source.id === item.sourceId));
            const walk = (itemId, path = [], depth = 0) => {
                if (++scans > 4096) throw new TypeError('Cognition dependency scan budget');
                const item = leaves.get(itemId);
                if (!item || depth > 4 || path.includes(itemId) || def.sources.find(peer => peer.id === item.sourceId)?.domainId === source.domainId && item.recordId === id) throw new TypeError('Cognitive dependency cycle or depth exceeded');
                if (!derived(item)) return;
                if (item.actorId !== value.actor) throw new TypeError('Cognitive dependency requires the same Actor');
                const parent = def.sources.find(source => source.id === item.sourceId);
                const record = base.states.atri_lifecycle.domains[parent.domainId].records.find(record => record.id === item.recordId);
                for (const ref of record.value.basis.sourceRefs) walk(ref.itemId, [...path, itemId], depth + 1);
            };
            for (const ref of value.basis.sourceRefs) walk(ref.itemId, [], 1);
            if (source.semantic === 'theory_of_mind') validateHypothesisEvidence(base, source, value, projection, previous, candidate.states.atri_lifecycle.domains[source.domainId].records);
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
