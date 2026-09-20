import { describe, expect, test } from '@jest/globals';
import vm from 'node:vm';

import { redactValue } from '../../src/logging/redact.js';

describe('redactValue cross-realm structured objects', () => {
    test('preserves cross-realm plain object structure while still redacting secrets', () => {
        const foreign = vm.runInNewContext("({ correlation: { requestId: 'req-1', generationId: 'gen-1' }, ownership: { probableOwner: 'external-service', confidence: 0.9 }, password: 'do-not-leak' })");
        const redacted = redactValue(foreign);
        expect(redacted).toMatchObject({
            correlation: { requestId: 'req-1', generationId: 'gen-1' },
            ownership: { probableOwner: 'external-service', confidence: 0.9 },
            password: '[REDACTED]',
        });
        expect(JSON.stringify(redacted)).not.toContain('[object Object]');
        expect(JSON.stringify(redacted)).not.toContain('do-not-leak');
    });
});
