import test from 'node:test';
import assert from 'node:assert/strict';
import { jsonTextFragment } from '../src/json-fragment.js';
import { redact } from '../src/policy.js';

test('redacted JSON pages survive every sensitive-key and surrogate boundary plus repeated outer serialization', () => {
    const clean = redact({ apiKey: 'synthetic-private', password: 'synthetic-password', label: '中文😀', source: 'token="private source"', tokenLikeText: 'sk-abcdefghijklmnop' });
    const serialized = JSON.stringify(clean);
    for (let boundary = 1; boundary < serialized.length; boundary++) {
        const decoded = [jsonTextFragment(serialized, 0, boundary), jsonTextFragment(serialized, boundary, serialized.length)]
            .map(fragment => {
                const output = redact(JSON.parse(JSON.stringify(redact(fragment))));
                assert.equal(output.encoding, 'hex-utf16le');
                return Buffer.from(output.encodedText, 'hex').toString('utf16le');
            }).join('');
        assert.equal(decoded, serialized); assert.deepEqual(JSON.parse(decoded), clean);
    }
});
