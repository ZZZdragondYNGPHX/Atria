import { test, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import './_mocks/main-module-stack.js';
import { frozen, hash, memoryFixture, localRetrieval, countTokens } from './hm1-fixture.js';
import { informationActor } from '../native/helpers/information-fixture.js';
import { resolveMemoryEligibility, eligibleMemorySnapshot } from '../../public/scripts/agents/memory/eligibility.js';
import { retrieveMemory, buildMemoryCorpus } from '../../public/scripts/agents/memory/hybrid-retrieval.js';
import { configureSourceLifecycle } from '../../public/scripts/agents/memory/source-lifecycle.js';
import { createMemoryRecallBridge, recallNativePackageTurnMemory } from '../../public/scripts/native/experience/llm/memory-bridge.js';
import { compileNativeContextPlan } from '../../public/scripts/native/context-compiler.js';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const actor = { kind: 'actor', id: informationActor };
const report = { algorithm: 'B1', tokenCounting: 'utf8_bytes_estimate', externalApiRequests: 0, runs: [], counterexamples: [], consumers: [] };
const save = () => { if (process.env.ATRIA_HM_REPORT) fs.writeFileSync(process.env.ATRIA_HM_REPORT, JSON.stringify(report, null, 2)); };
const opts = { countTokens, budget: 2400 };
const legal = async (fixture, options = {}) => eligibleMemorySnapshot(await fixture.retrievalSnapshot(), resolveMemoryEligibility(fixture.context, { requester: actor, ...options }));
const json = value => JSON.parse(JSON.stringify(value));

test('B1 frozen paired source-first corpus precedes all lexical/vector/rerank lanes', async () => {
    const local = await localRetrieval();
    try {
        for (const sample of frozen.cases) {
            const f = memoryFixture(sample, { native: true });
            const before = hash(fs.readFileSync(path.join(f.root, 'raw-sources.json')));
            for (const query of sample.queries) for (const lane of ['lexical_graph', 'local_vector']) {
                const snapshot = await legal(f, { at: query.atTick ?? null });
                const start = local.calls.length;
                const result = await retrieveMemory(snapshot, query.text, { ...opts, at: query.atTick ?? null,
                    ...(lane === 'local_vector' ? { service: local.service, profile: { source: 'synthetic_loopback', model: 'fixed-char-overlap-v1' }, rerankProfile: { source: 'synthetic' } } : {}) });
                expect(query.excludedSourceIds.filter(id => result.sourceMessageIds.includes(id))).toEqual([]);
                const calls = local.calls.slice(start);
                const excludedText = sample.sources.filter(s => query.excludedSourceIds.includes(s.id)).map(s => s.text);
                for (const call of calls.filter(c => ['insert', 'rerank'].includes(c.operation))) {
                    for (const text of excludedText) expect(JSON.stringify(call.args)).not.toContain(text);
                }
                report.runs.push({ caseId: sample.id, query, lane, information: f.information(), sourceFixture: f.root,
                    corpus: buildMemoryCorpus(snapshot, query.atTick ?? null), result: json(result),
                    requiredCoverage: query.requiredSourceIds.filter(id => result.sourceMessageIds.includes(id)), excludedSelected: [], calls }); save();
            }
            expect(hash(fs.readFileSync(path.join(f.root, 'raw-sources.json')))).toBe(before);
        }
    } finally { await local.close(); save(); }
}, 60000);

test('authority rejects forged grants, summaries and revocations before IO and late consumption', async () => {
    for (const mutation of ['grant', 'availability', 'branch', 'revision', 'variant', 'edit', 'delete']) {
        const f = memoryFixture(frozen.cases[4], { native: true });
        const snapshot = await legal(f);
        if (mutation === 'grant') f.snapshot.manifest.runtime.experienceContract.informationRuntime.views.find(v => v.id === 'actor').memory = false;
        if (mutation === 'availability') f.snapshot.states.atri_lifecycle.domains.availability.records[0].value.available = false;
        if (mutation === 'branch') f.snapshot.revision.branchId = 'foreign';
        if (mutation === 'revision') f.snapshot.revision.revisionId = 'new';
        if (mutation === 'variant') f.snapshot.timeline[0].activeVariantId = 'new';
        if (mutation === 'edit') f.context.chat[0].mes += 'edited';
        if (mutation === 'delete') f.context.chat.splice(0, 1);
        await expect(retrieveMemory(snapshot, '约在哪里？', opts)).rejects.toHaveProperty('name', 'AbortError');
        report.counterexamples.push({ mutation, rejected: true });
    }
    const f = memoryFixture(frozen.cases[3], { native: true });
    f.snapshot.states.atri_lifecycle.domains.memories.records[0].value.text = 'summary only';
    const snapshot = await legal(f, { sourceMessageIds: ['s04-third'], grants: ['all'] });
    expect(Object.values(snapshot.state.episodes).flatMap(e => e.messageIds)).not.toContain(f.raw[0].id);
    expect(Object.values(snapshot.state.episodes).flatMap(e => e.messageIds)).not.toContain('s04-third');
    const local = await localRetrieval();
    try {
        const g = memoryFixture(frozen.cases[6], { native: true }); const current = await legal(g);
        const query = local.service.query;
        local.service.query = async args => { const result = await query(args); g.snapshot.revision.revisionId = 'changed-in-flight'; return result; };
        await expect(retrieveMemory(current, '归还书籍', { ...opts, service: local.service, profile: { source: 'synthetic' } })).rejects.toHaveProperty('name', 'AbortError');
    } finally { await local.close(); save(); }
});

test('Game and Package consume the shared Hybrid runtime with original Information and Context', async () => {
    const f = memoryFixture(frozen.cases[6], { native: true });
    configureSourceLifecycle({ getContext: () => f.context, resolveScope: ctx => ({ key: ctx.key, target: { key: ctx.key } }), enabled: () => true, writeEnabled: () => false });
    const { recallHybridMemory } = await import('../../public/scripts/agents/memory/hybrid-runtime.js');
    const api = { openSession: async context => ({ recallMemory: (query, input) => recallHybridMemory(context, query, { ...input, readOnly: true }) }) };
    const anchor = { sessionId: f.snapshot.session.sessionId, ...f.snapshot.revision };
    const turn = { turnId: 'h1-turn', userInput: '阿岚答应归还什么？', anchor };
    const game = await createMemoryRecallBridge({ context: f.context, memoryApi: api, getCurrentBranchIdentity: () => anchor }).recall(turn, { requester: actor });
    expect(game.status).toBe('recalled'); expect(game.packet.content).toContain('归还书籍');
    const pack = await recallNativePackageTurnMemory({ context: f.context, snapshot: f.snapshot, memoryApi: api, userInput: turn.userInput });
    const plan = await compileNativeContextPlan(f.snapshot, { modelContextLimit: 16000, responseReserve: 1000, memoryEvidence: pack.evidence });
    expect(pack.status).toBe('recalled'); expect(JSON.stringify(plan.included)).toContain('归还书籍');
    report.consumers.push({ path: 'Game', result: game }, { path: 'Package', result: pack, contextPlan: plan }); save();
});
