import { describe, expect, test } from '@jest/globals';
import {
    CONTEXT_LANES,
    SessionContextCompiler,
    compileNativeContextPlan,
    createContextProvider,
    filterNativeCoreChatForContext,
    replaceContextLaneReservation,
} from '../../public/scripts/native/context-compiler.js';
import { sessionFixture } from './helpers/session-fixture.js';

const countTokens = value => Math.max(1, Math.ceil(String(value ?? '').length / 4));

function timeline(turns, branchId = 'branch-root') {
    const result = [];
    for (let turn = 0; turn < turns; turn++) {
        result.push({
            messageId: 'message-u-' + turn,
            branchId,
            sequence: result.length,
            role: 'user',
            content: 'User turn ' + turn + ' asks about harbor route and obligation.',
        });
        result.push({
            messageId: 'message-a-' + turn,
            branchId,
            sequence: result.length,
            role: 'assistant',
            content: 'Assistant turn ' + turn + ' advances the harbor route with grounded detail.',
        });
    }
    return result;
}

function buildSnapshot(turns = 20, { branchId = 'branch-root', derived = null, graph = null } = {}) {
    const fixture = sessionFixture();
    return {
        manifest: structuredClone(fixture.manifest),
        knowledge: {
            schemaVersion: 1,
            bindings: [structuredClone(fixture.binding)],
            snapshots: [],
        },
        states: {
            atri_game_world: {
                schemaVersion: 1,
                state: { hp: 8, location: 'harbor', quest: { stage: 2 } },
                journal: {
                    version: 1,
                    events: [{ id: 'event-arrive', seq: 1, type: 'arrive', payload: { location: 'harbor' }, branchId }],
                },
            },
            ...(derived ? { atri_context_derived: derived } : {}),
        },
        revision: { revisionId: 'revision-current', branchId },
        graph: graph ?? [{ branchId, branch: { branchId, parentBranchId: null } }],
        timeline: timeline(turns, branchId),
    };
}

function budget(overrides = {}) {
    return {
        modelContextLimit: 4096,
        responseReserve: 512,
        safetyMarginTokens: 128,
        hardReserveTokens: 256,
        minimumGuarantees: {
            [CONTEXT_LANES.currentState]: 128,
            [CONTEXT_LANES.commitments]: 64,
            [CONTEXT_LANES.recentRaw]: 800,
            [CONTEXT_LANES.knowledge]: 128,
            [CONTEXT_LANES.narrative]: 128,
            [CONTEXT_LANES.memory]: 128,
            [CONTEXT_LANES.targetAgent]: 64,
        },
        laneCaps: {
            [CONTEXT_LANES.currentState]: 800,
            [CONTEXT_LANES.commitments]: 400,
            [CONTEXT_LANES.recentRaw]: 1200,
            [CONTEXT_LANES.knowledge]: 400,
            [CONTEXT_LANES.narrative]: 500,
            [CONTEXT_LANES.memory]: 500,
            [CONTEXT_LANES.targetAgent]: 400,
        },
        countTokens,
        ...overrides,
    };
}

describe('N7 SessionContextCompiler / Checkpoint C', () => {
    test.each([100, 1000, 10000])('fixed model budget stays bounded across %i complete turns', async turns => {
        const plan = await compileNativeContextPlan(buildSnapshot(turns), budget());
        expect(plan.budget.usedTokens).toBeLessThanOrEqual(plan.budget.promptBudget);
        expect(plan.laneUsage.recent_raw.tokens).toBeLessThanOrEqual(plan.laneUsage.recent_raw.cap);
        expect(plan.included.filter(item => item.lane === CONTEXT_LANES.recentRaw).length).toBeLessThan(80);
        for (const item of plan.included.filter(item => item.lane === CONTEXT_LANES.recentRaw)) {
            expect(item.sourceRefs).toHaveLength(2);
            expect(new Set(item.sourceRefs.map(ref => ref.messageId)).size).toBe(2);
        }
    }, 30000);

    test('Recent Raw token accounting uses generation-processed prompt text while retaining canonical sourceRefs', async () => {
        const snapshot = buildSnapshot(4);
        const target = snapshot.timeline.at(-1);
        const expanded = 'REGEX_EXPANDED '.repeat(160);
        const plan = await compileNativeContextPlan(snapshot, budget({
            laneCaps: { [CONTEXT_LANES.recentRaw]: 520 },
            minimumGuarantees: { [CONTEXT_LANES.recentRaw]: 300 },
            promptContentByMessageId: { [target.messageId]: expanded },
        }));
        const group = [
            ...plan.included,
            ...plan.rejected,
        ].find(item => item.sourceRefs?.some(ref => ref.messageId === target.messageId));
        expect(group).toBeDefined();
        expect(group.sourceRefs.some(ref => ref.messageId === target.messageId)).toBe(true);
        const validOutcome = plan.included.includes(group)
            ? Number(group.tokenCount) > 300
            : ['budget', 'lane_cap', 'derived_lag_budget', 'outside_recent_raw_window'].includes(group.reason);
        expect(validOutcome).toBe(true);
    });

    test('Recent Raw uses complete TurnGroups and never partial-message trimming', async () => {
        const snapshot = buildSnapshot(50);
        snapshot.timeline.push({
            messageId: 'message-current-user',
            branchId: snapshot.revision.branchId,
            sequence: snapshot.timeline.length,
            role: 'user',
            content: 'Current user input remains hard-reserved.',
        });
        const plan = await compileNativeContextPlan(snapshot, budget({
            modelContextLimit: 1800,
            responseReserve: 300,
            laneCaps: { [CONTEXT_LANES.recentRaw]: 450 },
            minimumGuarantees: { [CONTEXT_LANES.recentRaw]: 300 },
        }));
        const current = plan.included.find(item => item.lane === CONTEXT_LANES.currentUser);
        expect(current?.sourceRefs.map(ref => ref.messageId)).toEqual(['message-current-user']);
        for (const item of plan.included.filter(entry => entry.lane === CONTEXT_LANES.recentRaw)) {
            expect(item.sourceRefs).toHaveLength(2);
        }
        expect(plan.rejected.some(item => item.reason === 'outside_recent_raw_window' || item.reason === 'derived_lag_budget')).toBe(true);
    });

    test('derived lag keeps uncovered raw turns prioritized and explicitly diagnosed', async () => {
        const derived = {
            schemaVersion: 1,
            narrative: [{
                narrativeId: 'scene-old',
                level: 'scene',
                branchId: 'branch-root',
                revisionId: 'revision-old',
                fromRevisionId: 'revision-old',
                toRevisionId: 'revision-old',
                content: 'Only the opening scene has been summarized.',
                sourceRefs: [
                    { kind: 'timeline', messageId: 'message-u-0', branchId: 'branch-root', revisionId: 'revision-old', sequence: 0 },
                    { kind: 'timeline', messageId: 'message-a-0', branchId: 'branch-root', revisionId: 'revision-old', sequence: 1 },
                ],
                childNarrativeIds: [],
                coverage: { fromSequence: 0, toSequence: 1, messageIds: ['message-u-0', 'message-a-0'], eventIds: [] },
                createdAt: 1,
                status: 'complete',
            }],
            commitments: [],
            digests: [],
            coverage: {
                narrativeThroughSequence: 1,
                commitmentsThroughSequence: -1,
                memoryThroughSequence: -1,
                digestThroughSequence: -1,
            },
        };
        const plan = await compileNativeContextPlan(buildSnapshot(120, { derived }), budget({
            laneCaps: { [CONTEXT_LANES.recentRaw]: 500 },
            minimumGuarantees: { [CONTEXT_LANES.recentRaw]: 400 },
        }));
        expect(plan.coverage.hasDerivedLag).toBe(true);
        expect(plan.coverage.uncoveredFromSequence).toBe(2);
        expect(plan.coverage).toHaveProperty('memoryCoveredAssistantSeq');
        expect(plan.included.filter(item => item.lane === CONTEXT_LANES.recentRaw).every(item => item.metadata.uncovered)).toBe(true);
        expect(plan.rejected.some(item => item.lane === CONTEXT_LANES.recentRaw && item.reason === 'derived_lag_budget')).toBe(true);
    });

    test('Narrative Spine remains branch-scoped and never substitutes canonical Timeline authority', async () => {
        const derived = {
            schemaVersion: 1,
            narrative: [
                {
                    narrativeId: 'scene-root',
                    level: 'scene',
                    branchId: 'branch-root',
                    revisionId: 'revision-root-scene',
                    content: 'Root harbor scene.',
                    sourceRefs: [{ kind: 'timeline', messageId: 'message-a-0', branchId: 'branch-root', revisionId: 'revision-root-scene', sequence: 1 }],
                    childNarrativeIds: [],
                    coverage: { fromSequence: 0, toSequence: 1, messageIds: ['message-a-0'], eventIds: [] },
                    status: 'complete',
                },
                {
                    narrativeId: 'scene-other',
                    level: 'scene',
                    branchId: 'branch-other',
                    revisionId: 'revision-other-scene',
                    content: 'Other branch scene.',
                    sourceRefs: [{ kind: 'timeline', messageId: 'other-message', branchId: 'branch-other', revisionId: 'revision-other-scene', sequence: 1 }],
                    childNarrativeIds: [],
                    coverage: { fromSequence: 0, toSequence: 1, messageIds: ['other-message'], eventIds: [] },
                    status: 'complete',
                },
            ],
            commitments: [],
            digests: [],
            coverage: {
                narrativeThroughSequence: 1,
                commitmentsThroughSequence: -1,
                memoryThroughSequence: -1,
                digestThroughSequence: -1,
            },
        };
        const childGraph = [
            { branchId: 'branch-root', branch: { branchId: 'branch-root', parentBranchId: null } },
            { branchId: 'branch-child', branch: { branchId: 'branch-child', parentBranchId: 'branch-root' } },
        ];
        const snapshot = buildSnapshot(12, {
            branchId: 'branch-child',
            derived,
            graph: childGraph,
        });
        snapshot.timeline = timeline(12, 'branch-child');
        const plan = await compileNativeContextPlan(snapshot, budget());
        // Common-ancestor derived material is inherited through the Revision,
        // while sibling/non-ancestor artifacts remain isolated.
        expect(plan.included.some(item => item.contextItemId === 'narrative:scene-root')).toBe(true);
        expect(plan.included.some(item => item.contextItemId === 'narrative:scene-other')).toBe(false);
        expect(plan.rejected).toEqual(expect.arrayContaining([
            expect.objectContaining({ contextItemId: 'narrative:scene-other', reason: 'branch_mismatch' }),
        ]));
        expect(plan.sourceSelection.rawMessageIds.length).toBeGreaterThan(0);
    });

    test('canonical atri_world_state remains authoritative when Game Runtime world state is absent', async () => {
        const snapshot = buildSnapshot(4);
        delete snapshot.states.atri_game_world;
        snapshot.states.atri_world_state = {
            primaryWorldId: 'world-native',
            worlds: {
                'world-native': {
                    worldRevisionId: 'worldv-native',
                    state: { location: 'library', hp: 9 },
                },
            },
        };
        const plan = await compileNativeContextPlan(snapshot, budget());
        const world = plan.included.find(item => item.contextItemId === 'state:atri_world_state');
        expect(world).toBeDefined();
        expect(world.required).toBe(true);
        expect(world.content).toContain('"location":"library"');
        expect(plan.included.some(item => item.contextItemId === 'state:atri_game_world')).toBe(false);
    });

    test('Narrator / Actor / Agent Context views preserve target isolation and Knowledge identity', async () => {
        const snapshot = buildSnapshot(6);
        const source = snapshot.manifest.knowledge[0];
        const base = source.entries[0];
        source.entries = [
            { ...structuredClone(base), knowledgeEntryId: 'kentry-narrator', content: 'Narrator only', delivery: { visibility: ['narrator'] } },
            { ...structuredClone(base), knowledgeEntryId: 'kentry-actor', content: 'Actor only', delivery: { visibility: ['actor'] } },
            { ...structuredClone(base), knowledgeEntryId: 'kentry-agent', content: 'Agent only', delivery: { visibility: ['agent'] } },
        ];
        source.revision.entryIds = source.entries.map(entry => entry.knowledgeEntryId);

        const narrator = await compileNativeContextPlan(snapshot, budget({ target: 'narrator' }));
        const actor = await compileNativeContextPlan(snapshot, budget({ target: { kind: 'actor', id: 'actor-1' } }));
        const agent = await compileNativeContextPlan(snapshot, budget({ target: { kind: 'agent', id: 'agent-1' } }));
        expect(narrator.sourceSelection.selectedKnowledgeIdentities).toHaveLength(1);
        expect(actor.sourceSelection.selectedKnowledgeIdentities).toHaveLength(1);
        expect(agent.sourceSelection.selectedKnowledgeIdentities).toHaveLength(1);
        expect(narrator.sourceSelection.selectedKnowledgeIdentities[0]).not.toBe(actor.sourceSelection.selectedKnowledgeIdentities[0]);
        expect(actor.sourceSelection.selectedKnowledgeIdentities[0]).not.toBe(agent.sourceSelection.selectedKnowledgeIdentities[0]);
    });

    test('non-negotiable runtime/tool material fails closed instead of being silently dropped', async () => {
        const compiler = new SessionContextCompiler({
            providers: [createContextProvider({
                providerId: 'oversized-runtime',
                provide: async () => [{
                    contextItemId: 'runtime:oversized',
                    lane: CONTEXT_LANES.runtime,
                    authority: 'runtime_mechanics',
                    authorityRank: 900,
                    priority: 1000,
                    content: 'x'.repeat(20000),
                    required: true,
                }],
            })],
        });
        await expect(compiler.compile(buildSnapshot(2), budget({
            modelContextLimit: 1200,
            responseReserve: 300,
        }))).rejects.toMatchObject({ code: 'native_context_hard_reserve_overflow' });
    });

    test('prompt assembly seam keeps only ContextPlan-selected Native raw messages', async () => {
        const snapshot = buildSnapshot(80);
        const plan = await compileNativeContextPlan(snapshot, budget({
            laneCaps: { [CONTEXT_LANES.recentRaw]: 450 },
            minimumGuarantees: { [CONTEXT_LANES.recentRaw]: 300 },
        }));
        const coreChat = snapshot.timeline.map(entry => ({
            mes: entry.content,
            is_user: entry.role === 'user',
            atri_native: { messageId: entry.messageId },
        }));
        coreChat.push({ mes: 'non-native framing injection', is_system: true });
        const filtered = filterNativeCoreChatForContext(coreChat, plan);
        const nativeIds = filtered
            .map(item => item.atri_native?.messageId)
            .filter(Boolean);
        expect(nativeIds).toEqual(plan.sourceSelection.rawMessageIds);
        expect(filtered.some(item => item.mes === 'non-native framing injection')).toBe(true);
    });

    test('provider/utility failure degrades gracefully without blocking Context compilation', async () => {
        const compiler = new SessionContextCompiler({
            providers: [createContextProvider({
                providerId: 'utility-failure',
                provide: async () => { throw new Error('utility unavailable'); },
            })],
        });
        const plan = await compiler.compile(buildSnapshot(8), budget());
        expect(plan.budget.usedTokens).toBeLessThanOrEqual(plan.budget.promptBudget);
        expect(plan.diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({ providerId: 'utility-failure', reason: 'provider_failed_graceful' }),
        ]));
    });

    test('Knowledge lane exposes selected usage separately from the selector cap', async () => {
        const plan = await compileNativeContextPlan(buildSnapshot(4), budget({
            laneCaps: { [CONTEXT_LANES.knowledge]: 320 },
            minimumGuarantees: { [CONTEXT_LANES.knowledge]: 80 },
        }));
        expect(plan.laneUsage.knowledge.tokens).toBeLessThanOrEqual(320);
        expect(plan.laneUsage.knowledge.cap).toBe(320);
        expect(plan.laneUsage.knowledge.cap).toBeGreaterThanOrEqual(plan.laneUsage.knowledge.tokens);
    });

    test('late Memory recall replaces, but cannot exceed, its reserved lane budget', async () => {
        const plan = await compileNativeContextPlan(buildSnapshot(8), budget({
            deferredLanes: [CONTEXT_LANES.memory],
            minimumGuarantees: { [CONTEXT_LANES.memory]: 180 },
            laneCaps: { [CONTEXT_LANES.memory]: 220 },
        }));
        const reserved = plan.included.find(item => item.contextItemId === 'deferred-reserve:memory');
        expect(reserved).toBeDefined();

        const ancientRef = {
            kind: 'timeline',
            messageId: 'message-a-0',
            branchId: 'branch-root',
            revisionId: 'revision-current',
            sequence: 1,
        };
        const updated = replaceContextLaneReservation(plan, CONTEXT_LANES.memory, [{
            contextItemId: 'memory:ancient-harbor',
            authority: 'memory_history_evidence',
            authorityRank: 200,
            priority: 100,
            content: 'Ancient harbor fact with provenance.',
            sourceRefs: [ancientRef],
            tokenEstimate: Math.min(120, reserved.tokenCount),
        }]);
        expect(updated.included.some(item => item.contextItemId === 'deferred-reserve:memory')).toBe(false);
        expect(updated.included.find(item => item.contextItemId === 'memory:ancient-harbor')?.sourceRefs).toEqual([ancientRef]);
        expect(updated.laneUsage.memory.tokens).toBeLessThanOrEqual(updated.laneUsage.memory.cap);
        expect(updated.budget.usedTokens).toBeLessThanOrEqual(updated.budget.promptBudget);
    });
});
