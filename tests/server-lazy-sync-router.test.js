import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const SERVER_URL = new URL('../src/server-main.js', import.meta.url);

describe('lazy LAN sync server router', () => {
    test('preserves the public sync mount position while deferring the heavy router graph', () => {
        const source = readFileSync(SERVER_URL, 'utf8');

        expect(source).not.toContain("import { router as syncRouter } from './endpoints/sync.js'");
        expect(source).toContain("() => import('./endpoints/sync.js')");
        expect(source).toContain("{ exportName: 'router', label: 'sync' }");

        const syncMount = source.indexOf("app.use('/api/sync/v1', createLazyRouter(");
        const loginGate = source.indexOf('app.use(requireLoginMiddleware);');
        const writeGate = source.indexOf('app.use(syncInProgressMiddleware());');

        expect(syncMount).toBeGreaterThanOrEqual(0);
        expect(loginGate).toBeGreaterThan(syncMount);
        expect(writeGate).toBeGreaterThan(loginGate);
    });
});
