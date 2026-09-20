import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const INIT_URL = new URL('../public/init.js', import.meta.url);
const SCRIPT_URL = new URL('../public/script.js', import.meta.url);
const SERVER_URL = new URL('../src/server-main.js', import.meta.url);
const EXTENSIONS_URL = new URL('../public/scripts/extensions.js', import.meta.url);

describe('client startup telemetry', () => {
    test('captures module-import milestones before app bootstrap', () => {
        const source = readFileSync(INIT_URL, 'utf8');
        expect(source).toContain("__atriaStartupTiming");
        expect(source).toContain('libImportStart');
        expect(source).toContain('libImportEnd');
        expect(source).toContain('appImportStart');
        expect(source).toContain('appImportEnd');
        expect(source).toContain('initModuleEnd');
        expect(source).toContain('durations: {}');
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
        expect(source).toContain("measureClientStartupTask('welcomeScreen'");
        expect(source).toContain("markClientStartupTiming('batch2TasksStart')");
        expect(source).toContain("markClientStartupTiming('batch2TasksDone')");
        expect(source).toContain("measureClientStartupTask('batch2BootstrapExtensions'");
        expect(source).toContain("measureClientStartupTask('batch2Tokenizers'");
        expect(source).toContain("durations: { ...durations }");
    });

    test('extension bootstrap exposes phase timings without changing phase order', () => {
        const source = readFileSync(EXTENSIONS_URL, 'utf8');
        const firstLoad = source.indexOf("measureExtensionStartupPhase('extensionsFirstLoadEvent'");
        const discover = source.indexOf("measureExtensionStartupPhase('extensionsDiscover'");
        const manifests = source.indexOf("measureExtensionStartupPhase('extensionsManifests'");
        const activate = source.indexOf("measureExtensionStartupPhase('extensionsActivate'");
        const settingsLoaded = source.indexOf("measureExtensionStartupPhase('extensionsSettingsLoadedEvent'");

        expect(firstLoad).toBeGreaterThanOrEqual(0);
        expect(discover).toBeGreaterThan(firstLoad);
        expect(manifests).toBeGreaterThan(discover);
        expect(activate).toBeGreaterThan(manifests);
        expect(settingsLoaded).toBeGreaterThan(activate);
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
        expect(source).toContain('welcomeScreenMs');
        expect(source).toContain('batch2TasksMs');
        expect(source).toContain('b2BootstrapExtensionsMs');
        expect(source).toContain('b2TokenizersMs');
        expect(source).toContain('extDiscoverMs');
        expect(source).toContain('extManifestsMs');
        expect(source).toContain('extActivateMs');
    });
});
