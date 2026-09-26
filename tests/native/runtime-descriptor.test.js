import { describe, expect, test } from '@jest/globals';

import {
    ATRIA_RUNTIME_DESCRIPTOR_FORMAT,
    compileNativeRuntimeDescriptor,
    createNativeId,
    resolveNativeRuntimePackage,
} from '../../src/native/index.js';

function fixture(overrides = {}) {
    const packageId = createNativeId('package');
    const packageVersionId = createNativeId('packageVersion');
    const entryPointId = createNativeId('entryPoint');
    const actorId = createNativeId('actor');
    const packageVersion = {
        packageId,
        packageVersionId,
        version: '1.0.0',
        packageContentHash: 'a'.repeat(64),
    };
    const entryPoint = {
        entryPointId,
        displayName: 'Text Start',
        actorIds: [actorId],
        worldIds: [],
        knowledgeBindingIds: [],
        runtime: {
            experience: { mode: 'text' },
            game: {
                logic: 'logic/main.json',
                observations: 'llm/observations.json',
            },
        },
        ...(overrides.entryPoint || {}),
    };
    const manifest = {
        packageId,
        packageVersionId,
        version: '1.0.0',
        actors: [{ actorId, displayName: 'Narrator' }],
        entryPoints: [entryPoint],
        capabilities: ['game-runtime', 'narrative'],
        worlds: [],
        knowledge: [],
        knowledgeBindings: [],
        assets: [],
        skills: ['skill_runtime'],
        ...(overrides.manifest || {}),
    };
    return { packageVersion, manifest, entryPoint, packageId, packageVersionId, entryPointId, actorId };
}

describe('A3 Native Runtime Descriptor compiler', () => {
    test('P0 derives contract metadata for every layout without enabling reserved features', () => {
        const experienceContract = {
            schemaVersion: 1,
            capabilities: [{ id: 'workflow', version: 1, required: false }],
            dataResources: [],
        };
        for (const mode of ['text', 'component', 'hybrid', 'full']) {
            const f = fixture({
                manifest: { runtime: { experienceContract } },
                entryPoint: { runtime: { experience: mode === 'text' ? { mode } : {
                    mode, componentModelVersion: 1, component: 'ui/main.json',
                } } },
            });
            expect(compileNativeRuntimeDescriptor(f).descriptor.experienceContract).toEqual(experienceContract);
            expect(compileNativeRuntimeDescriptor(f).runtime).not.toHaveProperty('experienceContract');
            f.manifest.runtime.experienceContract = { ...experienceContract, capabilities: [{ id: 'workflow', version: 1, required: true }] };
            expect(() => compileNativeRuntimeDescriptor(f)).toThrow(/Host does not support/);
        }
    });

    test('P0 compiler revalidates resource closure and forbids EntryPoint requirement overrides', () => {
        const contract = { schemaVersion: 1, capabilities: [], dataResources: [] };
        const f = fixture({ manifest: { runtime: { experienceContract: contract } } });
        f.manifest.runtime.experienceContract = { ...contract, dataResources: [{ resourceId: 'items', assetId: createNativeId('asset'), contentHash: 'a'.repeat(64) }] };
        expect(() => compileNativeRuntimeDescriptor(f)).toThrow(/exact application\/json/);
        f.entryPoint.runtime.experienceContract = contract;
        expect(() => compileNativeRuntimeDescriptor(f)).toThrow(/cannot be overridden/);
    });

    test('Skill declarations use shared validation and preserve extension data in the source', () => {
        const f = fixture({ manifest: { skills: [{ skillId: 'guide', custom: { tone: 'quiet' } }, 'global-helper'] } });
        expect(compileNativeRuntimeDescriptor(f, { entryPointId: f.entryPointId }).descriptor.skills).toEqual(['guide', 'global-helper']);
        expect(f.manifest.skills[0].custom).toEqual({ tone: 'quiet' });
        f.manifest.skills.push({ id: 'guide' });
        expect(() => compileNativeRuntimeDescriptor(f, { entryPointId: f.entryPointId })).toThrow('repeat');
        f.manifest.skills = [{ skillId: 'guide', id: 'other' }];
        expect(() => compileNativeRuntimeDescriptor(f, { entryPointId: f.entryPointId })).toThrow('agree');
    });

    test('compiles exact PackageVersion + EntryPoint identity without creating package authority', () => {
        const f = fixture();
        const result = compileNativeRuntimeDescriptor({
            packageVersion: f.packageVersion,
            manifest: f.manifest,
            entryPointId: f.entryPointId,
        });

        expect(result.descriptor).toEqual(expect.objectContaining({
            format: ATRIA_RUNTIME_DESCRIPTOR_FORMAT,
            packageId: f.packageId,
            packageVersionId: f.packageVersionId,
            packageContentHash: 'a'.repeat(64),
            entryPointId: f.entryPointId,
            experience: { mode: 'text' },
            capabilities: ['game-runtime', 'narrative'],
            plugins: [],
            skills: ['skill_runtime'],
        }));
        expect(result.descriptor.resources).toContainEqual({
            resourceType: 'core.actor',
            resourceId: f.actorId,
        });
        expect(result.runtime).toEqual({
            experience: { mode: 'text' },
            game: {
                logic: 'logic/main.json',
                observations: 'llm/observations.json',
            },
            primaryWorldId: null,
        });
    });

    test('derives A4 Component/Hybrid/Full runtime resources while keeping Descriptor experience minimal', () => {
        for (const mode of ['component', 'hybrid', 'full']) {
            const f = fixture({
                entryPoint: {
                    runtime: {
                        experience: {
                            mode,
                            componentModelVersion: 1,
                            component: 'ui/main.json',
                            selectors: 'ui/selectors.json',
                            surface: 'app.root',
                        },
                        game: { logic: 'logic/main.json' },
                    },
                },
            });
            const result = compileNativeRuntimeDescriptor({
                packageVersion: f.packageVersion,
                manifest: f.manifest,
                entryPointId: f.entryPointId,
            });

            expect(result.descriptor.experience).toEqual({
                mode,
                componentModelVersion: 1,
            });
            expect(result.runtime.experience).toEqual({
                mode,
                componentModelVersion: 1,
                component: 'ui/main.json',
                selectors: 'ui/selectors.json',
                surface: 'app.root',
            });
        }
    });

    test('A4 experience resources fail closed for missing, executable, or invalid stage definitions', () => {
        const missing = fixture({
            entryPoint: {
                runtime: {
                    experience: { mode: 'component', componentModelVersion: 1 },
                },
            },
        });
        expect(() => compileNativeRuntimeDescriptor({
            packageVersion: missing.packageVersion,
            manifest: missing.manifest,
            entryPointId: missing.entryPointId,
        })).toThrow(/requires a declarative component resource/);

        const executable = fixture({
            entryPoint: {
                runtime: {
                    experience: {
                        mode: 'component',
                        componentModelVersion: 1,
                        component: 'ui/main.js',
                    },
                },
            },
        });
        expect(() => compileNativeRuntimeDescriptor({
            packageVersion: executable.packageVersion,
            manifest: executable.manifest,
            entryPointId: executable.entryPointId,
        })).toThrow(/declarative \.json/);

        const invalidHybridSurface = fixture({
            entryPoint: {
                runtime: {
                    experience: {
                        mode: 'hybrid',
                        componentModelVersion: 1,
                        component: 'ui/main.json',
                        surface: 'sidebar.left',
                    },
                },
            },
        });
        expect(() => compileNativeRuntimeDescriptor({
            packageVersion: invalidHybridSurface.packageVersion,
            manifest: invalidHybridSurface.manifest,
            entryPointId: invalidHybridSurface.entryPointId,
        })).toThrow(/app.root stage surface/);
    });

    test('requires explicit experience instead of inferring from old UI/runtime fields', () => {
        const f = fixture({ entryPoint: { runtime: { game: { logic: 'logic/main.json' } } } });
        expect(() => compileNativeRuntimeDescriptor({
            packageVersion: f.packageVersion,
            manifest: f.manifest,
            entryPointId: f.entryPointId,
        })).toThrow(/explicit experience/);
    });

    test('rejects retired package-authority fields and executable runtime source paths', () => {
        const old = fixture({
            entryPoint: {
                runtime: {
                    experience: { mode: 'text' },
                    game: { gameManifest: 'runtime/old.json' },
                },
            },
        });
        expect(() => compileNativeRuntimeDescriptor({
            packageVersion: old.packageVersion,
            manifest: old.manifest,
            entryPointId: old.entryPointId,
        })).toThrow(/unsupported field/);

        const executable = fixture({
            entryPoint: {
                runtime: {
                    experience: { mode: 'text' },
                    game: { logic: 'logic/main.js' },
                },
            },
        });
        expect(() => compileNativeRuntimeDescriptor({
            packageVersion: executable.packageVersion,
            manifest: executable.manifest,
            entryPointId: executable.entryPointId,
        })).toThrow(/declarative \.json/);
    });

    test('resolver is derived from an opened immutable package and does not persist a descriptor', () => {
        const f = fixture();
        const opened = {
            packageVersion: f.packageVersion,
            manifest: f.manifest,
            sourceFiles: new Map([['logic/main.json', Buffer.from('{}')]]),
        };
        const resolved = resolveNativeRuntimePackage(opened, f.entryPointId);
        expect(resolved.descriptor.packageVersionId).toBe(f.packageVersionId);
        expect(resolved.packageVersion).toBe(f.packageVersion);
        expect(resolved.manifest).toBe(f.manifest);
    });

    test('refuses PackageVersion identity mismatch', () => {
        const f = fixture();
        expect(() => compileNativeRuntimeDescriptor({
            packageVersion: { ...f.packageVersion, packageVersionId: createNativeId('packageVersion') },
            manifest: f.manifest,
            entryPointId: f.entryPointId,
        })).toThrow(/identity mismatch/);
    });
});
