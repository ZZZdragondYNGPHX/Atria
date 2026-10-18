import { createHash } from 'node:crypto';
import { NATIVE_RESOURCE_KINDS as K, getNativeResourceKeyFields } from '../../src/native/contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { normalizeNativeResourceKey, encodeNativeResourceKey, nativeResourceFileId } from '../../src/storage/engines/native-resource-key.js';

describe('original Native resource identity bytes', () => {
    const key = () => ({ kind: K.orchestrationRecord, handle: 'key-test', runId: createNativeId('orchestrationRun'), recordType: 'receipt', recordId: 'original-row' });

    test('keeps canonical field order and file digest with immutable normalized keys', () => {
        const raw = key(), normalized = normalizeNativeResourceKey(raw);
        const encoded = JSON.stringify([raw.runId, raw.recordType, raw.recordId]);
        const expected = createHash('sha256').update(raw.kind).update('\0').update(encoded).digest('hex');
        expect(encodeNativeResourceKey(normalized)).toBe(encoded);
        expect(nativeResourceFileId(normalized)).toBe(expected);
        expect(Object.isFrozen(normalized)).toBe(true);
        const fields = getNativeResourceKeyFields(raw.kind);
        expect(fields).toEqual(['handle', 'runId', 'recordType', 'recordId']);
        expect(() => fields.push('charDir')).toThrow(TypeError);
        raw.recordId = 'later-row';
        expect(nativeResourceFileId(raw)).not.toBe(expected);
        expect(nativeResourceFileId(normalized)).toBe(expected);
        raw.charDir = 'forbidden-alias';
        expect(() => nativeResourceFileId(raw)).toThrow(/must not contain field/);
    });

    test('caller freezing never supplies validation or hides dynamic key values', () => {
        expect(() => normalizeNativeResourceKey(Object.freeze({ ...key(), runId: 'invalid' }))).toThrow();
        let reads = 0;
        const raw = key(), dynamic = Object.freeze({ ...raw, get recordId() { return 'row-' + ++reads; } });
        const first = nativeResourceFileId(dynamic), second = nativeResourceFileId(dynamic);
        expect(first).not.toBe(second);
        expect(() => normalizeNativeResourceKey(Object.freeze({ ...raw, unknown: true }))).toThrow(/must not contain field/);
    });

    test('a kind getter cannot turn an inconsistent copied key into validated identity', () => {
        let reads = 0;
        const raw = { get kind() { return ++reads === 1 ? K.orchestrationRun : K.rpRunControl; }, handle: 'key-test', runId: createNativeId('orchestrationRun') };
        const copied = normalizeNativeResourceKey(raw);
        expect(copied.kind).toBe(K.rpRunControl);
        expect(() => encodeNativeResourceKey(copied)).toThrow(/must not contain field/);
        expect(() => nativeResourceFileId(copied)).toThrow(/must not contain field/);
    });
});
