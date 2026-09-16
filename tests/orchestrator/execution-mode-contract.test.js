import { beforeEach, describe, expect, test } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import { executionConfigText, digestExecutionConfig, getOrchestrationOutcome, modeForOutput } from '../../public/scripts/extensions/orchestrator/execution-mode-contract.js';
import { normalizeOrchestrationSnapshot } from '../../public/scripts/extensions/orchestrator/anchors.js';
import { clearCacheForChatChange, setLatestOrchestrationSnapshotFromPick, canReuseLatestOrchestrationSnapshot } from '../../public/scripts/extensions/orchestrator/snapshot-cache.js';

beforeEach(() => { clearCacheForChatChange(); });

describe('execution identity', () => {
    const profile = { mode: 'spec', source: 'global', spec: { stages: [{ id: 'a', nodes: ['writer'] }] } };
    const anchor = { playableFloor: 2, hash: 'same-user-message' };
    test('canonical ordering is stable, while mode/source/profile/routing/active preset changes miss', () => {
        const config = executionConfigText(profile, { llmNodePresetName: 'A' }, 'preset-a');
        expect(executionConfigText({ spec: profile.spec, source: 'global', mode: 'spec' }, { llmNodePresetName: 'A' }, 'preset-a')).toBe(config);
        setLatestOrchestrationSnapshotFromPick('chat', { playableFloor: 2, snapshot: { anchorHash: anchor.hash, capsuleText: 'result', executionIdentity: config } });
        expect(canReuseLatestOrchestrationSnapshot('chat', anchor, config)).toBe(true);
        for (const changed of [
            executionConfigText({ ...profile, mode: 'loop' }, { llmNodePresetName: 'A' }, 'preset-a'),
            executionConfigText({ ...profile, source: 'character' }, { llmNodePresetName: 'A' }, 'preset-a'),
            executionConfigText({ ...profile, spec: { stages: [] } }, { llmNodePresetName: 'A' }, 'preset-a'),
            executionConfigText(profile, { llmNodePresetName: 'B' }, 'preset-a'),
            executionConfigText(profile, { llmNodePresetName: 'A' }, 'preset-b'),
        ]) expect(canReuseLatestOrchestrationSnapshot('chat', anchor, changed)).toBe(false);
        expect(canReuseLatestOrchestrationSnapshot('chat', anchor)).toBe(false);
    });
    test('legacy remains readable; normalization preserves new identity without inventing one', () => {
        const legacy = { capsuleText: 'history', anchorHash: anchor.hash };
        expect(normalizeOrchestrationSnapshot(legacy)).toMatchObject(legacy);
        expect(normalizeOrchestrationSnapshot(legacy)).not.toHaveProperty('executionIdentity');
        const newer = normalizeOrchestrationSnapshot({ ...legacy, executionIdentity: 'v1:digest' });
        setLatestOrchestrationSnapshotFromPick('chat', { playableFloor: 2, snapshot: newer });
        expect(canReuseLatestOrchestrationSnapshot('chat', anchor, 'v1:digest')).toBe(true);
        setLatestOrchestrationSnapshotFromPick('chat', { playableFloor: 2, snapshot: legacy });
        expect(canReuseLatestOrchestrationSnapshot('chat', anchor, 'v1:digest')).toBe(false);
    });
    test('digest contains no prompt data and insecure contexts disable reuse', async () => {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
        try {
            Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
            expect(await digestExecutionConfig('private text')).toMatch(/^v1:[a-f0-9]{64}$/);
            Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
            expect(await digestExecutionConfig('private text')).toBe('');
        } finally {
            if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
            else delete globalThis.crypto;
        }
    });
});

test('output choices preserve existing assistance modes and suggest loop when leaving director', () => {
    expect(modeForOutput('guidance', 'single')).toBe('single');
    expect(modeForOutput('guidance', 'spec')).toBe('spec');
    expect(modeForOutput('guidance', 'director')).toBe('loop');
    expect(modeForOutput('reply', 'agenda')).toBe('director');
});

test('partial result is not a successful run', () => {
    expect(getOrchestrationOutcome({ status: 'budget_exhausted', stageOutputs: [{ output: 'partial' }] })).toBe('budget_exhausted');
    expect(getOrchestrationOutcome({ runtimeTrace: { status: 'failed' } })).toBe('failed');
    expect(getOrchestrationOutcome({})).toBe('completed');
});
