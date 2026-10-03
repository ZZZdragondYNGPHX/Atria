import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renewalProfile } from './renewal-profile.mjs';

test('amended final acceptance has fixed workload and retained coverage intervals', () => {
    const p = renewalProfile({ century: true });
    assert.equal(p.turns, 1000); assert.equal(p.years, 200);
    assert.equal(p.profile, 'century-acceptance'); assert.equal(p.checkpointEvery, 250);
    assert.equal(p.hookEvery, 6); assert.equal(p.worldEvery, 24);
    assert.throws(() => renewalProfile({ century: true, override: '999' }), /exactly 1000/);
    assert.throws(() => renewalProfile({ century: true, full: true }), /exactly 1000/);
});

test('regional default is the bounded Phase 6 profile, not Gate B', () => {
    const p = renewalProfile({ regional: true });
    assert.equal(p.profile, 'regional-fast');
    assert.equal(p.turns, 100); assert.equal(p.years, 50);
    assert.equal(p.checkpointEvery, 25); assert.equal(p.hookEvery, 3); assert.equal(p.worldEvery, 6);
});
test('explicit regional soak retains the original workload and intervals', () => {
    const p = renewalProfile({ regional: true, full: true });
    assert.equal(p.profile, 'regional-soak'); assert.equal(p.turns, 5000);
    assert.equal(p.fast, false); assert.equal(p.checkpointEvery, 1000);
    assert.equal(p.hookEvery, null); assert.equal(p.worldEvery, 100);
});
test('existing renewal default stays at 5000, custom short runs are smoke only', () => {
    assert.equal(renewalProfile().profile, 'renewal-soak');
    assert.equal(renewalProfile().turns, 5000);
    assert.equal(renewalProfile({ override: '100' }).profile, 'renewal-smoke');
    assert.equal(renewalProfile({ regional: true, override: '99' }).profile, 'regional-smoke');
    assert.equal(renewalProfile({ regional: true, override: '101' }).profile, 'regional-smoke');
});
test('invalid workloads and conflicting full flags fail closed', () => {
    for (const override of ['', '0', '-1', 'NaN', 'Infinity', '1.5', '9007199254740992'])
        assert.throws(() => renewalProfile({ regional: true, override }), /positive safe integer/);
    assert.throws(() => renewalProfile({ full: true }), /requires --regional-only/);
    assert.throws(() => renewalProfile({ regional: true, full: true, override: '100' }), /exactly 5000/);
});
