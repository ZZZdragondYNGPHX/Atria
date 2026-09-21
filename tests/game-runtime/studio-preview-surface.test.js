import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs/promises';

describe('Atria Studio mobile preview surface', () => {
    test('Preview owns a dedicated Studio panel instead of exposing host chat', async () => {
        const source = await fs.readFile(
            new URL('../../public/scripts/extensions/character-editor-assistant/studio/studio.js', import.meta.url),
            'utf8',
        );
        const css = await fs.readFile(
            new URL('../../public/scripts/extensions/character-editor-assistant/studio/studio.css', import.meta.url),
            'utf8',
        );

        expect(source).toContain("const STUDIO_PANEL_PREVIEW_ID = 'card-app-studio-preview'");
        expect(source).toContain('data-studio-preview-body');
        expect(source).toContain("setMobileActiveTab('preview')");
        expect(source).not.toContain('preview — both studio panels hidden, host chat shows through');

        expect(css).toContain('.card-app-studio-panel.preview');
        expect(css).toContain('card-app-studio-mobile-tab-preview .card-app-studio-panel.preview { display: flex; }');
        expect(css).not.toContain('not(.card-app-studio-mobile-tab-preview) #sheld');
        expect(css).not.toContain('Preview mode: hide both studio panels so the host chat shows through');
    });
});
