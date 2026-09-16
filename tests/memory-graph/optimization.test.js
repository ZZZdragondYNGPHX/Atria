import { describe, test, expect, jest } from '@jest/globals';
import { largeMemory } from './fixtures/large-memory.js';
import { projectTemporalGraph } from '../../public/scripts/extensions/memory-graph/temporal-graph.js';
import { buildMemoryCorpus, rankMemory, retrieveMemory } from '../../public/scripts/extensions/memory-graph/hybrid-retrieval.js';
import { computeInspector, inspectorPayload } from '../../public/scripts/extensions/memory-graph/inspector-compute.js';
import { inspectMemory } from '../../public/scripts/extensions/memory-graph/diagnostics.js';

describe('Memory OS optimization invariants and retrieval replay', () => {
    test('compact worker payload preserves graph status and leaves source ledger unchanged', () => {
        const snapshot = largeMemory(10);
        snapshot.chat[0].variables = { largeExternalState: 'not needed by source validation' };
        snapshot.state.historyBuild = { before: { facts: snapshot.state.facts } };
        const before = structuredClone(snapshot.state);
        const payload = inspectorPayload(snapshot, 'graph');
        const view = graph => JSON.parse(JSON.stringify(graph, (key, value) => ['evidence', 'reason', 'fingerprint'].includes(key) ? undefined : value));
        expect(view(projectTemporalGraph(payload.state, payload.chat, { includeInactive: true })))
            .toEqual(view(projectTemporalGraph(snapshot.state, snapshot.chat, { includeInactive: true })));
        expect(payload.chat[0].variables).toBeUndefined(); expect(payload.state.historyBuild).toBeUndefined();
        expect(inspectorPayload(snapshot, 'batch').state.historyBuild.before).toBeUndefined();
        expect(snapshot.state).toEqual(before);
    });
    test('projection reads source content linearly and a fresh projection sees edits', () => {
        const snapshot = largeMemory(300); let reads = 0;
        snapshot.chat.forEach(message => { const value = message.mes; Object.defineProperty(message, 'mes', { configurable: true, get: () => { reads++; return value; } }); });
        expect(projectTemporalGraph(snapshot.state, snapshot.chat).relations).toHaveLength(300);
        expect(reads).toBeLessThanOrEqual(300);
        Object.defineProperty(snapshot.chat[1], 'mes', { value: 'Edited', configurable: true });
        expect(projectTemporalGraph(snapshot.state, snapshot.chat).relations).toHaveLength(299);
    });
    test('all duplicate-endpoint peers are disputed when one exclusive slot conflicts', () => {
        const { state, chat } = largeMemory(2);
        state.entities.harbor = { ...structuredClone(state.entities.castle), id: 'harbor' };
        state.relations.duplicate = { ...structuredClone(state.relations.r0), id: 'duplicate' };
        state.relations.r1.sourceEntityId = 'n0'; state.relations.r1.targetEntityId = 'harbor';
        const graph = projectTemporalGraph(state, chat, { includeInactive: true });
        expect(graph.relations.map(edge => edge.status)).toEqual(['disputed', 'disputed', 'disputed']);
    });
    for (const [query, expected] of [['Where is Person 42?', 'relation:r42'], ['Person 11 is where?', 'relation:r11'], ['银翼之花在哪里', 'relation:r42'], ['爱丽丝在哪', 'relation:r42'], ['Malice', null], ['volcano zebra', null], ['', null]]) {
        test(`retrieval replay: ${query || '(empty)'}`, () => {
            const snapshot = largeMemory(60);
            snapshot.state.entities.n42.names.push(...['爱丽丝', '银翼之花', 'Alice'].map(name => ({ ...snapshot.state.entities.n42.names[0], name, kind: 'alias' })));
            const result = rankMemory(query, buildMemoryCorpus(snapshot));
            expect(result.candidates[0]?.id || null).toBe(expected);
        });
    }
    test('diagnostics are read-only and show status, candidate provenance and limits', () => {
        const snapshot = largeMemory(10); const before = structuredClone(snapshot.state);
        const report = inspectMemory(snapshot, 'Where is Person 4?');
        expect(report.candidates[0].id).toBe('relation:r4'); expect(report.candidates[0].episodeIds).toEqual(['m4:1']);
        expect(report.counts.relations.active).toBe(10); expect(report.limits.maxDepth).toBe(2);
        expect(snapshot.state).toEqual(before);
    });
    test('worker termination and scope guard discard late output', async () => {
        const snapshot = largeMemory(2); let current = true;
        snapshot.assertCurrent = () => { if (!current) throw new Error('scope changed'); };
        const worker = { postMessage: jest.fn(), terminate: jest.fn() };
        const pending = computeInspector(snapshot, { workerFactory: () => worker });
        current = false; worker.onmessage({ data: { result: {} } });
        await expect(pending).rejects.toThrow('scope changed'); expect(worker.terminate).toHaveBeenCalledTimes(1);
    });
    test('cancelling terminates the worker exactly once', async () => {
        const snapshot = largeMemory(2); const controller = new AbortController();
        const worker = { postMessage: jest.fn(), terminate: jest.fn() };
        const pending = computeInspector(snapshot, { signal: controller.signal, workerFactory: () => worker });
        controller.abort(); worker.onmessage({ data: { result: {} } });
        await expect(pending).rejects.toThrow('cancelled'); expect(worker.terminate).toHaveBeenCalledTimes(1);
    });
    test('small worker-less fallback works; large fallback does not freeze the UI', async () => {
        const small = largeMemory(2);
        expect((await computeInspector(small, { workerFactory: null })).graph.relations).toHaveLength(2);
        await expect(computeInspector(largeMemory(1000), { workerFactory: null })).rejects.toThrow('Web Workers');
    });
    test('vector fingerprint batches yield to cancellation before indexing', async () => {
        const snapshot = largeMemory(50); const controller = new AbortController();
        const service = { listHashes: jest.fn(async () => []), insert: jest.fn(), query: jest.fn() };
        setTimeout(() => controller.abort(), 0);
        await expect(retrieveMemory(snapshot, 'Person', { service, profile: 'test', signal: controller.signal, countTokens: async text => text.length })).rejects.toThrow('aborted');
        expect(service.insert).not.toHaveBeenCalled();
    });
});
