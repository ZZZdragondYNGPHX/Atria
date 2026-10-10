import { test, expect } from '@jest/globals';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import './_mocks/main-module-stack.js';
import { frozen, memoryFixture, localRetrieval, countTokens } from './hm1-fixture.js';
import { informationActor } from '../native/helpers/information-fixture.js';
import { resolveMemoryEligibility, eligibleMemorySnapshot } from '../../public/scripts/agents/memory/eligibility.js';
import { retrieveMemory } from '../../public/scripts/agents/memory/hybrid-retrieval.js';
import { composeMemoryCoverage, memoryEvidenceGroups } from '../../public/scripts/agents/memory/packing.js';
import { memoryQuerySeeds } from '../../public/scripts/agents/memory/query-plan.js';
import { compileNativeContextPlan } from '../../public/scripts/native/context-compiler.js';
import { recallNativePackageTurnMemory } from '../../public/scripts/native/experience/llm/memory-bridge.js';
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const report = { algorithms: ['B2', 'B3'], budget: 2400, tokenCounting: 'utf8_bytes_estimate', externalApiRequests: 0, runs: [], consumers: [] };
const save = () => { if (process.env.ATRIA_HM_REPORT) fs.writeFileSync(process.env.ATRIA_HM_REPORT, JSON.stringify(report, null, 2)); };
const legal = async f => eligibleMemorySnapshot(await f.retrievalSnapshot(), resolveMemoryEligibility(f.context, { requester: { kind: 'actor', id: informationActor } }));

test('B2/B3 pair every frozen input, authority and budget with exact source evidence', async () => {
    const local = await localRetrieval();
    try {
        for (const sample of frozen.cases) {
            const f = memoryFixture(sample, { native: true });
            for (const query of sample.queries) for (const lane of ['lexical_graph', 'local_vector']) {
                const snapshot = await legal(f);
                const sceneText = snapshot.chat.filter(m => m.mes).slice(-2).map(m => m.mes).join('\n');
                for (const algorithm of ['B2', 'B3']) {
                    const result = await retrieveMemory(snapshot, query.text, { sceneText, countTokens, budget: 2400, at: query.atTick ?? null,
                        packing: algorithm === 'B2' ? 'ranked' : 'coverage',
                        ...(lane === 'local_vector' ? { service: local.service, profile: { source: 'synthetic_loopback', model: 'fixed-char-overlap-v1' } } : {}) });
                    expect(result.tokenCount).toBeLessThanOrEqual(2400);
                    expect(query.excludedSourceIds.filter(id => result.sourceMessageIds.includes(id))).toEqual([]);
                    expect(query.requiredSourceIds.filter(id => !result.sourceMessageIds.includes(id))).toEqual([]);
                    report.runs.push({ algorithm, caseId: sample.id, query, lane, result: JSON.parse(JSON.stringify(result)),
                        requiredCoverage: query.requiredSourceIds.filter(id => result.sourceMessageIds.includes(id)), excludedSelected: [] }); save();
                }
            }
        }
    } finally { await local.close(); save(); }
}, 60000);

test('conflict sources and source-backed atomic chains fit completely or are unavailable', async () => {
    const group = { id: 'complete-chain', ids: ['condition', 'receipt'], sourceMessageIds: ['a', 'b'],
        content: JSON.stringify({ condition: '先核对收据', receipt: '收据绑定条件来源' }), facets: ['commitment'], score: 1 };
    const packed = await composeMemoryCoverage([group], { countTokens, budget: 32000 });
    const denied = await composeMemoryCoverage([group], { countTokens, budget: packed.tokenCount - 1 });
    expect(denied.selected).toEqual([]); expect(denied.status).toBe('unknown');
    expect(denied.missingGroups).toEqual([{ id: 'complete-chain', reason: 'complete_group_exceeds_budget' }]);
    const docs = [{ id: 'a', kind: 'fact', text: '来源甲声称约定在河岸', episodeIds: ['ea'], score: 1 },
        { id: 'b', kind: 'fact', text: '来源乙声称约定在山门', episodeIds: ['eb'], score: .9 }];
    const groups = memoryEvidenceGroups(docs, { documents: docs }, { episodes: { ea: { messageIds: ['a'] }, eb: { messageIds: ['b'] } } }, { userInput: '约定地点确定吗？' });
    expect(groups).toHaveLength(1); expect(groups[0].sourceMessageIds).toEqual(['a', 'b']);
    expect(groups[0].content).toContain('unresolved_source_assertions');
    const conflict = await composeMemoryCoverage(groups, { countTokens, budget: 32000 });
    expect((await composeMemoryCoverage(groups, { countTokens, budget: conflict.tokenCount - 1 })).selected).toEqual([]);
});

test('Information-backed source groups survive Package and final Context whole-group budget admission', async () => {
    const f = memoryFixture(frozen.cases[5], { native: true });
    const contract = f.snapshot.manifest.runtime.experienceContract;
    const domain = contract.lifecycleRuntime.domains.find(d => d.id === 'memories');
    domain.recordSchema.properties.atomicGroup = { type: 'string', maxLength: 160 };
    domain.recordSchema.properties.atomicSourceMessageIds = { type: 'array', items: { type: 'string', maxLength: 256 }, maxItems: 8 };
    contract.informationRuntime.sources.find(s => s.id === 'memories').fields.push(['atomicGroup'], ['atomicSourceMessageIds']);
    const chain = ['s06-chain-a', 's06-chain-b'];
    for (const record of f.snapshot.states.atri_lifecycle.domains.memories.records.filter(r => chain.includes(r.id))) {
        record.value.atomicGroup = 'commitment-chain'; record.value.atomicSourceMessageIds = chain;
    }
    const snapshot = await legal(f);
    const result = await retrieveMemory(snapshot, '承诺的条件和收据？', { countTokens, budget: 2400 });
    const grouped = result.evidence.find(item => item.atomicGroup === 'commitment-chain');
    expect(grouped.sourceMessageIds).toEqual(chain);
    const api = { openSession: async () => ({ recallMemory: async () => result }) };
    const bridge = await recallNativePackageTurnMemory({ context: f.context, snapshot: f.snapshot, memoryApi: api, userInput: '收据？' });
    const admitted = await compileNativeContextPlan(f.snapshot, { modelContextLimit: 16000, responseReserve: 1000, memoryEvidence: bridge.evidence });
    expect(admitted.included.some(item => item.atomicGroup === 'commitment-chain')).toBe(true);
    const exhausted = await compileNativeContextPlan(f.snapshot, { modelContextLimit: 1024, responseReserve: 1000, memoryEvidence: bridge.evidence });
    expect(exhausted.included.some(item => item.atomicGroup === 'commitment-chain')).toBe(false);
    report.consumers.push({ path: 'Package_atomic', result, bridge, admitted, exhausted }); save();
    f.snapshot.states.atri_lifecycle.domains.memories.records.find(r => r.id === 's06-chain-b').value.actor = 'other';
    const revoked = await legal(f);
    expect(Object.values(revoked.state.episodes).flatMap(e => e.messageIds).some(id => chain.includes(id))).toBe(false);
});

test('aliases and ambiguous references remain source constrained without creating cognition', () => {
    const entities = [{ id: 'alan', type: 'Character', canonicalName: '阿岚', aliases: ['岚姐'] }, { id: 'lin', type: 'Character', canonicalName: '阿林', aliases: [] }];
    const one = memoryQuerySeeds('她答应的事呢？', entities, '岚姐站在桥边');
    expect(one.actorSeeds).toEqual(['alan']); expect(one.unresolvedReference).toBe(false);
    expect(memoryQuerySeeds('她呢？', entities, '阿岚与阿林').unresolvedReference).toBe(true);
});
