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
    if (!Array.isArray(entries)) throw new TypeError('Native Skill resolution requires an inventory array');
    const merged = new Map();
    for (const entry of entries) {
        const scope = nativeScopeForEntry(entry);
        if (scope?.scope === 'global') merged.set(entry.name, entry);
    }
    if (context.projectId) {
        for (const entry of entries) {
            const scope = nativeScopeForEntry(entry);
            if (scope?.scope === 'project' && scope.projectId === context.projectId) {
                merged.set(entry.name, entry);
            }
        }
    }
    if (context.packageId && context.packageVersionId) {
        for (const entry of entries) {
            const scope = nativeScopeForEntry(entry);
            if (
                scope?.scope === 'package'
                && scope.packageId === context.packageId
                && scope.packageVersionId === context.packageVersionId
            ) {
                merged.set(entry.name, entry);
            }
        }
    }

    const declared = Array.isArray(context.skillIds) && context.skillIds.length
        ? new Set(context.skillIds)
        : null;
    return Object.freeze(
        [...merged.values()]
            .filter(entry => {
                if (!declared) return true;
                const scope = nativeScopeForEntry(entry);
                return scope?.scope === 'global' || declared.has(entry.name);
            })
            .sort((left, right) => left.name.localeCompare(right.name)),
    );
}

export function toNativeSkillScope(entry) {
    const scope = nativeScopeForEntry(entry);
    if (!scope) {
        throw new TypeError('Skill entry does not use a Native global/project/package scope');
    }
    return scope;
}
