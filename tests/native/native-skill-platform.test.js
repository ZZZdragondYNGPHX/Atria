import { describe, expect, test } from '@jest/globals';

import {
    createNativeId,
    resolveNativeSkillEntries,
    toNativeSkillScope,
} from '../../src/native/index.js';

describe('A5 Native Skill scopes', () => {
    test('resolves global -> project -> exact package with later scopes winning by skill name', () => {
        const projectId = createNativeId('project');
        const packageId = createNativeId('package');
        const packageVersionId = createNativeId('packageVersion');
        const entries = [
            { name: 'guide', scope: { kind: 'global' }, description: 'global' },
            { name: 'guide', scope: { kind: 'project', projectId }, description: 'project' },
            {
                name: 'guide',
                scope: { kind: 'package', packageId, packageVersionId },
                description: 'package',
            },
            { name: 'global-only', scope: { kind: 'global' } },
            { name: 'legacy-char', scope: { kind: 'character', characterFile: 'a.png' } },
        ];
        const resolved = resolveNativeSkillEntries(entries, {
            projectId,
            packageId,
            packageVersionId,
            skillIds: ['guide'],
        });
        expect(resolved.map(item => [item.name, item.description]))
            .toEqual([['global-only', undefined], ['guide', 'package']]);
        expect(resolved.some(item => item.name === 'legacy-char')).toBe(false);
    });

    test('converts only global/project/package repository scopes into Native contract scopes', () => {
        const projectId = createNativeId('project');
        expect(toNativeSkillScope({
            name: 'workflow',
            scope: { kind: 'project', projectId },
        })).toEqual({
            skillId: 'workflow',
            scope: 'project',
            projectId,
        });
        expect(() => toNativeSkillScope({
            name: 'card-skill',
            scope: { kind: 'character', characterFile: 'a.png' },
        })).toThrow(/does not use a Native/);
    });
});
