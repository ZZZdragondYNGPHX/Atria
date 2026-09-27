import { resolveSkillScopes } from '../../public/shared/skill-invocation.js';
import { assertNativeSkillScope } from './authoring-contracts.js';

function nativeScopeForEntry(entry) {
    const scope = entry?.scope;
    if (!scope || typeof scope !== 'object') return null;
    if (scope.kind === 'global') {
        return assertNativeSkillScope({ skillId: entry.name, scope: 'global' });
    }
    if (scope.kind === 'project') {
        return assertNativeSkillScope({
            skillId: entry.name,
            scope: 'project',
            projectId: scope.projectId,
        });
    }
    if (scope.kind === 'package') {
        return assertNativeSkillScope({
            skillId: entry.name,
            scope: 'package',
            packageId: scope.packageId,
            packageVersionId: scope.packageVersionId,
        });
    }
    return null;
}

export function resolveNativeSkillEntries(entries, context = {}) {
    for (const entry of entries) nativeScopeForEntry(entry);
    return Object.freeze(resolveSkillScopes(entries, context));
}

export function toNativeSkillScope(entry) {
    const scope = nativeScopeForEntry(entry);
    if (!scope) {
        throw new TypeError('Skill entry does not use a Native global/project/package scope');
    }
    return scope;
}
