import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

describe('L06 diagnostics workspace structure', () => {
    test('user.js delegates logs UI to a lazy workspace module', () => {
        const source = readFileSync(new URL('../../public/scripts/user.js', import.meta.url), 'utf8');
        expect(source).toContain("import('./logging/workspace.js')");
        expect(source).toContain('openLogsWorkspace({');
        expect(source).not.toContain('accountLogsViewer');
        expect(source).not.toContain("fetch('/api/users/logs/get'");
        expect(source).not.toContain("fetch('/api/users/logs/clear'");
    });

    test('workspace defaults to guided incidents and keeps expert raw logs behind a mode switch', () => {
        const source = readFileSync(new URL('../../public/scripts/logging/workspace.js', import.meta.url), 'utf8');
        expect(source).toContain('data-mode="guided"');
        expect(source).toContain('My problem just happened');
        expect(source).toContain('/incidents/create-from-recent');
        expect(source).toContain('/incidents/list');
        expect(source).toContain('/logs/query');
        expect(source).toContain('renderVirtualLogs');
        expect(source).toContain('Copy diagnostic summary');
        expect(source).toContain('Copy full context');
        expect(source).toContain('Module health');
    });

    test('mobile workspace uses a detail drill-down rather than squeezed columns', () => {
        const css = readFileSync(new URL('../../public/css/accounts.css', import.meta.url), 'utf8');
        expect(css).toContain('@media (max-width: 700px)');
        expect(css).toContain('.atriaLogsWorkspace.is-detailing .atriaLogsDetailPane');
        expect(css).toContain('.atriaLogsMobileBack');
        expect(css).toContain('grid-template-columns: minmax(190px');
    });

    test('legacy viewer-only backend routes are removed after caller cutover', () => {
        const source = readFileSync(new URL('../../src/endpoints/users-admin.js', import.meta.url), 'utf8');
        expect(source).not.toContain("router.post('/logs/get'");
        expect(source).not.toContain("router.post('/logs/clear'");
    });
});
