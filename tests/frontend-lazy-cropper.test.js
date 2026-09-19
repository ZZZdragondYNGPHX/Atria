import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const INDEX_URL = new URL('../public/index.html', import.meta.url);
const POPUP_URL = new URL('../public/scripts/popup.js', import.meta.url);

describe('lazy cropper libraries', () => {
    test('does not load cropper classic scripts during normal page startup', () => {
        const html = readFileSync(INDEX_URL, 'utf8');

        expect(html).not.toContain('<script src="lib/cropper.min.js"></script>');
        expect(html).not.toContain('<script src="lib/jquery-cropper.min.js"></script>');
        expect(html).toContain('css/cropper.min.css');
    });

    test('crop popup loads both classic libraries in dependency order', () => {
        const source = readFileSync(POPUP_URL, 'utf8');

        expect(source).toContain("await loadClassicScript('/lib/cropper.min.js')");
        expect(source).toContain("await loadClassicScript('/lib/jquery-cropper.min.js')");
        expect(source).toContain("typeof $.fn?.cropper === 'function'");
        expect(source).toContain('cropperLibrariesPromise = null;');
    });

    test('every Popup CROP path initializes cropper from show()', () => {
        const source = readFileSync(POPUP_URL, 'utf8');
        const showStart = source.indexOf('    async show() {');
        const appendStart = source.indexOf('document.body.append(this.dlg);', showStart);
        const ensureStart = source.indexOf('await ensureCropperLibraries();', showStart);

        expect(showStart).toBeGreaterThanOrEqual(0);
        expect(ensureStart).toBeGreaterThan(showStart);
        expect(ensureStart).toBeLessThan(appendStart);
        expect(source).toContain('this.type === POPUP_TYPE.CROP && !this.cropperInitialized');
    });
});
