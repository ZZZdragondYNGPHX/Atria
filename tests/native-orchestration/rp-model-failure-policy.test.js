import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture, RP_MODEL_TEXT } from './helpers/rp-model-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { sendAttemptId } from '../../src/native/orchestration/budget-port.js';
import { createResponsesGenerationProvider } from '../../src/native/adapters/responses-generation-provider.js';
import { capabilityObservationProof, executionPathFingerprint } from '../../src/native/model-prompt-runtime/execution-evidence.js';
import { readRpOutput, rpOutputClosureId } from '../../src/native/orchestration/rp-output-contracts.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';

const configureFailure = ({ fallback = true, retries = 0, pinned = true, maxRequests = 4 } = {}) => async (plan, { h, host, route, seeded }) => {
    const primary = structuredClone(route);
    primary.policy.maxRetries = retries;
    primary.executionPolicy.reuse = 'exact';
    primary.executionPolicy.computeBudget.maxRequests = maxRequests;
    if (fallback) {
        const connection = { ...seeded.connection, connectionProfileId: createNativeId('connectionProfile'), displayName: 'Fallback connection' };
        await host.persistence.saveConnectionProfile(h.handle, connection);
        const model = { ...seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'fallback-fixture',
            connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId } };
        await host.persistence.saveModelProfile(h.handle, model);
        primary.executionPolicy.allowedModelProfileIds.push(model.modelProfileId);
        const target = { ...structuredClone(primary), runtimeRouteId: createNativeId('runtimeRoute'), displayName: 'Owned fallback',
            modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId }, connectionProfileRef: model.connectionProfileRef };
        await host.persistence.saveRuntimeRoute(h.handle, target);
        const stored = await host.persistence.getRuntimeRoute(h.handle, target.runtimeRouteId);
        primary.fallbackRouteRefs = [{ scope: 'player', runtimeRouteId: stored.runtimeRouteId }];
        if (pinned) {
            plan.dependencyPins.push({ pinId: 'rp.fallback', port: 'model', resourceRef: primary.fallbackRouteRefs[0], integrity: hash(stored) });
            plan.definition.nodes[0].dependencyPinIds.push('rp.fallback');
        }
    }
    await host.persistence.saveRuntimeRoute(h.handle, primary);
    plan.dependencyPins[0].integrity = hash(await host.persistence.getRuntimeRoute(h.handle, primary.runtimeRouteId));
    plan.definition.nodes.find(node => node.kind === 'output').capabilities = ['chat.output'];
    plan.definition.capabilityCeiling.push('chat.output');
    Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
};
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
const configureContinuity = (mode = 'active_execution', verified = true) => async (plan, args) => {
    await configureFailure({ fallback: false })(plan, args);
    const { host, h, seeded, route } = args;
    const provider = createResponsesGenerationProvider();
    host.providers['provider.openai-responses'] = provider;
    host.turnOrchestration.modelResolver.providers.set('provider.openai-responses', provider);
    const connection = { ...await host.persistence.getConnectionProfile(h.handle, seeded.connection.connectionProfileId), providerAdapter: 'provider.openai-responses' };
    await host.persistence.saveConnectionProfile(h.handle, connection);
    const model = await host.persistence.getModelProfile(h.handle, seeded.model.modelProfileId), observedAt = Date.now() - 100;
    const decision = { capability: 'generation.continuation.active-execution', state: 'supported',
        provenance: [{ kind: 'provider-endpoint', source: 'Synthetic actual Responses protocol', observedAt }],
        ...(verified ? { binding: { schemaVersion: 1, pathFingerprint: executionPathFingerprint({ handle: h.handle, connection, model }),
            observedAt, expiresAt: Date.now() + 60000, assurance: 'verified' } } : {}) };
    await host.persistence.saveModelProfile(h.handle, { ...model, capabilities: [...model.capabilities, decision] }, verified
        ? { observationProof: capabilityObservationProof({ handle: h.handle, connection, model }, [decision]) } : {});
    const updated = await host.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId);
    await host.persistence.saveRuntimeRoute(h.handle, { ...updated, executionPolicy: { ...updated.executionPolicy, continuity: mode } });
    plan.dependencyPins[0].integrity = hash(await host.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId));
};

describe.each(CONTRACT_HARNESSES)('$name real RP failure policy', ({ make }) => {
    test.each([false, true])('an explicit paid rejection uses the original bounded failure policy and closes one output; retry=%s', async retry => {
        const f = await rpModelFixture(make, { configurePlan: configureFailure({ retries: retry ? 1 : 0 }), responseStatus: (_body, index) => index === 1 ? 500 : 200 });
        try {
            const result = await f.run(), bank = await bankOf(f);
            expect(result.generated.response.text).toBe(RP_MODEL_TEXT); expect(result.output.runStatus).toBe('completed');
            expect(f.requests.map(body => body.model)).toEqual(['p4-fixture', retry ? 'p4-fixture' : 'fallback-fixture']);
            expect(bank.attempts).toHaveLength(2);
            expect(bank.attempts.map(row => row.attemptId)).toEqual([sendAttemptId(result.effectId, 0), sendAttemptId(result.effectId, 1)]);
            expect(bank.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
            expect(bank.localWork.every(row => row.status === 'settled')).toBe(true);
            expect(result.generated.routing.fallbackUsed).toBe(!retry);
            expect(result.generated.snapshot.diagnostics.executionPlan.policy.reuse).toBe('exact');
            expect(result.generated.snapshot.diagnostics.executionPlan.cache.applicationResult).toBe('unknown');
            const root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(root.status).toBe('completed');
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(3);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'receipt', rpOutputClosureId(root.runId)), saved = await tx.getResource(key);
                const doc = structuredClone(saved.doc);
                doc.budgetAttemptRefs = doc.budgetAttemptRefs.filter(ref => ref.attemptId !== sendAttemptId(result.effectId, 0));
                try {
                    await tx.putResource(key, { ...saved, doc, integrity: hash(doc) });
                    await expect(readRpOutput(tx, f.h.handle, root)).rejects.toThrow('Invalid RP output completion facts');
                } finally { await tx.putResource(key, saved); }
            });
            await f.h.engine.close();
            const cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: f.h.directoriesByHandle ?? (() => f.h.dirs) });
            try {
                attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
                const facts = await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
                expect(facts.closure.budgetAttemptRefs.filter(ref => ref.kind !== 'local_work')).toHaveLength(2);
            } finally { await cold.close(); }
        } finally { await f.cleanup(); }
    }, 60000);

    test('an ambiguous transport retains its original unknown attempt and cannot retry, fallback or replay the operation', async () => {
        const f = await rpModelFixture(make, { configurePlan: configureFailure({ retries: 1 }), responseStatus: () => null });
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'generation_provider_submission_unknown' });
            expect(f.requests).toHaveLength(1); const bank = await bankOf(f);
            expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe('unknown');
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
            expect(await bankOf(f)).toEqual(bank);
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    }, 60000);

    test('an explicit HTTP failure with unknown spending may use remaining budget but cannot erase its cost or claim terminal output', async () => {
        const f = await rpModelFixture(make, { configurePlan: configureFailure(), usage: (_body, index) => index !== 1, responseStatus: (_body, index) => index === 1 ? 500 : 200 });
        try {
            const result = await f.run(), bank = await bankOf(f);
            expect(f.requests).toHaveLength(2); expect(result.generated.routing.fallbackUsed).toBe(true);
            expect(bank.attempts).toHaveLength(2); expect(bank.attempts.map(row => row.status)).toEqual(['unknown', 'settled']);
            expect(bank.attempts[1].usage.totalTokens).toBe(20);
            expect(result.output.runStatus).toBe('pending_output'); expect(result.output.outputClaimRef).toBeNull();
            expect((await f.authority.execution.runs.get(f.h.handle, result.runId)).status).toBe('running');
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['source', 'fallback-profile'])('%s changed after rejection prevents the second send and retains the paid first attempt', async change => {
        const f = await rpModelFixture(make, { configurePlan: configureFailure(), responseStatus: () => 500 });
        f.onResponse(async () => {
            if (change === 'source') {
                const chat = await f.chats.get(f.h.handle, 'Actor', 'main'); chat.body[0].mes = 'Independent current source';
                await f.chats.save(f.h.handle, 'Actor', 'main', chat.header, chat.body, chat.integrity);
            } else {
                const target = (await f.persistence.listRuntimeRoutes(f.h.handle)).find(route => route.runtimeRouteId !== f.input.routeRef.runtimeRouteId);
                const connection = await f.persistence.getConnectionProfile(f.h.handle, target.connectionProfileRef.connectionProfileId);
                await f.persistence.saveConnectionProfile(f.h.handle, { ...connection, endpoint: connection.endpoint + '/changed' });
            }
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(1);
            expect(bank.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    }, 60000);

    test('an unowned fallback cannot publish as Model mechanism evidence', async () => {
        await expect(rpModelFixture(make, { configurePlan: configureFailure({ pinned: false }) })).rejects.toThrow('native_orchestration_dependency_invalid');
    });

    test('the original remaining bank refuses fallback without refunding the failed send', async () => {
        const f = await rpModelFixture(make, { configurePlan: configureFailure({ maxRequests: 1 }), responseStatus: () => 500 });
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
            expect(f.requests).toHaveLength(1);
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(1);
            expect(bank.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    }, 60000);

    test('the original verified active-execution adapter is usable while RP prose remains a fresh generation with no opaque checkpoint disclosure', async () => {
        const f = await rpModelFixture(make, { configurePlan: configureContinuity(), responseBody: () => ({ id: 'synthetic-response', status: 'completed',
            output: [{ type: 'reasoning', id: 'synthetic-reasoning', encrypted_content: 'PRIVATE-RP-CONTINUITY' },
                { type: 'message', id: 'synthetic-message', role: 'assistant', content: [{ type: 'output_text', text: RP_MODEL_TEXT }] }],
            usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } }) });
        try {
            const result = await f.run();
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(1);
            expect(result.generated.snapshot.diagnostics.executionPlan.policy.continuity).toBe('active_execution');
            expect(result.generated.response.observation.nativeEnvelope).toBe('completed');
            expect(result.generated.response.observation.upstreamIdentity).toBe('unknown');
            expect(JSON.stringify(result)).not.toContain('PRIVATE-RP-CONTINUITY');
            expect(JSON.stringify((await f.chats.get(f.h.handle, 'Actor', 'main')).body)).not.toContain('PRIVATE-RP-CONTINUITY');
            expect((await bankOf(f)).attempts).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each([['active_execution', false], ['task', true]])('unsupported or unverified %s continuity is refused by the original Runtime mechanism before a send', async (mode, verified) => {
        await expect(rpModelFixture(make, { configurePlan: configureContinuity(mode, verified) })).rejects.toThrow('native_orchestration_dependency_invalid');
    });
});
