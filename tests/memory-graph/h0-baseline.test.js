import { test, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import './_mocks/main-module-stack.js';
import { frozen, frozenBytes, hash, memoryFixture, localRetrieval, countTokens } from './hm1-fixture.js';
import { retrieveMemory, buildMemoryCorpus, composeMemory } from '../../public/scripts/agents/memory/hybrid-retrieval.js';
import { emptyProvenance, captureEpisodes } from '../../public/scripts/agents/memory/source-provenance.js';
import { applyFactOperations } from '../../public/scripts/agents/memory/atomic-facts.js';
import { createMemoryRecallBridge, recallNativePackageTurnMemory } from '../../public/scripts/native/experience/llm/memory-bridge.js';
import { compileNativeContextPlan } from '../../public/scripts/native/context-compiler.js';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const report = { schemaVersion: 1, algorithm: process.env.ATRIA_HM_STAGE || 'B0', frozenSha256: hash(frozenBytes),
    productHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), startedAt: new Date().toISOString(),
    tokenCounting: 'utf8_bytes_estimate', modelGeneration: 'not_run', providerUsage: 'unavailable', currencyCost: 'unavailable',
    externalApiRequests: 0, inputs: frozen, runs: [], counterexamples: [], consumers: [] };
const output = process.env.ATRIA_HM_REPORT;
const save = () => { if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2)); };
const options = { countTokens, budget: 2400 };
const serialize = result => JSON.parse(JSON.stringify(result));

test('frozen native fixture B0 observes all eight cases on isolated disk and loopback retrieval', async () => {
    expect(hash(frozenBytes)).toBe('ef9a584cfde78f5bc60e43914e1eb676d3530df4398e903f56afabb0631e6eeb');
    expect(frozen.cases.reduce((n, c) => n + c.sources.length, 0)).toBe(519);
    const local = await localRetrieval();
    try {
        for (const sample of frozen.cases) {
            if (process.env.ATRIA_HM_CASES && !process.env.ATRIA_HM_CASES.split(',').includes(sample.id)) continue;
            const f = memoryFixture(sample);
            const snapshot = await f.retrievalSnapshot();
            fs.writeFileSync(path.join(f.root, 'information.json'), JSON.stringify(f.information()));
            for (const query of sample.queries) {
                for (const lane of ['lexical_graph', 'local_vector']) {
                    const result = await retrieveMemory(snapshot, query.text, { ...options, at: query.atTick ?? null,
                        ...(lane === 'local_vector' ? { service: local.service, profile: { source: 'synthetic_loopback', model: 'fixed-char-overlap-v1' } } : {}) });
                    const selected = result.sourceMessageIds;
                    report.runs.push({ caseId: sample.id, query, lane, sourceFixture: f.root,
                        information: f.information(), corpus: buildMemoryCorpus(snapshot, query.atTick ?? null), result: serialize(result),
                        requiredCoverage: query.requiredSourceIds.filter(id => selected.includes(id)), excludedSelected: query.excludedSourceIds.filter(id => selected.includes(id)) });
                    save();
                }
            }
        }
        report.localRetrievalCalls = local.calls; report.localIndexBytes = Buffer.byteLength(JSON.stringify([...local.collections]));
    } finally { await local.close(); save(); }
}, 60000);

test('B0 records edit/delete/branch/late callbacks, optional failure and source save failure', async () => {
    for (const mutation of ['edit', 'delete', 'branch', 'variant']) {
        const f = memoryFixture(frozen.cases[4]); const snapshot = await f.retrievalSnapshot();
        if (mutation === 'edit') f.context.chat[0].mes += '修改';
        if (mutation === 'delete') f.context.chat.splice(0, 1);
        if (mutation === 'branch') f.context.key = 'branch-sibling';
        if (mutation === 'variant') { f.context.chat[0].mes = '选定新的对白'; f.snapshot.timeline[0].activeVariantId = 'variant-next'; }
        let failure = null; try { await retrieveMemory(snapshot, '约在哪里？', options); } catch (e) { failure = { name: e.name, message: e.message }; }
        report.counterexamples.push({ mutation, failure }); expect(failure?.name).toBe('AbortError');
    }
    const f = memoryFixture(frozen.cases[6]); const before = hash(fs.readFileSync(path.join(f.root, 'provenance.json')));
    const local = await localRetrieval();
    try {
        local.failRerank();
        report.counterexamples.push({ mutation: 'rerank_transport_failure', result: serialize(await retrieveMemory(await f.retrievalSnapshot(), '阿岚答应归还什么？',
            { ...options, service: local.service, rerankProfile: { source: 'synthetic' } })) });
        const controller = new AbortController(); controller.abort();
        await expect(retrieveMemory(await f.retrievalSnapshot(), '阿岚', { ...options, signal: controller.signal })).rejects.toThrow(/aborted/);
        f.context.failSave = true;
        const writable = await f.lifecycle.retrievalSnapshot(f.context);
        let saveFailure = null; try { await writable.recordAccess(Object.keys(writable.state.facts)); } catch (e) { saveFailure = e.message; }
        report.counterexamples.push({ mutation: 'metadata_save_failed', saveFailure, sourcePreserved: before === hash(fs.readFileSync(path.join(f.root, 'provenance.json'))) });
        expect(saveFailure).toMatch(/write failed/); expect(before).toBe(hash(fs.readFileSync(path.join(f.root, 'provenance.json'))));
        report.counterexamples.push({ mutation: 'actor_information', allowed: f.information(), note: 'B0 retrieval does not receive this grant' });
    } finally { await local.close(); save(); }
});

test('B0 observes atomic budget and permissions without injecting future eligibility or packing', async () => {
    const f = memoryFixture(frozen.cases[5]); const snapshot = await f.retrievalSnapshot();
    const corpus = buildMemoryCorpus(snapshot);
    const chain = corpus.documents.filter(d => d.kind === 'fact' && d.episodeIds.some(id => snapshot.state.episodes[id].messageIds.includes('s06-chain-a') || snapshot.state.episodes[id].messageIds.includes('s06-chain-b')));
    const one = await composeMemory([chain[0]], { countTokens, budget: 32000 });
    const packed = await composeMemory(chain, { countTokens, budget: one.tokenCount });
    report.counterexamples.push({ mutation: 'atomic_chain_budget', candidates: chain, result: packed, atomicLabel: 'commitment-chain', observation: 'B0 has no atomic-group protocol' });
    const hidden = memoryFixture(frozen.cases[3], { native: true });
    const result = await retrieveMemory(await hidden.retrievalSnapshot(), '寄信者真正的动机是什么？', options);
    report.counterexamples.push({ mutation: 'actor_denied_candidates', information: hidden.information(), result: serialize(result), excludedSelected: result.sourceMessageIds.includes('s04-third') });
    const actorView = hidden.snapshot.manifest.runtime.experienceContract.informationRuntime.views.find(v => v.id === 'actor'); actorView.memory = false;
    report.counterexamples.push({ mutation: 'grant_revocation', information: hidden.information(), note: 'B0 recall options contain no Information grant' }); save();
    expect(chain).toHaveLength(2);
});

test('B0 Game and Package bridges consume original retrieval and real Context compiler', async () => {
    const f = memoryFixture(frozen.cases[6], { native: true });
    const api = { openSession: async () => ({ recallMemory: async (query, input) => retrieveMemory(await f.retrievalSnapshot(), query, { ...options, ...input }) }) };
    const turn = { turnId: 'h0-turn', userInput: '阿岚答应归还什么？', anchor: { sessionId: f.snapshot.session.sessionId, ...f.snapshot.revision } };
    const game = await createMemoryRecallBridge({ context: f.context, memoryApi: api, getCurrentBranchIdentity: () => turn.anchor }).recall(turn);
    expect(game.status).toBe('recalled');
    report.consumers.push({ path: 'Game', result: game, narrativeInput: game.packet.content, packetHash: hash(game.packet) });
    const pov = f.snapshot.manifest.runtime.experienceContract.informationRuntime.views.find(v => v.id === 'pov'); pov.sources = ['history'];
    const result = await recallNativePackageTurnMemory({ snapshot: f.snapshot, context: f.context, memoryApi: api, userInput: turn.userInput });
    const plan = await compileNativeContextPlan(f.snapshot, { modelContextLimit: 16000, responseReserve: 1000, memoryEvidence: result.evidence });
    expect(result.status).toBe('recalled'); expect(JSON.stringify(plan.included)).toContain('归还书籍');
    report.consumers.push({ path: 'Package', result, contextPlan: plan, packetHash: hash(result), finalText: 'not_generated' }); save();
});

test('B0 ordinary RP actual after-WI handler injects once into original lorebook consumer', async () => {
    const f = memoryFixture(frozen.cases[6], { key: 'char:hm1.png:h0-ordinary' });
    for (const message of f.context.chat) delete message.atri_native;
    let state = emptyProvenance(); state.scopeId = f.context.key;
    const ids = captureEpisodes(state, f.context.chat, [0], f.context.key);
    state = applyFactOperations(state, [{ action: 'create', type: 'explicit', text: f.context.chat[0].mes,
        evidence: [{ episodeId: ids[0], excerpt: f.context.chat[0].mes }] }], { scopeId: f.context.key, episodeIds: ids }, f.context.chat, () => 'ordinary-fact', 1000).state;
    fs.writeFileSync(path.join(f.root, 'provenance.json'), JSON.stringify(state));
    const old = globalThis.Atria.getContext(); let book = { entries: {} }; const apis = {};
    const ctx = Object.assign(Object.create(old), f.context, {
        characters: [], characterId: 0, groupId: null,
        constants: { promptRoles: { SYSTEM: 0, USER: 1, ASSISTANT: 2 }, promptTypes: { NONE: 0, IN_PROMPT: 1, IN_CHAT: 2 }, wiPosition: { before: 0, atDepth: 6 }, unset: Symbol('unset') },
        eventSource: { on() {}, off() {}, emit() {} }, eventTypes: {},
        worldInfoEntry: { template: { position: 0, depth: 4, role: 0 }, setGlobalSelection: async () => {} },
        resolveChatStateTarget: () => ({ is_group: false, avatar_url: 'hm1.png', file_name: 'h0-ordinary' }),
        registerCapabilityApi: (name, api) => { apis[name] = api; }, getCapabilityApi: name => apis[name] || null,
        createFloorState: async () => ({ ready: async () => {}, get: async () => ({ ok: true, state: { nodes: {}, edges: [], seqCounter: 0 } }) }),
        loadWorldInfo: async () => structuredClone(book), saveWorldInfo: async (_name, data) => { book = structuredClone(data); },
        getTokenCountAsync: null, stateProviders: [], saveSettings() {}, saveSettingsDebounced() {},
        translate: s => s, addLocaleData() {},
    });
    globalThis.Atria = { getContext: () => ctx };
    const main = await import('../../public/scripts/agents/memory/main.js');
    main.getSettings().memoryOsEnabled = true;
    const payload = { type: 'normal', coreChat: [{ is_user: true, mes: '阿岚答应归还什么？' }] };
    await main._handleWiAfterScanForTest(payload);
    const entries = Object.values(book.entries).filter(e => e.content);
    report.consumers.push({ path: 'ordinary_RP', payload, entries, packetHash: hash(entries), projection: main.getMemoryStore(ctx)?.lastRecallProjection }); save();
    expect(entries).toHaveLength(1); expect(entries[0].content).toContain('归还书籍');
});
