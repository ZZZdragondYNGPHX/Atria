import { describe, expect, test } from '@jest/globals';

import { createReducerRegistry } from '../../public/scripts/extensions/game-runtime/logic/reducers.js';

describe('Game Reducer Registry', () => {
    test('validates typed event payloads before invoking reducers', () => {
        const registry = createReducerRegistry({
            DamageDealt: {
                payloadSchema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['amount'],
                    properties: {
                        amount: { type: 'integer', minimum: 1, maximum: 20 },
                    },
                },
                reduce(state, event) {
                    return { hp: state.hp - event.payload.amount };
                },
            },
        });
        const reducers = registry.toMap();

        expect(reducers.get('DamageDealt')({ hp: 20 }, {
            type: 'DamageDealt',
            payload: { amount: 4 },
        })).toEqual({ hp: 16 });

        expect(() => reducers.get('DamageDealt')({ hp: 20 }, {
            type: 'DamageDealt',
            payload: { amount: '4' },
        })).toThrow(/payload validation failed/);
    });

    test('raw reducer functions remain a concise current authoring form', () => {
        const registry = createReducerRegistry({
            FlagSet(state, event) {
                return { ...state, flag: event.payload.flag };
            },
        });

        expect(registry.list()).toEqual([{
            type: 'FlagSet',
            payloadSchema: { type: 'object' },
        }]);
        expect(registry.toMap().get('FlagSet')({}, {
            type: 'FlagSet',
            payload: { flag: 'ready' },
        })).toEqual({ flag: 'ready' });
    });

    test('unknown event types and malformed definitions fail closed', () => {
        const registry = createReducerRegistry({});
        expect(registry.validateEvent({
            type: 'Missing',
            payload: {},
        })).toEqual({
            ok: false,
            errors: ["No World reducer registered for event type 'Missing'"],
        });

        expect(() => createReducerRegistry([{
            type: 'bad event',
            reduce() {
                return {};
            },
        }])).toThrow(/World Event type/);

        expect(() => createReducerRegistry([
            { type: 'Same', reduce() { return {}; } },
            { type: 'Same', reduce() { return {}; } },
        ])).toThrow(/Duplicate reducer/);
    });
});
