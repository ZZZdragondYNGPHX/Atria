export const CONTEXT_DERIVED_NAMESPACE = 'atri_context_derived';
export const CONTEXT_DERIVED_SCHEMA_VERSION = 1;
export const TURN_DIGEST_SCHEMA_VERSION = 1;

export const NARRATIVE_LEVELS = Object.freeze(['scene', 'chapter', 'arc', 'campaign']);
export const COMMITMENT_STATUSES = Object.freeze(['open', 'closed', 'superseded']);
export const CONTEXT_POLICIES = Object.freeze(['economy', 'balanced', 'rich']);

const PRODUCERS = new Set(['runtime', 'orchestrator', 'utility', 'distiller']);
const SOURCE_KINDS = new Set([
    'timeline',
    'event',
    'knowledge',
    'memory',
    'narrative',
    'runtime',
    'state',
    'orchestrator',
    'utility',
]);

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function text(value) {
    return String(value ?? '').trim();
}

function integer(value, fallback = -1) {
    const number = Number(value);
    return Number.isInteger(number) ? number : fallback;
}

function uniqueStrings(values = []) {
    return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

export function normalizeContextPolicy(value = 'balanced') {
    const policy = text(value).toLowerCase() || 'balanced';
    if (!CONTEXT_POLICIES.includes(policy)) throw new TypeError('Unknown Native Context policy');
    return policy;
}

export function normalizeContextSourceRef(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('Context sourceRef must be an object');
    }
    const kind = text(value.kind);
    if (!SOURCE_KINDS.has(kind)) throw new TypeError('Unknown Context sourceRef kind');
    const ref = { kind };
    for (const key of [
        'messageId',
        'eventId',
        'knowledgeBindingId',
        'knowledgeBaseId',
        'knowledgeRevisionId',
        'knowledgeEntryId',
        'memoryId',
        'narrativeId',
        'revisionId',
        'branchId',
        'providerId',
    ]) {
        const normalized = text(value[key]);
        if (normalized) ref[key] = normalized;
    }
    if (Number.isInteger(Number(value.sequence)) && Number(value.sequence) >= 0) {
        ref.sequence = Number(value.sequence);
    }
    if (kind === 'timeline' && !ref.messageId) throw new TypeError('Timeline sourceRef requires messageId');
    if (kind === 'event' && !ref.eventId) throw new TypeError('Event sourceRef requires eventId');
    if (kind === 'narrative' && !ref.narrativeId) throw new TypeError('Narrative sourceRef requires narrativeId');
    if (kind === 'memory' && !ref.memoryId) throw new TypeError('Memory sourceRef requires memoryId');
    if (kind === 'knowledge' && !ref.knowledgeEntryId) throw new TypeError('Knowledge sourceRef requires knowledgeEntryId');
    return Object.freeze(ref);
}

export function normalizeContextSourceRefs(values = []) {
    const normalized = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
        const ref = normalizeContextSourceRef(value);
        const key = JSON.stringify(ref);
        if (!seen.has(key)) {
            seen.add(key);
            normalized.push(ref);
        }
    }
    return Object.freeze(normalized);
}

export function normalizeCoverage(value = {}) {
    const fromSequence = Math.max(0, integer(value.fromSequence, 0));
    const toSequence = Math.max(fromSequence - 1, integer(value.toSequence, fromSequence - 1));
    return Object.freeze({
        fromSequence,
        toSequence,
        messageIds: Object.freeze(uniqueStrings(value.messageIds)),
        eventIds: Object.freeze(uniqueStrings(value.eventIds)),
    });
}

export function assertNarrativeArtifact(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('Narrative artifact must be an object');
    }
    const narrativeId = text(value.narrativeId || value.id);
    const level = text(value.level).toLowerCase();
    const branchId = text(value.branchId);
    const revisionId = text(value.revisionId || value.toRevisionId);
    const content = String(value.content ?? '').trim();
    if (!narrativeId || !NARRATIVE_LEVELS.includes(level) || !branchId || !revisionId || !content) {
        throw new TypeError('Narrative artifact requires stable identity, level, branch, revision and content');
    }
    const sourceRefs = normalizeContextSourceRefs(value.sourceRefs);
    if (!sourceRefs.length) throw new TypeError('Narrative artifact must be source-backed');
    const childNarrativeIds = uniqueStrings(value.childNarrativeIds);
    if (level !== 'scene' && childNarrativeIds.length === 0) {
        throw new TypeError('Higher Narrative artifacts require bounded child Narrative IDs');
    }
    return Object.freeze({
        narrativeId,
        level,
        branchId,
        revisionId,
        fromRevisionId: text(value.fromRevisionId) || revisionId,
        toRevisionId: text(value.toRevisionId) || revisionId,
        content,
        sourceRefs,
        childNarrativeIds: Object.freeze(childNarrativeIds),
        coverage: normalizeCoverage(value.coverage),
        createdAt: Number.isFinite(Number(value.createdAt)) ? Number(value.createdAt) : 0,
        status: text(value.status) || 'complete',
    });
}

export function validateNarrativeSpine(values = []) {
    const artifacts = (Array.isArray(values) ? values : []).map(assertNarrativeArtifact);
    const byId = new Map(artifacts.map(item => [item.narrativeId, item]));
    if (byId.size !== artifacts.length) throw new TypeError('Duplicate Narrative identity');
    for (const item of artifacts) {
        const levelIndex = NARRATIVE_LEVELS.indexOf(item.level);
        for (const childId of item.childNarrativeIds) {
            const child = byId.get(childId);
            if (!child) throw new TypeError('Narrative child identity is missing');
            if (child.branchId !== item.branchId) throw new TypeError('Narrative child crosses Branch scope');
            if (NARRATIVE_LEVELS.indexOf(child.level) !== levelIndex - 1) {
                throw new TypeError('Narrative hierarchy must be Scene -> Chapter -> Arc -> Campaign');
            }
            if (
                child.coverage.fromSequence < item.coverage.fromSequence
                || child.coverage.toSequence > item.coverage.toSequence
            ) {
                throw new TypeError('Narrative parent coverage must contain child coverage');
            }
        }
    }
    return Object.freeze(artifacts);
}

export function assertCommitment(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('Commitment must be an object');
    }
    const commitmentId = text(value.commitmentId || value.id);
    const branchId = text(value.branchId);
    const revisionId = text(value.revisionId);
    const status = text(value.status || 'open').toLowerCase();
    const content = String(value.content ?? '').trim();
    if (!commitmentId || !branchId || !revisionId || !COMMITMENT_STATUSES.includes(status) || !content) {
        throw new TypeError('Commitment requires stable identity, branch, revision, status and content');
    }
    if (status === 'superseded' && !text(value.supersededBy)) {
        throw new TypeError('Superseded Commitment requires supersededBy');
    }
    const sourceRefs = normalizeContextSourceRefs(value.sourceRefs);
    if (!sourceRefs.length) throw new TypeError('Commitment must retain source provenance');
    return Object.freeze({
        commitmentId,
        branchId,
        revisionId,
        status,
        content,
        importance: Math.max(0, Math.min(100, Number(value.importance ?? 50) || 0)),
        sourceRefs,
        supersededBy: status === 'superseded' ? text(value.supersededBy) : null,
        actorIds: Object.freeze(uniqueStrings(value.actorIds)),
        worldIds: Object.freeze(uniqueStrings(value.worldIds)),
        due: value.due === undefined ? null : clone(value.due),
        target: value.target === undefined ? null : clone(value.target),
        createdAt: Number.isFinite(Number(value.createdAt)) ? Number(value.createdAt) : 0,
        updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : 0,
    });
}

export function normalizeTurnDigest(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('TurnDigest must be an object');
    }
    const branchId = text(value.branchId);
    const revisionId = text(value.revisionId);
    const producer = text(value.producer || 'runtime').toLowerCase();
    if (!branchId || !revisionId || !PRODUCERS.has(producer)) {
        throw new TypeError('TurnDigest requires branch/revision provenance and a known producer');
    }
    const sourceRefs = normalizeContextSourceRefs(value.sourceRefs);
    if (!sourceRefs.length) throw new TypeError('TurnDigest must retain source provenance');
    const boundary = value.sceneBoundary && typeof value.sceneBoundary === 'object'
        ? {
            detected: value.sceneBoundary.detected === true,
            reason: text(value.sceneBoundary.reason),
            confidence: Math.max(0, Math.min(1, Number(value.sceneBoundary.confidence ?? 0) || 0)),
        }
        : { detected: false, reason: '', confidence: 0 };
    return Object.freeze({
        schemaVersion: TURN_DIGEST_SCHEMA_VERSION,
        branchId,
        revisionId,
        producer,
        sourceRefs,
        coverage: normalizeCoverage(value.coverage),
        durableFacts: Object.freeze(clone(Array.isArray(value.durableFacts) ? value.durableFacts : [])),
        commitmentProposals: Object.freeze(clone(Array.isArray(value.commitmentProposals) ? value.commitmentProposals : [])),
        narrativeBeats: Object.freeze(clone(Array.isArray(value.narrativeBeats) ? value.narrativeBeats : [])),
        sceneBoundary: Object.freeze(boundary),
    });
}

export function createContextDerivedState() {
    return {
        schemaVersion: CONTEXT_DERIVED_SCHEMA_VERSION,
        narrative: [],
        commitments: [],
        digests: [],
        coverage: {
            narrativeThroughSequence: -1,
            commitmentsThroughSequence: -1,
            memoryThroughSequence: -1,
            digestThroughSequence: -1,
        },
    };
}

export function normalizeContextDerivedState(value) {
    if (value === undefined || value === null) return createContextDerivedState();
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Number(value.schemaVersion) !== CONTEXT_DERIVED_SCHEMA_VERSION) {
        throw new TypeError('Invalid Native Context derived state');
    }
    const state = createContextDerivedState();
    state.narrative = [...validateNarrativeSpine(value.narrative)];
    state.commitments = (Array.isArray(value.commitments) ? value.commitments : []).map(assertCommitment);
    const commitmentIds = new Set(state.commitments.map(item => item.commitmentId));
    if (commitmentIds.size !== state.commitments.length) throw new TypeError('Duplicate Commitment identity');
    state.digests = (Array.isArray(value.digests) ? value.digests : []).map(normalizeTurnDigest);
    const coverage = value.coverage && typeof value.coverage === 'object' ? value.coverage : {};
    state.coverage = {
        narrativeThroughSequence: integer(coverage.narrativeThroughSequence, -1),
        commitmentsThroughSequence: integer(coverage.commitmentsThroughSequence, -1),
        memoryThroughSequence: integer(coverage.memoryThroughSequence, -1),
        digestThroughSequence: integer(coverage.digestThroughSequence, -1),
    };
    return state;
}

export function appendNarrativeArtifact(stateValue, artifactValue) {
    const state = normalizeContextDerivedState(stateValue);
    const artifact = assertNarrativeArtifact(artifactValue);
    const existing = state.narrative.find(item => item.narrativeId === artifact.narrativeId);
    if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(artifact)) {
            throw new TypeError('Narrative artifact identity is immutable');
        }
        return state;
    }
    state.narrative.push(clone(artifact));
    validateNarrativeSpine(state.narrative);
    state.coverage.narrativeThroughSequence = Math.max(
        state.coverage.narrativeThroughSequence,
        artifact.coverage.toSequence,
    );
    return state;
}

export function openCommitment(stateValue, commitmentValue) {
    const state = normalizeContextDerivedState(stateValue);
    const commitment = assertCommitment({ ...commitmentValue, status: 'open' });
    if (state.commitments.some(item => item.commitmentId === commitment.commitmentId)) {
        throw new TypeError('Commitment identity already exists');
    }
    state.commitments.push(clone(commitment));
    const sequence = Math.max(-1, ...commitment.sourceRefs.map(ref => Number(ref.sequence ?? -1)));
    state.coverage.commitmentsThroughSequence = Math.max(state.coverage.commitmentsThroughSequence, sequence);
    return state;
}

export function transitionCommitment(stateValue, commitmentId, transition = {}) {
    const state = normalizeContextDerivedState(stateValue);
    const id = text(commitmentId);
    const index = state.commitments.findIndex(item => item.commitmentId === id);
    if (index < 0) throw new TypeError('Unknown Commitment identity');
    const current = state.commitments[index];
    if (current.status !== 'open') throw new TypeError('Only open Commitments may transition');
    const status = text(transition.status).toLowerCase();
    if (!['closed', 'superseded'].includes(status)) throw new TypeError('Commitment transition must close or supersede');
    const refs = normalizeContextSourceRefs([
        ...current.sourceRefs,
        ...(Array.isArray(transition.sourceRefs) ? transition.sourceRefs : []),
    ]);
    const next = assertCommitment({
        ...current,
        ...transition,
        commitmentId: id,
        branchId: current.branchId,
        status,
        sourceRefs: refs,
    });
    state.commitments[index] = clone(next);
    const sequence = Math.max(-1, ...refs.map(ref => Number(ref.sequence ?? -1)));
    state.coverage.commitmentsThroughSequence = Math.max(state.coverage.commitmentsThroughSequence, sequence);
    return state;
}

export function appendTurnDigest(stateValue, digestValue) {
    const state = normalizeContextDerivedState(stateValue);
    const digest = normalizeTurnDigest(digestValue);
    state.digests.push(clone(digest));
    state.coverage.digestThroughSequence = Math.max(
        state.coverage.digestThroughSequence,
        digest.coverage.toSequence,
    );
    return state;
}

const DERIVATION_POLICY = Object.freeze({
    economy: Object.freeze({ distillTurnThreshold: 12, memoryPendingThreshold: 16 }),
    balanced: Object.freeze({ distillTurnThreshold: 8, memoryPendingThreshold: 10 }),
    rich: Object.freeze({ distillTurnThreshold: 4, memoryPendingThreshold: 6 }),
});

export function evaluateDerivationGate(input = {}) {
    const policy = normalizeContextPolicy(input.policy);
    const rules = DERIVATION_POLICY[policy];
    const events = Array.isArray(input.events) ? input.events : [];
    const eventTypes = new Set(events.map(item => text(item?.type || item)).filter(Boolean));
    const deterministicSceneBoundary = input.sceneBoundary === true || [
        'scene_close',
        'scene_change',
        'chapter_change',
        'location_change',
        'battle_end',
        'quest_complete',
        'day_change',
    ].some(type => eventTypes.has(type));
    const hasSignificantEvent = events.some(item => item?.significant === true)
        || ['quest_open', 'quest_complete', 'promise', 'commitment', 'irreversible_outcome']
            .some(type => eventTypes.has(type));
    const turnsSinceDigest = Math.max(0, Number(input.turnsSinceDigest) || 0);
    const reusableDigest = input.runtimeDigest || input.orchestratorDigest || input.utilityDigest || null;
    const memory = input.memory && typeof input.memory === 'object' ? input.memory : {};
    const reasons = [];
    if (reusableDigest) reasons.push('reuse_existing_digest');
    if (deterministicSceneBoundary) reasons.push('deterministic_scene_boundary');
    if (hasSignificantEvent) reasons.push('significant_event');
    if (turnsSinceDigest >= rules.distillTurnThreshold) reasons.push('distill_threshold');
    if (input.utilityError) reasons.push('utility_failed_graceful');

    const runTurnDistiller = !reusableDigest
        && (deterministicSceneBoundary || hasSignificantEvent || turnsSinceDigest >= rules.distillTurnThreshold);
    const runMemoryConsolidation = memory.conflict === true
        || memory.compactionDue === true
        || deterministicSceneBoundary
        || Math.max(0, Number(memory.pendingCount) || 0) >= rules.memoryPendingThreshold;

    return Object.freeze({
        schemaVersion: 1,
        policy,
        blocking: false,
        reusableDigest: reusableDigest ? clone(reusableDigest) : null,
        runTurnDistiller,
        runMemoryConsolidation,
        summaryLevels: Object.freeze(deterministicSceneBoundary ? ['scene'] : []),
        cheapMemoryIngest: input.hasCommittedEvidence === true,
        reasons: Object.freeze(reasons),
    });
}


/**
 * Compatibility boundary for an optional bounded Turn Distiller.
 * The caller supplies the utility/orchestrator implementation; this function
 * never makes a model call by itself and never blocks ordinary play on failure.
 */
export async function runTurnDistiller(gate, input = {}, distiller = null) {
    if (!gate || gate.schemaVersion !== 1) throw new TypeError('Turn Distiller requires a Derivation Gate decision');
    if (gate.reusableDigest) {
        return Object.freeze({
            status: 'reused',
            blocking: false,
            digest: clone(gate.reusableDigest),
            error: null,
        });
    }
    if (!gate.runTurnDistiller) {
        return Object.freeze({ status: 'skipped', blocking: false, digest: null, error: null });
    }
    if (typeof distiller !== 'function') {
        return Object.freeze({ status: 'unavailable', blocking: false, digest: null, error: 'distiller_unavailable' });
    }
    const maxInputChars = Math.max(1024, Math.min(65536, Math.floor(Number(input.maxInputChars) || 48000)));
    const rawText = String(input.text ?? input.content ?? '');
    const boundedText = rawText.length > maxInputChars ? rawText.slice(rawText.length - maxInputChars) : rawText;
    const sourceRefs = normalizeContextSourceRefs(input.sourceRefs);
    const branchId = text(input.branchId);
    const revisionId = text(input.revisionId);
    if (!branchId || !revisionId || !sourceRefs.length) {
        throw new TypeError('Turn Distiller requires branch/revision/source provenance');
    }
    try {
        const raw = await distiller(Object.freeze({
            policy: gate.policy,
            text: boundedText,
            sourceRefs,
            branchId,
            revisionId,
            coverage: normalizeCoverage(input.coverage),
        }));
        const digest = normalizeTurnDigest({
            ...(raw && typeof raw === 'object' ? raw : {}),
            branchId,
            revisionId,
            producer: text(raw?.producer) || 'distiller',
            sourceRefs,
            coverage: input.coverage,
        });
        return Object.freeze({ status: 'distilled', blocking: false, digest, error: null });
    } catch (error) {
        return Object.freeze({
            status: 'failed',
            blocking: false,
            digest: null,
            error: String(error?.message || error),
        });
    }
}
