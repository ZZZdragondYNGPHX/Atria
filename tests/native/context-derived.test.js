import { describe, expect, test } from '@jest/globals';
import {
    appendNarrativeArtifact,
    appendTurnDigest,
    createContextDerivedState,
    evaluateDerivationGate,
    openCommitment,
    transitionCommitment,
    validateNarrativeSpine,
} from '../../public/scripts/native/context-derived.js';

const timelineRef = (messageId, sequence = 0) => ({
    kind: 'timeline',
    messageId,
    branchId: 'branch-root',
    revisionId: 'revision-root',
    sequence,
});

describe('N7 Native derived Context contracts', () => {
    test('Narrative Spine is source-backed, branch-scoped and hierarchical', () => {
        let state = createContextDerivedState();
        state = appendNarrativeArtifact(state, {
            narrativeId: 'scene-1',
            level: 'scene',
            branchId: 'branch-root',
            revisionId: 'revision-scene',
            content: 'The party reached the harbor.',
            sourceRefs: [timelineRef('message-1', 1), timelineRef('message-2', 2)],
            coverage: { fromSequence: 1, toSequence: 2, messageIds: ['message-1', 'message-2'] },
        });
        state = appendNarrativeArtifact(state, {
            narrativeId: 'chapter-1',
            level: 'chapter',
            branchId: 'branch-root',
            revisionId: 'revision-chapter',
            content: 'The harbor chapter.',
            sourceRefs: [{ kind: 'narrative', narrativeId: 'scene-1', branchId: 'branch-root', revisionId: 'revision-scene' }],
            childNarrativeIds: ['scene-1'],
            coverage: { fromSequence: 1, toSequence: 2, messageIds: ['message-1', 'message-2'] },
        });

        expect(validateNarrativeSpine(state.narrative).map(item => item.level)).toEqual(['scene', 'chapter']);
        expect(state.coverage.narrativeThroughSequence).toBe(2);
        expect(() => appendNarrativeArtifact(state, {
            narrativeId: 'arc-cross-branch',
            level: 'arc',
            branchId: 'branch-child',
            revisionId: 'revision-child',
            content: 'Invalid cross-branch arc.',
            sourceRefs: [{ kind: 'narrative', narrativeId: 'chapter-1', branchId: 'branch-root' }],
            childNarrativeIds: ['chapter-1'],
            coverage: { fromSequence: 1, toSequence: 2 },
        })).toThrow(/Branch|child/i);
    });

    test('Active Commitments keep stable identity and explicit lifecycle', () => {
        let state = openCommitment(createContextDerivedState(), {
            commitmentId: 'commitment-rescue',
            branchId: 'branch-root',
            revisionId: 'revision-open',
            content: 'Return for the stranded sailor.',
            importance: 95,
            sourceRefs: [timelineRef('message-promise', 4)],
        });
        expect(state.commitments[0]).toMatchObject({
            commitmentId: 'commitment-rescue',
            status: 'open',
            importance: 95,
        });

        state = transitionCommitment(state, 'commitment-rescue', {
            revisionId: 'revision-close',
            status: 'closed',
            sourceRefs: [timelineRef('message-resolved', 12)],
        });
        expect(state.commitments[0]).toMatchObject({
            commitmentId: 'commitment-rescue',
            status: 'closed',
            revisionId: 'revision-close',
        });
        expect(state.commitments[0].sourceRefs.map(ref => ref.messageId)).toEqual([
            'message-promise',
            'message-resolved',
        ]);
        expect(() => transitionCommitment(state, 'commitment-rescue', {
            revisionId: 'revision-again',
            status: 'closed',
        })).toThrow(/open Commitments/i);
    });

    test('TurnDigest contract retains producer, source provenance and coverage', () => {
        const state = appendTurnDigest(createContextDerivedState(), {
            branchId: 'branch-root',
            revisionId: 'revision-digest',
            producer: 'orchestrator',
            sourceRefs: [timelineRef('message-10', 10), timelineRef('message-11', 11)],
            coverage: { fromSequence: 10, toSequence: 11 },
            durableFacts: [{ fact: 'harbor_gate_open' }],
            commitmentProposals: [{ content: 'Pay the dock fee' }],
            narrativeBeats: ['Entered the inner harbor'],
            sceneBoundary: { detected: true, reason: 'location_change', confidence: 1 },
        });
        expect(state.digests[0]).toMatchObject({
            schemaVersion: 1,
            producer: 'orchestrator',
            coverage: { fromSequence: 10, toSequence: 11 },
        });
        expect(state.coverage.digestThroughSequence).toBe(11);
    });

    test('Derivation Gate avoids mandatory hidden work on ordinary turns and reuses existing results', () => {
        const normal = evaluateDerivationGate({
            policy: 'balanced',
            turnsSinceDigest: 1,
            memory: { pendingCount: 1 },
            hasCommittedEvidence: true,
        });
        expect(normal).toMatchObject({
            blocking: false,
            runTurnDistiller: false,
            runMemoryConsolidation: false,
            cheapMemoryIngest: true,
        });

        const threshold = evaluateDerivationGate({
            policy: 'balanced',
            turnsSinceDigest: 10,
            memory: { pendingCount: 10 },
        });
        expect(threshold.runTurnDistiller).toBe(true);
        expect(threshold.runMemoryConsolidation).toBe(true);

        const boundary = evaluateDerivationGate({
            policy: 'economy',
            events: [{ type: 'scene_close' }],
            turnsSinceDigest: 0,
            memory: { pendingCount: 0 },
        });
        expect(boundary.summaryLevels).toEqual(['scene']);
        expect(boundary.runMemoryConsolidation).toBe(true);

        const reused = evaluateDerivationGate({
            policy: 'rich',
            runtimeDigest: { source: 'runtime', beats: ['already-derived'] },
            events: [{ type: 'quest_complete' }],
        });
        expect(reused.runTurnDistiller).toBe(false);
        expect(reused.reusableDigest).toEqual({ source: 'runtime', beats: ['already-derived'] });
    });

    test('Utility failure is diagnostic only and never turns derivation into a blocking step', () => {
        const decision = evaluateDerivationGate({
            policy: 'balanced',
            utilityError: new Error('offline'),
            turnsSinceDigest: 1,
        });
        expect(decision.blocking).toBe(false);
        expect(decision.reasons).toContain('utility_failed_graceful');
    });
});
