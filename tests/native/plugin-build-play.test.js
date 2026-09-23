import { describe, expect, test } from '@jest/globals';

import {
    assertAtriaProjectSource,
    buildProjectPackage,
    compileNativeRuntimeDescriptor,
    createNativeId,
} from '../../src/native/index.js';

function packagePlugin() {
    return {
        format: 'atria-plugin',
        schemaVersion: 1,
        apiVersion: 1,
        pluginId: 'plugin.runtime',
        displayName: 'Runtime Plugin',
        version: '1.0.0',
        permissions: [],
        dependencies: [],
        packageRuntime: {
            format: 'atria-package-runtime',
            version: 1,
            execution: 'declarative',
            capabilities: ['runtime.selector'],
            contributions: [{
                id: 'plugin.runtime.hp',
                type: 'play.selector',
                config: { selectors: [{ id: 'plugin.hp', formula: 'world.hp' }] },
            }],
            config: {},
        },
        contributions: [],
    };
}

function source() {
    const projectId = createNativeId('project');
    const packageId = createNativeId('package');
    const entryPointId = createNativeId('entryPoint');
    return assertAtriaProjectSource({
        format: 'atria-project-source',
        schemaVersion: 1,
        project: {
            projectId,
            packageId,
            displayName: 'A5 Plugin Project',
            createdAt: 1,
            updatedAt: 1,
        },
        package: {
            name: 'A5 Work',
            version: '1.0.0',
            actors: [],
            entryPoints: [{
                entryPointId,
                displayName: 'Main',
                actorIds: [],
                worldIds: [],
                knowledgeBindingIds: [],
                runtime: { experience: { mode: 'text' } },
            }],
            capabilities: ['narrative'],
            permissions: [],
            runtime: { plugins: [packagePlugin()] },
        },
        worlds: [],
        knowledge: [],
        knowledgeBindings: [],
        dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [] },
        assetFiles: [],
    });
}

describe('A5 Build / Play contribution integration', () => {
    test('Build validates package plugins and Play descriptor projects only declarative runtime contributions', async () => {
        const project = source();
        const built = await buildProjectPackage({
            handle: 'user',
            projectId: project.project.projectId,
            projectStore: {
                async get() { return project; },
                async readBuildFiles() { return new Map(); },
                async readFile() { return null; },
            },
            worldRepo: {},
            knowledgeRepo: {},
            assetStore: {},
            idFactory: family => createNativeId(family),
        });
        expect(built.manifest.runtime.plugins[0]).not.toHaveProperty('host');

        const compiled = compileNativeRuntimeDescriptor({
            packageVersion: built.packageVersion,
            manifest: built.manifest,
            entryPointId: project.package.entryPoints[0].entryPointId,
        });
        expect(compiled.descriptor.plugins).toEqual(['plugin.runtime']);
        expect(compiled.runtime.plugins).toEqual([expect.objectContaining({
            pluginId: 'plugin.runtime',
            capabilities: ['runtime.selector'],
            contributions: [expect.objectContaining({ type: 'play.selector' })],
        })]);
    });

    test('Build rejects Host Plugin execution from package runtime source', async () => {
        const project = structuredClone(source());
        project.package.runtime.plugins[0].permissions = ['host.play'];
        project.package.runtime.plugins[0].host = {
            entrypoint: 'host/index.js',
            capabilities: ['host.play'],
        };
        await expect(buildProjectPackage({
            handle: 'user',
            projectId: project.project.projectId,
            projectStore: {
                async get() { return project; },
                async readBuildFiles() { return new Map(); },
                async readFile() { return null; },
            },
            worldRepo: {},
            knowledgeRepo: {},
            assetStore: {},
            idFactory: family => createNativeId(family),
        })).rejects.toThrow(/must not include executable Host Plugin/);
    });
});
