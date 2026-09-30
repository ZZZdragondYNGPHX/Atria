import { describe, expect, test } from '@jest/globals';
import { assertNativeExperienceContract, assertSupportedExperienceContract, ATRIA_EXPERIENCE_CAPABILITIES } from '../../public/shared/native-experience-contract.js';
import { AUTHORITY_LIMITS } from '../../public/shared/native-authority-contract.js';
import { authorityFixture } from './helpers/authority-fixture.js';

const at = (value, path) => path.split('.').reduce((item, key) => item[key], value);
const set = (value, path, next) => { const parts = path.split('.'); const key = parts.pop(); (parts.length ? at(value, parts.join('.')) : value)[key] = next; };
const frozen = value => !value || typeof value !== 'object' || Object.isFrozen(value) && Object.values(value).every(frozen);

describe('C1 independent Authority capability contract', () => {
    test.each([true, false])('accepts required=%s only with an explicit runtime', required => {
        const { contract } = authorityFixture(); contract.capabilities[0].required = required;
        const result = assertNativeExperienceContract(contract);
        expect(result).toEqual(contract); expect(frozen(result.authorityRuntime)).toBe(true);
        contract.authorityRuntime.policy.maxEffects = 1;
        expect(result.authorityRuntime.policy.maxEffects).toBe(32);
        expect(ATRIA_EXPERIENCE_CAPABILITIES.action).toEqual({ versions: [2], supported: [2] });
    });
    test('C1 registers declaration vocabulary, but fails closed until execution exists', () => {
        const { contract } = authorityFixture();
        expect(ATRIA_EXPERIENCE_CAPABILITIES['authority-transaction']).toEqual({ versions: [1], supported: [] });
        expect(() => assertSupportedExperienceContract(contract)).toThrow(/Host does not support required Experience capability authority-transaction@1/);
        contract.capabilities[0].required = false;
        expect(assertSupportedExperienceContract(contract)).toEqual(contract);
    });
    test('legacy contracts are unchanged and do not acquire default authority', () => {
        const legacy = { schemaVersion: 1, capabilities: [{ id: 'action', version: 2, required: true }], dataResources: [] };
        expect(assertSupportedExperienceContract(legacy)).toEqual(legacy);
        expect(assertSupportedExperienceContract(legacy)).not.toHaveProperty('authorityRuntime');
    });
    test.each([true, false])('rejects capability without runtime, required=%s', required => {
        const { contract } = authorityFixture(); contract.capabilities[0].required = required; delete contract.authorityRuntime;
        expect(() => assertNativeExperienceContract(contract)).toThrow(/declared together/);
    });
    test('rejects a runtime without capability', () => {
        const { contract } = authorityFixture(); contract.capabilities = [];
        expect(() => assertNativeExperienceContract(contract)).toThrow(/declared together/);
    });
    test.each(['authorityRuntime', 'authorityRuntime.intentObservation', 'authorityRuntime.policy'])('closes fields at %s', path => {
        const { contract } = authorityFixture(); at(contract, path).script = 'eval()';
        expect(() => assertNativeExperienceContract(contract)).toThrow();
    });
    test.each(['schemaVersion', 'intentObservation', 'policy', 'intentObservation.viewIds', 'intentObservation.maxItems', 'intentObservation.maxBytes',
        'policy.maxReadGrants', 'policy.maxWorldEvents', 'policy.maxAppCommands', 'policy.maxEffects', 'policy.maxReceiptBytes'])('requires runtime field %s', path => {
        const { contract } = authorityFixture(); const parts = path.split('.'); const key = parts.pop();
        delete (parts.length ? at(contract.authorityRuntime, parts.join('.')) : contract.authorityRuntime)[key];
        expect(() => assertNativeExperienceContract(contract)).toThrow();
    });
    test.each([
        ['schemaVersion', 2], ['canonicalClockId', 'missing'], ['canonicalClockId', { formula: 'args.clock' }],
        ['intentObservation.viewIds', ['missing']], ['intentObservation.viewIds', ['player.notes', 'player.notes']],
        ['intentObservation.maxItems', 65], ['intentObservation.maxItems', 0], ['intentObservation.maxBytes', 16385],
        ['policy.maxReadGrants', 17], ['policy.maxWorldEvents', 17], ['policy.maxAppCommands', 25],
        ['policy.maxEffects', 33], ['policy.maxReceiptBytes', 32769], ['policy.maxEffects', 1.5], ['policy.maxEffects', -1],
        ['policy.maxEffects', '32'], ['policy.maxReceiptBytes', Infinity],
    ])('rejects bounded/reference violation %s=%j', (path, value) => {
        const { contract } = authorityFixture(); set(contract.authorityRuntime, path, value);
        expect(() => assertNativeExperienceContract(contract)).toThrow();
    });
    test.each([['audience', 'narrator'], ['exposure', ['context']], ['knowledge', true], ['memory', true]])('rejects unsafe observation %s', (key, value) => {
        const { contract } = authorityFixture(); contract.informationRuntime.views[0][key] = value;
        expect(() => assertNativeExperienceContract(contract)).toThrow();
    });
    test('accepts stricter policies, empty observation and no clock for read-only transactions', () => {
        const { contract } = authorityFixture(); const runtime = contract.authorityRuntime;
        delete runtime.canonicalClockId; runtime.intentObservation.viewIds = [];
        for (const key of ['maxReadGrants', 'maxWorldEvents', 'maxAppCommands', 'maxEffects']) runtime.policy[key] = 0;
        expect(assertNativeExperienceContract(contract).authorityRuntime).toEqual(runtime);
        expect(Object.isFrozen(AUTHORITY_LIMITS)).toBe(true);
    });
    test.each(['getter', 'symbol', 'hidden', 'prototype', 'sparse', 'date', 'function'])('rejects non-data runtime: %s', kind => {
        const { contract } = authorityFixture(); const runtime = contract.authorityRuntime;
        if (kind === 'getter') Object.defineProperty(runtime, 'script', { enumerable: true, get() { throw new Error('getter ran'); } });
        if (kind === 'symbol') runtime[Symbol('x')] = 1;
        if (kind === 'hidden') Object.defineProperty(runtime, 'hidden', { value: 1 });
        if (kind === 'prototype') Object.setPrototypeOf(runtime, { inherited: true });
        if (kind === 'sparse') runtime.intentObservation.viewIds = Array(1);
        if (kind === 'date') runtime.policy = new Date();
        if (kind === 'function') runtime.policy.maxEffects = () => 1;
        expect(() => assertNativeExperienceContract(contract)).toThrow();
        expect(() => assertNativeExperienceContract(contract)).not.toThrow('getter ran');
    });
});
