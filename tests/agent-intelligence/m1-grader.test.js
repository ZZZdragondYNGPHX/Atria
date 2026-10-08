import { afterEach, expect, test } from '@jest/globals';
import { evolutionFixture, testConfig } from './evolution-fixture.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { m1GraderConfiguration, sendM1Grader, m1ExtractionConfiguration, sendM1Extraction } from './m1-grader.js';
import { m1TransportKey } from './m1-transport-key.js';
import { M1RetryPolicy } from './m1-retry.js';
import { createFrozenEvaluationBridge } from '../../src/native/agent-intelligence/evaluation/worker-bridge.js';
import { evolutionHash as hash } from '../../src/native/agent-intelligence/evolution-repository.js';

const cleanup = [];
afterEach(async () => { for (const fn of cleanup.splice(0)) await fn(); });

test('authorized extraction uses 8000 on the original compiler/provider with a separate persistent output window', async () => {
    let sends = 0;
    const f = await evolutionFixture(makeTempFsEngineHarness, 'project-prompt', { realEvaluator: true, fetchImpl: async (_url, options) => {
        sends++;
        expect(JSON.parse(options.body).max_tokens).toBe(8000);
        expect((await f.repository.owner(f.h.handle)).attempts.at(-1)).toMatchObject({ kind: 'extraction', status: 'reserved' });
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{"value":"Original style. Explain the actual review state.","rationale":"Address the diagnosed missing review explanation."}' } }], usage: { prompt_tokens: 644, completion_tokens: 2000, total_tokens: 2644 } }) };
    } });
    cleanup.push(f.h.cleanup);
    const original = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId), before = hash(original);
    const config = m1ExtractionConfiguration(original);
    const doc = await f.repository.get(f.h.handle, f.scope, f.subject), job = { id: 'fixture-extraction', scopeId: doc.scopeId, price: null };
    f.evaluator.send = (handle, request, resolved, packet, signal, fresh) => sendM1Extraction(f.evaluator, handle, request, resolved, packet, signal, fresh);
    const result = await f.evaluator.extract(f.h.handle, job, config, new AbortController().signal, async () => {}, { base: 'Original style.', feedback: [] });
    expect(result.value).toContain('actual review state'); expect(sends).toBe(1); expect(hash(original)).toBe(before);
    expect((await f.repository.owner(f.h.handle)).attempts[0]).toMatchObject({ kind: 'extraction', status: 'reported', tokens: 2644 });
    const old = m1TransportKey('fixture-url', 'fixture-model'), revised = m1TransportKey('fixture-url', 'fixture-model', {}, 8000);
    const policy = new M1RetryPolicy({ snapshot: { [old]: { consecutive: 3, recent: [true, true, true], stopped: 'm1_response_incomplete' } } });
    expect(() => policy.assertAvailable(old)).toThrow('m1_response_incomplete'); policy.assertAvailable(revised);
    policy.observe(revised); const restarted = new M1RetryPolicy({ snapshot: Object.fromEntries(policy.connections) });
    expect(restarted.state(old).stopped).toBe('m1_response_incomplete'); expect(restarted.state(revised).recent).toEqual([false]);
});

test.each([false, true])('extended independent grader funds the original provider and settles failure=%s without changing native limits', async failure => {
    let sends = 0, reserved;
    const f = await evolutionFixture(makeTempFsEngineHarness, 'project-strategy', { fetchImpl: async (_url, options) => {
        sends++;
        expect(JSON.parse(options.body).max_tokens).toBe(8192);
        reserved = (await f.repository.owner(f.h.handle)).attempts.at(-1);
        expect(reserved.status).toBe('reserved');
        if (failure) throw new Error('fixture_transport_failure');
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { role: 'assistant', content: '{"preference":"tie"}' } }], usage: { prompt_tokens: 100, completion_tokens: 2000, total_tokens: 2100 } }) };
    } });
    cleanup.push(f.h.cleanup);
    const { createLiveBridge } = await import('./live-bridge.js');
    await createLiveBridge({ engine: f.h.engine, handle: f.h.handle, config: { ...testConfig, model: 'independent', maxOutputTokens: 8192, contextTokens: 32000 }, secretPort: f.host.secretPort });
    const route = (await f.host.persistence.listRuntimeRoutes(f.h.handle)).find(r => r.role === 'role.orchestrator' && r.runtimeRouteId !== f.route.runtimeRouteId
        && r.modelProfileRef.modelProfileId !== f.route.modelProfileRef.modelProfileId);
    const config = await m1GraderConfiguration(f.host, f.h.handle, route.runtimeRouteId);
    await expect(f.evaluator.configuration(f.h.handle, route.runtimeRouteId)).rejects.toThrow('supported exact bounded');
    const doc = await f.repository.get(f.h.handle, f.scope, f.subject), job = { id: 'fixture:independent', scopeId: doc.scopeId, price: null };
    let paid;
    const bridge = await createFrozenEvaluationBridge(config, async packet => {
        const payload = { ...packet, arm: 'judge' }, signal = new AbortController().signal;
        await expect(f.evaluator.send(f.h.handle, job, config, payload, signal, async () => {})).rejects.toThrow();
        await expect(sendM1Grader(f.evaluator, f.h.handle, job, config, { ...payload, arm: 'candidate' }, signal, async () => {})).rejects.toThrow('independent_m1_grader_only');
        const changed = { ...payload.rendered, body: { ...payload.rendered.body, max_tokens: 1024 } };
        await expect(sendM1Grader(f.evaluator, f.h.handle, job, config, { ...payload, rendered: changed, requestHash: hash(changed) }, signal, async () => {})).rejects.toThrow('m1_grader_transport_changed');
        expect((await f.repository.owner(f.h.handle)).attempts).toHaveLength(0);
        paid = await sendM1Grader(f.evaluator, f.h.handle, job, config, payload, signal, async () => {});
        return paid.raw;
    });
    cleanup.push(bridge.cleanup);
    const call = bridge.rp({ requestId: 'fixture-grader', trialId: 'fixture-pair', fixtureHash: hash('fixture'), messages: [{ role: 'user', content: 'Return a grade.' }], tools: [], kind: 'grader' });
    const [outcome] = await Promise.allSettled([call]);
    expect(outcome.status).toBe(failure ? 'rejected' : 'fulfilled');
    expect(sends).toBe(1);
    const owner = await f.repository.owner(f.h.handle);
    expect(owner.attempts).toHaveLength(1);
    expect(owner.attempts[0]).toMatchObject({ id: reserved.id, jobId: job.id, kind: 'judge', status: failure ? 'unknown' : 'reported', tokens: failure ? reserved.upperBound : 2100, cost: null });
    expect(paid?.charge.tokens).toBe(failure ? undefined : 2100);
});

test('single explicit diagnostic caps a legacy 8192 route at 8000 before reserving the original provider send', async () => {
    let sends = 0;
    const f = await evolutionFixture(makeTempFsEngineHarness, 'project-strategy', { fetchImpl: async (_url, options) => {
        sends++; expect(JSON.parse(options.body).max_tokens).toBe(8000);
        expect((await f.repository.owner(f.h.handle)).attempts.at(-1).status).toBe('reserved');
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { role: 'assistant', content: '{"ok":true}' } }], usage: { total_tokens: 17 } }) };
    } });
    cleanup.push(f.h.cleanup);
    const { createLiveBridge } = await import('./live-bridge.js');
    await createLiveBridge({ engine: f.h.engine, handle: f.h.handle, config: { ...testConfig, model: 'diagnostic', maxOutputTokens: 8192, contextTokens: 32000 }, secretPort: f.host.secretPort });
    const routes = await f.host.persistence.listRuntimeRoutes(f.h.handle);
    const route = routes.find(r => r.role === 'role.orchestrator' && r.runtimeRouteId !== f.route.runtimeRouteId);
    const original = await m1GraderConfiguration(f.host, f.h.handle, route.runtimeRouteId);
    const config = await m1GraderConfiguration(f.host, f.h.handle, route.runtimeRouteId, 8000);
    expect(original.generation.output.maxTokens).toBe(8192); expect(config.generation.output.maxTokens).toBe(8000);
    const doc = await f.repository.get(f.h.handle, f.scope, f.subject), job = { id: 'm1-secondary-diagnostic-fixture:diagnostic', scopeId: doc.scopeId, price: null };
    const bridge = await createFrozenEvaluationBridge(config, async payload => {
        const packet = { ...payload, arm: 'judge' };
        await expect(sendM1Grader(f.evaluator, f.h.handle, { ...job, id: 'arbitrary:diagnostic' }, config, packet, new AbortController().signal, async () => {})).rejects.toThrow('independent_m1_grader_only');
        return (await sendM1Grader(f.evaluator, f.h.handle, job, config, packet, new AbortController().signal, async () => {})).raw;
    });
    cleanup.push(bridge.cleanup);
    await bridge.rp({ requestId: job.id, trialId: job.id, fixtureHash: hash('diagnostic'), messages: [{ role: 'user', content: 'Return JSON only: {"ok":true}' }], tools: [], kind: 'grader' });
    expect(sends).toBe(1); expect((await f.repository.owner(f.h.handle)).attempts[0]).toMatchObject({ kind: 'judge', status: 'reported', tokens: 17 });
});
