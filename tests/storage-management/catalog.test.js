import { describe, expect, test } from '@jest/globals';
import { NATIVE_RESOURCE_KINDS } from '../../src/native/contracts.js';
import {
    RESOURCE_CATEGORIES, NATIVE_CATEGORY_BY_KIND, RECOVERY_RETENTION_MS,
    classifyNativeRecord, resourceContentBytes, resourceCapabilities,
} from '../../src/storage/resource-catalog.js';

describe('resource center contracts', () => {
    test('covers the current native registry exactly, with nine business categories', () => {
        expect(Object.keys(NATIVE_CATEGORY_BY_KIND).sort()).toEqual(Object.values(NATIVE_RESOURCE_KINDS).sort());
        expect(RESOURCE_CATEGORIES).toHaveLength(9);
        expect(RECOVERY_RETENTION_MS).toBe(2592000000);
    });
    test('counts content consistently regardless of JSON key order or Unicode', () => {
        expect(resourceContentBytes({ z: '世界', a: 3 })).toBe(Buffer.byteLength('{"a":3,"z":"世界"}'));
        expect(resourceContentBytes({ a: 3, z: '世界' })).toBe(resourceContentBytes({ z: '世界', a: 3 }));
    });
    test('unknown and unowned versioned resources remain in reconciliation', () => {
        expect(classifyNativeRecord({ key: { kind: 'future-kind' }, doc: {} })).toBe('advanced');
        const key = { kind: NATIVE_RESOURCE_KINDS.versionedJsonResource, resourceType: 'atri.visual.job' };
        expect(classifyNativeRecord({ key, doc: {} })).toBe('advanced');
        expect(classifyNativeRecord({ key, doc: { source: { sessionId: 'stored-owner' } } })).toBe('sessions');
        expect(classifyNativeRecord({ key: { ...key, resourceType: 'core.prompt-module' }, doc: {} })).toBe('settings');
    });
    test('agent scope alone never changes ownership or grants deletion', () => {
        expect(classifyNativeRecord({ key: { kind: NATIVE_RESOURCE_KINDS.agentExperience }, doc: { scope: 'project:x' } })).toBe('agents');
        expect(resourceCapabilities().trash.allowed).toBe(false);
        expect(resourceCapabilities({ view: true }).view.allowed).toBe(true);
    });
});
