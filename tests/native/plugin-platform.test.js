import { describe, expect, test } from '@jest/globals';

import {
    ContributionRegistry,
    HostPluginBoundary,
    ResourceRegistry,
    compilePackageRuntimePlugins,
    resolvePluginDependencies,
} from '../../src/native/index.js';

function packagePlugin(pluginId, overrides = {}) {
    return {
        format: 'atria-plugin',
        schemaVersion: 1,
        apiVersion: 1,
        pluginId,
        displayName: pluginId,
        version: overrides.version || '1.0.0',
        permissions: [],
        dependencies: overrides.dependencies || [],
        packageRuntime: {
            format: 'atria-package-runtime',
            version: 1,
            execution: 'declarative',
            capabilities: overrides.capabilities || ['runtime.selector'],
            contributions: overrides.contributions || [{
                id: pluginId + '.selector',
                type: 'play.selector',
                config: { selectors: [{ id: 'plugin.value', formula: 'world.value' }] },
            }],
            config: {},
        },
        contributions: [],
    };
}

describe('A5 package plugin dependency/permission model', () => {
    test('resolves exact dependencies in dependency-first order', () => {
        const base = packagePlugin('plugin.base');
        const child = packagePlugin('plugin.child', {
            dependencies: [{ pluginId: 'plugin.base', version: '1.0.0' }],
        });
        expect(resolvePluginDependencies([child, base]).map(item => item.pluginId))
            .toEqual(['plugin.base', 'plugin.child']);
    });

    test('fails closed for missing, version-mismatched, or cyclic dependencies', () => {
        expect(() => resolvePluginDependencies([
            packagePlugin('plugin.child', {
                dependencies: [{ pluginId: 'plugin.missing', version: '1.0.0' }],
            }),
        ])).toThrow(/missing dependency/);

        expect(() => resolvePluginDependencies([
            packagePlugin('plugin.base', { version: '2.0.0' }),
            packagePlugin('plugin.child', {
                dependencies: [{ pluginId: 'plugin.base', version: '1.0.0' }],
            }),
        ])).toThrow(/requires plugin.base@1.0.0/);

        expect(() => resolvePluginDependencies([
            packagePlugin('plugin.a', { dependencies: [{ pluginId: 'plugin.b', version: '1.0.0' }] }),
            packagePlugin('plugin.b', { dependencies: [{ pluginId: 'plugin.a', version: '1.0.0' }] }),
        ])).toThrow(/cycle/);
    });

    test('maps package capabilities onto existing package permissions', () => {
        const ui = packagePlugin('plugin.ui', {
            capabilities: ['runtime.ui'],
            contributions: [{
                id: 'plugin.ui.hud',
                type: 'ui.component',
                config: { component: 'hud' },
            }],
        });
        expect(() => compilePackageRuntimePlugins([ui], { declaredPermissions: [] }))
            .toThrow(/requires declared package permission custom-ui/);
        expect(compilePackageRuntimePlugins([ui], {
            declaredPermissions: [{ permission: 'custom-ui', required: true }],
        }).pluginIds).toEqual(['plugin.ui']);
    });

    test('rejects Host execution or undeclared contribution capability inside package runtime', () => {
        const withHost = {
            ...packagePlugin('plugin.bad'),
            permissions: ['host.play'],
            host: { entrypoint: 'host/index.js', capabilities: ['host.play'] },
        };
        expect(() => compilePackageRuntimePlugins([withHost], { declaredPermissions: [] }))
            .toThrow(/must not include executable Host Plugin/);

        const wrongCapability = packagePlugin('plugin.wrong', {
            capabilities: ['runtime.selector'],
            contributions: [{ id: 'plugin.wrong.command', type: 'play.command', config: {} }],
        });
        expect(() => compilePackageRuntimePlugins([wrongCapability], { declaredPermissions: [] }))
            .toThrow(/requires runtime.command/);
    });
});

describe('A5 Host Plugin boundary and contribution registry', () => {
    function manifest() {
        return {
            format: 'atria-plugin',
            schemaVersion: 1,
            apiVersion: 1,
            pluginId: 'plugin.authoring',
            displayName: 'Authoring Plugin',
            version: '1.0.0',
            permissions: ['host.project-read', 'host.authoring'],
            dependencies: [],
            host: {
                entrypoint: 'host/index.js',
                capabilities: ['host.resource-registration', 'host.authoring'],
            },
            contributions: [{
                id: 'plugin.authoring.quest',
                type: 'authoring.resource',
                config: {
                    descriptor: {
                        resourceType: 'rpg.quest',
                        displayName: 'Quest',
                        capabilities: ['create', 'read', 'update', 'delete', 'validate'],
                        schema: { type: 'object' },
                    },
                },
            }],
        };
    }

    test('registers Build resources into the existing ResourceRegistry', async () => {
        const resources = new ResourceRegistry({ descriptors: [] });
        const contributions = new ContributionRegistry({ resourceRegistry: resources });
        const submitted = [];
        const boundary = new HostPluginBoundary({
            contributionRegistry: contributions,
            authoringSubmit: async value => submitted.push(value),
        });
        let api;
        await boundary.activate(manifest(), {
            activate(value) {
                api = value;
            },
        }, { grantedPermissions: ['host.project-read', 'host.authoring'] });

        expect(resources.get('rpg.quest')).toMatchObject({
            provider: { kind: 'plugin', pluginId: 'plugin.authoring' },
            authority: 'plugin-source',
        });
        await api.authoring.submit({
            projectId: 'project_target',
            baseRevision: 'a'.repeat(64),
            operations: [{
                operationId: 'op_plugin',
                operationType: 'resource.update',
                target: { resourceType: 'rpg.quest', resourceId: 'quest_1' },
                input: { title: 'Updated' },
                origin: { kind: 'human', id: 'spoofed' },
            }],
        });
        expect(submitted[0].origin).toEqual({ kind: 'plugin', id: 'plugin.authoring' });
        expect(submitted[0].operations[0].origin).toEqual({ kind: 'plugin', id: 'plugin.authoring' });

        await boundary.deactivate('plugin.authoring');
        expect(resources.get('rpg.quest')).toBeNull();
    });

    test('requires explicit grants and never exposes repository/session authorities', async () => {
        const boundary = new HostPluginBoundary({
            contributionRegistry: new ContributionRegistry(),
        });
        await expect(boundary.activate(manifest(), { activate() {} }, {
            grantedPermissions: ['host.authoring'],
        })).rejects.toMatchObject({
            code: 'atria_plugin_permission_required',
            permissions: ['host.project-read'],
        });

        let api;
        await boundary.activate(manifest(), {
            activate(value) { api = value; },
        }, { grantedPermissions: ['host.project-read', 'host.authoring'] });
        expect(api).not.toHaveProperty('sessionRepo');
        expect(api).not.toHaveProperty('packageRepo');
        expect(api).not.toHaveProperty('worldRepo');
        expect(api).not.toHaveProperty('branch');
        expect(api).not.toHaveProperty('timeline');
    });
});
