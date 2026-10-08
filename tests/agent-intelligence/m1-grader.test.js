import { afterEach, expect, test } from '@jest/globals';
import { evolutionFixture, testConfig } from './evolution-fixture.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { m1GraderConfiguration, sendM1Grader } from './m1-grader.js';
import { createFrozenEvaluationBridge } from '../../src/native/agent-intelligence/evaluation/worker-bridge.js';
import { evolutionHash as hash } from '../../src/native/agent-intelligence/evolution-repository.js';

const cleanup = [];
afterEach(async () => { for (const fn of cleanup.splice(0)) await fn(); });

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
