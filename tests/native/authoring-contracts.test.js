import { describe, expect, test } from '@jest/globals';

import {
    ATRIA_AUTHORING_SCHEMA_VERSION,
    ATRIA_COMPONENT_MODEL_VERSION,
    ATRIA_EXPERIENCE_MODES,
    ATRIA_NATIVE_SKILL_SCOPES,
    ATRIA_PACKAGE_RUNTIME_FORMAT,
    ATRIA_PLUGIN_FORMAT,
    ATRIA_PROJECT_CONFLICT_CODE,
    ATRIA_RESOURCE_GRAPH_MODE,
    ATRIA_RUNTIME_DESCRIPTOR_FORMAT,
    assertAtriaPluginContract,
    assertAuthoringChangeSet,
    assertAuthoringOperation,
    assertAuthoringWorkspace,
    assertExperienceContract,
    assertNativeRuntimeDescriptor,
    assertNativeSkillScope,
    assertPackageRuntimeV1,
    assertProjectRevision,
    assertProjectRevisionConflict,
    assertResourceDescriptor,
    assertResourceRegistryContract,
    createNativeId,
} from '../../src/native/index.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function operation(kind = 'human') {
    return {
        operationId: 'op_1',
        operationType: 'resource.update',
        target: {
            resourceType: 'core.actor',
            resourceId: 'actor_target',
        },
        input: { patch: { displayName: 'Updated' } },
        origin: { kind, id: kind + '_1' },
    };
}

function runtimeDescriptor(overrides = {}) {
    return {
        format: ATRIA_RUNTIME_DESCRIPTOR_FORMAT,
        schemaVersion: 1,
        packageId: createNativeId('package'),
        packageVersionId: createNativeId('packageVersion'),
        packageContentHash: HASH_A,
        entryPointId: createNativeId('entryPoint'),
        experience: { mode: 'text' },
        capabilities: ['narrative', 'knowledge'],
        resources: [{
            resourceType: 'core.world',
            resourceId: createNativeId('world'),
            revision: createNativeId('worldRevision'),
        }],
        plugins: ['plugin.example'],
        skills: ['skill_global'],
        ...overrides,
    };
}

describe('A0 Experience contract', () => {
    test('freezes Text / Component / Hybrid / Full as explicit modes', () => {
        expect(ATRIA_EXPERIENCE_MODES).toEqual(['text', 'component', 'hybrid', 'full']);
        expect(assertExperienceContract({ mode: 'text' })).toEqual({ mode: 'text' });
        for (const mode of ['component', 'hybrid', 'full']) {
            expect(assertExperienceContract({
                mode,
                componentModelVersion: ATRIA_COMPONENT_MODEL_VERSION,
            })).toEqual({ mode, componentModelVersion: 1 });
        }
    });

    test('does not infer or duplicate the shared Component Model', () => {
        expect(() => assertExperienceContract({ mode: 'component' })).toThrow(/componentModelVersion/);
        expect(() => assertExperienceContract({
            mode: 'text',
            componentModelVersion: 1,
        })).toThrow(/must not own/);
        expect(() => assertExperienceContract({ mode: 'legacy' })).toThrow(/must be one of/);
    });
});

describe('A0 Resource Descriptor and Registry contracts', () => {
    test('keeps Resource Graph derived-only while allowing core and plugin resource descriptors', () => {
        const actor = assertResourceDescriptor({
            resourceType: 'core.actor',
            displayName: 'Actor',
            provider: { kind: 'core' },
            authority: 'project-source',
            capabilities: ['read', 'update', 'validate'],
            schema: { type: 'object' },
        });
        const quest = assertResourceDescriptor({
            resourceType: 'rpg.quest',
            displayName: 'Quest',
            provider: { kind: 'plugin', pluginId: 'plugin.rpg' },
            authority: 'plugin-source',
            capabilities: ['create', 'read', 'update', 'delete'],
            schema: { type: 'object' },
        });
        const registry = assertResourceRegistryContract({
            schemaVersion: ATRIA_AUTHORING_SCHEMA_VERSION,
            graphMode: ATRIA_RESOURCE_GRAPH_MODE,
            descriptors: [actor, quest],
        });

        expect(registry.graphMode).toBe('derived-readonly');
        expect(registry.descriptors.map(item => item.resourceType)).toEqual(['core.actor', 'rpg.quest']);
    });

    test('rejects a writable graph mode, duplicate resource types, and retired identity', () => {
        expect(() => assertResourceRegistryContract({
            schemaVersion: 1,
            graphMode: 'writable',
            descriptors: [],
        })).toThrow(/derived-readonly/);

        const descriptor = {
            resourceType: 'core.actor',
            displayName: 'Actor',
            provider: { kind: 'core' },
            authority: 'project-source',
            capabilities: ['read'],
            schema: { type: 'object' },
        };
        expect(() => assertResourceRegistryContract({
            schemaVersion: 1,
            graphMode: 'derived-readonly',
            descriptors: [descriptor, descriptor],
        })).toThrow(/unique/);

        expect(() => assertResourceDescriptor({
            ...descriptor,
            metadata: { charId: 7 },
        })).toThrow(/retired authoring authority/);
    });
});

describe('A0 Authoring Operation / Workspace / ChangeSet contracts', () => {
    test('human and Project Agent use the same Authoring Operation contract', () => {
        expect(assertAuthoringOperation(operation('human')).operationType).toBe('resource.update');
        expect(assertAuthoringOperation(operation('agent')).origin.kind).toBe('agent');
        expect(assertAuthoringOperation(operation('plugin')).origin.kind).toBe('plugin');
    });

    test('workspace pins one project/base revision and ChangeSet publishes only after validation passes', () => {
        const projectId = createNativeId('project');
        const workspace = assertAuthoringWorkspace({
            workspaceId: 'workspace_1',
            projectId,
            baseRevision: HASH_A,
            origin: { kind: 'human', id: 'user_1' },
            operations: [operation()],
            createdAt: 10,
        });
        expect(workspace.baseRevision).toBe(HASH_A);

        const changes = assertAuthoringChangeSet({
            changeSetId: 'changes_1',
            workspaceId: workspace.workspaceId,
            projectId,
            baseRevision: HASH_A,
            operations: workspace.operations,
            validation: {
                status: 'passed',
                diagnostics: [{
                    severity: 'info',
                    code: 'validation.clean',
                    message: 'Ready',
                }],
            },
            resultingRevision: HASH_B,
        });
        expect(changes.resultingRevision).toBe(HASH_B);

        expect(() => assertAuthoringChangeSet({
            ...changes,
            validation: { status: 'failed', diagnostics: [] },
        })).toThrow(/Only a passed ChangeSet/);
    });

    test('retired char/swipe authority cannot enter authoring operations', () => {
        expect(() => assertAuthoringOperation({
            ...operation(),
            input: { characterId: 7 },
        })).toThrow(/retired authoring authority/);
        expect(() => assertAuthoringOperation({
            ...operation(),
            input: { swipeId: 2 },
        })).toThrow(/retired authoring authority/);
    });
});

describe('A0 project revision/conflict contract', () => {
    test('uses content revisions and optimistic conflicts without a second project store', () => {
        const projectId = createNativeId('project');
        expect(assertProjectRevision({
            projectId,
            revision: HASH_A,
            parentRevision: null,
            createdAt: 10,
        }).revision).toBe(HASH_A);

        expect(assertProjectRevisionConflict({
            code: ATRIA_PROJECT_CONFLICT_CODE,
            projectId,
            expectedRevision: HASH_A,
            actualRevision: HASH_B,
        })).toEqual({
            code: 'project_revision_conflict',
            projectId,
            expectedRevision: HASH_A,
            actualRevision: HASH_B,
        });

        expect(() => assertProjectRevisionConflict({
            code: ATRIA_PROJECT_CONFLICT_CODE,
            projectId,
            expectedRevision: HASH_A,
            actualRevision: HASH_A,
        })).toThrow(/different/);
    });
});

describe('A0 Native Runtime Descriptor', () => {
    test('references existing PackageVersion/EntryPoint authority and explicit Experience', () => {
        const descriptor = assertNativeRuntimeDescriptor(runtimeDescriptor());
        expect(descriptor.format).toBe('atria-native-runtime-descriptor');
        expect(descriptor.experience).toEqual({ mode: 'text' });
        expect(descriptor.capabilities).toEqual(['narrative', 'knowledge']);
        expect(descriptor).not.toHaveProperty('sessionId');
        expect(descriptor).not.toHaveProperty('timeline');
    });

    test('rejects retired game.json/char/swipe authority and unknown package capabilities', () => {
        expect(() => assertNativeRuntimeDescriptor({
            ...runtimeDescriptor(),
            gameManifest: 'game.json',
        })).toThrow(/unsupported field/);
        expect(() => assertNativeRuntimeDescriptor({
            ...runtimeDescriptor(),
            characterId: 7,
        })).toThrow(/unsupported field/);
        expect(() => assertNativeRuntimeDescriptor({
            ...runtimeDescriptor(),
            capabilities: ['new-second-capability-system'],
        })).toThrow(/Package capability/);
    });
});

describe('A0 Atria Plugin and package-runtime-v1 contracts', () => {
    test('allows executable Host Plugin entrypoints while package runtime stays declarative', () => {
        const plugin = assertAtriaPluginContract({
            format: ATRIA_PLUGIN_FORMAT,
            schemaVersion: 1,
            apiVersion: 1,
            pluginId: 'plugin.example',
            displayName: 'Example Plugin',
            version: '1.0.0',
            permissions: ['host.project-read'],
            host: {
                entrypoint: 'plugins/example/index.js',
                capabilities: ['host.authoring'],
            },
            packageRuntime: {
                format: ATRIA_PACKAGE_RUNTIME_FORMAT,
                version: 1,
                execution: 'declarative',
                capabilities: ['runtime.ui'],
                contributions: [{
                    id: 'example.hud',
                    type: 'ui.component',
                    config: { component: 'status-panel' },
                }],
                config: { enabled: true },
            },
            contributions: [{
                id: 'example.quest-editor',
                type: 'authoring.resource',
                config: { resourceType: 'rpg.quest' },
            }],
        });
        expect(plugin.host.entrypoint).toBe('plugins/example/index.js');
        expect(plugin.packageRuntime.execution).toBe('declarative');
    });

    test('package-runtime-v1 rejects arbitrary JavaScript execution fields and JS payload paths', () => {
        const base = {
            format: ATRIA_PACKAGE_RUNTIME_FORMAT,
            version: 1,
            execution: 'declarative',
            capabilities: ['runtime.ui'],
            contributions: [],
            config: {},
        };
        expect(assertPackageRuntimeV1(base).execution).toBe('declarative');
        expect(() => assertPackageRuntimeV1({
            ...base,
            execution: 'javascript',
        })).toThrow(/declarative/);
        expect(() => assertPackageRuntimeV1({
            ...base,
            config: { script: 'doWork()' },
        })).toThrow(/executable/);
        expect(() => assertPackageRuntimeV1({
            ...base,
            config: { renderer: 'runtime/main.js' },
        })).toThrow(/JavaScript/);
    });
});

describe('A0 Native Skill scope contract', () => {
    test('freezes global/project/package scopes and excludes Character identity', () => {
        expect(ATRIA_NATIVE_SKILL_SCOPES).toEqual(['global', 'project', 'package']);
        expect(assertNativeSkillScope({
            skillId: 'skill_global',
            scope: 'global',
        })).toEqual({ skillId: 'skill_global', scope: 'global' });

        const projectId = createNativeId('project');
        expect(assertNativeSkillScope({
            skillId: 'skill_project',
            scope: 'project',
            projectId,
        }).projectId).toBe(projectId);

        const packageId = createNativeId('package');
        const packageVersionId = createNativeId('packageVersion');
        expect(assertNativeSkillScope({
            skillId: 'skill_package',
            scope: 'package',
            packageId,
            packageVersionId,
        })).toEqual({
            skillId: 'skill_package',
            scope: 'package',
            packageId,
            packageVersionId,
        });

        expect(() => assertNativeSkillScope({
            skillId: 'skill_character',
            scope: 'character',
            characterId: 7,
        })).toThrow(/unsupported field|scope/);
    });
});
