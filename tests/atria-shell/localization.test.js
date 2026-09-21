import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs/promises';

import { formatShellText, translateShellText } from '../../public/scripts/atria-shell/localization.js';

describe('Atria Shell localization', () => {
    test('uses namespaced keys so Shell Play does not collide with generic media Play', () => {
        const fakeTranslate = (fallback, key) => key === 'atria.shell.domain.play' ? '游玩' : fallback;
        expect(translateShellText('Play', fakeTranslate)).toBe('游玩');
    });

    test('formats translated Shell templates with indexed values', () => {
        const fakeTranslate = (fallback, key) => key === 'atria.shell.command.goToDomain' ? '前往${0}' : fallback;
        expect(formatShellText('Go to ${0}', ['书库'], fakeTranslate, 'atria.shell.command.goToDomain')).toBe('前往书库');
    });

    test('Simplified Chinese covers all primary domains and utilities', async () => {
        const locale = JSON.parse(await fs.readFile(new URL('../../public/locales/zh-cn.json', import.meta.url), 'utf8'));
        const required = [
            'atria.shell.domain.play',
            'atria.shell.domain.library',
            'atria.shell.domain.studio',
            'atria.shell.domain.agents',
            'atria.shell.domain.runtime',
            'atria.shell.utility.command',
            'atria.shell.utility.diagnostics',
            'atria.shell.utility.plugins',
            'atria.shell.utility.settings',
            'atria.shell.utility.account',
            'atria.shell.library.worldInfo',
            'atria.shell.runtime.presets',
            'atria.shell.action.edit',
            'atria.shell.runtime.backToPresetList',
            'atria.shell.runtime.presetEditor',
            'atria.shell.runtime.editPresetTitle',
            'atria.shell.runtime.connectionProfileCounts',
            'atria.shell.command.search',
        ];
        for (const key of required) expect(locale[key]).toBeTruthy();
        expect(locale['atria.shell.domain.play']).toBe('游玩');
    });
});
