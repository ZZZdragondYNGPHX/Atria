import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

describe('L07 startup analysis UI structure', () => {
    test('diagnostics workspace lazy-loads Startup Analysis as its own mode', () => {
        const workspace = readFileSync(new URL('../../public/scripts/logging/workspace.js', import.meta.url), 'utf8');
        expect(workspace).toContain("import('./startup-analysis.js')");
        expect(workspace).toContain('data-mode="startup"');
        expect(workspace).toContain('atriaStartupAnalysisMount');
        expect(workspace).toContain("state.mode === 'startup'");
    });

    test('startup analysis uses diagnostics startup APIs and native SVG without chart dependencies', () => {
        const source = readFileSync(new URL('../../public/scripts/logging/startup-analysis.js', import.meta.url), 'utf8');
        expect(source).toContain("request('/startup/list'");
        expect(source).toContain("request('/startup/compare'");
        expect(source).toContain("request('/startup/' + encodeURIComponent");
        expect(source).toContain('viewBox="0 0 100 100"');
        expect(source).toContain('stroke-dasharray');
        expect(source).toContain('Extension activation breakdown');
        expect(source).toContain('Startup timeline');
        expect(source).toContain('Session comparison');
        expect(source).not.toContain('Chart.js');
        expect(source).not.toContain('echarts');
    });

    test('startup analysis CSS deliberately stacks the layout on mobile', () => {
        const css = readFileSync(new URL('../../public/css/accounts.css', import.meta.url), 'utf8');
        expect(css).toContain('.atriaStartupBody');
        expect(css).toContain('.atriaStartupHeroGrid');
        expect(css).toContain('@media (max-width: 700px)');
        expect(css).toContain('.atriaStartupHeroGrid,');
        expect(css).toContain('grid-template-columns: 1fr;');
    });
});
