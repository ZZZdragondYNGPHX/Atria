import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

function extractTemplateTranslationKeys(source) {
    const keys = new Set();
    for (const match of source.matchAll(/\bt`([^`]*)`/g)) {
        let index = 0;
        const key = match[1].replace(/\$\{[^}]*\}/g, () => `\${${index++}}`);
        keys.add(key);
    }
    return [...keys];
}

describe('logging workspace Chinese localization', () => {
    const workspace = readFileSync(new URL('../../public/scripts/logging/workspace.js', import.meta.url), 'utf8');
    const startup = readFileSync(new URL('../../public/scripts/logging/startup-analysis.js', import.meta.url), 'utf8');
    const zhCn = JSON.parse(readFileSync(new URL('../../public/locales/zh-cn.json', import.meta.url), 'utf8'));
    const zhTw = JSON.parse(readFileSync(new URL('../../public/locales/zh-tw.json', import.meta.url), 'utf8'));

    test('all static workspace/startup t-strings exist in both Chinese locales', () => {
        const keys = [...new Set([
            ...extractTemplateTranslationKeys(workspace),
            ...extractTemplateTranslationKeys(startup),
        ])];
        for (const key of keys) {
            expect(zhCn[key]).toEqual(expect.any(String));
            expect(zhCn[key].length).toBeGreaterThan(0);
            expect(zhTw[key]).toEqual(expect.any(String));
            expect(zhTw[key].length).toBeGreaterThan(0);
        }
    });

    test('dynamic module, incident, owner and startup labels are translated at render time', () => {
        expect(workspace).toContain('translatedValue(item.label)');
        expect(workspace).toContain('incidentTypeLabel(incident.type)');
        expect(workspace).toContain('ownerLabel(incident.ownership?.probableOwner');
        expect(startup).toContain('startupLabel(slice.label)');
        expect(startup).toContain('startupLabel(row.label)');
        expect(startup).toContain('scopeLabel(item.scope)');

        for (const key of [
            'Network', 'Generation', 'Orchestrator', 'Memory', 'Worldbook', 'Sync',
            'Startup failure', 'Generation failure', 'Orchestration failure',
            'Third-party extension', 'External service', 'Network environment',
            'Module bootstrap', 'First visible UI', 'First-load event', 'Manifests',
            'Prewarm', 'Settings-loaded event',
        ]) {
            expect(zhCn[key]).toEqual(expect.any(String));
            expect(zhTw[key]).toEqual(expect.any(String));
        }
    });
});
