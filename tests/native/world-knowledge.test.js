import { describe, expect, test } from '@jest/globals';

import {
    ATRIA_PACKAGE_FORMAT,
    ATRIA_PACKAGE_SCHEMA_VERSION,
    NATIVE_RESOURCE_KINDS,
    NATIVE_SCHEMA_VERSION,
    assertAtriaPackageManifest,
    assertKnowledgeBase,
    assertKnowledgeBinding,
    assertKnowledgeEntry,
    assertKnowledgeRevision,
    assertNativeResourceKey,
    assertSessionRevision,
    assertWorld,
    assertWorldRevision,
} from '../../src/native/index.js';

const IDs = Object.freeze({
    packageId: 'pkg_' + '1'.repeat(32),
    packageVersionId: 'pkgv_' + '2'.repeat(32),
    entryPointId: 'entry_' + '3'.repeat(32),
    worldId: 'world_' + '4'.repeat(32),
    worldRevisionId: 'worldv_' + '5'.repeat(32),
    knowledgeBaseId: 'kb_' + '6'.repeat(32),
    knowledgeRevisionId: 'kbv_' + '7'.repeat(32),
    knowledgeRevisionNextId: 'kbv_' + '8'.repeat(32),
    knowledgeEntryA: 'kentry_' + '9'.repeat(32),
    knowledgeEntryB: 'kentry_' + 'a'.repeat(32),
    knowledgeBindingId: 'kbind_' + 'b'.repeat(32),
    assetId: 'asset_' + 'c'.repeat(32),
    sessionId: 'ses_' + 'd'.repeat(32),
    branchId: 'br_' + 'e'.repeat(32),
    revisionId: 'rev_' + 'f'.repeat(32),
});

function worldSnapshot() {
    return {
        world: {
            worldId: IDs.worldId,
            displayName: 'Aster',
            currentRevisionId: IDs.worldRevisionId,
            createdAt: 1,
            updatedAt: 2,
        },
        revision: {
            worldRevisionId: IDs.worldRevisionId,
            worldId: IDs.worldId,
            schema: {
                hp: { type: 'number' },
            },
            baseline: {
                region: 'capital',
            },
            knowledgeBindingIds: [IDs.knowledgeBindingId],
            assetIds: [IDs.assetId],
            metadata: {
                authoredBy: 'project',
            },
            createdAt: 2,
        },
    };
}

function knowledgeSnapshot() {
    return {
        knowledgeBase: {
            knowledgeBaseId: IDs.knowledgeBaseId,
            displayName: 'Aster Canon',
            currentRevisionId: IDs.knowledgeRevisionId,
            createdAt: 1,
            updatedAt: 2,
        },
        revision: {
            knowledgeRevisionId: IDs.knowledgeRevisionId,
            knowledgeBaseId: IDs.knowledgeBaseId,
            entryIds: [IDs.knowledgeEntryA, IDs.knowledgeEntryB],
            metadata: {
                source: 'library-revision',
            },
            createdAt: 2,
        },
        entries: [
            {
                knowledgeEntryId: IDs.knowledgeEntryA,
                content: 'The capital is Aster.',
                discovery: {
                    keywords: ['capital', 'Aster'],
                },
            },
            {
                knowledgeEntryId: IDs.knowledgeEntryB,
                content: 'The old gate opens after dusk.',
                discovery: {
                    aliases: ['old gate'],
                    regex: ['gate.*dusk'],
                    semanticHints: ['city gate opening time'],
                },
                applicability: {
                    stateConditions: [{ providerId: 'atri_world_state', path: ['time', 'phase'], operator: 'eq', value: 'night' }],
                    stateConditionsLogic: 'all',
                    stateActivation: true,
                },
                lifecycle: {
                    probability: 100,
                    sticky: { turns: 2 },
                    cooldown: { turns: 1 },
                    delay: { turns: 0 },
                },
                relations: {
                    requiredEntryIds: [IDs.knowledgeEntryA],
                    relatedEntryIds: [IDs.knowledgeEntryA],
                    exclusiveGroup: 'gate-state',
                },
                delivery: {
                    target: 'narrator',
                    position: 'before',
                    priority: 10,
                    visibility: ['narrator', 'actor', 'agent'],
                },
                metadata: {
                    canonical: true,
                },
            },
        ],
    };
}

function knowledgeBinding(overrides = {}) {
    return {
        knowledgeBindingId: IDs.knowledgeBindingId,
        source: {
            kind: 'library',
            knowledgeBaseId: IDs.knowledgeBaseId,
            knowledgeRevisionId: IDs.knowledgeRevisionId,
        },
        enabled: true,
        mode: 'augment',
        visibility: ['narrator', 'actor', 'agent'],
        priority: 20,
        metadata: {
            vendoredAtBuild: true,
        },
        ...overrides,
    };
}

function packageManifest(overrides = {}) {
    return {
        format: ATRIA_PACKAGE_FORMAT,
        schemaVersion: ATRIA_PACKAGE_SCHEMA_VERSION,
        nativeSchemaVersion: NATIVE_SCHEMA_VERSION,
        packageId: IDs.packageId,
        packageVersionId: IDs.packageVersionId,
        name: 'Aster Package',
        version: '1.0.0',
        actors: [],
        entryPoints: [{
            entryPointId: IDs.entryPointId,
            displayName: 'Main',
            actorIds: [],
            worldIds: [IDs.worldId],
            primaryWorldId: IDs.worldId,
            knowledgeBindingIds: [IDs.knowledgeBindingId],
            initialStateOverlay: { hp: 100 },
        }],
        capabilities: ['narrative', 'world-simulation', 'knowledge'],
        permissions: [],
        worlds: [worldSnapshot()],
        knowledge: [knowledgeSnapshot()],
        knowledgeBindings: [knowledgeBinding()],
        assets: [{
            assetId: IDs.assetId,
            contentHash: '0'.repeat(64),
            size: 4,
            logicalName: 'map.webp',
        }],
        ...overrides,
    };
}

describe('N0 World contracts', () => {
    test('World identity is opaque and presentation rename does not move identity', () => {
        const before = assertWorld(worldSnapshot().world);
        const after = assertWorld({
            ...worldSnapshot().world,
            displayName: 'Renamed Aster',
        });
        expect(after.worldId).toBe(before.worldId);
        expect(after.currentRevisionId).toBe(before.currentRevisionId);
    });

    test('WorldRevision carries immutable definition/baseline, not current Session state', () => {
        const revision = assertWorldRevision(worldSnapshot().revision);
        expect(revision.schema).toEqual({ hp: { type: 'number' } });
        expect(revision.baseline).toEqual({ region: 'capital' });

        expect(() => assertWorldRevision({
            ...worldSnapshot().revision,
            currentState: { hp: 20 },
        })).toThrow(/unsupported field/);
        expect(() => assertWorldRevision({
            ...worldSnapshot().revision,
            eventJournal: [],
        })).toThrow(/unsupported field/);
    });

    test.each([
        ['uid', 42],
        ['worldBookName', 'Aster'],
        ['filename', 'aster.json'],
        ['path', 'worlds/aster.json'],
    ])('rejects legacy World identity field %s', (field, value) => {
        expect(() => assertWorld({
            ...worldSnapshot().world,
            [field]: value,
        })).toThrow(/legacy World\/Knowledge identity field/);
    });
});

describe('N0 Knowledge contracts', () => {
    test('KnowledgeBase and KnowledgeRevision pin stable immutable revisions', () => {
        const snapshot = knowledgeSnapshot();
        expect(assertKnowledgeBase(snapshot.knowledgeBase).currentRevisionId).toBe(IDs.knowledgeRevisionId);
        expect(assertKnowledgeRevision(snapshot.revision).entryIds).toEqual([
            IDs.knowledgeEntryA,
            IDs.knowledgeEntryB,
        ]);
    });

    test('simple authors may use only content and keywords', () => {
        const entry = assertKnowledgeEntry({
            knowledgeEntryId: IDs.knowledgeEntryA,
            content: 'Simple lore.',
            discovery: {
                keywords: ['simple'],
            },
        });
        expect(entry.content).toBe('Simple lore.');
        expect(entry.discovery.keywords).toEqual(['simple']);
        expect(entry.applicability).toBeUndefined();
    });

    test('advanced semantic regions are optional but validated when present', () => {
        const entry = assertKnowledgeEntry(knowledgeSnapshot().entries[1]);
        expect(entry.lifecycle.probability).toBe(100);
        expect(entry.relations.requiredEntryIds).toEqual([IDs.knowledgeEntryA]);
        expect(entry.delivery.visibility).toEqual(['narrator', 'actor', 'agent']);

        expect(() => assertKnowledgeEntry({
            ...knowledgeSnapshot().entries[1],
            lifecycle: { probability: 101 },
        })).toThrow(/between 0 and 100/);
    });

    test('identical bodies from distinct IDs remain distinct knowledge identities', () => {
        const first = assertKnowledgeEntry({
            knowledgeEntryId: IDs.knowledgeEntryA,
            content: 'Same body.',
        });
        const second = assertKnowledgeEntry({
            knowledgeEntryId: IDs.knowledgeEntryB,
            content: 'Same body.',
        });
        expect(first.content).toBe(second.content);
        expect(first.knowledgeEntryId).not.toBe(second.knowledgeEntryId);
    });

    test.each([
        ['uid', 7],
        ['bookName', 'Old World Book'],
        ['charaFilename', 'alice.png'],
        ['selected_world_info', ['Old World Book']],
    ])('rejects legacy Knowledge identity field %s', (field, value) => {
        expect(() => assertKnowledgeEntry({
            knowledgeEntryId: IDs.knowledgeEntryA,
            content: 'Lore',
            [field]: value,
        })).toThrow(/legacy World\/Knowledge identity field/);
    });
});

describe('N0 KnowledgeBinding contracts', () => {
    test('pins source to stable KnowledgeBase and KnowledgeRevision', () => {
        const binding = assertKnowledgeBinding(knowledgeBinding());
        expect(binding.source).toEqual({
            kind: 'library',
            knowledgeBaseId: IDs.knowledgeBaseId,
            knowledgeRevisionId: IDs.knowledgeRevisionId,
        });
        expect(binding.mode).toBe('augment');
    });

    test('supports explicit override without granting runtime/state authority', () => {
        expect(assertKnowledgeBinding(knowledgeBinding({
            mode: 'override',
        })).mode).toBe('override');

        expect(() => assertKnowledgeBinding(knowledgeBinding({
            runtimeOverride: true,
        }))).toThrow(/unsupported field/);
        expect(() => assertKnowledgeBinding(knowledgeBinding({
            mode: 'authoritative-state',
        }))).toThrow(/must be one of/);
    });

    test('old global/character/chat scope is not part of Native binding schema', () => {
        for (const scope of ['global', 'character', 'character_aux', 'chat']) {
            expect(() => assertKnowledgeBinding({
                ...knowledgeBinding(),
                scope,
            })).toThrow(/unsupported field/);
        }
    });

    test('a binding stays pinned when Library current revision advances', () => {
        const pinned = assertKnowledgeBinding(knowledgeBinding());
        const updatedLibrary = assertKnowledgeBase({
            ...knowledgeSnapshot().knowledgeBase,
            currentRevisionId: IDs.knowledgeRevisionNextId,
            updatedAt: 9,
        });
        expect(updatedLibrary.currentRevisionId).toBe(IDs.knowledgeRevisionNextId);
        expect(pinned.source.knowledgeRevisionId).toBe(IDs.knowledgeRevisionId);
    });
});

describe('N0 Package World/Knowledge snapshots', () => {
    test('Package v2 vendors exact immutable World/Knowledge snapshots', () => {
        const parsed = assertAtriaPackageManifest(packageManifest());
        expect(parsed.worlds[0].world.currentRevisionId).toBe(IDs.worldRevisionId);
        expect(parsed.knowledge[0].knowledgeBase.currentRevisionId).toBe(IDs.knowledgeRevisionId);
        expect(parsed.knowledgeBindings[0].source.knowledgeRevisionId).toBe(IDs.knowledgeRevisionId);
        expect(parsed.entryPoints[0].worldIds).toEqual([IDs.worldId]);
        expect(parsed.entryPoints[0].knowledgeBindingIds).toEqual([IDs.knowledgeBindingId]);
    });

    test('Package can contain zero Worlds and zero Knowledge dependencies', () => {
        const parsed = assertAtriaPackageManifest(packageManifest({
            entryPoints: [{
                entryPointId: IDs.entryPointId,
                displayName: 'Pure tool',
                actorIds: [],
            }],
            capabilities: ['tool'],
            worlds: [],
            knowledge: [],
            knowledgeBindings: [],
            assets: [],
        }));
        expect(parsed.worlds).toEqual([]);
        expect(parsed.knowledge).toEqual([]);
    });

    test('EntryPoint world must use IDs and resolve to a packaged snapshot', () => {
        expect(() => assertAtriaPackageManifest(packageManifest({
            entryPoints: [{
                entryPointId: IDs.entryPointId,
                displayName: 'Broken',
                actorIds: [],
                worldIds: ['world_' + '9'.repeat(32)],
            }],
        }))).toThrow(/unknown worldId/);

        expect(() => assertAtriaPackageManifest(packageManifest({
            entryPoints: [{
                entryPointId: IDs.entryPointId,
                displayName: 'Legacy',
                actorIds: [],
                world: { name: 'Aster' },
            }],
        }))).toThrow(/EntryPoint.world is retired/);
    });

    test('KnowledgeBinding source must resolve to vendored exact KnowledgeRevision', () => {
        expect(() => assertAtriaPackageManifest(packageManifest({
            knowledgeBindings: [knowledgeBinding({
                source: {
                    kind: 'library',
                    knowledgeBaseId: IDs.knowledgeBaseId,
                    knowledgeRevisionId: IDs.knowledgeRevisionNextId,
                },
            })],
        }))).toThrow(/immutable Knowledge snapshot/);
    });

    test('WorldRevision binding and asset references must resolve within PackageVersion', () => {
        const missingBinding = worldSnapshot();
        missingBinding.revision = {
            ...missingBinding.revision,
            knowledgeBindingIds: ['kbind_' + 'f'.repeat(32)],
        };
        expect(() => assertAtriaPackageManifest(packageManifest({
            worlds: [missingBinding],
        }))).toThrow(/unknown knowledgeBindingId/);

        const missingAsset = worldSnapshot();
        missingAsset.revision = {
            ...missingAsset.revision,
            assetIds: ['asset_' + 'f'.repeat(32)],
        };
        expect(() => assertAtriaPackageManifest(packageManifest({
            worlds: [missingAsset],
        }))).toThrow(/unknown assetId/);
    });
});

describe('N0 SessionRevision Knowledge pin', () => {
    test('requires an opaque resolved Knowledge dependency head', () => {
        const parsed = assertSessionRevision({
            revisionId: IDs.revisionId,
            sessionId: IDs.sessionId,
            branchId: IDs.branchId,
            timelineHead: null,
            knowledgeHead: 'knowledge_binding_set_1',
            stateHeads: {},
            createdAt: 10,
        });
        expect(parsed.knowledgeHead).toBe('knowledge_binding_set_1');

        expect(() => assertSessionRevision({
            revisionId: IDs.revisionId,
            sessionId: IDs.sessionId,
            branchId: IDs.branchId,
            timelineHead: null,
            stateHeads: {},
            createdAt: 10,
        })).toThrow(/knowledgeHead/);
    });
});

describe('N0 Native Store World/Knowledge identity', () => {
    test('keys World and immutable WorldRevision by opaque IDs', () => {
        expect(assertNativeResourceKey({
            kind: NATIVE_RESOURCE_KINDS.worldRevision,
            handle: 'user-1',
            worldId: IDs.worldId,
            worldRevisionId: IDs.worldRevisionId,
        })).toEqual({
            kind: 'atri_world_revision',
            handle: 'user-1',
            worldId: IDs.worldId,
            worldRevisionId: IDs.worldRevisionId,
        });
    });

    test('keys KnowledgeEntry by base + exact revision + stable entry ID', () => {
        expect(assertNativeResourceKey({
            kind: NATIVE_RESOURCE_KINDS.knowledgeEntry,
            handle: 'user-1',
            knowledgeBaseId: IDs.knowledgeBaseId,
            knowledgeRevisionId: IDs.knowledgeRevisionId,
            knowledgeEntryId: IDs.knowledgeEntryA,
        })).toEqual({
            kind: 'atri_knowledge_entry',
            handle: 'user-1',
            knowledgeBaseId: IDs.knowledgeBaseId,
            knowledgeRevisionId: IDs.knowledgeRevisionId,
            knowledgeEntryId: IDs.knowledgeEntryA,
        });
    });

    test('does not allow world/book name or uid into Native resource identity', () => {
        expect(() => assertNativeResourceKey({
            kind: NATIVE_RESOURCE_KINDS.knowledgeBase,
            handle: 'user-1',
            knowledgeBaseId: IDs.knowledgeBaseId,
            bookName: 'Old book',
        })).toThrow(/must not contain field/);

        expect(() => assertNativeResourceKey({
            kind: NATIVE_RESOURCE_KINDS.world,
            handle: 'user-1',
            worldId: IDs.worldId,
            uid: 7,
        })).toThrow(/must not contain field/);
    });
});
