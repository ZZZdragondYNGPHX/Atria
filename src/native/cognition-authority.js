import { hasPerspectiveIdentity, resolvePerspectiveView } from '../../public/shared/native-subject-contract.js';
import { isCognitionSource, isAppraisalSource, assertCognitionValue, assertCognitionBasis, informationItemFingerprint } from '../../public/shared/native-cognition-runtime.js';
import { hasInformationBasis, isManagedMemory, assertMemoryValue } from '../../public/shared/native-memory-contract.js';
import { informationDefinition, projectInformation, refreshInformationCognition, assertInformationAnchor, actorAvailability } from '../../public/shared/native-information-runtime.js';
import { hashNativeDocument } from './repositories/common.js';
import { validateHypothesisEvidence } from './tom-authority.js';
import { INFORMATION_LIMITS } from '../../public/shared/native-information-contract.js';

// Only SessionCore's coherent branch recovery calls this. Keep the immutable
// source Revision untouched; copy current evidence into the derived Branch in
// dependency order. Stale/denied evidence is never repaired by a restore.
export function rebindCognitionBranch(base, candidate) {
    if (base.revision.branchId === candidate.revision.branchId) return candidate.states;
    const def = informationDefinition(base);
    if (!def) return candidate.states;
    const states = structuredClone(candidate.states);
    const inherited = { ...candidate, states, revision: base.revision };
    const destination = { ...candidate, states };
    const views = new Map(), eligible = new Map(), completed = new Set();
    let scans = 0;
    const project = (snapshot, id) => projectInformation(snapshot, id, { purpose: 'context', includeRollups: false,
        onScan: count => { scans += count; if (scans > INFORMATION_LIMITS.views * INFORMATION_LIMITS.records) throw new TypeError('Cognition recovery scan budget'); } });
    for (const source of def.sources.filter(source => isCognitionSource(source) || hasInformationBasis(source))) {
        for (const record of states.atri_lifecycle.domains[source.domainId]?.records ?? []) {
            const basis = record.value.basis;
            if (isManagedMemory(source) && basis?.received) continue;
            if (!basis || basis.anchor.branchId !== base.revision.branchId) continue;
            if (!views.has(basis.viewId)) views.set(basis.viewId, project(inherited, basis.viewId));
            const projection = views.get(basis.viewId), item = projection.items.find(item => item.sourceId === source.id && item.recordId === record.id);
            if (!(item?.cognition?.sourceCurrent || item?.memory?.sourceCurrent || item?.causality?.sourceCurrent)) continue;
            const original = base.states.atri_lifecycle.domains[source.domainId]?.records.find(old => old.id === record.id);
            if (hashNativeDocument(original?.value ?? null) !== hashNativeDocument(record.value)) continue;
            eligible.set(source.domainId + ':' + record.id, { source, record, projection });
        }
    }
    const visit = (key, path = []) => {
        if (completed.has(key)) return;
        const entry = eligible.get(key);
        if (!entry || path.includes(key) || path.length > 4) return;
        const { record, projection } = entry;
        for (const ref of record.value.basis.sourceRefs) {
            const item = projection.items.find(item => item.id === ref.itemId);
            const source = def.sources.find(source => source.id === item?.sourceId);
            if (source?.domainId) visit(source.domainId + ':' + item.recordId, [...path, key]);
        }
        const next = refreshInformationCognition(destination, projection);
        const refs = record.value.basis.sourceRefs.map(ref => {
            const item = next.items.find(item => item.id === ref.itemId);
            return item ? { ...ref, fingerprint: informationItemFingerprint(item) } : ref;
        });
        record.value = { ...record.value, basis: { ...record.value.basis, anchor: next.anchor, sourceRefs: refs } };
        if (isManagedMemory(entry.source)) record.value.applicability = { ...record.value.applicability,
            exceptionRefs: record.value.applicability.exceptionRefs.map(ref => ({ ...ref,
                fingerprint: refs.find(next => next.itemId === ref.itemId).fingerprint })) };
        completed.add(key);
    };
    for (const key of eligible.keys()) visit(key);
    return states;
}

// This guard runs inside the original Session publication. It does not publish,
// synthesize evidence, grant reads or adopt a model's World/Task claims.
export function validateCognitionTransition(base, candidate, { taskId = null, appraisalEvidence = null } = {}) {
    const def = informationDefinition(base);
    const acquisitions = [];
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
            if (value.basis.received !== undefined) {
                if (!isManagedMemory(source) || !previous?.basis.received || hashNativeDocument(value.basis.received) !== hashNativeDocument(previous.basis.received)) throw new TypeError('Personal acquisition requires Host publication');
                const expected = { ...previous, status: value.status, clarity: value.clarity, use: value.use, applicability: value.applicability };
                if (hashNativeDocument(expected) !== hashNativeDocument(value)) throw new TypeError('Acquired content and disclosure version are immutable');
                const subject = candidate.states.atri_subjects?.subjects.find(subject => subject.subjectId === value.actor);
                const ownView = subject ? resolvePerspectiveView(candidate, subject.perspective?.viewId)
                    : def.views.find(view => view.audience === 'actor' && view.actorId === value.actor && view.exposure.includes('context'));
                if (!ownView?.sources.includes(source.id) || !actorAvailability(candidate, value.actor).available
                    || candidate.states.atri_lifecycle.scopes[source.scopeId]?.status !== 'active') throw new TypeError('Personal Memory access unavailable');
                continue;
            }
            if (previous?.basis.received) throw new TypeError('Personal acquisition cannot be removed');
            if (!taskId && previous && ['paused', 'cancelled', 'abandoned', 'withdrawn'].includes(value.status)
                && hashNativeDocument({ ...previous, status: value.status }) === hashNativeDocument(value)) continue;
            if (isAppraisalSource(source)) {
                if (source.semantic === 'relationship' && !hasPerspectiveIdentity(candidate, value.target)) throw new TypeError('Appraisal relationship target is outside this Package');
                const { previousHash, ...evidence } = value.appraisal;
                if (taskId ? !appraisalEvidence || hashNativeDocument(evidence) !== hashNativeDocument(appraisalEvidence)
                    : value.appraisal.origin !== 'author') throw new TypeError('Appraisal provenance requires author or sealed Host adoption');
                const domain = base.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(domain => domain.id === source.domainId);
                if (previousHash !== hashNativeDocument(previous ?? domain.initial)) throw new TypeError('Appraisal old state changed');
            }
            const view = resolvePerspectiveView(candidate, value.basis.viewId);
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
            if (isManagedMemory(source)) {
                const domain = base.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(domain => domain.id === source.domainId);
                if (domain.recordSchema.properties.basis.properties.received) acquisitions.push({ domainId: source.domainId, recordId: id, clockId: source.memoryPolicy.clockId });
            }
        }
    }
    return acquisitions;
}

// Called after evidence validation and only inside the original publication.
export function publishMemoryAcquisitions(states, acquisitions, revisionId) {
    for (const item of acquisitions) {
        const record = states.atri_lifecycle.domains[item.domainId].records.find(record => record.id === item.recordId);
        record.value.basis.received = { revisionId, clockId: item.clockId, tick: states.atri_lifecycle.clocks[item.clockId] };
    }
}
