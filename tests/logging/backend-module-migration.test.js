import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

describe('L02 structured backend module migration', () => {
    test('websocket lifecycle uses the websocket structured logger', () => {
        const source = readFileSync(new URL('../../src/ws-delivery.js', import.meta.url), 'utf8');
        expect(source).toContain("createLogger('websocket'");
        expect(source).toContain("'connection.open'");
        expect(source).toContain("'subscription.forbidden'");
        expect(source).toContain("'connection.pong-timeout'");
    });

    test('dispatch and generation boundaries carry real correlation IDs', () => {
        const source = readFileSync(new URL('../../src/atria-dispatch/runner.js', import.meta.url), 'utf8');
        expect(source).toContain("createLogger('dispatch'");
        expect(source).toContain("createLogger('generation'");
        expect(source).toContain('const correlation = { requestId, generationId: requestId };');
        expect(source).toContain("'dispatch.started'");
        expect(source).toContain("'dispatch.failed'");
        expect(source).toContain("'dispatch.completed'");
    });

    test('HTTP startup-facing boundaries have structured module events', () => {
        const source = readFileSync(new URL('../../src/server-main.js', import.meta.url), 'utf8');
        expect(source).toContain("createLogger('http')");
        expect(source).toContain("'csrf-token.request'");
        expect(source).toContain("'root.request'");
    });
});
