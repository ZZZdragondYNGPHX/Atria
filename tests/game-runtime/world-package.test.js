import { describe, expect, test } from '@jest/globals';

import { loadGameWorldDefinition } from '../../public/scripts/native/experience/world/package.js';

const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['hp'],
    properties: {
        hp: { type: 'integer', minimum: 0, maximum: 100 },
    },
};

function packageState({ state = { hp: 20 }, worldRevisionId = 'worldv_native' } = {}) {
    return {
        runtime: { primaryWorldId: 'world_native' },
        snapshot: {
            states: {
                atri_world_state: {
                    primaryWorldId: 'world_native',
                    worlds: {
                        world_native: {
                            worldRevisionId,
                            state,
                        },
                    },
                },
            },
            worlds: [{
                world: { worldId: 'world_native', displayName: 'Native World' },
                revision: {
                    worldId: 'world_native',
                    worldRevisionId: 'worldv_native',
                    schema,
                    baseline: { hp: 20 },
                    knowledgeBindingIds: [],
                    assetIds: [],
                    metadata: {},
                },
            }],
        },
    };
}

describe('Native Game World definition', () => {
    test('supports a Session with no pinned World via initialState', () => {
        const result = loadGameWorldDefinition({
            runtime: { primaryWorldId: null },
            snapshot: {
                states: {
                    atri_world_state: {
                        primaryWorldId: null,
                        initialState: { hp: 7 },
                    },
                },
                worlds: [],
            },
        });
        expect(result).toMatchObject({
            worldId: null,
            worldRevisionId: null,
            baseline: { hp: 7 },
        });
    });

    test('loads exact pinned World schema and baseline from the Session PackageVersion', () => {
        const result = loadGameWorldDefinition(packageState());
        expect(result).toEqual({
            worldId: 'world_native',
            worldRevisionId: 'worldv_native',
            schema,
            baseline: { hp: 20 },
        });
    });

    test('rejects current Session state that violates the pinned World schema', () => {
        expect(() => loadGameWorldDefinition(packageState({ state: { hp: -1 } })))
            .toThrow(/World State validation failed/);
    });

    test('rejects a World revision that differs from the Session PackageVersion', () => {
        expect(() => loadGameWorldDefinition(packageState({ worldRevisionId: 'worldv_other' })))
            .toThrow(/dependency does not match/);
    });
});

test('explicit Session World choice overrides the immutable Package runtime default, including no World', () => {
    const value = packageState();
    value.runtime.primaryWorldId = 'retired_package_world';
    value.snapshot.states.atri_world_selection = { schemaVersion: 1 };
    expect(loadGameWorldDefinition(value).worldId).toBe('world_native');
    value.snapshot.states.atri_world_state = { primaryWorldId: null, worlds: {} };
    value.snapshot.worlds = [];
    expect(loadGameWorldDefinition(value).worldId).toBeNull();
});
