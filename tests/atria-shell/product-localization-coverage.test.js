import { afterEach, expect, test } from '@jest/globals';
import fs from 'node:fs';
import { auditProductLocalization, auditProductSource } from '../../scripts/check-native-product-localization.mjs';
import { formatShellText, translateShellText } from '../../public/scripts/atria-shell/localization.js';
import { createCommandRegistry } from '../../public/scripts/atria-shell/command-registry.js';
import { runtimeRemediation } from '../../public/scripts/native/runtime-client.js';
import { assertRetrievalProfile } from '../../public/scripts/native/retrieval-contracts.js';
afterEach(() => { delete globalThis.__i18n; });

test('the application ships only English and Simplified Chinese interface catalogs', () => {
    const directory = new URL('../../public/locales/', import.meta.url);
    const languages = JSON.parse(fs.readFileSync(new URL('lang.json', directory), 'utf8'));
    expect(languages.map(item => item.lang)).toEqual(['en', 'zh-cn']);
    expect(fs.readdirSync(directory).sort()).toEqual(['lang.json', 'zh-cn.json']);
});

test('coverage ignores style elements but still audits similarly named visible elements', () => {
    const source = 'const css = document.createElement(\'style\'); css.textContent = \'.example { color: red; }\'; const style = document.createElement(\'div\'); style.textContent = \'Visible label\';';
    expect(auditProductSource(source, 'example.js', [{}])).toEqual([
        { line: 1, reason: 'raw UI copy', text: 'Visible label' },
    ]);
});

test('Native, Shell, Agents, Skills and retained Global Plugin copy has Simplified Chinese and matching placeholders', () => {
    expect(auditProductLocalization()).toEqual([]);
});

test('coverage rejects new raw visible/accessibility text, missing keys and concatenated translation lookups', () => {
    const issues = auditProductSource('node.textContent = \'Untranslated action\'; node.setAttribute(\'aria-label\', \'Missing label\'); tl(\'New unmapped text\'); tl(\'Status: \' + state);', 'public/scripts/native/example.js', [{}, {}]);
    expect(issues.map(item => item.reason)).toEqual(expect.arrayContaining(['raw UI copy', 'raw accessibility label', 'missing translation', 'concatenated translation lookup']));
    expect(auditProductSource('node.textContent = userName; input.value = modelId; pre.textContent = sourceCode;', 'public/scripts/native/example.js', [{}, {}])).toEqual([]);
});

for (const language of ['zh-cn']) test(language + ' formats copy, preserves literal values and searches localized commands', () => {
    const locale = JSON.parse(fs.readFileSync(new URL('../../public/locales/' + language + '.json', import.meta.url), 'utf8'));
    const translate = (text, key) => locale[key || text] || text;
    globalThis.__i18n = { translate };
    const literal = 'Save / model-v1 ${1} <script>';
    expect(formatShellText('Open ${0}', [literal])).toBe('打开' + literal);
    expect(formatShellText('${0} · ${1} fallback routes', ['narrator/id', 2])).toContain('narrator/id');
    expect(formatShellText('${0} · ${1} fallback routes', ['narrator/id', 2])).not.toContain('fallback');
    expect(translateShellText('Secret')).not.toBe('Secret');
    expect(runtimeRemediation('native_generation_route_missing')[0]).not.toContain('No route');
    expect(() => assertRetrievalProfile({})).toThrow();
    const registry = createCommandRegistry();
    registry.register({ id: 'owned', title: 'Open Library', run() {} });
    registry.register({ id: 'user', title: 'Save', literalTitle: true, run() {} });
    expect(registry.search('打开书库').map(item => item.id)).toEqual(['owned']);
    expect(registry.get('user').title).toBe('Save');
    expect(registry.search('保存').map(item => item.id)).not.toContain('user');
});
