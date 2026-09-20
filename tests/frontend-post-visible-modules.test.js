import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const SCRIPT_URL = new URL('../public/script.js', import.meta.url);

describe('post-visible startup module loading', () => {
    test('keeps non-critical batch-3 modules out of the first static import graph', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');
        const deferredModules = [
            './scripts/input-md-formatting.js',
            './scripts/server-history.js',
            './scripts/setting-search.js',
            './scripts/bulk-edit.js',
            './scripts/data-maid.js',
            './scripts/a11y.js',
            './scripts/debug-export.js',
        ];

        for (const modulePath of deferredModules) {
            expect(source).not.toContain(`from '${modulePath}'`);
            expect(source).toContain(`import('${modulePath}')`);
        }
    });

    test('starts deferred module loading only after the first loader is hidden', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');
        const loaderHidden = source.indexOf("markClientStartupTiming('loaderHidden')");
        const deferredWarm = source.indexOf('void loadPostVisibleStartupModules()');

        expect(loaderHidden).toBeGreaterThanOrEqual(0);
        expect(deferredWarm).toBeGreaterThan(loaderHidden);
        expect(source).toContain('postVisibleStartupModulesPromise ??= Promise.all([');
    });

    test('batch 3 initializes through the shared deferred module promise', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');
        for (const initName of [
            'initInputMarkdown',
            'initServerHistory',
            'initSettingsSearch',
            'initBulkEdit',
            'initDataMaid',
            'initAccessibility',
        ]) {
            expect(source).toContain(
                `loadPostVisibleStartupModules().then(({ ${initName} }) => ${initName}())`,
            );
        }
    });
});
