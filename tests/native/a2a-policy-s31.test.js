import { test, expect } from '@jest/globals';
import { assertExecutionPolicy, assertConnectionProfile } from '../../src/native/model-prompt-runtime/contracts.js';

const model = 'model_' + 'a'.repeat(32), connection = 'conn_' + 'b'.repeat(32);
const policy = () => ({ schemaVersion: 1, allowedModelProfileIds: [model] });
const a2a = () => ({ protocolVersion: '1.0', connectionProfileId: connection, skillIds: ['stats'], auth: 'none' });

test('S31 optional A2A policy preserves legacy normalization', () => {
    expect(assertExecutionPolicy(policy())).toEqual({ ...policy(), verifiedRequirements: [], continuity: 'none', reuse: 'disabled' });
    expect(assertExecutionPolicy(policy())).not.toHaveProperty('a2a');
});

test.each(['none', 'secret'])('S31 exact %s policy detaches and freezes its bounded skill allowlist', auth => {
    const input = { ...policy(), a2a: { ...a2a(), auth, skillIds: Array.from({ length: 8 }, (_, index) => 'skill.' + index) } };
    const before = structuredClone(input), result = assertExecutionPolicy(input);
    expect(result.a2a).toEqual(before.a2a); expect(input).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.a2a)).toBe(true);
    expect(Object.isFrozen(result.a2a.skillIds)).toBe(true);
    input.a2a.skillIds.push('later');
    expect(result.a2a).toEqual(before.a2a);
});

test.each([
    { protocolVersion: '0.3' }, { protocolVersion: '1.0.0' }, { protocolVersion: 1 },
    { connectionProfileId: model }, { connectionProfileId: 'conn_arbitrary' }, { connectionProfileId: 'conn_' + 'B'.repeat(32) },
    { auth: 'oauth' }, { auth: 'bearer' }, { skillIds: [] }, { skillIds: ['dup', 'dup'] },
    { skillIds: Array.from({ length: 9 }, (_, index) => 'skill' + index) }, { skillIds: null },
    { skillIds: [''] }, { skillIds: ['contains space'] }, { skillIds: ['contains\nnewline'] }, { skillIds: ['*'] }, { skillIds: ['a'.repeat(257)] },
    { endpoint: 'http://127.0.0.1/rpc' }, { headers: { Authorization: 'private' } }, { secretRef: { secretId: 'secret' } },
    { providerAdapter: 'provider.a2a' }, { transport: 'transport.http' }, { autoReconnect: true }, { taskId: 'remote' },
])('S31 rejects unsupported protocol, identifiers, bounds and forged permissions %#', change => {
    expect(() => assertExecutionPolicy({ ...policy(), a2a: { ...a2a(), ...change } })).toThrow(TypeError);
});

test('S31 A2A policy requires every exact field and permits no alternate authority', () => {
    for (const field of Object.keys(a2a())) {
        const incomplete = a2a(); delete incomplete[field];
        expect(() => assertExecutionPolicy({ ...policy(), a2a: incomplete })).toThrow(TypeError);
    }
    for (const value of [null, [], 'server', true]) expect(() => assertExecutionPolicy({ ...policy(), a2a: value })).toThrow(TypeError);
    expect(() => assertExecutionPolicy({ ...policy(), providerAdapter: 'provider.a2a' })).toThrow(TypeError);
});

test('protocol connections may omit authentication, while model connections retain required SecretRef', () => {
    const base = { schemaVersion: 1, connectionProfileId: connection, displayName: 'Public protocol', scope: 'player', endpoint: 'https://example.test/rpc', transport: 'transport.http' };
    expect(assertConnectionProfile({ ...base, providerAdapter: 'provider.a2a' })).not.toHaveProperty('secretRef');
    expect(assertConnectionProfile({ ...base, providerAdapter: 'provider.mcp' })).not.toHaveProperty('secretRef');
    expect(() => assertConnectionProfile({ ...base, providerAdapter: 'provider.openai-compatible' })).toThrow();
});
