import { afterEach, expect, jest, test } from '@jest/globals';
import { createNativeId } from '../../src/native/identity.js';
import { RouteResolver } from '../../src/native/model-prompt-runtime/route-resolver.js';
import { GenerationService } from '../../src/native/model-prompt-runtime/generation-service.js';
import { assertCapabilityDecision, assertExecutionPolicy } from '../../src/native/model-prompt-runtime/contracts.js';
import { executionPathFingerprint, capabilityObservationProof } from '../../src/native/model-prompt-runtime/execution-evidence.js';
import { createGenerationProviderAdapter } from '../../src/native/adapters/generation-provider.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { Readable } from 'node:stream';
import { ProviderFailure } from '../../src/native/model-prompt-runtime/execution-utils.js';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
const decision = (state, binding) => ({ capability: 'generation.cache', state,
    provenance: [{ kind: binding ? 'provider-endpoint' : 'adapter-metadata', source: 'synthetic endpoint observation',
        ...(binding ? { observedAt: binding.observedAt } : {}) }],
    ...(binding ? { binding } : {}) });

async function fixture() {
    const h = await makeTempFsEngine(); cleanups.push(h.cleanup);
    const f = await seedGenerationProfiles({ engine: h.engine, handle: h.handle, endpoint: 'https://fixture.invalid/v1' });
    let time = 1000;
    const send = jest.fn(async () => ({ choices: [{ message: { content: 'fresh' } }] }));
    const provider = createGenerationProviderAdapter({ format: 'openai-compatible', send, countTokens: async () => 5,
        parseStream: async value => value, capabilities: [decision('supported')] });
    const resolver = new RouteResolver({ ...f, providers: { 'provider.openai-compatible': provider }, now: () => time });
    const source = { kind: 'task', projectId: createNativeId('project'), revision: 'r1', taskId: 'g01' };
    const secretPort = { resolveSecret: jest.fn(async () => 'synthetic-credential') };
    const contextProvider = { buildRequestContextPlan: async request => ({ schemaVersion: 1, requestId: request.requestId,
        source, items: [], provenance: [], budget: { maxTokens: 1000, reservedOutputTokens: 512 } }) };
    const preparePrompt = async ({ request }) => ({ schemaVersion: 1, requestId: request.requestId, input: 'hello', provenance: [] });
    const service = new GenerationService({ resolver, contextProvider, preparePrompt, secretPort, now: () => time });
    const request = { handle: h.handle, role: 'role.narrator', requestId: 'g01-test',
        routeRef: { scope: 'player', runtimeRouteId: f.routes[0].runtimeRouteId } };
    const normalized = { handle: h.handle,
        connection: await f.persistence.getConnectionProfile(h.handle, f.connection.connectionProfileId),
        model: await f.persistence.getModelProfile(h.handle, f.model.modelProfileId) };
    const binding = { schemaVersion: 1, pathFingerprint: executionPathFingerprint(normalized), observedAt: 900, expiresAt: 2000, assurance: 'verified' };
    const saveEvidence = async value => {
        const config = { handle: h.handle, connection: await f.persistence.getConnectionProfile(h.handle, f.connection.connectionProfileId),
            model: await f.persistence.getModelProfile(h.handle, f.model.modelProfileId) };
        const observationProof = capabilityObservationProof(config, [value]);
        return f.persistence.saveModelProfile(h.handle, { ...f.model, capabilities: [value] }, { observationProof });
    };
    const savePolicy = async policy => f.persistence.saveRuntimeRoute(h.handle, { ...f.routes[0], executionPolicy: policy });
    const policy = { schemaVersion: 1, allowedModelProfileIds: [f.model.modelProfileId], verifiedRequirements: ['generation.cache'] };
    return { ...f, h, service, request, send, secretPort, contextProvider, binding, saveEvidence, savePolicy, policy,
        setTime: value => { time = value; } };
}

test('adapter field construction cannot prove a hard gateway cache requirement', async () => {
    const f = await fixture();
    await expect(f.service.execute({ ...f.request, requirements: ['generation.cache'] })).rejects.toMatchObject({ code: 'generation_capability_unknown' });
    expect(f.secretPort.resolveSecret).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled();
    const preview = await f.service.execute(f.request, { preview: true });
    expect(preview.snapshot.diagnostics.executionPlan.cache.provider).toBe('unknown');
    expect(preview.snapshot.diagnostics.executionPlan.evidence[0].reason).toBe('path_unverified');
});

test('G03 explicit policy fallback cannot change accepted semantic program or weaken network policy', async () => {
    const f = await fixture();
    const prompt = { ...f.prompt, promptProgramId: createNativeId('promptProgram') };
    await f.library.commit(f.h.handle, 'core.prompt-program', prompt);
    const fallback = { ...f.routes[0], runtimeRouteId: createNativeId('runtimeRoute'),
        promptProgramRef: { ...f.routes[0].promptProgramRef, resourceId: prompt.promptProgramId } };
    await f.persistence.saveRuntimeRoute(f.h.handle, fallback);
    const initial = { ...f.routes[0], fallbackRouteRefs: [{ scope: 'player', runtimeRouteId: fallback.runtimeRouteId }],
        executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [f.model.modelProfileId], verifiedRequirements: [] } };
    await f.persistence.saveRuntimeRoute(f.h.handle, initial);
    f.send.mockRejectedValueOnce(new ProviderFailure('transport'));
    await expect(f.service.execute({ ...f.request, fallbackMode: 'automatic' })).rejects.toMatchObject({ code: 'generation_semantic_authority_changed' });
    expect(f.send).toHaveBeenCalledTimes(1); expect(f.secretPort.resolveSecret).toHaveBeenCalledTimes(1);

    const connection = { ...f.connection, connectionProfileId: createNativeId('connectionProfile'), networkPolicy: { region: 'different' } };
    await f.persistence.saveConnectionProfile(f.h.handle, connection);
    const model = { ...f.model, modelProfileId: createNativeId('modelProfile'),
        connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId } };
    await f.persistence.saveModelProfile(f.h.handle, model);
    await f.persistence.saveRuntimeRoute(f.h.handle, { ...fallback, promptProgramRef: initial.promptProgramRef,
        modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId }, connectionProfileRef: model.connectionProfileRef });
    await f.persistence.saveRuntimeRoute(f.h.handle, { ...initial, executionPolicy: { ...initial.executionPolicy,
        allowedModelProfileIds: [f.model.modelProfileId, model.modelProfileId] } });
    f.send.mockRejectedValueOnce(new ProviderFailure('transport'));
    await expect(f.service.execute({ ...f.request, fallbackMode: 'automatic' })).rejects.toMatchObject({ code: 'generation_target_policy_denied' });
    expect(f.send).toHaveBeenCalledTimes(2); expect(f.secretPort.resolveSecret).toHaveBeenCalledTimes(2);
});

test('persisted exact evidence and policy are consumed before sending; provider identity and price stay unknown', async () => {
    const f = await fixture(); await f.saveEvidence(decision('supported', f.binding)); await f.savePolicy(f.policy);
    const result = await f.service.execute(f.request);
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(result.snapshot.diagnostics.executionPlan).toMatchObject({ pathFingerprint: f.binding.pathFingerprint,
        selection: 'fixed_route', cache: { provider: 'supported' }, economics: { state: 'unknown', currencyCost: null },
        upstream: { identity: 'unknown', attempts: 'unknown' } });
    expect(JSON.stringify(result)).not.toContain('synthetic-credential');
    expect((await f.persistence.getRuntimeRoute(f.h.handle, f.routes[0].runtimeRouteId)).executionPolicy.schemaVersion).toBe(1);
});

test.each(['path', 'time', 'owner'])('changed %s rejects persisted capability evidence before send', async change => {
    const f = await fixture(); await f.saveEvidence(decision('supported', f.binding)); await f.savePolicy(f.policy);
    if (change === 'path') await f.persistence.saveConnectionProfile(f.h.handle, { ...f.connection, endpoint: 'https://changed.invalid/v1' });
    if (change === 'time') f.setTime(2000);
    if (change === 'owner') await f.persistence.saveConnectionProfile(f.h.handle, { ...f.connection, secretRef: { scope: 'player', secretId: 'different-account' } });
    await expect(f.service.execute(f.request)).rejects.toMatchObject({ code: 'generation_capability_unknown' });
    expect(f.secretPort.resolveSecret).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled();
});

test('evidence expiring during Context compilation cannot pass the later send boundary', async () => {
    const f = await fixture(); await f.saveEvidence(decision('supported', f.binding)); await f.savePolicy(f.policy);
    const build = f.contextProvider.buildRequestContextPlan;
    f.service.contextProvider = { ...f.contextProvider, buildRequestContextPlan: async (...args) => {
        const result = await build(...args); f.setTime(2000); return result;
    } };
    await expect(f.service.execute(f.request)).rejects.toMatchObject({ code: 'generation_path_evidence_unavailable' });
    expect(f.send).not.toHaveBeenCalled();
});

test.each(['active_execution', 'task', 'adaptive'])('fixed target allowlist and unavailable %s continuation cannot resolve secrets', async mode => {
    const f = await fixture();
    await f.savePolicy({ ...f.policy, verifiedRequirements: [], allowedModelProfileIds: [createNativeId('modelProfile')] });
    await expect(f.service.execute(f.request)).rejects.toMatchObject({ code: 'generation_target_policy_denied' });
    await f.savePolicy({ ...f.policy, verifiedRequirements: [], continuity: mode });
    await expect(f.service.execute(f.request)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
    expect(f.secretPort.resolveSecret).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
});

test('unknown contract versions and invalid freshness are rejected without changing old Route format', () => {
    expect(() => assertExecutionPolicy({ schemaVersion: 2, allowedModelProfileIds: [] })).toThrow();
    expect(() => assertCapabilityDecision(decision('supported', { schemaVersion: 1, pathFingerprint: 'a'.repeat(64),
        observedAt: 20, expiresAt: 20, assurance: 'verified' }))).toThrow();
});

test('SQLite original registry dump/restore preserves exact policy and evidence without a new storage kind', async () => {
    const h = await makeTempSqliteEngineHarness(); cleanups.push(h.cleanup);
    const f = await seedGenerationProfiles({ engine: h.engine, handle: h.handle, endpoint: 'https://fixture.invalid/v1' });
    const connection = await f.persistence.getConnectionProfile(h.handle, f.connection.connectionProfileId);
    const model = await f.persistence.getModelProfile(h.handle, f.model.modelProfileId);
    const binding = { schemaVersion: 1, pathFingerprint: executionPathFingerprint({ handle: h.handle, connection, model }),
        observedAt: 100, expiresAt: 10000, assurance: 'verified' };
    const measured = decision('supported', binding);
    await f.persistence.saveModelProfile(h.handle, { ...model, capabilities: [measured] },
        { observationProof: capabilityObservationProof({ handle: h.handle, connection, model }, [measured]) });
    await f.persistence.saveRuntimeRoute(h.handle, { ...f.routes[0], executionPolicy: { schemaVersion: 1,
        allowedModelProfileIds: [model.modelProfileId], verifiedRequirements: ['generation.cache'] } });
    const originalRoute = await f.persistence.getRuntimeRoute(h.handle, f.routes[0].runtimeRouteId);
    const chunks = []; for await (const chunk of await h.engine.dumpUser(h.handle)) chunks.push(chunk);
    await f.persistence.saveModelProfile(h.handle, { ...model, capabilities: [] });
    await h.engine.restoreUser(h.handle, Readable.from([Buffer.concat(chunks)]));
    expect((await f.persistence.getModelProfile(h.handle, model.modelProfileId)).capabilities[0].binding).toEqual(binding);
    expect(await f.persistence.getRuntimeRoute(h.handle, originalRoute.runtimeRouteId)).toEqual(originalRoute);
    expect((await f.library.getExact(h.handle, originalRoute.generationProfileRef)).snapshot.revision).toBe('r1');
});

test('configuration JSON cannot forge verified measurements; exact retained observations remain editable', async () => {
    const f = await fixture(); const measured = decision('supported', f.binding);
    await expect(f.persistence.saveModelProfile(f.h.handle, { ...f.model, capabilities: [measured] },
        { observationProof: {} })).rejects.toThrow('unverified path measurements');
    await f.saveEvidence(measured);
    await f.persistence.saveModelProfile(f.h.handle, { ...f.model, displayName: 'renamed', capabilities: [measured] });
    expect((await f.persistence.getModelProfile(f.h.handle, f.model.modelProfileId)).capabilities).toEqual([measured]);
});
