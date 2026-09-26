import { describe, expect, jest, test } from '@jest/globals';

import {
    ATRIA_PACKAGE_CAPABILITIES,
    ATRIA_PACKAGE_FORMAT,
    ATRIA_PACKAGE_PERMISSIONS,
    ATRIA_PACKAGE_SCHEMA_VERSION,
    ATRIA_SAVE_FORMAT,
    ATRIA_SAVE_SCHEMA_VERSION,
    NATIVE_ID_FAMILIES,
    NATIVE_RESOURCE_KINDS,
    NATIVE_SCHEMA_VERSION,
    NATIVE_STORE_FAMILIES,
    assertAtriaPackageManifest,
    assertAtriaSave,
    assertNativeResourceKey,
    assertProject,
    assertSessionRevision,
    assertTimelineEntry,
    createNativeId,
    isNativeId,
    parseNativeId,
    validateAtriaPackageManifest,
    validateAtriaSave,
} from '../../src/native/index.js';

const IDs = Object.freeze({
    packageId: 'pkg_' + '1'.repeat(32),
    packageVersionId: 'pkgv_' + '2'.repeat(32),
    actorA: 'actor_' + '3'.repeat(32),
    actorB: 'actor_' + '4'.repeat(32),
    entryPointId: 'entry_' + '5'.repeat(32),
    projectId: 'project_' + '6'.repeat(32),
    sessionId: 'ses_' + '7'.repeat(32),
    branchId: 'br_' + '8'.repeat(32),
    childBranchId: 'br_' + '9'.repeat(32),
    messageId: 'msg_' + 'a'.repeat(32),
    variantId: 'var_' + 'b'.repeat(32),
    revisionId: 'rev_' + 'c'.repeat(32),
    saveId: 'save_' + 'd'.repeat(32),
    assetId: 'asset_' + 'e'.repeat(32),
});

const PACKAGE_HASH = 'f'.repeat(64);
const ASSET_HASH = 'a'.repeat(64);

test('P0 Package Data uses exact existing AssetRefs and strict package-owned declarations', () => {
    const experienceContract = {
        schemaVersion: 1,
        capabilities: [{ id: 'package-data', version: 1, required: false }],
        dataResources: [{ resourceId: 'items', assetId: IDs.assetId, contentHash: ASSET_HASH }],
    };
    const value = packageManifest({
        runtime: { experienceContract },
        assets: [{ assetId: IDs.assetId, contentHash: ASSET_HASH, size: 2, mediaType: 'application/json' }],
    });
    expect(assertAtriaPackageManifest(value).runtime.experienceContract).toEqual(experienceContract);
    expect(() => assertAtriaPackageManifest({ ...value, assets: [] })).toThrow(/exact application\/json/);
    for (const patch of [{ contentHash: 'b'.repeat(64) }, { mediaType: 'text/javascript' }, { mediaType: 'text/html' }]) {
        expect(() => assertAtriaPackageManifest({ ...value, assets: [{ ...value.assets[0], ...patch }] })).toThrow(/exact application\/json/);
    }
    expect(() => assertAtriaPackageManifest({ ...value, runtime: { experienceContract: { ...experienceContract, script: 'main.js' } } })).toThrow(/unsupported field/);
    expect(() => assertAtriaPackageManifest({
        ...value,
        entryPoints: [{ ...value.entryPoints[0], runtime: { experienceContract } }],
    })).toThrow(/cannot be overridden/);
});

test('Package Regex normalizes ID-less native rules and rejects duplicate IDs', () => {
    const rule = { scriptName: 'Existing native rule', findRegex: '/hello/g', replaceString: 'world', placement: [1] };
    const value = packageManifest({ processors: { regex: [rule, { ...rule, id: 'atri_game_regex_0' }] } });
    const normalized = assertAtriaPackageManifest(value);
    expect(normalized.processors.regex[0]).toMatchObject(rule);
    expect(normalized.processors.regex[0].id).toBe('atri_game_regex_0_');
    expect(assertAtriaPackageManifest(normalized).processors.regex).toEqual(normalized.processors.regex);
    expect(() => assertAtriaPackageManifest(packageManifest({ processors: { regex: [{ ...rule, id: 'same' }, { ...rule, id: 'same' }] } }))).toThrow('duplicate Regex');
});

function packageManifest(overrides = {}) {
    return {
        format: ATRIA_PACKAGE_FORMAT,
        schemaVersion: ATRIA_PACKAGE_SCHEMA_VERSION,
        nativeSchemaVersion: NATIVE_SCHEMA_VERSION,
        packageId: IDs.packageId,
        packageVersionId: IDs.packageVersionId,
        name: 'Native Work',
        version: '1.0.0',
        actors: [
            {
                actorId: IDs.actorA,
                displayName: 'Alice',
                profile: { description: 'actor profile' },
            },
        ],
        entryPoints: [
            {
                entryPointId: IDs.entryPointId,
                displayName: 'Main',
                actorIds: [IDs.actorA],
                primaryActorId: IDs.actorA,
                runtime: { mode: 'narrative' },
            },
        ],
        capabilities: ['actor-interaction', 'narrative'],
        permissions: [
            {
                permission: 'generation',
                required: true,
                reason: 'Interactive generation',
            },
        ],
        assets: [],
        metadata: { authoring: 'source-project' },
        ...overrides,
    };
}

function nativeSession(overrides = {}) {
    return {
        sessionId: IDs.sessionId,
        packageId: IDs.packageId,
        packageVersionId: IDs.packageVersionId,
        packageVersion: '1.0.0',
        packageContentHash: PACKAGE_HASH,
        entryPointId: IDs.entryPointId,
        activeBranchId: IDs.branchId,
        headRevisionId: IDs.revisionId,
        displayTitle: 'Run 1',
        createdAt: 100,
        updatedAt: 200,
        ...overrides,
    };
}

function snapshotSave(overrides = {}) {
    const session = nativeSession();
    const branch = {
        branchId: IDs.branchId,
        sessionId: IDs.sessionId,
        parentBranchId: null,
        forkPoint: null,
        displayName: 'Main timeline',
        createdAt: 100,
    };
    const message = {
        messageId: IDs.messageId,
        sessionId: IDs.sessionId,
        branchId: IDs.branchId,
        sequence: 0,
        role: 'assistant',
        content: 'Hello',
        variantIds: [IDs.variantId],
        activeVariantId: IDs.variantId,
        metadata: {},
    };
    const variant = {
        variantId: IDs.variantId,
        sessionId: IDs.sessionId,
        messageId: IDs.messageId,
        content: 'Hello',
        metadata: {},
        createdAt: 110,
    };
    const revision = {
        revisionId: IDs.revisionId,
        sessionId: IDs.sessionId,
        branchId: IDs.branchId,
        timelineHead: {
            messageId: IDs.messageId,
            variantId: IDs.variantId,
        },
        knowledgeHead: 'knowledge_set_1',
        stateHeads: {
            atri_world_state: 'native_world_head_1',
            atri_memory_graph: 'memory_head_1',
            atri_orchestrator: 'orch_head_1',
        },
        createdAt: 150,
    };
    const savePoint = {
        saveId: IDs.saveId,
        sessionId: IDs.sessionId,
        branchId: IDs.branchId,
        revisionId: IDs.revisionId,
        kind: 'manual',
        displayName: 'Before boss',
        createdAt: 160,
    };
    return {
        format: ATRIA_SAVE_FORMAT,
        schemaVersion: ATRIA_SAVE_SCHEMA_VERSION,
        nativeSchemaVersion: NATIVE_SCHEMA_VERSION,
        scope: 'snapshot',
        exportedAt: 300,
        package: {
            packageId: IDs.packageId,
            packageVersionId: IDs.packageVersionId,
            packageVersion: '1.0.0',
            packageContentHash: PACKAGE_HASH,
            entryPointId: IDs.entryPointId,
        },
        root: {
            sessionId: IDs.sessionId,
            revisionId: IDs.revisionId,
            saveId: IDs.saveId,
        },
        closure: {
            session,
            branches: [branch],
            timelineEntries: [message],
            variants: [variant],
            stateRecords: [
                { namespace: 'atri_world_state', head: 'native_world_head_1', data: { hp: 90 } },
                { namespace: 'atri_memory_graph', head: 'memory_head_1', data: { nodes: [] } },
                { namespace: 'atri_orchestrator', head: 'orch_head_1', data: { round: 4 } },
                {
                    namespace: 'atri_knowledge',
                    head: 'knowledge_set_1',
                    data: { schemaVersion: 1, bindings: [], snapshots: [] },
                },
            ],
            revisions: [revision],
            savePoints: [savePoint],
            assetRefs: [
                {
                    assetId: IDs.assetId,
                    contentHash: ASSET_HASH,
                    size: 12,
                    logicalName: 'scene.webp',
                    mediaType: 'image/webp',
                },
            ],
            attachments: [],
        },
        ...overrides,
    };
}

describe('N0 opaque Native identity', () => {
    test('defines every frozen Native ID family', () => {
        expect(NATIVE_ID_FAMILIES).toEqual({
            package: 'pkg',
            packageVersion: 'pkgv',
            actor: 'actor',
            entryPoint: 'entry',
            project: 'project',
            session: 'ses',
            branch: 'br',
            message: 'msg',
            variant: 'var',
            revision: 'rev',
            savePoint: 'save',
            asset: 'asset',
            world: 'world',
            worldRevision: 'worldv',
            knowledgeBase: 'kb',
            knowledgeRevision: 'kbv',
            knowledgeEntry: 'kentry',
            knowledgeBinding: 'kbind',
            connectionProfile: 'conn',
            modelProfile: 'model',
            generationProfile: 'genprof',
            promptModule: 'pmod',
            promptProgram: 'pprog',
            runtimeRoute: 'route',
            retrievalProfile: 'retr',
        });
    });

    test('creates opaque IDs from UUID entropy and preserves family parsing', () => {
        const uuid = '12345678-1234-4abc-8def-1234567890ab';
        const factory = jest.fn(() => uuid);
        const id = createNativeId('session', factory);
        expect(id).toBe('ses_1234567812344abc8def1234567890ab');
        expect(parseNativeId(id)).toEqual({
            kind: 'session',
            prefix: 'ses',
            opaque: '1234567812344abc8def1234567890ab',
        });
        expect(isNativeId(id, 'session')).toBe(true);
        expect(factory).toHaveBeenCalledTimes(1);
    });

    test.each([
        'Alice',
        'Alice.png',
        'characters/Alice.png',
        '0',
        'chat_12.jsonl',
        'floor:42',
    ])('rejects human/file/index identity %s', value => {
        expect(isNativeId(value)).toBe(false);
    });
});

describe('N0 AtriaPackage v2 logical contract', () => {
    test('accepts a current package and freezes capability/permission vocabularies', () => {
        const parsed = assertAtriaPackageManifest(packageManifest());
        expect(parsed.packageId).toBe(IDs.packageId);
        expect(parsed.entryPoints[0].entryPointId).toBe(IDs.entryPointId);
        expect(ATRIA_PACKAGE_CAPABILITIES).toContain('world-simulation');
        expect(ATRIA_PACKAGE_PERMISSIONS).toContain('network');
    });

    test('supports zero actors and multiple actors without changing the top-level product type', () => {
        const zero = packageManifest({
            actors: [],
            entryPoints: [{
                entryPointId: IDs.entryPointId,
                displayName: 'Tool',
                actorIds: [],
                runtime: { mode: 'tool' },
            }],
            capabilities: ['tool'],
        });
        expect(assertAtriaPackageManifest(zero).actors).toHaveLength(0);

        const many = packageManifest({
            actors: [
                { actorId: IDs.actorA, displayName: 'A' },
                { actorId: IDs.actorB, displayName: 'B' },
            ],
            entryPoints: [{
                entryPointId: IDs.entryPointId,
                displayName: 'Ensemble',
                actorIds: [IDs.actorA, IDs.actorB],
            }],
        });
        expect(assertAtriaPackageManifest(many).actors).toHaveLength(2);
    });

    test('does not accept Character/Card/Chat authority fields', () => {
        for (const [field, value] of [
            ['characterId', 7],
            ['charDir', 'Alice'],
            ['avatar_url', 'Alice.png'],
            ['chatFile', 'chat.jsonl'],
            ['savePoints', []],
        ]) {
            const result = validateAtriaPackageManifest({ ...packageManifest(), [field]: value });
            expect(result.ok).toBe(false);
        }
    });

    test('rejects unresolved Actor identity and undeclared capabilities', () => {
        expect(() => assertAtriaPackageManifest(packageManifest({
            entryPoints: [{
                entryPointId: IDs.entryPointId,
                displayName: 'Broken',
                actorIds: [IDs.actorB],
            }],
        }))).toThrow(/unknown actorId/);

        expect(() => assertAtriaPackageManifest(packageManifest({
            capabilities: ['character-card'],
        }))).toThrow(/unsupported value/);
    });

    test('renaming presentation data never changes Native identity', () => {
        const before = assertAtriaPackageManifest(packageManifest());
        const after = assertAtriaPackageManifest(packageManifest({
            name: 'Renamed Work',
            actors: [{ actorId: IDs.actorA, displayName: 'Renamed Actor' }],
        }));
        expect(after.packageId).toBe(before.packageId);
        expect(after.packageVersionId).toBe(before.packageVersionId);
        expect(after.actors[0].actorId).toBe(before.actors[0].actorId);
    });
});

describe('N0 Session, Timeline, Revision and SavePoint contracts', () => {
    test('uses stable message/variant IDs while sequence is ordering only', () => {
        const parsed = assertTimelineEntry({
            messageId: IDs.messageId,
            sessionId: IDs.sessionId,
            branchId: IDs.branchId,
            sequence: 42,
            role: 'assistant',
            content: 'text',
            variantIds: [IDs.variantId],
            activeVariantId: IDs.variantId,
        });
        expect(parsed.messageId).toBe(IDs.messageId);
        expect(parsed.activeVariantId).toBe(IDs.variantId);

        expect(() => assertTimelineEntry({
            ...parsed,
            messageIndex: 42,
        })).toThrow(/legacy identity field/);
        expect(() => assertTimelineEntry({
            ...parsed,
            swipe_id: 0,
        })).toThrow(/legacy identity field/);
    });

    test('requires SessionRevision state to use Atria-owned namespaces and opaque heads', () => {
        expect(assertSessionRevision({
            revisionId: IDs.revisionId,
            sessionId: IDs.sessionId,
            branchId: IDs.branchId,
            timelineHead: null,
            knowledgeHead: 'knowledge_set_1',
            stateHeads: {
                atri_world_state: 'native_world_head_1',
                atri_memory_graph: 'memory_head_1',
            },
            createdAt: 10,
        }).stateHeads.atri_world_state).toBe('native_world_head_1');

        expect(() => assertSessionRevision({
            revisionId: IDs.revisionId,
            sessionId: IDs.sessionId,
            branchId: IDs.branchId,
            timelineHead: null,
            knowledgeHead: 'knowledge_set_1',
            stateHeads: { memory_graph: 'old_head' },
            createdAt: 10,
        })).toThrow(/Atria-owned/);

        expect(() => assertSessionRevision({
            revisionId: IDs.revisionId,
            sessionId: IDs.sessionId,
            branchId: IDs.branchId,
            timelineHead: null,
            knowledgeHead: 'knowledge_set_1',
            stateHeads: { atri_world_state: 'states/world.json' },
            createdAt: 10,
        })).toThrow(/state-head token/);
    });

    test('Studio Project identity is projectId/packageId, never characterId', () => {
        expect(assertProject({
            projectId: IDs.projectId,
            packageId: IDs.packageId,
            displayName: 'Source Project',
        }).projectId).toBe(IDs.projectId);

        expect(() => assertProject({
            projectId: IDs.projectId,
            packageId: IDs.packageId,
            displayName: 'Source Project',
            characterId: 1,
        })).toThrow(/legacy identity field/);
    });
});

describe('N0 .atriasave v1 logical contract', () => {
    test('validates a coherent snapshot closure', () => {
        const parsed = assertAtriaSave(snapshotSave());
        expect(parsed.scope).toBe('snapshot');
        expect(parsed.root.saveId).toBe(IDs.saveId);
        expect(parsed.closure.revisions[0].revisionId).toBe(IDs.revisionId);
        expect(parsed.closure.session.packageContentHash).toBe(PACKAGE_HASH);
    });

    test('supports full-session scope without pretending Session equals SavePoint', () => {
        const value = snapshotSave();
        value.scope = 'session';
        value.root = { ...value.root, saveId: null };
        expect(assertAtriaSave(value).root.saveId).toBeNull();
    });

    test('snapshot scope requires a SavePoint pointer', () => {
        const value = snapshotSave();
        value.root = { ...value.root, saveId: null };
        expect(validateAtriaSave(value).ok).toBe(false);
    });

    test('requires exact PackageVersion dependency, not display-name matching', () => {
        const value = snapshotSave();
        value.package = { ...value.package, packageContentHash: '0'.repeat(64) };
        expect(() => assertAtriaSave(value)).toThrow(/exactly match/);
    });

    test('rejects a revision whose state head is absent from the exported closure', () => {
        const value = snapshotSave();
        value.closure.stateRecords = value.closure.stateRecords.filter(item => item.namespace !== 'atri_memory_graph');
        expect(() => assertAtriaSave(value)).toThrow(/missing state/);
    });

    test('rejects raw chat-file authority at the portable artifact boundary', () => {
        const value = snapshotSave();
        value.chatFile = 'chat.jsonl';
        expect(validateAtriaSave(value).ok).toBe(false);
    });
});

describe('N0 Native Store schema v1', () => {
    test('reserves first-class Native resource families rather than named_docs', () => {
        expect(NATIVE_STORE_FAMILIES).toEqual([
            'packages',
            'package_versions',
            'package_states',
            'worlds',
            'world_revisions',
            'knowledge_bases',
            'knowledge_revisions',
            'knowledge_entries',
            'knowledge_bindings',
            'sessions',
            'session_branches',
            'timeline_entries',
            'timeline_variants',
            'session_states',
            'session_revisions',
            'save_points',
            'asset_refs',
        ]);
        expect(NATIVE_STORE_FAMILIES).not.toContain('named_docs');
        for (const kind of Object.values(NATIVE_RESOURCE_KINDS)) {
            expect(kind.startsWith('atri_')).toBe(true);
        }
    });

    test('keys Sessions by opaque sessionId and rejects charDir/file/index aliases', () => {
        expect(assertNativeResourceKey({
            kind: NATIVE_RESOURCE_KINDS.session,
            handle: 'user-1',
            sessionId: IDs.sessionId,
        })).toEqual({
            kind: 'atri_session',
            handle: 'user-1',
            sessionId: IDs.sessionId,
        });

        expect(() => assertNativeResourceKey({
            kind: NATIVE_RESOURCE_KINDS.session,
            handle: 'user-1',
            sessionId: IDs.sessionId,
            charDir: 'Alice',
        })).toThrow(/must not contain field/);

        expect(() => assertNativeResourceKey({
            kind: NATIVE_RESOURCE_KINDS.timelineEntry,
            handle: 'user-1',
            sessionId: IDs.sessionId,
            branchId: IDs.branchId,
            messageId: IDs.messageId,
            messageIndex: 0,
        })).toThrow(/must not contain field/);
    });

    test('keys Session State by session + atri namespace + immutable state head', () => {
        expect(assertNativeResourceKey({
            kind: NATIVE_RESOURCE_KINDS.sessionState,
            handle: 'user-1',
            sessionId: IDs.sessionId,
            namespace: 'atri_memory_graph',
            head: 'memory_head_1',
        })).toEqual({
            kind: 'atri_session_state',
            handle: 'user-1',
            sessionId: IDs.sessionId,
            namespace: 'atri_memory_graph',
            head: 'memory_head_1',
        });
    });
});
