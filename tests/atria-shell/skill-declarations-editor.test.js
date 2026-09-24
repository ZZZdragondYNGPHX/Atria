/** @jest-environment jsdom */
import { test, expect, jest } from '@jest/globals';
import { serialize, deserialize } from 'node:v8';
import { mountSkillDeclarationsEditor } from '../../public/scripts/native/skill-declarations-editor.js';
import { validateSkillDeclarations } from '../../public/scripts/native/skill-declarations.js';

globalThis.structuredClone = value => deserialize(serialize(value));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function mount(value, listSkills) {
    const root = document.createElement('div'); document.body.replaceChildren(root); const onReview = jest.fn();
    const controller = mountSkillDeclarationsEditor({ document, root, value, projectId: 'project_a', listSkills, onReview });
    const button = name => [...root.querySelectorAll('button')].find(node => node.textContent === name);
    const field = label => root.querySelector('[aria-label="' + label + '"]');
    const change = (label, text) => { const node = field(label); node.value = text; node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input')); };
    return { root, onReview, controller, button, field, change };
}
test('domain selection honors project ownership and stages detached declarations without losing plugin fields', async () => {
    const value = [{ skillId: 'custom', pluginOptions: { strict: true } }];
    const ui = mount(value, async () => [
        { name: 'guide', description: 'Global', scope: { kind: 'global' } },
        { name: 'guide', description: 'Project guide', scope: { kind: 'project', projectId: 'project_a' } },
        { name: 'foreign', scope: { kind: 'project', projectId: 'project_b' } },
        { name: 'package', scope: { kind: 'package', packageId: 'pkg', packageVersionId: 'version' } },
    ]);
    await tick();
    expect([...ui.field('Available Skills').options].map(option => option.value)).toEqual(['', 'guide']);
    ui.change('Available Skills', 'guide'); ui.button('Add selected Skill').click(); await tick();
    expect(ui.root.textContent).toContain('Project guide');
    ui.change('Skill ID 1', 'custom-renamed');
    ui.button('Review Changes').click(); await tick();
    expect(ui.onReview).toHaveBeenCalledWith([{ skillId: 'custom-renamed', pluginOptions: { strict: true } }, 'guide']);
    expect(value[0].skillId).toBe('custom');
    ui.button('Remove declaration').click(); await tick();
    expect(ui.controller.getValue()).toEqual(['guide']);
});
test('duplicate/invalid Source blocks review, preserves draft and catalog failures can retry', async () => {
    const list = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
    const ui = mount(['guide'], list); await tick();
    expect(ui.root.textContent).toContain('Your declarations are kept');
    ui.button('Retry').click(); await tick(); expect(list).toHaveBeenCalledTimes(2);
    ui.button('Source').click(); await tick();
    ui.change('Skill declarations JSON', '["guide", "guide"]');
    ui.button('Review Changes').click(); await tick(); expect(ui.onReview).not.toHaveBeenCalled();
    expect(ui.field('Skill declarations JSON').value).toBe('["guide", "guide"]');
    ui.change('Skill declarations JSON', '[{"id":"guide","custom":42}]');
    ui.button('Fields').click(); await tick(); ui.button('Review Changes').click(); await tick();
    expect(ui.onReview).toHaveBeenCalledWith([{ id: 'guide', custom: 42 }]);
});
test.each([{}, [null], ['bad id'], ['x', { skillId: 'x' }], [{ skillId: 'x', id: 'y' }]])('invalid declarations reject without conversion: %j', value => {
    expect(() => validateSkillDeclarations(value)).toThrow();
});
