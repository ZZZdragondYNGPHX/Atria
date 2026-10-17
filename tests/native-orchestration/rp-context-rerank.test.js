import { createServer } from 'node:http';
import { jest } from '@jest/globals';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { NativeRetrievalPersistence } from '../../src/native/retrieval-persistence.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { SecretManager, SECRET_KEYS } from '../../src/endpoints/secrets.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { retrievalRef } from '../../public/scripts/native/retrieval-contracts.js';
import { PROVENANCE_NAMESPACE } from '../../public/scripts/agents/memory/source-lifecycle.js';
import { emptyProvenance, captureEpisodes } from '../../public/scripts/agents/memory/source-provenance.js';
import { applyFactOperations } from '../../public/scripts/agents/memory/atomic-facts.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { ContextRetrievalPort } from '../../src/native/orchestration/context-retrieval-port.js';
import { contextRetrievalReceiptId } from '../../src/native/orchestration/context-retrieval-contracts.js';
import { EvolutionTargets } from '../../src/native/agent-intelligence/evolution-targets.js';
import { EvolutionEvaluator } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { AgentEvolutionRepository } from '../../src/native/agent-intelligence/evolution-repository.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';

async function setup(make, { usage = true, singleSource = false, reservePolicy } = {}) {
    const calls = [];
    let onRerank = async () => {};
    const server = createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw); calls.push({ body, endpoint: req.url, auth: req.headers.authorization });
        await onRerank();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results: body.documents.map((_, index) => ({ index, relevance_score: index })), ...(usage ? { usage: { total_tokens: 7 } } : {}) }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const f = await rpModelFixture(make, { seedMemory: true, memorySettings: { enabled: true, memoryOsTokenBudget: 2400 }, configurePlan: async (plan, { h, host, route }) => {
            if (reservePolicy !== undefined) {
                await host.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { ...route.executionPolicy,
                    optionalWork: { mode: 'preserve_required', roles: ['rerank'], ...(reservePolicy === null ? {} : { requiredCompute: reservePolicy }) } } });
                plan.dependencyPins[0].integrity = hash(await host.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId));
            }
            const manager = new SecretManager(h.dirs), secretId = manager.writeSecret(SECRET_KEYS.ATRIA_RUNTIME, 'synthetic-rerank-secret', 'Scoped ranker', { activate: false });
            const profile = { retrievalProfileId: createNativeId('retrievalProfile'), revision: createNativeId('revision'), displayName: 'Scoped ranker',
                mode: 'rerank', source: 'custom', model: 'scoped-reranker', endpoint: `http://127.0.0.1:${server.address().port}/v1`, secretRef: { secretId }, options: {} };
            await new NativeRetrievalPersistence({ engine: h.engine }).commit(h.handle, profile);
            plan.definition.nodes[0].capabilities.push('memory.retrieve'); plan.definition.capabilityCeiling.push('memory.retrieve');
            plan.definition.nodes[1].capabilities.push('chat.output'); plan.definition.capabilityCeiling.push('chat.output');
            Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 16384 } });
            plan.definition.nodes[0].dependencyPinIds.push('memory.rerank');
            plan.dependencyPins.push({ pinId: 'memory.rerank', port: 'context', resourceRef: retrievalRef(profile), integrity: hash(profile) });
            await new SettingsRepo({ engine: h.engine }).save(h.handle, { atri_capabilities: { memory_graph: { enabled: true, memoryOsTokenBudget: 2400,
                sourceWritesEnabled: false, rerankEnabled: true, nativeRetrieval: { rerank: retrievalRef(profile) } } } });
            const chats = new ChatRepo({ engine: h.engine }), chat = await chats.get(h.handle, 'Actor', 'main');
            const before = await chats.getState(h.handle, 'Actor', 'main', PROVENANCE_NAMESPACE);
            chat.body[0].mes = 'Alice left because of a storm.'; chat.body[1].mes = 'Why did Alice leave?';
            chat.body.splice(1, 0, { name: 'Actor', is_user: false, mes: 'Alice left because of a promise.', memory_os_source_id: 'rp-cause-second' });
            await chats.save(h.handle, 'Actor', 'main', chat.header, chat.body, chat.integrity);
            const state = emptyProvenance(); state.scopeId = before.scopeId;
            const all = [...chat.body, { mes: 'FUTURE FORBIDDEN MEMORY', memory_os_source_id: 'rp-future' }];
            const episodeIds = captureEpisodes(state, all, singleSource ? [0, 3] : [0, 1, 3], state.scopeId); let serial = 0;
            const facts = applyFactOperations(state, ['Alice left because of a storm.', ...singleSource ? [] : ['Alice left because of a promise.']].map((text, index) => ({ action: 'create', type: 'inferred', text,
                evidence: [{ episodeId: episodeIds[index], excerpt: chat.body[index].mes }] })), { scopeId: state.scopeId, episodeIds }, all, () => 'cause-' + ++serial, 1000);
            await chats.setState(h.handle, 'Actor', 'main', PROVENANCE_NAMESPACE, facts.state);
        } });
        return { ...f, calls, onRerank: callback => { onRerank = callback; }, async cleanup() { await f.cleanup(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
    } catch (error) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); throw error; }
}

const currentRoot = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))[0].doc);
const compute = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0]?.compute;

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s original RP Context reranker', (_name, make) => {
    test('one eligible original recall owns a distinct exact Effect and original bank send before the Model', async () => {
        const f = await setup(make);
        try {
            const result = await f.run({ floor: 2 }), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(f.calls).toHaveLength(1); expect(f.calls[0].endpoint).toBe('/v1/rerank');
            expect(f.calls[0].auth).toBe('Bearer synthetic-rerank-secret');
            expect(JSON.stringify(f.calls)).not.toContain('FUTURE FORBIDDEN MEMORY'); expect(f.requests).toHaveLength(1);
            const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(bank.attempts).toHaveLength(2); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(new Set(bank.attempts.map(row => row.orchestration.effectId)).size).toBe(2);
            const attempt = await f.h.engine.withTransaction(f.h.handle, async tx => (await tx.getResource(controlRecordKey(f.h.handle, root.runId, 'attempt', root.attemptRefs[0]))).doc);
            expect(attempt.effectRefs).toHaveLength(2); expect(root.pendingEffectRefs).toEqual([]);
            expect(result.output.runStatus).toBe('completed');
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.retrievalCompletions).toHaveLength(1); expect(output.closure.effectIds).toHaveLength(3);
            expect(JSON.stringify({ root, output })).not.toContain('synthetic-rerank-secret');
        } finally { await f.cleanup(); }
    }, 60000);

    test('unknown retrieval usage preserves its distinct original charge and never starts or resends the Model', async () => {
        const f = await setup(make, { usage: false });
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow();
            expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0);
            const bank = await compute(f), root = await currentRoot(f);
            expect(bank.attempts).toMatchObject([{ status: 'unknown' }]);
            expect(root).toMatchObject({ status: 'reconciling', outputClaims: [] });
            expect(root.pendingEffectRefs).toHaveLength(2);
            await expect(f.run({ floor: 2 })).rejects.toThrow();
            expect(f.calls).toHaveLength(1); expect(await compute(f)).toEqual(bank);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['settings', 'ledger', 'cancel'])('%s withdrawn during actual rerank keeps the original fee and withholds Model/Chat', async change => {
        const f = await setup(make);
        try {
            f.onRerank(async () => {
                if (change === 'cancel') {
                    const root = await currentRoot(f);
                    await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(root), reasonCode: 'test_cancel' });
                } else if (change === 'settings') {
                    const repo = new SettingsRepo({ engine: f.h.engine }), stored = await repo.get(f.h.handle);
                    stored.atri_capabilities.memory_graph.recallEnabled = false; await repo.save(f.h.handle, stored);
                } else {
                    const state = await f.chats.getState(f.h.handle, 'Actor', 'main', PROVENANCE_NAMESPACE);
                    state.facts['cause-1'].text = 'Independent actual Memory update';
                    await f.chats.setState(f.h.handle, 'Actor', 'main', PROVENANCE_NAMESPACE, state);
                }
            });
            await expect(f.run({ floor: 2 })).rejects.toThrow();
            expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0);
            expect((await compute(f)).attempts).toMatchObject([{ status: 'settled', usage: { totalTokens: 7 } }]);
            expect((await currentRoot(f)).outputClaims).toEqual([]);
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['claim', 'observation-saved', 'observation-not-saved'])('%s ACK loss preserves charges without another Provider or Chat send', async phase => {
        const f = await setup(make), effects = f.authority.execution.effects;
        const method = phase === 'claim' ? 'claim' : 'observe', original = effects[method].bind(effects); let lost = false;
        effects[method] = async (handle, input) => {
            const root = await f.authority.execution.runs.get(handle, input.runId);
            const intent = await f.h.engine.withTransaction(handle, async tx => (await tx.getResource(controlRecordKey(handle, root.runId, 'effect', input.effectId))).doc);
            if (!lost && intent.actionRef.kind === 'context_retrieval') {
                lost = true;
                if (phase !== 'observation-not-saved') await original(handle, input);
                throw new StorageCommitUnknownError(new Error('Synthetic retrieval ACK loss'));
            }
            return original(handle, input);
        };
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(lost).toBe(true);
            expect(f.calls).toHaveLength(phase === 'claim' ? 0 : 1); expect(f.requests).toHaveLength(0);
            const bank = await compute(f); expect(bank.attempts).toHaveLength(1);
            expect(bank.attempts[0].status).toBe(phase === 'claim' ? 'charged' : 'settled');
            await expect(f.run({ floor: 2 })).rejects.toThrow();
            expect(await compute(f)).toEqual(bank); expect((await currentRoot(f)).outputClaims).toEqual([]);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['foreign-profile', 'embed-unavailable'])('%s cannot reuse the rerank scope or start either Provider', async change => {
        const f = await setup(make);
        try {
            const repo = new SettingsRepo({ engine: f.h.engine }), stored = await repo.get(f.h.handle), settings = stored.atri_capabilities.memory_graph;
            if (change === 'foreign-profile') settings.nativeRetrieval.rerank = { ...settings.nativeRetrieval.rerank, revision: createNativeId('revision') };
            else settings.nativeRetrieval.embed = { ...settings.nativeRetrieval.rerank };
            await repo.save(f.h.handle, stored);
            await expect(f.run({ floor: 2 })).rejects.toThrow();
            expect(f.calls).toHaveLength(0); expect(f.requests).toHaveLength(0);
            expect((await compute(f))?.attempts ?? []).toEqual([]);
        } finally { await f.cleanup(); }
    }, 60000);

    test('one causal source keeps the original skip policy and creates no implicit retrieval Effect', async () => {
        const f = await setup(make, { singleSource: true });
        try {
            const result = await f.run({ floor: 2 }), root = await currentRoot(f);
            expect(result.output.runStatus).toBe('completed'); expect(f.calls).toHaveLength(0); expect(f.requests).toHaveLength(1);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.retrievalCompletions).toEqual([]); expect(output.closure.effectIds).toHaveLength(2);
            expect((await compute(f)).attempts).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test('copied, foreign-instance and reused Context scope tokens cannot issue another recall', async () => {
        const f = await setup(make), denied = [], original = ContextRetrievalPort.prototype.openRecall;
        const spy = jest.spyOn(ContextRetrievalPort.prototype, 'openRecall').mockImplementation(async function (handle, token, input) {
            const foreign = new ContextRetrievalPort({ runs: this.runs, effects: this.effects, budgetPort: this.budgetPort, sourcePort: this.sourcePort, authorizeModel: this.authorizeModel });
            for (const [port, scope] of [[this, structuredClone(token)], [foreign, token]]) {
                try { await original.call(port, handle, scope, input); } catch (error) { denied.push(error.code); }
            }
            const result = await original.call(this, handle, token, input);
            try { await original.call(this, handle, token, input); } catch (error) { denied.push(error.code); }
            return result;
        });
        try {
            const result = await f.run({ floor: 2 }); expect(result.output.runStatus).toBe('completed');
            expect(denied).toEqual(Array(3).fill('native_orchestration_context_retrieval_denied'));
            expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(1);
        } finally { spy.mockRestore(); await f.cleanup(); }
    }, 60000);

    test.each(['parent', 'request', 'usage'])('cold history after Source deletion rejects rehashed retrieval %s facts without restoring a scope', async field => {
        const f = await setup(make); let cold;
        try {
            await f.run({ floor: 2 }); const root = await currentRoot(f);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            await f.chats.delete(f.h.handle, 'Actor', 'main'); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            const childId = output.published.retrievalCompletions[0].effectId;
            await cold.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, field === 'parent' ? 'effect' : 'receipt', field === 'parent' ? childId : contextRetrievalReceiptId(childId));
                const record = await tx.getResource(key), doc = structuredClone(record.doc);
                if (field === 'parent') { doc.inputRef.contextForEffectId = createNativeId('orchestrationEffect'); doc.inputHash = hash(doc.inputRef); }
                if (field === 'request') doc.dispatchEvidence.reference.expectedSend.inputFingerprint = hash('different actual request');
                if (field === 'usage') doc.budgetObservationRef.usageHash = hash({ totalTokens: 0 });
                await putMutable(tx, key, doc, { expectedIntegrity: record.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow();
            expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(1);
        } finally { await cold?.close(); await f.cleanup(); }
    }, 60000);

    test('the isolated evaluator refuses an unconnected retrieval consumer before any parent RPC or paid trial', async () => {
        const f = await setup(make);
        try {
            const handle = f.h.handle, targets = new EvolutionTargets({ host: f.host }), scope = { domain: 'rp_chat', charDir: 'Actor', name: 'main', isGroup: false, groupId: '' };
            const choice = (await targets.catalog(handle, scope, 'Actor')).find(item => item.target.fieldPath === 'limits.maxSteps');
            await targets.declare(handle, scope, 'Actor', choice.target, choice.baseHash);
            const captured = await targets.capture(handle, scope, 'Actor', choice.target);
            const candidate = await targets.prepare(handle, scope, 'Actor', choice.target, captured, captured.body - 1);
            const settings = { baseline: await targets.evaluationSettings(handle, scope, 'Actor', choice.target),
                candidate: await targets.evaluationSettings(handle, scope, 'Actor', choice.target, candidate.candidateId) };
            const repository = new AgentEvolutionRepository({ engine: f.h.engine }), evaluator = new EvolutionEvaluator({ host: f.host, repository });
            await repository.limits(handle, { maxRequests: 12, maxTokens: 100000, minIntervalMs: 1000 }, 0);
            const config = await evaluator.configuration(handle, settings.baseline.runtimeRouteId, null, settings.baseline.nativePlan);
            const job = { id: 'context-rerank-evaluation', scopeId: 'context-scope', domain: 'rp', policyFingerprint: 'test-policy', targetPin: 'test-target', price: null };
            await expect(evaluator.compare(handle, job, { baseline: config, candidate: config }, settings, new AbortController().signal,
                async () => {}, async () => {}, async () => {}, { split: 'development', repetitions: 1, caseIds: ['rp_agency_d1'] })).rejects.toThrow('native_orchestration_evaluation_unavailable');
            expect(f.calls).toHaveLength(0); expect(f.requests).toHaveLength(0);
            expect((await repository.owner(handle)).attempts).toEqual([]);
            expect((await f.plans.getBinding(handle, f.sourceSelector)).planRef).toEqual(f.planRef);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each([['model', 'settings'], ['model', 'cancel'], ['output', 'settings'], ['output', 'cancel']])('last %s budget await preserves same-transaction %s withdrawal and withholds Chat', async (stage, change) => {
        const f = await setup(make), original = BudgetPort.prototype.verifyBudgetAttempt; let injected = false;
        BudgetPort.prototype.verifyBudgetAttempt = async function (args) {
            const result = await original.call(this, args);
            const candidate = !injected && (stage === 'model' ? args.intent.capability === 'memory.retrieve' : args.intent.capability === 'chat.output' && args.intent.status === 'dispatching');
            if (!candidate) return result;
            if (stage === 'model') {
                const parent = await args.tx.getResource(controlRecordKey(args.handle, args.root.runId, 'effect', args.intent.inputRef.contextForEffectId));
                if (parent.doc.status !== 'confirmed') return result;
            }
            injected = true;
            if (change === 'cancel') await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(await currentRoot(f)), reasonCode: 'last_budget_cancel' });
            else {
                const repo = new SettingsRepo({ engine: f.h.engine }), stored = await repo.get(f.h.handle);
                stored.atri_capabilities.memory_graph.recallEnabled = false; await repo.save(f.h.handle, stored);
            }
            return result;
        };
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(injected).toBe(true);
            expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(1);
            const bank = await compute(f); expect(bank.attempts).toHaveLength(2); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            const root = await currentRoot(f); expect(root.outputClaims).toEqual([]); expect(root.cancelRequested).toBe(change === 'cancel');
            const settings = await new SettingsRepo({ engine: f.h.engine }).get(f.h.handle);
            expect(settings.atri_capabilities.memory_graph.recallEnabled ?? true).toBe(change !== 'settings');
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(3);
        } finally { BudgetPort.prototype.verifyBudgetAttempt = original; await f.cleanup(); }
    }, 60000);

    test.each([['available', { maxRequests: 1, maxTokens: 1024 }], ['reserved', { maxRequests: 4, maxTokens: 100000 }], ['unknown', null]])('original %s required compute reserve remains authoritative for optional rerank', async (policy, reservePolicy) => {
        const f = await setup(make, { reservePolicy });
        try {
            const result = await f.run({ floor: 2 }).then(value => ({ value }), error => ({ error }));
            expect(result.error).toBeUndefined(); expect(result.value.output.runStatus).toBe('completed');
            expect(f.calls).toHaveLength(policy === 'available' ? 1 : 0); expect(f.requests).toHaveLength(1);
            const bank = await compute(f); expect(bank.attempts).toHaveLength(policy === 'available' ? 2 : 1);
            expect(bank.limits.maxRequests).toBe(4);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['forged-skip', 'admission-ack'])('%s after Effect preparation cannot fabricate the private zero-send fallback proof', async scenario => {
        const f = await setup(make, { reservePolicy: { maxRequests: 1, maxTokens: 1024 } });
        const port = f.authority.execution.budgetPort, original = port.admitAttempt.bind(port); let injected = false;
        port.admitAttempt = async (...args) => {
            if (injected) return original(...args);
            injected = true;
            if (scenario === 'admission-ack') { await original(...args); throw new StorageCommitUnknownError(new Error('Synthetic retrieval admission ACK loss')); }
            throw Object.assign(new Error('Synthetic post-prepare budget refusal'), { code: 'native_generation_required_budget_reserved', contextRetrievalSkipped: true });
        };
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(injected).toBe(true);
            expect(f.calls).toHaveLength(0); expect(f.requests).toHaveLength(0);
            const bank = await compute(f); expect(bank.attempts).toHaveLength(scenario === 'admission-ack' ? 1 : 0);
            const root = await currentRoot(f); expect(root.pendingEffectRefs).toHaveLength(2); expect(root.outputClaims).toEqual([]);
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(await compute(f)).toEqual(bank);
        } finally { port.admitAttempt = original; await f.cleanup(); }
    }, 60000);
});
