import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const INIT_URL = new URL('../public/init.js', import.meta.url);
const SCRIPT_URL = new URL('../public/script.js', import.meta.url);
const SERVER_URL = new URL('../src/server-main.js', import.meta.url);

describe('client startup telemetry', () => {
    test('captures module-import milestones before app bootstrap', () => {
        const source = readFileSync(INIT_URL, 'utf8');
        expect(source).toContain("__atriaStartupTiming");
        expect(source).toContain('libImportStart');
        expect(source).toContain('libImportEnd');
        expect(source).toContain('appImportStart');
        expect(source).toContain('appImportEnd');
        expect(source).toContain('initModuleEnd');
    });

    test('reports first-visible and APP_READY milestones without blocking startup', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');
        expect(source).toContain("markClientStartupTiming('firstLoadStart')");
        expect(source).toContain("markClientStartupTiming('csrfDone')");
        expect(source).toContain("markClientStartupTiming('getSettingsDone')");
        expect(source).toContain("markClientStartupTiming('loaderHidden')");
        expect(source).toContain("markClientStartupTiming('appReady')");
        expect(source).toContain("fetch('/api/startup/client-timing'");
        expect(source).toContain("keepalive: true");
        expect(source).toContain("reportClientStartupTiming('visible')");
        expect(source).toContain("reportClientStartupTiming('ready')");
        expect(source.indexOf("markClientStartupTiming('loaderHidden')"))
            .toBeLessThan(source.indexOf("reportClientStartupTiming('visible')"));
        expect(source.indexOf("markClientStartupTiming('appReady')"))
            .toBeLessThan(source.lastIndexOf("reportClientStartupTiming('ready')"));
    });

    test('backend logs only numeric startup timing summary fields', () => {
        const source = readFileSync(SERVER_URL, 'utf8');
        expect(source).toContain("app.post('/api/startup/client-timing'");
        expect(source).toContain("'[startup-client-visible]'");
        expect(source).toContain("'[startup-client]'");
        expect(source).toContain('visibleTotalMs');
        expect(source).toContain('appImportMs');
        expect(source).toContain('firstLoadTotalMs');
        expect(source).toContain('htmlToInitJsMs');
    });
});
