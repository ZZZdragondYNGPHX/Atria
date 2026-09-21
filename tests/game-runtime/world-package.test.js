import { describe, expect, jest, test } from '@jest/globals';

import { loadGameWorldDefinition } from '../../public/scripts/extensions/game-runtime/world/package.js';

function response(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return structuredClone(body);
        },
    };
}

const packageState = {
    status: 'ready',
    active: true,
    charId: 'hero',
    manifest: {
        world: {
            schema: 'world/schema.json',
            initial: 'world/initial.json',
        },
    },
};

const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['hp'],
    properties: {
        hp: { type: 'integer', minimum: 0, maximum: 100 },
    },
};

describe('Game Package World definition', () => {
    test('returns null when the package declares no world runtime', async () => {
        const result = await loadGameWorldDefinition({
            ...packageState,
            manifest: {},
        });
        expect(result).toBeNull();
    });

    test('loads and validates world schema plus initial state', async () => {
        const fetchImpl = jest.fn(async (url) => {
            if (url.endsWith('/world/schema.json')) return response(schema);
            if (url.endsWith('/world/initial.json')) return response({ hp: 20 });
            throw new Error('unexpected URL ' + url);
        });

        const result = await loadGameWorldDefinition(packageState, { fetchImpl });

        expect(result.schema).toEqual(schema);
        expect(result.initialState).toEqual({ hp: 20 });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test('rejects an initial state that violates the world schema', async () => {
        const fetchImpl = jest.fn(async (url) => {
            if (url.endsWith('/world/schema.json')) return response(schema);
            return response({ hp: -1 });
        });

        await expect(loadGameWorldDefinition(packageState, { fetchImpl }))
            .rejects.toThrow(/World State validation failed/);
    });

    test('rejects non-object world roots', async () => {
        const fetchImpl = jest.fn(async (url) => {
            if (url.endsWith('/world/schema.json')) return response(schema);
            return response(['not', 'a', 'world']);
        });

        await expect(loadGameWorldDefinition(packageState, { fetchImpl }))
            .rejects.toThrow(/initial state must be a JSON object/);
    });
});
