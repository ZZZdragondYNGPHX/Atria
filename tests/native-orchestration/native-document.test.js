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

    test('a later mutation changes integrity and no caller-owned document is cached', () => {
        const value = { a: { b: 1 } }, first = hashNativeDocument(value);
        value.a.b = 2;
        expect(hashNativeDocument(value)).not.toBe(first);
        value.a.b = 1;
        expect(hashNativeDocument(value)).toBe(first);
    });

    test('canonical compatibility survives bounded content eviction', () => {
        const original = { z: [1, 2], '10': 'ten', '2': 'two' };
        const first = hashNativeDocument(original);
        for (let index = 0; index < 300; index++) hashNativeDocument({ index, body: 'x'.repeat(100) });
        expect(serializeNativeDocument(original)).toBe('{"10":"ten","2":"two","z":[1,2]}');
        expect(hashNativeDocument(original)).toBe(first);
    });
});
