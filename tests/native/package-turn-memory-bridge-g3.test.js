import { afterEach, expect, jest, test } from '@jest/globals';

import { recallNativePackageTurnMemory } from '../../public/scripts/native/experience/llm/memory-bridge.js';
import { compileNativeContextPlan } from '../../public/scripts/native/context-compiler.js';
import { NativeSessionRuntime } from '../../public/scripts/native/session-runtime.js';
import {
    NATIVE_SESSION_LIFECYCLE,
    onNativeSessionLifecycle,
    resetNativeSessionLifecycleForTesting,
} from '../../public/scripts/native/session-lifecycle.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { informationSnapshot } from './helpers/information-fixture.js';

afterEach(() => resetNativeSessionLifecycleForTesting());

function memorySnapshot(enabled = true) {
    const snapshot = informationSnapshot();
    snapshot.manifest = structuredClone(snapshot.manifest);
    const view = snapshot.manifest.runtime.experienceContract.informationRuntime.views.find(item => item.id === 'pov');
    view.sources = [...view.sources, 'history'];
    view.memory = enabled;
    return snapshot;
}

const budget = extra => ({
    modelContextLimit: 16000,
    responseReserve: 1000,
    ...extra,
});

test('G3 Package Turn memory:true recalls existing Memory Graph evidence and compiler admits only exact visible provenance', async () => {
    const snapshot = memorySnapshot(true);
    const assertCurrent = jest.fn();
    const recallMemory = jest.fn(async () => ({
        text: 'The old harbor bell was hidden below Pier Seven.',
        selected: ['fact:harbor-bell'],
        sourceMessageIds: ['message-one'],
        tokenCount: 18,
        assertCurrent,
    }));
    const openSession = jest.fn(async () => ({ recallMemory }));
    const result = await recallNativePackageTurnMemory({
        snapshot,
        userInput: 'Where was the bell hidden?',
        memoryApi: { openSession },
    });

    expect(result.status).toBe('recalled');
    expect(openSession).toHaveBeenCalledTimes(1);
    expect(recallMemory).toHaveBeenCalledTimes(1);
    expect(assertCurrent).toHaveBeenCalledTimes(2);
    expect(result.evidence).toEqual([expect.objectContaining({
        memoryId: 'package-turn:revision-one',
        content: expect.stringContaining('Pier Seven'),
        sourceRefs: [{
            kind: 'timeline',
            messageId: 'message-one',
            revisionId: 'revision-one',
            branchId: 'branch-one',
        }],
    })]);

    const plan = await compileNativeContextPlan(snapshot, budget({ memoryEvidence: result.evidence }));
    expect(JSON.stringify(plan.included)).toContain('Pier Seven');

    const hidden = structuredClone(result.evidence);
    hidden[0].sourceRefs[0].messageId = 'message-hidden';
    const stale = structuredClone(result.evidence);
    stale[0].sourceRefs[0].revisionId = 'revision-old';
    const foreign = structuredClone(result.evidence);
    foreign[0].sourceRefs[0].branchId = 'branch-other';
    for (const evidence of [hidden, stale, foreign]) {
        const rejected = await compileNativeContextPlan(snapshot, budget({ memoryEvidence: evidence }));
        expect(JSON.stringify(rejected.included)).not.toContain('Pier Seven');
    }
});

test('G3 memory:false is a hard authorization gate and does not call Memory Graph', async () => {
    const snapshot = memorySnapshot(false);
    const openSession = jest.fn(async () => ({ recallMemory: jest.fn() }));
    const result = await recallNativePackageTurnMemory({
        snapshot,
        userInput: 'Do not recall',
        memoryApi: { openSession },
    });
    expect(result).toMatchObject({ status: 'denied', evidence: [] });
    expect(openSession).not.toHaveBeenCalled();

    const evidence = [{
        memoryId: 'forged',
        content: 'MUST NOT APPEAR',
        sourceRefs: [{ kind: 'timeline', messageId: 'message-one', revisionId: 'revision-one', branchId: 'branch-one' }],
    }];
    const plan = await compileNativeContextPlan(snapshot, budget({ memoryEvidence: evidence }));
    expect(JSON.stringify(plan.included)).not.toContain('MUST NOT APPEAR');
});

test.each([
    ['stale revision', { revisionId: 'revision-old', branchId: 'branch-one' }],
    ['foreign branch', { revisionId: 'revision-one', branchId: 'branch-other' }],
])('G3 Host rejects %s evidence before Package Turn execution', async (_label, anchor) => {
    const snapshot = memorySnapshot(true);
    snapshot.manifest.runtime.experienceContract.taskRuntime = {
        schemaVersion: 1,
        slots: [],
        tasks: [],
        turn: { policy: 'authority-first', stages: [] },
    };
    const host = new NativeGenerationHost({
        sessionCore: { load: jest.fn(async () => snapshot) },
        persistence: { listRuntimeRoutes: jest.fn(async () => [{
            runtimeRouteId: 'route-test',
            role: 'role.narrator',
            fallbackRouteRefs: [],
        }]) },
    });
    await expect(host.executeTurn('alice', {
        sessionId: snapshot.session.sessionId,
        revisionId: snapshot.revision.revisionId,
        invocationId: 'g3-stale',
        hostMemoryEvidence: [{
            memoryId: 'old',
            content: 'stale',
            sourceRefs: [{ kind: 'timeline', messageId: 'message-one', ...anchor }],
        }],
    })).rejects.toMatchObject({ code: 'native_turn_memory_evidence_stale' });
});

test('G3 finalized Package Turn emits one Timeline append lifecycle event; exact replay does not duplicate ingestion', async () => {
    const runtime = new NativeSessionRuntime();
    const previous = memorySnapshot(true);
    const next = structuredClone(previous);
    next.revision = { ...next.revision, revisionId: 'revision-two' };
    next.timeline.push({
        messageId: 'message-two',
        activeVariantId: 'variant-two',
        sequence: 1,
        role: 'assistant',
        content: 'Final canonical Package Turn narrative.',
    });
    const installed = [];
    runtime.configure({
        isGenerating: () => false,
        install: async projection => { installed.push(projection); },
        messages: () => [],
        headers: () => ({}),
        clear: async () => {},
    });
    runtime.snapshot = previous;
    runtime.generation = { kind: 'append', provisionalTurn: true };
    runtime.request = jest.fn(async path => {
        expect(path).toBe('load');
        return structuredClone(next);
    });

    const appended = [];
    const off = onNativeSessionLifecycle(NATIVE_SESSION_LIFECYCLE.TIMELINE_APPENDED, event => appended.push(event));
    await runtime.acceptOperationSnapshot(next, { turn: true });
    await runtime.acceptOperationSnapshot(next, { turn: true });
    off();

    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
        messageIds: ['message-two'],
        reason: 'package_turn',
        revisionId: 'revision-two',
    });
    expect(installed).toHaveLength(2);
});
