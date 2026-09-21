import { describe, expect, jest, test } from '@jest/globals';

import {
    compileGameObservationDefinitions,
    loadGameObservationDefinitions,
} from '../../public/scripts/extensions/game-runtime/llm/declarative-observations.js';
import { createWorldObservationProjector } from '../../public/scripts/extensions/game-runtime/llm/observation.js';

describe('Declarative Game Observations', () => {
    test('compiles safe Formula AST projectors into the existing R5 projector contract', () => {
        const definitions = compileGameObservationDefinitions([
            { id: 'player.hp', formula: 'world.player.hp' },
            { id: 'turn.role', formula: 'args.role' },
        ]);
        const projector = createWorldObservationProjector({
            projectors: definitions,
            eventLimit: 0,
        });

        expect(projector.list()).toEqual(['player.hp', 'turn.role']);
        expect(projector.project({
            world: { player: { hp: 9 } },
            events: [],
            context: { role: 'narrator' },
        })).toEqual({
            views: {
                'player.hp': 9,
                'turn.role': 'narrator',
            },
            recentEvents: [],
        });
    });

    test('loads a declared package observation resource losslessly', async () => {
        const fetchImpl = jest.fn(async () => ({
            ok: true,
            status: 200,
            async json() {
                return [
                    { id: 'scene.threat', formula: 'world.scene.threat' },
                ];
            },
        }));
        const definitions = await loadGameObservationDefinitions({
            charId: 'hero',
            manifest: {
                llm: {
                    observations: 'llm/observations.json',
                },
            },
        }, { fetchImpl });

        expect(definitions).toHaveLength(1);
        expect(fetchImpl).toHaveBeenCalledWith(
            '/api/card-app/hero/llm/observations.json',
            expect.objectContaining({ cache: 'no-store' }),
        );
        expect(definitions[0].select(
            { scene: { threat: 'high' } },
            { role: 'director' },
        )).toBe('high');
    });

    test('rejects duplicate ids, unknown fields, invalid formulas and invalid ids', () => {
        expect(() => compileGameObservationDefinitions([
            { id: 'same', formula: 'world.hp' },
            { id: 'same', formula: 'world.mp' },
        ])).toThrow(/Duplicate/);

        expect(() => compileGameObservationDefinitions([
            { id: 'Bad Id', formula: 'world.hp' },
        ])).toThrow(/id is invalid/);

        expect(() => compileGameObservationDefinitions([
            { id: 'hp', formula: 'world.hp ** 2' },
        ])).toThrow();

        expect(() => compileGameObservationDefinitions([
            { id: 'hp', formula: 'world.hp', setState: true },
        ])).toThrow(/unknown field/);
    });
});
