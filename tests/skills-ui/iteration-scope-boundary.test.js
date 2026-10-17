import { afterEach, expect, jest, test } from '@jest/globals';
import { runSkillIterStudioTool, isSkillIterStudioTool, SKILL_ITER_STUDIO_TOOL_DEFS } from '../../public/scripts/iteration-library/tools/skill-iter-studio.js';
import { scopeDisplay } from '../../public/scripts/iteration-library/proposal-bus/diff-bodies/skill.js';

const previousAtria = globalThis.Atria;
afterEach(() => { globalThis.Atria = previousAtria; });

test.each([
    { kind: 'global' }, { kind: 'project', projectId: 'p' },
    { kind: 'package', packageId: 'p', packageVersionId: 'v' },
    { kind: 'preset', name: 'compatible' }, { kind: 'character', characterFile: 'a.png' },
])('iteration Skill reads retain supported scope $kind', async scope => {
    const readFile = jest.fn(async () => ({ content: 'guidance' }));
    globalThis.Atria = { getContext: () => ({ skills: { readFile } }) };
    const result = await runSkillIterStudioTool({ name: 'skill_read_content', args: { name: 'guide', scope } });
    expect(result.ok).toBe(true);
    expect(readFile.mock.calls[0][0].scope).toEqual(scope);
    expect(scopeDisplay(scope, s => s, (s, ...args) => s.replace(/\$\{(\d+)\}/g, (_, index) => args[index]))).not.toContain('unknown');
});

test('retired orchestration scope is absent from catalog and rejected before any read', async () => {
    const readFile = jest.fn();
    globalThis.Atria = { getContext: () => ({ skills: { readFile } }) };
    const scope = { kind: 'orch-preset', mode: 'director', name: 'retired' };
    for (const call of [
        () => runSkillIterStudioTool({ name: 'skill_read_content', args: { name: 'guide', scope } }),
        () => runSkillIterStudioTool({ name: 'skill_read_content', args: { name: 'guide', scope: 'orch-preset/director/retired' } }),
        () => runSkillIterStudioTool({ name: 'skill_read_content', args: { name: 'guide' } }, { defaultScope: scope }),
    ]) expect((await call()).ok).toBe(false);
    expect(readFile).not.toHaveBeenCalled();
    expect(JSON.stringify(SKILL_ITER_STUDIO_TOOL_DEFS)).not.toContain('orch-preset');
});

test.each(['skill_list_visible', 'skill_bind_to_agent', 'skill_unbind_from_agent', 'skill_set_mode_defaults', 'skill_replace_in_systemprompt'])(
    'retired profile tool %s cannot be advertised or dispatched', async name => {
        expect(isSkillIterStudioTool(name)).toBe(false);
        expect(SKILL_ITER_STUDIO_TOOL_DEFS.some(def => def.function.name === name)).toBe(false);
        expect((await runSkillIterStudioTool({ name, args: {} })).ok).toBe(false);
    },
);
