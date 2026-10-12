import { test, expect } from '@jest/globals';
import { assertExecutionPolicy } from '../../src/native/model-prompt-runtime/contracts.js';

const model = 'model_' + 'a'.repeat(32), connection = 'conn_' + 'b'.repeat(32);
const policy = () => ({ schemaVersion: 1, allowedModelProfileIds: [model] });
const mcp = () => ({ protocolVersion: '2025-11-25', connectionProfileId: connection, toolNames: ['text.stats'], resourceUris: ['fixture://public/example'], auth: 'none' });

test('legacy execution policies preserve their old normalized shape without MCP', () => {
    expect(assertExecutionPolicy(policy())).toEqual({ ...policy(), verifiedRequirements: [], continuity: 'none', reuse: 'disabled' });
    const old = { ...policy(), continuity: 'task', reuse: 'exact', computeBudget: { maxRequests: 2, maxTokens: 100 }, optionalWork: { mode: 'preserve_required' } };
    expect(assertExecutionPolicy(old)).toMatchObject(old);
    expect(assertExecutionPolicy(old)).not.toHaveProperty('mcp');
});

test('exact MCP allowlists accept tool-only, resource-only and Secret mode and detach/freeze input', () => {
    for (const selection of [mcp(), { ...mcp(), resourceUris: [] }, { ...mcp(), toolNames: [], auth: 'secret' }]) {
        const input = { ...policy(), mcp: selection }, before = structuredClone(input), result = assertExecutionPolicy(input);
        expect(result.mcp).toEqual(selection); expect(input).toEqual(before);
        expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.mcp)).toBe(true);
        expect(Object.isFrozen(result.mcp.toolNames)).toBe(true); expect(Object.isFrozen(result.mcp.resourceUris)).toBe(true);
        selection.toolNames.push('later'); selection.resourceUris.push('fixture://later');
        expect(result.mcp).toEqual(before.mcp);
    }
    expect(assertExecutionPolicy({ ...policy(), mcp: { ...mcp(), toolNames: Array.from({ length: 8 }, (_, i) => 'tool.' + i), resourceUris: Array.from({ length: 8 }, (_, i) => 'urn:fixture:' + i) } }).mcp.toolNames).toHaveLength(8);
});

test.each([
    { protocolVersion: '2024-11-05' }, { protocolVersion: '' }, { connectionProfileId: model }, { connectionProfileId: 'conn_arbitrary' },
    { connectionProfileId: 'conn_' + 'B'.repeat(32) }, { auth: 'oauth' }, { auth: 'bearer' },
    { toolNames: [], resourceUris: [] }, { toolNames: ['dup', 'dup'] }, { resourceUris: ['urn:a', 'urn:a'] },
    { toolNames: Array(9).fill('tool') }, { resourceUris: Array(9).fill('urn:a') },
    { toolNames: ['contains space'] }, { toolNames: ['slash/name'] }, { toolNames: [''] }, { toolNames: ['a'.repeat(97)] },
    { toolNames: null }, { resourceUris: null }, { resourceUris: ['relative/path'] }, { resourceUris: ['urn:' + 'a'.repeat(253)] },
    { resourceUris: ['https://user:pass@localhost/path'] }, { resourceUris: ['fixture://@local/path'] },
    { resourceUris: ['urn:contains space'] }, { resourceUris: ['urn:contains\nnewline'] },
    { readOnlyHint: true }, { providerAdapter: 'provider.mcp' }, { transport: 'transport.http' },
    { endpoint: 'http://127.0.0.1' }, { headers: { Authorization: 'private' } }, { secretRef: { secretId: 'secret' } },
    { allowlist: ['*'] }, { toolNames: ['*'] }, { protocolVersion: undefined },
])('rejects invalid identifiers, bounds, URI userinfo and forged provider permissions %#', change => {
    expect(() => assertExecutionPolicy({ ...policy(), mcp: { ...mcp(), ...change } })).toThrow(TypeError);
});

test('MCP policy is a strict complete declaration, never a replacement provider authority', () => {
    for (const field of Object.keys(mcp())) {
        const incomplete = mcp(); delete incomplete[field];
        expect(() => assertExecutionPolicy({ ...policy(), mcp: incomplete })).toThrow(TypeError);
    }
    for (const value of [null, [], 'server', true]) expect(() => assertExecutionPolicy({ ...policy(), mcp: value })).toThrow(TypeError);
    expect(() => assertExecutionPolicy({ ...policy(), providerAdapter: 'provider.mcp' })).toThrow(TypeError);
    expect(() => assertExecutionPolicy({ ...policy(), mcp: mcp(), providerPolicy: { readOnlyHint: true } })).toThrow(TypeError);
});
