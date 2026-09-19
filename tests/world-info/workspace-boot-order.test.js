import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const SCRIPT_PATH = new URL('../../public/script.js', import.meta.url);

describe('World Info workspace boot order', () => {
    test('mounts the Workspace shell before the loader is removed and before extensions bootstrap', () => {
        const source = readFileSync(SCRIPT_PATH, 'utf8');

        const workspaceMount = source.indexOf('initWorldInfoWorkspace();');
        const loaderHide = source.indexOf('await hideLoader();');
        const extensionBootstrap = source.indexOf('() => initExtensions()');
        const fullWorldInfoInit = source.indexOf('() => initWorldInfo()');

        expect(workspaceMount).toBeGreaterThanOrEqual(0);
        expect(loaderHide).toBeGreaterThanOrEqual(0);
        expect(extensionBootstrap).toBeGreaterThanOrEqual(0);
        expect(fullWorldInfoInit).toBeGreaterThanOrEqual(0);

        expect(workspaceMount).toBeLessThan(loaderHide);
        expect(workspaceMount).toBeLessThan(extensionBootstrap);
        expect(workspaceMount).toBeLessThan(fullWorldInfoInit);
    });
});
