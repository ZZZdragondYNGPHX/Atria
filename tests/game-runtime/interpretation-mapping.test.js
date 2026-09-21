import { describe, expect, test } from '@jest/globals';

import { createInterpretationMappingRegistry } from '../../public/scripts/extensions/game-runtime/logic/interpretations.js';

describe('R5 deterministic Interpretation Mapping Registry', () => {
    test('maps one accepted semantic event into one typed Command proposal', () => {
        const registry = createInterpretationMappingRegistry([{
            eventType: 'implicit_threat',
            map(context) {
                expect(Object.isFrozen(context)).toBe(true);
                expect(Object.isFrozen(context.interpretation)).toBe(true);
                expect(Object.isFrozen(context.world)).toBe(true);
                return {
                    id: 'record_threat',
                    args: {
                        severity: context.interpretation.severity,
                        participant: context.interpretation.participants[0],
                    },
                };
            },
        }]);

        const result = registry.map({
            decision: 'event',
            eventType: 'implicit_threat',
            severity: 'medium',
            participants: ['guard_02'],
            confidence: 0.91,
        }, {
            world: { threatCount: 0 },
            observation: { views: {} },
            turn: { turnId: 'turn:test' },
        });

        expect(result).toEqual({
            status: 'mapped',
            eventType: 'implicit_threat',
            commands: [{
                id: 'record_threat',
                args: {
                    severity: 'medium',
                    participant: 'guard_02',
                },
            }],
        });
    });

    test('no-change interpretation never maps to a Command', () => {
        const registry = createInterpretationMappingRegistry([{
            eventType: 'implicit_threat',
            map() {
                throw new Error('no-change must not invoke mapper');
            },
        }]);

        expect(registry.map({
            decision: 'no_change',
            confidence: 0.9,
        })).toEqual({
            status: 'no_change',
            eventType: null,
            commands: [],
        });
    });

    test('unknown semantic event type fails closed', () => {
        const registry = createInterpretationMappingRegistry([]);

        expect(() => registry.map({
            decision: 'event',
            eventType: 'unmapped_semantic_event',
            confidence: 0.99,
        })).toThrow(/No deterministic interpretation mapping registered/);
    });

    test('mapping cannot fan out into multiple non-atomic Commands', () => {
        const registry = createInterpretationMappingRegistry([{
            eventType: 'implicit_threat',
            map() {
                return [
                    { id: 'first', args: {} },
                    { id: 'second', args: {} },
                ];
            },
        }]);

        expect(() => registry.map({
            decision: 'event',
            eventType: 'implicit_threat',
            confidence: 0.99,
        })).toThrow(/too many commands/);
    });
});
