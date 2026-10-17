import { test, expect, jest } from '@jest/globals';

test('Native target picker offers named projects and excludes Package originals from writable scopes', async () => {
    const { buildScopePickerHtml } = await import('../../public/scripts/skills/scope-picker.js');
    const html = buildScopePickerHtml({ title: 'Move', t: value => value, suggestKind: 'project',
        suggestProject: 'project_a', projects: [{ projectId: 'project_a', displayName: 'Harbor project' }],
        presets: [], characters: [] });
    expect(html).toContain('value="project_a" selected>Harbor project');
    expect(html).toMatch(/value="project"[^>]*checked/);
    expect(html).not.toContain('value="package"');
    expect(html).toContain('Package originals are read-only');
    expect(html).toContain('<details class="atri-skill-compatibility">');
});

jest.unstable_mockModule('../../public/scripts/skills/i18n.js', () => ({
    ensureSkillI18n: () => {},
}));

test('picker retains compatibility scopes and omits retired preset scope', async () => {
    const { buildScopePickerHtml } = await import('../../public/scripts/skills/scope-picker.js');
    const html = buildScopePickerHtml({ title: 'Pick', t: s => s, suggestKind: 'preset',
        suggestPreset: 'Compatible', presets: [{ name: 'Compatible' }], characters: [{ value: 'a.png', label: 'A' }] });
    expect(html).toMatch(/value="preset"[^>]*checked/);
    expect(html).toContain('value="character"');
    expect(html).toContain('value="global"');
    expect(html).toContain('value="Compatible" selected');
    expect(html).not.toContain('orch-preset');
});
