import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { redactText } from '../src/policy.js';

test('assignment redaction preserves exact labels and removes quoted, adjacent and embedded credentials', () => {
    assert.equal(redactText('my-api_key="private value"; x_password:abc, "accessToken": "hidden"\nnormal: visible'),
        'my-api_key="[REDACTED]"; x_password:[REDACTED], "accessToken": "[REDACTED]"\nnormal: visible');
    assert.equal(redactText('https://user:password@example.com/a https://only-user@example.com'),
        'https://[REDACTED]@example.com/a https://[REDACTED]@example.com');
    assert.equal(redactText('password: |\n  concealed'), '[REDACTED SENSITIVE MULTILINE CONTENT]');
    const encoded = JSON.stringify({ apiKey: 'untrusted"escaped\\credential', nested: { password: '[REDACTED]' } });
    const clean = redactText(encoded); assert.equal(redactText(clean), clean);
    assert.deepEqual(JSON.parse(clean), { apiKey: '[REDACTED]', nested: { password: '[REDACTED]' } });
});

test('multi-megabyte untrusted words cannot block the Control event loop through redaction', () => {
    // A subprocess gives the regression a hard deadline even for a synchronous
    // catastrophic regexp; an in-process test timeout cannot interrupt one.
    const code = `import assert from 'node:assert/strict'; import {redactText} from './src/policy.js';
        for (const value of ['a'.repeat(4*1024*1024), 'a-'.repeat(1024*1024), 'a'.repeat(1024*1024)+':not-a-url']) assert.equal(redactText(value),value);
        assert.equal(redactText('a'.repeat(524200)+' token=concealed').endsWith('token=[REDACTED]'),true);`;
    execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: fileURLToPath(new URL('../', import.meta.url)), timeout: 8000, stdio: 'pipe', windowsHide: true });
});
