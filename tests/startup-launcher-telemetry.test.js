import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const SERVER_URL = new URL('../src/server-main.js', import.meta.url);
const DIRECT_URL = new URL('../scripts/termux/atria.sh', import.meta.url);
const TOOLBOX_URL = new URL('../scripts/termux/atria_toolbox.sh', import.meta.url);

describe('Termux launcher to root startup timing', () => {
    test('backend accepts launcher diagnostics only on the loopback path before auth/CSRF', () => {
        const source = readFileSync(SERVER_URL, 'utf8');
        const endpoint = source.indexOf("app.get('/api/startup/launcher-event'");
        const basicAuth = source.indexOf('app.use(basicAuthMiddleware)');
        const csrf = source.indexOf('app.use(csrfSyncProtection.csrfSynchronisedProtection)');

        expect(endpoint).toBeGreaterThanOrEqual(0);
        expect(source).toContain('if (!shouldSkipLoopbackCompression(request))');
        expect(endpoint).toBeLessThan(basicAuth);
        expect(endpoint).toBeLessThan(csrf);
        expect(source).toContain("'browser-open-start'");
        expect(source).toContain("'browser-open-return'");
    });

    test('root GET reports ready-to-root and browser-open-to-root separately', () => {
        const source = readFileSync(SERVER_URL, 'utf8');

        expect(source).toContain("event: 'root-get'");
        expect(source).toContain('readyToRootGetMs');
        expect(source).toContain('browserOpenToRootGetMs');
        expect(source).toContain("console.log('[startup-launcher]', JSON.stringify(summary))");
    });

    test('both Termux launch paths mirror boundaries into the backend before opening the browser', () => {
        for (const path of [DIRECT_URL, TOOLBOX_URL]) {
            const source = readFileSync(path, 'utf8');
            const mirror = source.indexOf('/api/startup/launcher-event?event=');
            const startEvent = source.indexOf('log_launcher_event "browser-open-start"');
            const openViaTermux = source.indexOf('termux-open-url');
            const openViaAm = source.indexOf('am start -a android.intent.action.VIEW');

            expect(mirror).toBeGreaterThanOrEqual(0);
            expect(startEvent).toBeGreaterThanOrEqual(0);
            expect(openViaTermux).toBeGreaterThan(startEvent);
            expect(openViaAm).toBeGreaterThan(startEvent);
        }
    });
});
