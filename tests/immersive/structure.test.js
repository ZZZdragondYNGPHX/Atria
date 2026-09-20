import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

describe('immersive experience host integration', () => {
    test('core delegates immersive presentation and exposes one public provider entrypoint', () => {
        const script = read('public/script.js');
        expect(script).toContain("import { createImmersiveController } from './scripts/immersive/controller.js'");
        expect(script).toContain('globalThis.Atria.immersive = immersiveController');
        expect(script).toContain('immersiveController.reportGenerationFailure({ message: errorMessage })');
        expect(script).not.toContain('applyImmersiveLayoutOverrides');
        expect(script).not.toContain('onImmersiveFullscreenChanged');
    });

    test('startup keeps immersive translation safe across the circular i18n module graph', () => {
        const script = read('public/script.js');
        expect(script).toContain("translate as translateText");
        expect(script).toContain('const translateImmersiveText = value => {');
        expect(script).toContain('translate: translateImmersiveText');
        expect(script).not.toContain('translate: value => t(value)');
    });

    test('legacy keep-top-bar product mode is gone from active UI and styling', () => {
        for (const path of [
            'public/index.html',
            'public/scripts/power-user.js',
            'public/style.css',
            'public/css/mobile-styles.css',
            'public/css/immersive.css',
        ]) {
            const source = read(path);
            expect(source).not.toContain('immersive_mode_keep_top_bar');
            expect(source).not.toContain('immersiveKeepTopBar');
            expect(source).not.toContain('atria-immersive-keep-top-bar');
        }
    });

    test('immersive entry and exit are semantic buttons and stylesheet is isolated', () => {
        const index = read('public/index.html');
        expect(index).toContain('<button id="immersiveExitButton" type="button"');
        expect(index).toContain('<button id="immersive_mode_toggle" type="button"');
        expect(index).toContain('href="css/immersive.css"');
        expect(index).toContain('id="immersiveVisualMode"');
        expect(index).toContain('id="immersiveHudMode"');
    });

    test('Android Back dismisses input before overlays and leaves immersive HUD to its controller', () => {
        const script = read('public/script.js');
        expect(script).toContain("activeElement?.matches?.('input, textarea, select, [contenteditable=\"true\"]')");
        expect(script).toContain("dialog[open]:not(#atriaImmersiveHudDetails)");
        expect(script).toContain('immersiveController.dismissTransientLayer?.()');
    });

    test('immersive tools and extensions menus use stable native menu entrypoints', () => {
        const script = read('public/script.js');
        const composer = read('public/scripts/immersive/composer.js');
        const extensions = read('public/scripts/extensions.js');

        expect(script).toContain("target.closest('#options_button, #atriaImmersiveTools')");
        expect(script).toContain("Popper.createPopper(immersiveButton, menu.get(0)");
        expect(composer).toContain("id: 'atriaImmersiveExtensions'");
        expect(composer).toContain("fa-solid fa-magic-wand-sparkles");
        expect(extensions).toContain("'#atriaImmersiveExtensions'");
        expect(extensions).toContain('updatePopperReference(this)');
    });

    test('presentation reuses the live chat DOM rather than cloning history', () => {
        const sources = [
            read('public/scripts/immersive/presentation.js'),
            read('public/scripts/immersive/message-actions.js'),
            read('public/scripts/immersive/composer.js'),
        ].join('\n');
        expect(sources).not.toContain('cloneNode(');
        expect(sources).toContain("getElementById('chat')");
        expect(sources).toContain("getElementById('send_textarea')");
    });
});
