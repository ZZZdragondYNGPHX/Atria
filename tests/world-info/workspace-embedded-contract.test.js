import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const CSS_PATH = new URL('../../public/css/world-info.css', import.meta.url);
const WORKSPACE_PATH = new URL('../../public/scripts/world-info/workspace.js', import.meta.url);

describe('World Info embedded workspace layout contract', () => {
    test('owns a complete embedded flex/visibility chain independent of legacy drawer media rules', () => {
        const css = readFileSync(CSS_PATH, 'utf8');

        expect(css).toMatch(/#WorldInfo\[data-atria-workspace-embedded="true"\]\s*\{[\s\S]*?display:\s*flex\s*!important;[\s\S]*?flex-direction:\s*column;[\s\S]*?overflow:\s*hidden\s*!important;/);
        expect(css).toMatch(/#WorldInfo\[data-atria-workspace-embedded="true"\]\s*>\s*#wi-holder\s*\{[\s\S]*?display:\s*flex\s*!important;[\s\S]*?flex:\s*1\s+1\s+0;[\s\S]*?min-height:\s*0\s*!important;/);
        expect(css).toMatch(/#WorldInfo\[data-atria-workspace-embedded="true"\]\s+#world_popup\s*\{[\s\S]*?display:\s*flex\s*!important;[\s\S]*?flex:\s*1\s+1\s+0;[\s\S]*?height:\s*100%\s*!important;/);
        expect(css).toMatch(/#WorldInfo\[data-atria-workspace-embedded="true"\]\s+#wi_workspace_shell\s*\{[\s\S]*?display:\s*flex\s*!important;[\s\S]*?flex:\s*1\s+1\s+0;[\s\S]*?height:\s*100%\s*!important;/);
        expect(css).toMatch(/#WorldInfo\[data-atria-workspace-embedded="true"\]\s+#wiTopBlock\s*\{[\s\S]*?display:\s*none\s*!important;/);
    });

    test('mount lifecycle makes embedded visibility explicit and restores prior accessibility state', () => {
        const source = readFileSync(WORKSPACE_PATH, 'utf8');

        expect(source).toContain("root.dataset.atriaWorkspaceEmbedded = String(Boolean(embedded));");
        expect(source).toContain("root.classList.add('openDrawer');");
        expect(source).toContain("root.classList.remove('closedDrawer');");
        expect(source).toContain('root.hidden = false;');
        expect(source).toContain("root.setAttribute('aria-hidden', 'false');");
        expect(source).toContain('root.hidden = originalHidden;');
        expect(source).toContain("if (originalAriaHidden === null) root.removeAttribute('aria-hidden');");
    });
});
