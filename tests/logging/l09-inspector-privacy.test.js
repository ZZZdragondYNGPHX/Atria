import { describe, expect, test } from '@jest/globals';

import { sanitizeRequestInspectorEntry } from '../../src/logging/incident-export.js';

describe('diagnostic request inspector privacy', () => {
    test('debug/export-safe inspector shape never includes prompt or response bodies', () => {
        const safe = sanitizeRequestInspectorEntry({
            id: 'inspect-1',
            requestId: 'req-1',
            generationId: 'gen-1',
            provider: 'provider',
            model: 'model',
            fullMessages: [{ role: 'user', content: 'PRIVATE PROMPT' }],
            wireRequest: { messages: [{ content: 'PRIVATE PROMPT' }], stream: true },
            responseText: 'PRIVATE RESPONSE',
            errorMessage: 'failed',
        });
        const text = JSON.stringify(safe);
        expect(safe).toMatchObject({
            id: 'inspect-1',
            requestId: 'req-1',
            generationId: 'gen-1',
            provider: 'provider',
            model: 'model',
            messageCount: 1,
            responseChars: 16,
        });
        expect(safe.wireRequestKeys).toEqual(expect.arrayContaining(['messages', 'stream']));
        expect(text).not.toContain('PRIVATE PROMPT');
        expect(text).not.toContain('PRIVATE RESPONSE');
    });
});
