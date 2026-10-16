import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { ActionRegistry, PolicyCeiling, RiskExecutor, fingerprint } from '../src/kernel.js';

test('bounded source review keeps the complete input binding and cannot authorize another body with the same display', async () => {
    const registry = new ActionRegistry(), source = 'untrusted-code-'.repeat(160000), calls = [], reviews = [];
    registry.register({ version: 1, id: 'fixture.prepare', domain: 'fixture', title: 'Prepare', risk: 'INTERACT', authority: 'Inert preparation', adapter: 'fixed-http',
        externalEffects: ['temporary-inert-staging'], guards: ['source-hash'], approval: 'trusted-approval-required', availability: { available: true, reason: '' } },
    z.strictObject({ source: z.string(), name: z.string() }), z.json(), input => { calls.push(input.source); return { prepared: true }; },
    () => ({ target: { name: 'same' }, serverBootId: 'boot' }), input => ({ name: input.name, source: 'Inspect original source separately before formal install' }));
    const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: review => {
        reviews.push(review); return { action: 'accept', content: { authorize: true, uses: 2 } };
    } });
    const input = { name: 'same', source }, first = await executor.execute('INTERACT', { action: 'fixture.prepare', input });
    assert.equal(reviews[0].input.inputFingerprint, fingerprint(input)); assert.ok(JSON.stringify(reviews).length < 2000);
    assert.doesNotMatch(JSON.stringify(first), /untrusted-code-/); assert.equal(calls[0], source);
    await assert.rejects(executor.execute('INTERACT', { action: 'fixture.prepare', input: { ...input, source: source + 'different' }, leaseId: first.lease.leaseId }), /Lease/);
    await executor.execute('INTERACT', { action: 'fixture.prepare', input, leaseId: first.lease.leaseId });
    assert.equal(calls.length, 2); assert.equal(reviews.length, 1);
});
