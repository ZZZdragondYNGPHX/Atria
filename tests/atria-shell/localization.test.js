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
            'atria.shell.domain.build',
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
            'atria.shell.runtime.noActivePackage',
            'atria.shell.runtime.activePackage',
            'atria.shell.runtime.noActiveProfile',
            'atria.shell.runtime.activeProfile',
            'atria.shell.agents.hub.title',
            'atria.shell.agents.hub.description',
            'atria.shell.command.openOrchestration',
            'atria.shell.command.openAgentRun',
            'atria.shell.command.openAgentDiagnostics',
            'atria.shell.command.search',
        ];
        for (const key of required) expect(locale[key]).toBeTruthy();
        expect(locale['atria.shell.domain.play']).toBe('游玩');
    });
});


test('P7 Prompt/Runtime/Settings labels and dynamic stages use owned Chinese keys', async () => {
    const locale = JSON.parse(await fs.readFile(new URL('../../public/locales/zh-cn.json', import.meta.url), 'utf8'));
    const translate = (fallback, key) => locale[key] || fallback;
    expect(translateShellText('Prompt Programs', translate)).toBe('提示词程序');
    expect(translateShellText('Prompt Authoring', translate)).toBe('提示词创作');
    expect(translateShellText('Runtime Design', translate)).toBe('运行设计');
    expect(translateShellText('Send on Enter', translate)).toBe('按回车发送');
    expect(formatShellText('Stage ID ${0}', [2], translate, 'atria.product.stageIdIndex')).toBe('阶段 ID 2');
});
