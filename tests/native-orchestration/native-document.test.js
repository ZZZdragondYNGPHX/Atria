import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { serializeNativeDocument, hashNativeDocument } from '../../src/native/repositories/common.js';

describe('existing Native document integrity bytes', () => {
    test.each([
        [{ z: [null, true, false, -0, 1e-7], a: { '2': 'two', '10': 'ten' } }, '{"a":{"10":"ten","2":"two"},"z":[null,true,false,0,1e-7]}'],
        [{ '\n': 'quote" slash\\ \ud800', '__proto__': null }, '{"\\n":"quote\\" slash\\\\ \\ud800"}'],
        [Object.assign(Object.create(null), { b: 2, a: 1 }), '{"a":1,"b":2}'],
        [Array(2), '[,]'],
        [vm.runInNewContext('({z:[1,2], a:{b:"cross realm"}})'), '{"a":{"b":"cross realm"},"z":[1,2]}'],
    ])('keeps persisted canonical text and SHA256 for %j', (value, text) => {
        expect(serializeNativeDocument(value)).toBe(text);
        expect(hashNativeDocument(value)).toBe(createHash('sha256').update(text).digest('hex'));
    });

    test('rejects invalid documents before hashing, including nested values and cycles', () => {
        const cycle = {}; cycle.self = cycle;
        for (const value of [undefined, NaN, Infinity, 1n, { a: [undefined] }, { a: new Map() }, { a: new Date() }, cycle]) {
            expect(() => serializeNativeDocument(value)).toThrow(TypeError);
            expect(() => hashNativeDocument(value)).toThrow(TypeError);
        }
    });

    test('a later mutation changes integrity and no caller-owned document is cached', () => {
        const value = { a: { b: 1 } }, first = hashNativeDocument(value);
        value.a.b = 2;
        expect(hashNativeDocument(value)).not.toBe(first);
        value.a.b = 1;
        expect(hashNativeDocument(value)).toBe(first);
    });

    test('keeps exact nested validation locations and allows shared acyclic values', () => {
        expect(() => serializeNativeDocument({ a: [0, { b: undefined }] })).toThrow('Native resource.a[1].b must contain JSON values only');
        const child = { b: true };
        expect(serializeNativeDocument([child, child])).toBe('[{"b":true},{"b":true}]');
        child.b = child;
        expect(() => serializeNativeDocument([child])).toThrow('Native resource[0].b must not contain cycles');
    });

    test('pure content reuse cannot normalize holes or bypass fresh validation and cloning', () => {
        expect(serializeNativeDocument({ a: [null, null] })).toBe('{"a":[null,null]}');
        expect(serializeNativeDocument({ a: Array(2) })).toBe('{"a":[,]}');
        const value = { a: { b: 1 } };
        expect(serializeNativeDocument(value)).toBe('{"a":{"b":1}}');
        value.a.extra = undefined; // Native JSON alone would omit this.
        expect(() => serializeNativeDocument(value)).toThrow('Native resource.a.extra must contain JSON values only');
        delete value.a.extra;
        let reads = 0;
        Object.defineProperty(value.a, 'b', { enumerable: true, get: () => { reads++; return 1; } });
        const first = hashNativeDocument(value), before = reads;
        expect(hashNativeDocument(value)).toBe(first);
        expect(reads).toBeGreaterThan(before); // An existing key never bypasses original input reads.
        let phase = 0;
        const changing = { get a() { return phase++ % 2 === 0 ? [null, null] : Array(2); } };
        expect(serializeNativeDocument(changing)).toBe('{"a":[,]}');
    });

    test('canonical compatibility survives bounded content eviction', () => {
        const original = { z: [1, 2], '10': 'ten', '2': 'two' };
        const first = hashNativeDocument(original);
        for (let index = 0; index < 300; index++) hashNativeDocument({ index, body: 'x'.repeat(100) });
        expect(serializeNativeDocument(original)).toBe('{"10":"ten","2":"two","z":[1,2]}');
        expect(hashNativeDocument(original)).toBe(first);
    });
});
