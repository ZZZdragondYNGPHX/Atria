import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

describe('frontend structured startup migration', () => {
    test('client startup timing emits structured startup events without replacing telemetry', () => {
        const source = readFileSync(new URL('../../public/script.js', import.meta.url), 'utf8');
        expect(source).toContain("createLogger('startup')");
        expect(source).toContain("createLogger('ui')");
        expect(source).toContain('clientStartupLogger.debug(`milestone.');
        expect(source).toContain("'timing.report'");
        expect(source).toContain("'first-load.started'");
        expect(source).toContain("'first-load.completed'");
        expect(source).toContain("'csrf.failed'");
        expect(source).toContain("'websocket-delivery.failed'");
        expect(source).toContain("'app.ready'");
        expect(source).toContain("fetch('/api/startup/client-timing'");
        expect(source).toContain('keepalive: true');
    });
});
