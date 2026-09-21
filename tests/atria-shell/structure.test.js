import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

describe('R7A shell architecture', () => {
    test('loads semantic tokens and shell stylesheet as first-class frontend assets', () => {
        const index = read('public/index.html');
        expect(index).toContain('href="css/atria-tokens.css"');
        expect(index).toContain('href="css/atria-shell.css"');
    });

    test('initializes the shell foundation after settings/theme setup without making it a second app runtime', () => {
        const script = read('public/script.js');
        expect(script).toContain('import { initializeAtriaShellFoundation } from \'./scripts/atria-shell/index.js\'');
        expect(script).toContain('const shellFoundation = initializeAtriaShellFoundation({');
        expect(script).toContain('globalThis.Atria.shell = shellFoundation');

        const dynamicStyles = script.indexOf('initDynamicStyles();');
        const shellInit = script.indexOf('const shellFoundation = initializeAtriaShellFoundation({');
        const worldWorkspace = script.indexOf('initWorldInfoWorkspace();');
        expect(shellInit).toBeGreaterThan(dynamicStyles);
        expect(shellInit).toBeLessThan(worldWorkspace);
    });

    test('keeps native Conversation and Composer out of R7A shell implementation', () => {
        const shell = read('public/scripts/atria-shell/app-shell.js');
        expect(shell).not.toContain('getElementById(\'chat\')');
        expect(shell).not.toContain('getElementById(\'send_form\')');
        expect(shell).not.toContain('getElementById(\'send_textarea\')');
        expect(shell).not.toContain('cloneNode(');
    });

    test('isolates SmartTheme compatibility in the semantic token adapter', () => {
        const tokens = read('public/css/atria-tokens.css');
        const shell = read('public/css/atria-shell.css');
        expect(tokens).toContain('--atri-color-canvas');
        expect(tokens).toContain('SmartTheme');
        expect(shell).not.toContain('SmartTheme');
        expect(shell).toContain('var(--atri-color-canvas)');
    });

    test('keeps R7A behind the temporary preview gate until R7B reparenting', () => {
        const entry = read('public/scripts/atria-shell/index.js');
        expect(entry).toContain('ATRIA_SHELL_PREVIEW_QUERY_KEY');
        expect(entry).toContain('ATRIA_SHELL_PREVIEW_STORAGE_KEY');
        expect(entry).toContain('if (previewEnabled) mount();');
    });

    test('keeps Backgrounds hash tabs local when the document URL has a query string', () => {
        const backgrounds = read('public/scripts/backgrounds.js');
        expect(backgrounds).toContain('const currentDocumentUrl =');
        expect(backgrounds).toContain('window.location.pathname');
        expect(backgrounds).toContain('window.location.search');
        expect(backgrounds).toContain('this.setAttribute(\'href\',');
        expect(backgrounds.indexOf('currentDocumentUrl')).toBeLessThan(backgrounds.indexOf('$(\'#bg_tabs\').tabs();'));
    });

    test('locks the shell root to the dynamic viewport on compact devices', () => {
        const shell = read('public/css/atria-shell.css');
        expect(shell).toContain('width: 100dvw;');
        expect(shell).toContain('height: 100dvh;');
        expect(shell).toContain('min-height: 100dvh;');
    });
});
, '
    });

    test('locks the shell root to the dynamic viewport on compact devices', () => {
        const shell = read('public/css/atria-shell.css');
        expect(shell).toContain('width: 100dvw;');
        expect(shell).toContain('height: 100dvh;');
        expect(shell).toContain('min-height: 100dvh;');
    });
});
)));
    });

    test('locks the shell root to the dynamic viewport on compact devices', () => {
        const shell = read('public/css/atria-shell.css');
        expect(shell).toContain('width: 100dvw;');
        expect(shell).toContain('height: 100dvh;');
        expect(shell).toContain('min-height: 100dvh;');
    });
});
