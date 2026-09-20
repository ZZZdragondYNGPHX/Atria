import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const WORKSPACE_URL = new URL('../../public/scripts/logging/workspace.js', import.meta.url);
const STARTUP_URL = new URL('../../public/scripts/logging/startup-analysis.js', import.meta.url);
const INDEX_URL = new URL('../../public/index.html', import.meta.url);
const ZH_CN_URL = new URL('../../public/locales/zh-cn.json', import.meta.url);
const ZH_TW_URL = new URL('../../public/locales/zh-tw.json', import.meta.url);

const workspaceSource = readFileSync(WORKSPACE_URL, 'utf8');
const startupSource = readFileSync(STARTUP_URL, 'utf8');
const indexSource = readFileSync(INDEX_URL, 'utf8');

function taggedTranslationKeys(source) {
    return [...source.matchAll(/\bt`([^`]*)`/g)].map(match => match[1]);
}

const dynamicUiKeys = [
    'Diagnostics',
    '[title]Open diagnostics workspace',
    'Startup',
    'Network',
    'Generation',
    'Orchestrator',
    'Memory',
    'Worldbook',
    'Extensions',
    'Storage',
    'Sync',
    'WebSocket',
    'Module bootstrap',
    'CSRF',
    'Settings bootstrap',
    'First visible UI',
    'Batch 1',
    'Batch 2',
    'Batch 3',
    'APP_READY',
    'First-load event',
    'Discover',
    'Manifests',
    'Auto update',
    'Prewarm',
    'Activate',
    'Settings-loaded event',
    'Server phase',
    'Unknown extension',
];

const requiredKeys = [...new Set([
    ...taggedTranslationKeys(workspaceSource),
    ...taggedTranslationKeys(startupSource),
    ...dynamicUiKeys,
])];

describe('logging workspace Chinese localization', () => {
    test.each([
        ['zh-cn', ZH_CN_URL],
        ['zh-tw', ZH_TW_URL],
    ])('%s covers every diagnostics workspace UI key', (_locale, url) => {
        const locale = JSON.parse(readFileSync(url, 'utf8'));
        const missing = requiredKeys.filter(key => !Object.hasOwn(locale, key) || !String(locale[key]).trim());
        expect(missing).toEqual([]);
    });

    test('dynamic workspace and startup labels flow through the i18n layer', () => {
        expect(workspaceSource).toContain("import { t, translate } from '../i18n.js';");
        expect(workspaceSource).toContain('translate(item.label)');
        expect(workspaceSource).toContain('ownershipLabel(incident.ownership)');
        expect(startupSource).toContain("import { t, translate } from '../i18n.js';");
        expect(startupSource).toContain('localizeStartupLabel(slice.label)');
        expect(startupSource).toContain('localizeStartupLabel(item.scope)');
        expect(startupSource).toContain('localizeStartupLabel(row.label)');
    });

    test('settings entry is covered by the same locale keys', () => {
        expect(indexSource).toContain('data-i18n="[title]Open diagnostics workspace"');
        expect(indexSource).toContain('data-i18n="Diagnostics">Diagnostics</span>');
    });
});
