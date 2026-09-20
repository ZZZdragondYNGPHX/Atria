import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const INIT_URL = new URL('../public/init.js', import.meta.url);
const SCRIPT_URL = new URL('../public/script.js', import.meta.url);
const SERVER_URL = new URL('../src/server-main.js', import.meta.url);
const STARTUP_STORE_URL = new URL('../src/logging/startup-store.js', import.meta.url);
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
        const prewarm = source.indexOf("measureExtensionStartupPhase('extensionsPrewarm'");
        const activate = source.indexOf("measureExtensionStartupPhase('extensionsActivate'");
        const settingsLoaded = source.indexOf("measureExtensionStartupPhase('extensionsSettingsLoadedEvent'");

        expect(firstLoad).toBeGreaterThanOrEqual(0);
        expect(discover).toBeGreaterThan(firstLoad);
        expect(manifests).toBeGreaterThan(discover);
        expect(prewarm).toBeGreaterThan(manifests);
        expect(activate).toBeGreaterThan(prewarm);
        expect(settingsLoaded).toBeGreaterThan(activate);
        expect(source).toContain('prewarmDeferredExtensionModules');
        expect(source).toContain('extensionActivate:');
        expect(source).toContain('extensionLocale:');
        expect(source).toContain('extensionScript:');
        expect(source).toContain('extensionStyle:');
        expect(source).toContain('extensionHook:');
    });

    test('backend stores startup timing summary and bounded slow-extension diagnostics', () => {
        const server = readFileSync(SERVER_URL, 'utf8');
        const store = readFileSync(STARTUP_STORE_URL, 'utf8');
        expect(server).toContain("app.post('/api/startup/client-timing'");
        expect(server).toContain("'[startup-client-visible]'");
        expect(server).toContain("'[startup-client]'");
        expect(server).toContain('startupSessionStore.recordClientReport');

        expect(store).toContain('visibleTotalMs');
        expect(store).toContain('appImportMs');
        expect(store).toContain('firstLoadTotalMs');
        expect(store).toContain('htmlToInitJsMs');
        expect(store).toContain('welcomeScreenMs');
        expect(store).toContain('batch2TasksMs');
        expect(store).toContain('b2BootstrapExtensionsMs');
        expect(store).toContain('b2TokenizersMs');
        expect(store).toContain('extDiscoverMs');
        expect(store).toContain('extManifestsMs');
        expect(store).toContain('extPrewarmMs');
        expect(store).toContain('extActivateMs');
        expect(store).toContain('extSlow');
        expect(store).toContain('summarizeExtensionActivationTimings');
        expect(store).toContain('scriptMs');
        expect(store).toContain('styleMs');
        expect(store).toContain('hookMs');
    });
});
