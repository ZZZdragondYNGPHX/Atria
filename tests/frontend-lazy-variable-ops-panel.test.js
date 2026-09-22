import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const SCRIPT_URL = new URL('../public/script.js', import.meta.url);
const PANEL_URL = new URL('../public/scripts/variable-op-log/panel.js', import.meta.url);

describe('lazy variable-op panel loading', () => {
    test('keeps the panel out of the first static import graph', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');

        expect(source).not.toContain("from './scripts/variable-op-log/panel.js'");
        expect(source).toContain("import('./scripts/variable-op-log/panel.js')");
        expect(source).toContain('function loadVariableOpsPanelModule()');
    });

    test('initializes the panel only after the first loader is hidden', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');
        const loaderHidden = source.indexOf("markClientStartupTiming('loaderHidden')");
        const panelWarm = source.indexOf('void loadVariableOpsPanelModule()');

        expect(loaderHidden).toBeGreaterThanOrEqual(0);
        expect(panelWarm).toBeGreaterThan(loaderHidden);
        expect(source).not.toContain('        initVarOpsPanelHandler();');
    });

    test('deferred init is idempotent and refreshes already-rendered messages', () => {
        const source = readFileSync(PANEL_URL, 'utf8');

        expect(source).toContain('let panelHandlerInitialized = false;');
        expect(source).toContain('if (panelHandlerInitialized) return;');
        expect(source).toContain('panelHandlerInitialized = true;');
        expect(source).toContain('refreshAllButtons();');
    });
    test('keeps committed Native Timeline messages read-only', () => {
        const source = readFileSync(PANEL_URL, 'utf8');

        expect(source).toContain("message?.atri_native?.messageId");
        expect(source).toContain('Committed Native Timeline entries are immutable');
        expect(source).toContain('isNativeCommitted');
        expect(source).toContain('&& Array.isArray(message?.extra?.var_ops)');
    });

});
