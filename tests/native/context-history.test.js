import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { compileNativeContextPlan, CONTEXT_LANES } from '../../public/scripts/native/context-compiler.js';
import { installFixture } from './helpers/session-fixture.js';

describe('N7 exact raw-history drill-down', () => {
    let h;
    let f;

    beforeEach(async () => {
        h = await makeTempFsEngineHarness();
        f = await installFixture(h);
    });

    afterEach(async () => {
        await h.cleanup();
    });

    test('excluded raw history remains readable by exact Revision range and stable messageId', async () => {
        let view = await f.core.create(h.handle, f.start);
        const sessionId = view.session.sessionId;
        view = await f.core.appendTimeline(h.handle, sessionId, { role: 'user', content: 'Ancient question' });
        view = await f.core.appendTimeline(h.handle, sessionId, {
            role: 'assistant',
            actorId: view.entryPoint.primaryActorId ?? view.entryPoint.actorIds[0],
            content: 'Ancient answer: the old harbor bell is beneath Pier Seven.',
        });
        const ancientRevisionId = view.revision.revisionId;
        const ancientMessageId = view.timeline.at(-1).messageId;

        for (let turn = 0; turn < 12; turn++) {
            view = await f.core.appendTimeline(h.handle, sessionId, { role: 'user', content: 'Later user turn ' + turn });
            view = await f.core.appendTimeline(h.handle, sessionId, {
                role: 'assistant',
                actorId: view.entryPoint.primaryActorId ?? view.entryPoint.actorIds[0],
                content: 'Later assistant turn ' + turn,
            });
        }

        const oldRange = await f.sessionRepo.readTimelineRange(h.handle, sessionId, {
            revisionId: ancientRevisionId,
            fromSequence: 1,
            toSequence: 3,
        });
        expect(oldRange.entries.map(entry => entry.content)).toEqual([
            'Ancient question',
            'Ancient answer: the old harbor bell is beneath Pier Seven.',
        ]);

        const currentRead = await f.sessionRepo.readTimelineByMessageIds(
            h.handle,
            sessionId,
            [ancientMessageId],
            { revisionId: view.revision.revisionId },
        );
        expect(currentRead.missingMessageIds).toEqual([]);
        expect(currentRead.entries[0]).toMatchObject({
            messageId: ancientMessageId,
            content: 'Ancient answer: the old harbor bell is beneath Pier Seven.',
        });
    });

    test('recalled ancient Memory provenance drills through sourceRefs to exact immutable Timeline text', async () => {
        let view = await f.core.create(h.handle, f.start);
        const sessionId = view.session.sessionId;
        view = await f.core.appendTimeline(h.handle, sessionId, { role: 'user', content: 'Where is the old bell?' });
        view = await f.core.appendTimeline(h.handle, sessionId, {
            role: 'assistant',
            actorId: view.entryPoint.primaryActorId ?? view.entryPoint.actorIds[0],
            content: 'The old bell is beneath Pier Seven.',
        });
        const ancientRevisionId = view.revision.revisionId;
        const ancient = view.timeline.at(-1);

        for (let turn = 0; turn < 14; turn++) {
            view = await f.core.appendTimeline(h.handle, sessionId, { role: 'user', content: 'Recent user ' + turn });
            view = await f.core.appendTimeline(h.handle, sessionId, {
                role: 'assistant',
                actorId: view.entryPoint.primaryActorId ?? view.entryPoint.actorIds[0],
                content: 'Recent assistant ' + turn,
            });
        }

        const plan = await compileNativeContextPlan(view, {
            target: 'narrator',
            policy: 'balanced',
            modelContextLimit: 3000,
            responseReserve: 400,
            safetyMarginTokens: 100,
            minimumGuarantees: {
                [CONTEXT_LANES.currentState]: 100,
                [CONTEXT_LANES.recentRaw]: 260,
                [CONTEXT_LANES.knowledge]: 80,
                [CONTEXT_LANES.memory]: 260,
            },
            laneCaps: {
                [CONTEXT_LANES.recentRaw]: 500,
                [CONTEXT_LANES.knowledge]: 180,
                [CONTEXT_LANES.memory]: 500,
            },
            memoryEvidence: [{
                memoryId: 'memory-old-bell',
                content: 'Long ago the bell was placed beneath Pier Seven.',
                priority: 999,
                tokenCount: 40,
                sourceRefs: [{
                    kind: 'timeline',
                    messageId: ancient.messageId,
                    branchId: ancient.branchId,
                    revisionId: ancientRevisionId,
                    sequence: ancient.sequence,
                }],
            }],
            countTokens: value => Math.max(1, Math.ceil(String(value ?? '').length / 4)),
        });

        const memoryItem = plan.included.find(item => item.contextItemId === 'memory:memory-old-bell');
        expect(memoryItem).toBeDefined();
        const sourceRef = memoryItem.sourceRefs.find(ref => ref.kind === 'timeline');
        expect(sourceRef).toBeDefined();

        const raw = await f.sessionRepo.readTimelineByMessageIds(
            h.handle,
            sessionId,
            [sourceRef.messageId],
            { revisionId: sourceRef.revisionId },
        );
        expect(raw.entries[0]).toMatchObject({
            messageId: ancient.messageId,
            content: 'The old bell is beneath Pier Seven.',
        });
    });
});
