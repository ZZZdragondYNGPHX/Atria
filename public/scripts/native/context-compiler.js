import {
    KNOWLEDGE_AUTHORITY,
    compileNativeKnowledgePlan,
    normalizeKnowledgeTarget,
} from './knowledge-runtime.js';
import {
    CONTEXT_DERIVED_NAMESPACE,
    normalizeContextDerivedState,
    normalizeContextPolicy,
    normalizeContextSourceRefs,
} from './context-derived.js';

export const CONTEXT_PLAN_SCHEMA_VERSION = 1;

export const CONTEXT_LANES = Object.freeze({
    runtime: 'runtime_system',
    tools: 'tools',
    currentUser: 'current_user',
    currentState: 'current_state_event',
    commitments: 'commitments',
    knowledge: 'knowledge',
    recentRaw: 'recent_raw',
    narrative: 'narrative_spine',
    memory: 'memory',
    targetAgent: 'target_agent',
});

const LANE_VALUES = new Set(Object.values(CONTEXT_LANES));

const POLICY = Object.freeze({
    economy: Object.freeze({
        safetyMargin: 256,
        hardReserve: 512,
        minima: Object.freeze({
            [CONTEXT_LANES.currentState]: 256,
            [CONTEXT_LANES.commitments]: 96,
            [CONTEXT_LANES.recentRaw]: 1200,
            [CONTEXT_LANES.knowledge]: 384,
            [CONTEXT_LANES.narrative]: 192,
            [CONTEXT_LANES.memory]: 192,
            [CONTEXT_LANES.targetAgent]: 128,
        }),
        caps: Object.freeze({
            [CONTEXT_LANES.knowledge]: 1400,
            [CONTEXT_LANES.recentRaw]: 3200,
            [CONTEXT_LANES.narrative]: 700,
            [CONTEXT_LANES.memory]: 700,
            [CONTEXT_LANES.commitments]: 600,
            [CONTEXT_LANES.targetAgent]: 700,
        }),
    }),
    balanced: Object.freeze({
        safetyMargin: 384,
        hardReserve: 768,
        minima: Object.freeze({
            [CONTEXT_LANES.currentState]: 384,
            [CONTEXT_LANES.commitments]: 160,
            [CONTEXT_LANES.recentRaw]: 2200,
            [CONTEXT_LANES.knowledge]: 700,
            [CONTEXT_LANES.narrative]: 384,
            [CONTEXT_LANES.memory]: 384,
            [CONTEXT_LANES.targetAgent]: 256,
        }),
        caps: Object.freeze({
            [CONTEXT_LANES.knowledge]: 3600,
            [CONTEXT_LANES.recentRaw]: 7000,
            [CONTEXT_LANES.narrative]: 1800,
            [CONTEXT_LANES.memory]: 2200,
            [CONTEXT_LANES.commitments]: 1200,
            [CONTEXT_LANES.targetAgent]: 1600,
        }),
    }),
    rich: Object.freeze({
        safetyMargin: 512,
        hardReserve: 1024,
        minima: Object.freeze({
            [CONTEXT_LANES.currentState]: 512,
            [CONTEXT_LANES.commitments]: 256,
            [CONTEXT_LANES.recentRaw]: 3600,
            [CONTEXT_LANES.knowledge]: 1200,
            [CONTEXT_LANES.narrative]: 768,
            [CONTEXT_LANES.memory]: 800,
            [CONTEXT_LANES.targetAgent]: 512,
        }),
        caps: Object.freeze({
            [CONTEXT_LANES.knowledge]: 7600,
            [CONTEXT_LANES.recentRaw]: 14000,
            [CONTEXT_LANES.narrative]: 4200,
            [CONTEXT_LANES.memory]: 5200,
            [CONTEXT_LANES.commitments]: 2400,
            [CONTEXT_LANES.targetAgent]: 3600,
        }),
    }),
});

const MINIMUM_ORDER = Object.freeze([
    CONTEXT_LANES.currentState,
    CONTEXT_LANES.commitments,
    CONTEXT_LANES.recentRaw,
    CONTEXT_LANES.knowledge,
    CONTEXT_LANES.narrative,
    CONTEXT_LANES.memory,
    CONTEXT_LANES.targetAgent,
]);

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function text(value) {
    return String(value ?? '').trim();
}

function finiteInteger(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function defaultCountTokens(value) {
    const bytes = new TextEncoder().encode(String(value ?? '')).length;
    return Math.max(1, Math.ceil(bytes / 3.35));
}

function targetKey(target) {
    return target.kind + ':' + String(target.id || '');
}

function targetMatches(scope, target) {
    if (scope === undefined || scope === null || scope === '') return true;
    if (Array.isArray(scope)) return scope.some(item => targetMatches(item, target));
    if (typeof scope === 'string') return scope === target.kind || scope === target.id;
    if (!scope || typeof scope !== 'object') return false;
    const kind = text(scope.kind || scope.type);
    const id = text(scope.id || scope.actorId || scope.agentId || scope.userId);
    if (kind && kind !== target.kind) return false;
    if (id && id !== target.id) return false;
    return Boolean(kind || id);
}

export function createContextProvider(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('ContextProvider must be an object');
    }
    const providerId = text(value.providerId || value.id);
    if (!providerId || typeof value.provide !== 'function') {
        throw new TypeError('ContextProvider requires providerId and provide()');
    }
    return Object.freeze({
        providerId,
        provide: value.provide,
        nonBlocking: value.nonBlocking !== false,
    });
}

export function normalizeContextItem(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('ContextItem must be an object');
    }
    const contextItemId = text(value.contextItemId || value.id);
    const lane = text(value.lane);
    if (!contextItemId || !LANE_VALUES.has(lane)) {
        throw new TypeError('ContextItem requires stable identity and known lane');
    }
    const content = String(value.content ?? '');
    const authorityRank = Number(value.authorityRank ?? 0);
    const priority = Number(value.priority ?? 0);
    if (!Number.isFinite(authorityRank) || !Number.isFinite(priority)) {
        throw new TypeError('ContextItem authority and priority must be finite');
    }
    return Object.freeze({
        contextItemId,
        lane,
        authority: text(value.authority) || 'derived',
        authorityRank,
        priority,
        content,
        required: value.required === true,
        atomic: value.atomic !== false,
        atomicGroup: text(value.atomicGroup) || contextItemId,
        sourceRefs: normalizeContextSourceRefs(value.sourceRefs),
        target: value.target === undefined ? null : clone(value.target),
        visibility: Object.freeze((Array.isArray(value.visibility) ? value.visibility : []).map(text).filter(Boolean)),
        minRetention: finiteInteger(value.minRetention, 0),
        maxRetention: Number.isFinite(Number(value.maxRetention)) ? finiteInteger(value.maxRetention, 0) : null,
        metadata: clone(value.metadata ?? {}),
        tokenEstimate: Number.isFinite(Number(value.tokenEstimate)) ? finiteInteger(value.tokenEstimate, 0) : null,
    });
}

function visibleTo(item, target) {
    if (item.visibility.length && !item.visibility.includes(target.kind)) return false;
    return targetMatches(item.target, target);
}

function timelineSourceRef(entry, revision) {
    return {
        kind: 'timeline',
        messageId: entry.messageId,
        branchId: entry.branchId,
        revisionId: revision?.revisionId,
        sequence: entry.sequence,
    };
}

function eventSourceRef(event, revision) {
    return {
        kind: 'event',
        eventId: String(event?.id || event?.eventId || ''),
        branchId: String(event?.branchId || revision?.branchId || ''),
        revisionId: revision?.revisionId,
        sequence: Number.isInteger(Number(event?.seq)) ? Number(event.seq) : undefined,
    };
}

function roleLabel(entry) {
    if (entry.role === 'user') return 'User';
    if (entry.role === 'assistant') return 'Assistant';
    return String(entry.role || 'System');
}

function renderTurnGroup(entries) {
    return entries.map(entry => roleLabel(entry) + ': ' + String(entry.content ?? '')).join('\n');
}

function groupTimeline(timeline, revision, narrativeThroughSequence) {
    const groups = [];
    let current = null;
    for (const entry of Array.isArray(timeline) ? timeline : []) {
        if (entry.role === 'user') {
            if (current) groups.push(current);
            current = { entries: [entry], startsWithUser: true };
        } else if (!current) {
            current = { entries: [entry], startsWithUser: false };
        } else {
            current.entries.push(entry);
        }
    }
    if (current) groups.push(current);
    const currentIncomplete = groups.length > 0
        && groups.at(-1).startsWithUser
        && !groups.at(-1).entries.some(entry => entry.role === 'assistant');
    const currentGroup = currentIncomplete ? groups.pop() : null;
    const recent = groups.reverse().map(group => {
        const first = group.entries[0];
        const last = group.entries.at(-1);
        const uncovered = Number(last.sequence) > narrativeThroughSequence;
        return normalizeContextItem({
            contextItemId: 'raw:' + first.messageId + ':' + last.messageId,
            lane: CONTEXT_LANES.recentRaw,
            authority: 'committed_timeline',
            authorityRank: 650,
            priority: (uncovered ? 1000000 : 0) + Number(last.sequence || 0),
            content: renderTurnGroup(group.entries),
            atomic: true,
            sourceRefs: group.entries.map(entry => timelineSourceRef(entry, revision)),
            metadata: {
                fromSequence: first.sequence,
                toSequence: last.sequence,
                messageIds: group.entries.map(entry => entry.messageId),
                uncovered,
            },
        });
    });
    const currentUser = currentGroup ? normalizeContextItem({
        contextItemId: 'current-user:' + currentGroup.entries[0].messageId,
        lane: CONTEXT_LANES.currentUser,
        authority: 'current_user_input',
        authorityRank: 950,
        priority: 1000000,
        content: renderTurnGroup(currentGroup.entries),
        required: true,
        atomic: true,
        sourceRefs: currentGroup.entries.map(entry => timelineSourceRef(entry, revision)),
        metadata: {
            fromSequence: currentGroup.entries[0].sequence,
            toSequence: currentGroup.entries.at(-1).sequence,
            messageIds: currentGroup.entries.map(entry => entry.messageId),
        },
    }) : null;
    return { currentUser, recent };
}

function currentStateItems(snapshot) {
    const states = snapshot?.states && typeof snapshot.states === 'object' ? snapshot.states : {};
    const result = [];
    const world = states.atri_game_world;
    if (world && typeof world === 'object') {
        const worldState = world.schemaVersion === 1 && world.state && typeof world.state === 'object'
            ? world.state
            : world;
        result.push(normalizeContextItem({
            contextItemId: 'state:atri_game_world',
            lane: CONTEXT_LANES.currentState,
            authority: KNOWLEDGE_AUTHORITY.currentState.id,
            authorityRank: KNOWLEDGE_AUTHORITY.currentState.rank,
            priority: 1000,
            content: 'Authoritative current world state:\n' + JSON.stringify(worldState),
            required: true,
            sourceRefs: [{
                kind: 'state',
                providerId: 'atri_game_world',
                revisionId: snapshot?.revision?.revisionId,
                branchId: snapshot?.revision?.branchId,
            }],
        }));
        const events = Array.isArray(world?.journal?.events) ? world.journal.events.slice(-16) : [];
        if (events.length) {
            result.push(normalizeContextItem({
                contextItemId: 'state:atri_event_journal:' + String(events.at(-1)?.id || events.length),
                lane: CONTEXT_LANES.currentState,
                authority: KNOWLEDGE_AUTHORITY.eventJournal.id,
                authorityRank: KNOWLEDGE_AUTHORITY.eventJournal.rank,
                priority: 900,
                content: 'Recent committed Event Journal:\n' + JSON.stringify(events),
                sourceRefs: events
                    .filter(event => event?.id || event?.eventId)
                    .map(event => eventSourceRef(event, snapshot?.revision)),
            }));
        }
    }
    const variables = states.atri_variables?.values;
    if (variables && typeof variables === 'object' && Object.keys(variables).length) {
        result.push(normalizeContextItem({
            contextItemId: 'state:atri_variables',
            lane: CONTEXT_LANES.currentState,
            authority: KNOWLEDGE_AUTHORITY.currentState.id,
            authorityRank: KNOWLEDGE_AUTHORITY.currentState.rank,
            priority: 700,
            content: 'Authoritative current variables:\n' + JSON.stringify(variables),
            required: true,
            sourceRefs: [{
                kind: 'state',
                providerId: 'atri_variables',
                revisionId: snapshot?.revision?.revisionId,
                branchId: snapshot?.revision?.branchId,
            }],
        }));
    }
    return result;
}

function knowledgeItems(snapshot, target, memoryEvidence) {
    const plan = compileNativeKnowledgePlan(snapshot, { target, memoryEvidence });
    const parent = new Map(plan.included.map(item => [item.identity, item.identity]));
    const find = key => {
        let cursor = key;
        while (parent.get(cursor) !== cursor) cursor = parent.get(cursor);
        let walk = key;
        while (parent.get(walk) !== cursor) {
            const next = parent.get(walk);
            parent.set(walk, cursor);
            walk = next;
        }
        return cursor;
    };
    const union = (left, right) => {
        const a = find(left);
        const b = find(right);
        if (a !== b) parent.set(b, a);
    };
    const byEntry = new Map(plan.included.map(item => [
        item.knowledgeBindingId + ':' + item.knowledgeEntryId,
        item,
    ]));
    for (const item of plan.included) {
        for (const requiredId of item.entry?.relations?.requiredEntryIds ?? []) {
            const dependency = byEntry.get(item.knowledgeBindingId + ':' + requiredId);
            if (dependency) union(item.identity, dependency.identity);
        }
    }
    const items = plan.included.map(item => normalizeContextItem({
        contextItemId: 'knowledge:' + item.identity,
        lane: CONTEXT_LANES.knowledge,
        authority: item.authority,
        authorityRank: item.authorityRank,
        priority: item.priority,
        content: String(item.entry?.content ?? ''),
        atomicGroup: 'knowledge-component:' + find(item.identity),
        sourceRefs: [{
            kind: 'knowledge',
            knowledgeBindingId: item.knowledgeBindingId,
            knowledgeBaseId: item.knowledgeBaseId,
            knowledgeRevisionId: item.knowledgeRevisionId,
            knowledgeEntryId: item.knowledgeEntryId,
            revisionId: snapshot?.revision?.revisionId,
            branchId: snapshot?.revision?.branchId,
        }],
        metadata: {
            knowledgeIdentity: item.identity,
            knowledgeBindingId: item.knowledgeBindingId,
            knowledgeEntryId: item.knowledgeEntryId,
            selectionReason: item.selectionReason,
        },
    }));
    const rejected = plan.rejected.map(item => ({
        contextItemId: 'knowledge:' + item.identity,
        lane: CONTEXT_LANES.knowledge,
        reason: item.reason,
        sourceRefs: [],
        metadata: clone(item),
    }));
    for (const item of plan.authorityEvidence?.memory?.rejected ?? []) {
        rejected.push({
            contextItemId: 'memory:' + item.memoryId,
            lane: CONTEXT_LANES.memory,
            reason: item.reason,
            sourceRefs: [],
            metadata: clone(item),
        });
    }
    return { plan, items, rejected };
}

function currentBranchScope(snapshot) {
    const current = String(snapshot?.revision?.branchId || '');
    const scope = new Set(current ? [current] : []);
    const byId = new Map((Array.isArray(snapshot?.graph) ? snapshot.graph : [])
        .map(node => [String(node?.branchId || ''), node]));
    let cursor = byId.get(current);
    const seen = new Set();
    while (cursor && !seen.has(cursor.branchId)) {
        seen.add(cursor.branchId);
        scope.add(String(cursor.branchId));
        const parentId = String(cursor?.branch?.parentBranchId || '');
        if (!parentId) break;
        scope.add(parentId);
        cursor = byId.get(parentId);
    }
    return scope;
}

function narrativeItems(state, branchScope) {
    const included = [];
    const rejected = [];
    const levels = new Map();
    for (const artifact of state.narrative) {
        if (!branchScope.has(artifact.branchId)) {
            rejected.push({
                contextItemId: 'narrative:' + artifact.narrativeId,
                lane: CONTEXT_LANES.narrative,
                reason: 'branch_mismatch',
                sourceRefs: artifact.sourceRefs,
            });
            continue;
        }
        if (artifact.status !== 'complete') {
            rejected.push({
                contextItemId: 'narrative:' + artifact.narrativeId,
                lane: CONTEXT_LANES.narrative,
                reason: 'derived_pending',
                sourceRefs: artifact.sourceRefs,
            });
            continue;
        }
        const existing = levels.get(artifact.level);
        if (!existing || artifact.coverage.toSequence > existing.coverage.toSequence
            || (artifact.coverage.toSequence === existing.coverage.toSequence && artifact.createdAt > existing.createdAt)) {
            if (existing) {
                rejected.push({
                    contextItemId: 'narrative:' + existing.narrativeId,
                    lane: CONTEXT_LANES.narrative,
                    reason: 'superseded_summary',
                    sourceRefs: existing.sourceRefs,
                });
            }
            levels.set(artifact.level, artifact);
        } else {
            rejected.push({
                contextItemId: 'narrative:' + artifact.narrativeId,
                lane: CONTEXT_LANES.narrative,
                reason: 'superseded_summary',
                sourceRefs: artifact.sourceRefs,
            });
        }
    }
    const rank = { scene: 4, chapter: 3, arc: 2, campaign: 1 };
    for (const artifact of levels.values()) {
        included.push(normalizeContextItem({
            contextItemId: 'narrative:' + artifact.narrativeId,
            lane: CONTEXT_LANES.narrative,
            authority: 'source_backed_narrative',
            authorityRank: 450,
            priority: 300 + rank[artifact.level] + artifact.coverage.toSequence,
            content: artifact.level.toUpperCase() + ': ' + artifact.content,
            sourceRefs: artifact.sourceRefs,
            metadata: {
                narrativeId: artifact.narrativeId,
                level: artifact.level,
                coverage: artifact.coverage,
                childNarrativeIds: artifact.childNarrativeIds,
            },
        }));
    }
    return { included, rejected };
}

function commitmentItems(state, target, branchScope) {
    const included = [];
    const rejected = [];
    for (const commitment of state.commitments) {
        const id = 'commitment:' + commitment.commitmentId;
        if (!branchScope.has(commitment.branchId)) {
            rejected.push({ contextItemId: id, lane: CONTEXT_LANES.commitments, reason: 'branch_mismatch', sourceRefs: commitment.sourceRefs });
            continue;
        }
        if (commitment.status !== 'open') {
            rejected.push({
                contextItemId: id,
                lane: CONTEXT_LANES.commitments,
                reason: commitment.status === 'superseded' ? 'superseded_commitment' : 'closed_commitment',
                sourceRefs: commitment.sourceRefs,
            });
            continue;
        }
        if (!targetMatches(commitment.target, target)) {
            rejected.push({ contextItemId: id, lane: CONTEXT_LANES.commitments, reason: 'visibility', sourceRefs: commitment.sourceRefs });
            continue;
        }
        included.push(normalizeContextItem({
            contextItemId: id,
            lane: CONTEXT_LANES.commitments,
            authority: 'active_commitment',
            authorityRank: 650,
            priority: 500 + commitment.importance,
            content: commitment.content,
            required: commitment.importance >= 90,
            sourceRefs: commitment.sourceRefs,
            metadata: {
                commitmentId: commitment.commitmentId,
                importance: commitment.importance,
                status: commitment.status,
            },
        }));
    }
    return { included, rejected };
}

function memoryItems(memoryEvidence, snapshot, rejectedMemoryIds = new Set()) {
    const result = [];
    for (const [index, raw] of (Array.isArray(memoryEvidence) ? memoryEvidence : []).entries()) {
        const memoryId = text(raw?.memoryId || raw?.id) || 'memory-' + index;
        const content = String(raw?.content ?? raw?.text ?? '').trim();
        if (!content || rejectedMemoryIds.has(memoryId)) continue;
        const sourceRefs = Array.isArray(raw?.sourceRefs)
            ? raw.sourceRefs
            : Array.isArray(raw?.source?.sourceRefs)
                ? raw.source.sourceRefs
                : [];
        result.push(normalizeContextItem({
            contextItemId: 'memory:' + memoryId,
            lane: CONTEXT_LANES.memory,
            authority: KNOWLEDGE_AUTHORITY.memoryEvidence.id,
            authorityRank: KNOWLEDGE_AUTHORITY.memoryEvidence.rank,
            priority: Number(raw?.priority ?? raw?.score ?? 0) || 0,
            content,
            sourceRefs: sourceRefs.length ? sourceRefs : [{
                kind: 'memory',
                memoryId,
                revisionId: snapshot?.revision?.revisionId,
                branchId: snapshot?.revision?.branchId,
            }],
            tokenEstimate: raw?.tokens ?? raw?.tokenCount,
            metadata: {
                memoryId,
                recalled: true,
                source: clone(raw?.source ?? null),
            },
        }));
    }
    return result;
}

function compareItems(a, b) {
    return b.authorityRank - a.authorityRank
        || b.priority - a.priority
        || a.contextItemId.localeCompare(b.contextItemId);
}

function groupCandidates(items) {
    const groups = new Map();
    for (const item of items) {
        const group = groups.get(item.atomicGroup) ?? [];
        group.push(item);
        groups.set(item.atomicGroup, group);
    }
    return [...groups.values()].map(group => ({
        key: group[0].atomicGroup,
        items: group.sort(compareItems),
        authorityRank: Math.max(...group.map(item => item.authorityRank)),
        priority: Math.max(...group.map(item => item.priority)),
        required: group.some(item => item.required),
        lane: group[0].lane,
        tokens: group.reduce((sum, item) => sum + item.tokenCount, 0),
    }));
}

function policyNumbers(policy, options, promptCeiling) {
    const defaults = POLICY[policy];
    const safetyMargin = Math.min(
        promptCeiling,
        finiteInteger(options.safetyMarginTokens, defaults.safetyMargin),
    );
    const externalHardReserve = Math.min(
        Math.max(0, promptCeiling - safetyMargin),
        finiteInteger(options.externalHardReserveTokens, 0),
    );
    return {
        defaults,
        safetyMargin,
        externalHardReserve,
        hardReserve: finiteInteger(options.hardReserveTokens, defaults.hardReserve),
    };
}

function mergeLaneNumbers(defaults, overrides = {}) {
    const result = {};
    for (const lane of LANE_VALUES) {
        const base = defaults[lane];
        const override = Number(overrides?.[lane]);
        result[lane] = Number.isFinite(override) && override >= 0
            ? Math.floor(override)
            : Number.isFinite(Number(base))
                ? Math.floor(Number(base))
                : Number.POSITIVE_INFINITY;
    }
    return result;
}

async function tokenizeItems(items, countTokens, diagnostics) {
    const result = [];
    for (const item of items) {
        let tokenCount = item.tokenEstimate;
        if (!Number.isFinite(tokenCount) || tokenCount <= 0) {
            try {
                tokenCount = Math.max(1, finiteInteger(await countTokens(item.content), 1));
            } catch (error) {
                tokenCount = defaultCountTokens(item.content);
                diagnostics.push({
                    providerId: 'token_counter',
                    reason: 'token_count_fallback',
                    contextItemId: item.contextItemId,
                    error: String(error?.message || error),
                });
            }
        }
        result.push(Object.freeze({ ...item, tokenCount }));
    }
    return result;
}

function selectedRawMessageIds(included) {
    const ids = [];
    const seen = new Set();
    for (const item of included) {
        if (![CONTEXT_LANES.currentUser, CONTEXT_LANES.recentRaw].includes(item.lane)) continue;
        for (const ref of item.sourceRefs) {
            if (ref.kind === 'timeline' && ref.messageId && !seen.has(ref.messageId)) {
                seen.add(ref.messageId);
                ids.push(ref.messageId);
            }
        }
    }
    return ids;
}

function coverageDiagnostics(snapshot, state) {
    const headSequence = Math.max(-1, ...(snapshot?.timeline ?? []).map(item => Number(item.sequence ?? -1)));
    const narrativeThrough = state.coverage.narrativeThroughSequence;
    return {
        headSequence,
        narrativeThroughSequence: narrativeThrough,
        commitmentsThroughSequence: state.coverage.commitmentsThroughSequence,
        memoryThroughSequence: state.coverage.memoryThroughSequence,
        digestThroughSequence: state.coverage.digestThroughSequence,
        narrativeLag: Math.max(0, headSequence - narrativeThrough),
        uncoveredFromSequence: Math.min(headSequence + 1, Math.max(0, narrativeThrough + 1)),
        hasDerivedLag: narrativeThrough < headSequence,
    };
}

function renderWarmBlock(included) {
    const lanes = new Set([
        CONTEXT_LANES.currentState,
        CONTEXT_LANES.commitments,
        CONTEXT_LANES.narrative,
        CONTEXT_LANES.memory,
        CONTEXT_LANES.targetAgent,
    ]);
    const items = included.filter(item => lanes.has(item.lane) && item.content.trim());
    if (!items.length) return '';
    const lines = ['<atria_native_context>'];
    for (const item of items) {
        lines.push('<context_item lane="' + item.lane + '" id="' + item.contextItemId.replaceAll('"', '') + '">');
        lines.push(item.content);
        lines.push('</context_item>');
    }
    lines.push('</atria_native_context>');
    return lines.join('\n');
}

export class SessionContextCompiler {
    constructor({ providers = [] } = {}) {
        this.providers = providers.map(createContextProvider);
    }

    async compile(snapshot, options = {}) {
        if (!snapshot?.revision || !Array.isArray(snapshot?.timeline)) {
            throw new TypeError('SessionContextCompiler requires a Native Session snapshot');
        }
        const target = normalizeKnowledgeTarget(options.target ?? 'narrator');
        const policy = normalizeContextPolicy(options.policy);
        const modelContextLimit = finiteInteger(options.modelContextLimit, 0);
        const responseReserve = finiteInteger(options.responseReserve, 0);
        if (modelContextLimit <= 0 || responseReserve >= modelContextLimit) {
            throw new TypeError('Native Context budget requires model limit greater than response reserve');
        }
        const modelPromptLimit = modelContextLimit - responseReserve;
        const effectivePromptLimit = Number.isFinite(Number(options.effectivePromptLimit))
            && Number(options.effectivePromptLimit) > 0
            ? Math.floor(Number(options.effectivePromptLimit))
            : modelPromptLimit;
        const promptCeiling = Math.max(1, Math.min(modelPromptLimit, effectivePromptLimit));
        const budgetPolicy = policyNumbers(policy, options, promptCeiling);
        const promptBudget = Math.max(
            0,
            promptCeiling - budgetPolicy.safetyMargin - budgetPolicy.externalHardReserve,
        );
        const minima = mergeLaneNumbers(budgetPolicy.defaults.minima, options.minimumGuarantees);
        const caps = mergeLaneNumbers(budgetPolicy.defaults.caps, options.laneCaps);
        for (const lane of [CONTEXT_LANES.runtime, CONTEXT_LANES.tools, CONTEXT_LANES.currentUser, CONTEXT_LANES.currentState]) {
            if (!Number.isFinite(caps[lane])) caps[lane] = promptBudget;
        }

        const diagnostics = [];
        let derivedState;
        try {
            derivedState = normalizeContextDerivedState(snapshot.states?.[CONTEXT_DERIVED_NAMESPACE]);
        } catch (error) {
            derivedState = normalizeContextDerivedState(null);
            diagnostics.push({
                providerId: CONTEXT_DERIVED_NAMESPACE,
                reason: 'derived_state_invalid_graceful',
                error: String(error?.message || error),
            });
        }
        const coverage = coverageDiagnostics(snapshot, derivedState);
        const raw = groupTimeline(snapshot.timeline, snapshot.revision, coverage.narrativeThroughSequence);
        const knowledge = knowledgeItems(snapshot, target, options.memoryEvidence);
        const branchScope = currentBranchScope(snapshot);
        const narrative = narrativeItems(derivedState, branchScope);
        const commitments = commitmentItems(derivedState, target, branchScope);

        const rejectedMemoryIds = new Set(
            (knowledge.plan.authorityEvidence?.memory?.rejected ?? []).map(item => String(item.memoryId || '')),
        );
        let candidates = [
            ...currentStateItems(snapshot),
            ...knowledge.items,
            ...narrative.included,
            ...commitments.included,
            ...memoryItems(options.memoryEvidence, snapshot, rejectedMemoryIds),
            ...raw.recent,
        ];
        if (raw.currentUser) candidates.push(raw.currentUser);
        for (const lane of Array.isArray(options.deferredLanes) ? options.deferredLanes : []) {
            if (!LANE_VALUES.has(lane) || !Number.isFinite(Number(minima[lane])) || Number(minima[lane]) <= 0) continue;
            candidates.push(normalizeContextItem({
                contextItemId: 'deferred-reserve:' + lane,
                lane,
                authority: 'deferred_lane_reserve',
                authorityRank: lane === CONTEXT_LANES.memory ? KNOWLEDGE_AUTHORITY.memoryEvidence.rank : 100,
                priority: -1000000,
                content: '',
                tokenEstimate: Math.min(promptBudget, Number(minima[lane])),
                metadata: { deferredReserve: true },
            }));
        }

        const preRejected = [
            ...knowledge.rejected,
            ...narrative.rejected,
            ...commitments.rejected,
        ];

        const providerContext = Object.freeze({
            snapshot,
            target,
            policy,
            coverage: clone(coverage),
            knowledgePlan: knowledge.plan,
        });
        for (const provider of this.providers) {
            try {
                const supplied = await provider.provide(providerContext);
                for (const rawItem of Array.isArray(supplied) ? supplied : []) {
                    candidates.push(normalizeContextItem(rawItem));
                }
            } catch (error) {
                if (!provider.nonBlocking) throw error;
                diagnostics.push({
                    providerId: provider.providerId,
                    reason: 'provider_failed_graceful',
                    error: String(error?.message || error),
                });
            }
        }

        const rejected = [...preRejected];
        candidates = candidates.filter(item => {
            if (visibleTo(item, target)) return true;
            rejected.push({
                contextItemId: item.contextItemId,
                lane: item.lane,
                reason: 'visibility',
                sourceRefs: item.sourceRefs,
                metadata: clone(item.metadata),
            });
            return false;
        });

        const countTokens = typeof options.countTokens === 'function' ? options.countTokens : defaultCountTokens;
        const tokenized = await tokenizeItems(candidates, countTokens, diagnostics);
        const groups = groupCandidates(tokenized).sort((a, b) =>
            Number(b.required) - Number(a.required)
            || b.authorityRank - a.authorityRank
            || b.priority - a.priority
            || a.key.localeCompare(b.key));
        const laneUsage = Object.fromEntries([...LANE_VALUES].map(lane => [lane, {
            tokens: 0,
            items: 0,
            cap: Number.isFinite(caps[lane]) ? Math.min(promptBudget, caps[lane]) : promptBudget,
            minimumGuarantee: Math.min(promptBudget, minima[lane] || 0),
        }]));
        const included = [];
        const chosenGroups = new Set();
        let usedTokens = 0;

        const canFit = group => {
            const lane = laneUsage[group.lane];
            return usedTokens + group.tokens <= promptBudget
                && lane.tokens + group.tokens <= lane.cap;
        };
        const includeGroup = (group, allocation) => {
            chosenGroups.add(group.key);
            usedTokens += group.tokens;
            laneUsage[group.lane].tokens += group.tokens;
            laneUsage[group.lane].items += group.items.length;
            for (const item of group.items) included.push({
                ...item,
                allocation,
            });
        };

        const requiredGroups = groups.filter(group => group.required);
        for (const group of requiredGroups) {
            if (canFit(group)) {
                includeGroup(group, 'hard_reserve');
                continue;
            }
            const error = new Error('Native Context hard reserve cannot fit non-negotiable material');
            error.code = 'native_context_hard_reserve_overflow';
            error.details = {
                lane: group.lane,
                atomicGroup: group.key,
                requiredTokens: group.tokens,
                promptBudget,
                usedTokens,
                laneCap: laneUsage[group.lane]?.cap ?? null,
            };
            throw error;
        }
        const actualHardReserve = Math.min(
            promptBudget,
            Math.max(
                budgetPolicy.hardReserve,
                included.filter(item => item.allocation === 'hard_reserve').reduce((sum, item) => sum + item.tokenCount, 0),
            ),
        );

        for (const lane of MINIMUM_ORDER) {
            const goal = laneUsage[lane].minimumGuarantee;
            for (const group of groups.filter(item => item.lane === lane && !chosenGroups.has(item.key)).sort((a, b) =>
                b.authorityRank - a.authorityRank || b.priority - a.priority || a.key.localeCompare(b.key))) {
                if (laneUsage[lane].tokens >= goal) break;
                if (canFit(group)) includeGroup(group, 'minimum_guarantee');
            }
        }

        for (const group of groups.filter(item => !chosenGroups.has(item.key)).sort((a, b) =>
            b.authorityRank - a.authorityRank || b.priority - a.priority || a.key.localeCompare(b.key))) {
            if (canFit(group)) includeGroup(group, 'elastic');
        }

        const rejectedIds = new Set(rejected.map(item => item.contextItemId));
        for (const group of groups) {
            if (chosenGroups.has(group.key)) continue;
            for (const item of group.items) {
                if (rejectedIds.has(item.contextItemId)) continue;
                const lane = laneUsage[item.lane];
                let reason = lane.tokens + group.tokens > lane.cap ? 'lane_cap' : 'budget';
                if (item.lane === CONTEXT_LANES.recentRaw) {
                    reason = item.metadata?.uncovered ? 'derived_lag_budget' : 'outside_recent_raw_window';
                }
                rejected.push({
                    contextItemId: item.contextItemId,
                    lane: item.lane,
                    reason,
                    tokenCount: item.tokenCount,
                    sourceRefs: item.sourceRefs,
                    metadata: clone(item.metadata),
                });
            }
        }

        included.sort((a, b) =>
            Object.values(CONTEXT_LANES).indexOf(a.lane) - Object.values(CONTEXT_LANES).indexOf(b.lane)
            || compareItems(a, b));

        const rawMessageIds = selectedRawMessageIds(included);
        const selectedKnowledgeIdentities = included
            .filter(item => item.lane === CONTEXT_LANES.knowledge)
            .map(item => item.metadata?.knowledgeIdentity)
            .filter(Boolean);

        const plan = {
            schemaVersion: CONTEXT_PLAN_SCHEMA_VERSION,
            revisionId: snapshot.revision.revisionId,
            branchId: snapshot.revision.branchId,
            target: clone(target),
            targetKey: targetKey(target),
            policy,
            budget: {
                modelContextLimit,
                responseReserve,
                modelPromptLimit,
                effectivePromptLimit,
                promptCeiling,
                safetyMargin: budgetPolicy.safetyMargin,
                externalHardReserve: budgetPolicy.externalHardReserve,
                hardReserve: actualHardReserve,
                promptBudget,
                usedTokens,
                remainingTokens: Math.max(0, promptBudget - usedTokens),
            },
            included,
            rejected: rejected.sort((a, b) =>
                String(a.lane).localeCompare(String(b.lane))
                || String(a.contextItemId).localeCompare(String(b.contextItemId))),
            laneUsage,
            sourceSelection: {
                rawMessageIds,
                selectedKnowledgeIdentities,
            },
            coverage,
            diagnostics,
            knowledgePlan: {
                revisionId: knowledge.plan.revisionId,
                branchId: knowledge.plan.branchId,
                target: clone(knowledge.plan.target),
                includedIdentities: knowledge.plan.included.map(item => item.identity),
                rejected: clone(knowledge.plan.rejected),
            },
        };
        plan.renderedWarmContext = renderWarmBlock(plan.included);
        return Object.freeze(plan);
    }
}

export async function compileNativeContextPlan(snapshot, options = {}) {
    const compiler = new SessionContextCompiler({ providers: options.providers ?? [] });
    return compiler.compile(snapshot, options);
}

export function filterNativeCoreChatForContext(coreChat, plan) {
    if (!Array.isArray(coreChat) || !plan || plan.schemaVersion !== CONTEXT_PLAN_SCHEMA_VERSION) return coreChat;
    const allowed = new Set(plan.sourceSelection?.rawMessageIds ?? []);
    return coreChat.filter(message => {
        const messageId = message?.atri_native?.messageId;
        if (!messageId) return true;
        return allowed.has(messageId);
    });
}

export function getContextLaneBudget(plan, lane) {
    if (!plan || plan.schemaVersion !== CONTEXT_PLAN_SCHEMA_VERSION || !LANE_VALUES.has(lane)) return null;
    const usage = plan.laneUsage?.[lane];
    return usage ? {
        tokens: Number(usage.tokens || 0),
        cap: Number(usage.cap || 0),
        minimumGuarantee: Number(usage.minimumGuarantee || 0),
    } : null;
}


/**
 * Replace a deferred lane reservation with material that became available
 * later in the same generation (for example Memory recall after WI scan).
 * The replacement can consume only the lane reservation plus still-unspent
 * global budget; it can never expand the total ContextPlan budget.
 */
export function replaceContextLaneReservation(planValue, lane, values = []) {
    if (!planValue || planValue.schemaVersion !== CONTEXT_PLAN_SCHEMA_VERSION || !LANE_VALUES.has(lane)) {
        throw new TypeError('Invalid ContextPlan lane replacement');
    }
    const plan = clone(planValue);
    const laneUsage = plan.laneUsage?.[lane];
    if (!laneUsage) throw new TypeError('ContextPlan lane is unavailable');
    const reserves = plan.included.filter(item => item.lane === lane && item.metadata?.deferredReserve === true);
    const reservedTokens = reserves.reduce((sum, item) => sum + Number(item.tokenCount || 0), 0);
    const baseLaneTokens = Math.max(0, Number(laneUsage.tokens || 0) - reservedTokens);
    const available = Math.max(
        0,
        Math.min(
            Number(laneUsage.cap || 0) - baseLaneTokens,
            reservedTokens + Number(plan.budget?.remainingTokens || 0),
        ),
    );
    const admitted = [];
    const rejected = [];
    let used = 0;
    for (const raw of Array.isArray(values) ? values : []) {
        const normalized = normalizeContextItem({ ...raw, lane });
        const tokenCount = Number.isFinite(Number(normalized.tokenEstimate)) && Number(normalized.tokenEstimate) > 0
            ? Math.floor(Number(normalized.tokenEstimate))
            : defaultCountTokens(normalized.content);
        const item = { ...normalized, tokenCount, allocation: 'deferred_actual' };
        if (used + tokenCount <= available) {
            admitted.push(item);
            used += tokenCount;
        } else {
            rejected.push({
                contextItemId: item.contextItemId,
                lane,
                reason: 'lane_cap',
                tokenCount,
                sourceRefs: item.sourceRefs,
                metadata: clone(item.metadata),
            });
        }
    }
    plan.included = [
        ...plan.included.filter(item => !(item.lane === lane && item.metadata?.deferredReserve === true)),
        ...admitted,
    ];
    plan.rejected = [...plan.rejected, ...rejected].sort((a, b) =>
        String(a.lane).localeCompare(String(b.lane))
        || String(a.contextItemId).localeCompare(String(b.contextItemId)));
    laneUsage.tokens = baseLaneTokens + used;
    laneUsage.items = plan.included.filter(item => item.lane === lane).length;
    const oldUsed = Number(plan.budget.usedTokens || 0);
    plan.budget.usedTokens = Math.max(0, oldUsed - reservedTokens + used);
    plan.budget.remainingTokens = Math.max(0, Number(plan.budget.promptBudget || 0) - plan.budget.usedTokens);
    plan.renderedWarmContext = renderWarmBlock(plan.included);
    return Object.freeze(plan);
}
