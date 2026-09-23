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
