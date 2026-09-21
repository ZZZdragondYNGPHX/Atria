import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const INDEX_URL = new URL('../public/index.html', import.meta.url);
const SCRIPT_URL = new URL('../public/script.js', import.meta.url);
const OPENAI_URL = new URL('../public/scripts/openai.js', import.meta.url);
const FOCUS_GUARD_URL = new URL('../public/lib/mobile-focus-guard.js', import.meta.url);
const SELECT2_PATCH_URL = new URL('../public/lib/select2-search-placeholder.js', import.meta.url);
const ACTIONABLE_SELECT_URL = new URL('../public/scripts/select2-actionable-single.js', import.meta.url);

describe('post-visible Select2 loading', () => {
    test('keeps Select2 out of the pre-visible classic script list', () => {
        const html = readFileSync(INDEX_URL, 'utf8');

        expect(html).not.toContain('<script src="lib/select2.min.js"></script>');
        expect(html).not.toContain('<script src="lib/select2-search-placeholder.js"></script>');
        expect(html).toContain('<script src="lib/mobile-focus-guard.js"></script>');
        expect(html).toContain('css/select2.min.css');
    });

    test('preserves the eager Android/iOS focus guard independently of Select2', () => {
        const guard = readFileSync(FOCUS_GUARD_URL, 'utf8');
        const patch = readFileSync(SELECT2_PATCH_URL, 'utf8');

        expect(guard).toContain('__atriaMobileFocusGuardInstalled');
        expect(guard).toContain("target.id === 'send_textarea'");
        expect(guard).toContain("classList.contains('select2-search__field')");
        expect(patch).toContain("$(document).on('select2:open'");
        expect(patch).toContain('__atriaSelect2SearchPatchLoaded = true');
        expect(patch).not.toContain('__atriaMobileFocusGuardInstalled');
    });

    test('defers desktop OpenAI Select2 controls until the library is ready', () => {
        const script = readFileSync(SCRIPT_URL, 'utf8');
        const openai = readFileSync(OPENAI_URL, 'utf8');

        const join = script.indexOf('await select2LibrariesReady;');
        const openaiSelects = script.indexOf('initOpenAIModelSelects();', join);
        const presetInit = script.indexOf('await initPresetManager();', openaiSelects);

        expect(openai).toContain('export function initOpenAIModelSelects()');
        expect(openai).toContain('openAIModelSelectsInitialized || isMobile()');
        expect(join).toBeGreaterThanOrEqual(0);
        expect(openaiSelects).toBeGreaterThan(join);
        expect(presetInit).toBeGreaterThan(openaiSelects);
    });

    test('keeps lazy Select2 bound to canonical jQuery and fail-soft at enhancement time', () => {
        const script = readFileSync(SCRIPT_URL, 'utf8');
        const textgen = readFileSync(new URL('../public/scripts/textgen-models.js', import.meta.url), 'utf8');

        expect(script).toContain('const getJQuery = () => globalThis.jQuery || globalThis.$;');
        expect(script).toContain('Select2 library failed to attach to the canonical jQuery instance');
        expect(textgen).toContain('const select2Jq = globalThis.jQuery || globalThis.$;');
        expect(textgen).toContain("if (typeof select2Jq?.fn?.select2 !== 'function')");
        expect(textgen).toContain("console.warn('[init] Select2 is not ready;");
        expect(textgen).toContain("select2Jq('#mancer_model').select2({");
        expect(textgen).not.toContain("$('#mancer_model').select2({");
    });

    test('keeps actionable Select2 on the canonical jQuery instance and fail-soft', () => {
        const actionable = readFileSync(ACTIONABLE_SELECT_URL, 'utf8');

        expect(actionable).toContain('function getCanonicalJQuery()');
        expect(actionable).toContain('const jq = getCanonicalJQuery();');
        expect(actionable).toContain("if (typeof jq.fn?.select2 !== 'function')");
        expect(actionable).toContain('const $select = jq(selectElement);');
        expect(actionable).toContain("console.warn('[init] Select2 is not ready;");
        expect(actionable).not.toContain('const $select = $(selectElement);');
    });

    test('loads Select2 after visible paint and before preset-manager initialization', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');
        const loaderHidden = source.indexOf("markClientStartupTiming('loaderHidden')");
        const yieldAfterVisible = source.indexOf('await yieldToBrowser();', loaderHidden);
        const select2Start = source.indexOf('const select2LibrariesReady = loadSelect2Libraries();', yieldAfterVisible);
        const select2Join = source.indexOf('await select2LibrariesReady;', select2Start);
        const presetInit = source.indexOf('await initPresetManager();', select2Join);

        expect(loaderHidden).toBeGreaterThanOrEqual(0);
        expect(yieldAfterVisible).toBeGreaterThan(loaderHidden);
        expect(select2Start).toBeGreaterThan(yieldAfterVisible);
        expect(select2Join).toBeGreaterThan(select2Start);
        expect(presetInit).toBeGreaterThan(select2Join);
        expect(source).toContain("loadStartupClassicScript('/lib/select2.min.js')");
        expect(source).toContain("loadStartupClassicScript('/lib/select2-search-placeholder.js')");
    });
});
