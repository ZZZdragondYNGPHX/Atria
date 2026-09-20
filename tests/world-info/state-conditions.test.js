import { describe, test, expect } from '@jest/globals';
import {
    WORLD_INFO_CONDITION_RESULT,
    evaluateWorldInfoStateCondition,
    evaluateWorldInfoStateConditions,
    shouldActivateWorldInfoFromStateConditions,
} from '../../public/scripts/atri-world-info-state-conditions.js';

const ready = {
    providerId: 'mvu',
    status: 'ready',
    fields: [
        { path: ['scene', 'place'], value: 'clocktower' },
        { path: ['scene', 'night'], value: true },
        { path: ['quest', 'clues'], value: 3 },
        { path: ['nullable'], value: null },
    ],
};

describe('W-03 tri-state world info conditions', () => {
    test('missing provider and missing field are explicit unknown', () => {
        expect(evaluateWorldInfoStateCondition({
            providerId: 'lorestate', path: ['scene', 'place'], operator: 'eq', value: 'clocktower',
        }, [ready])).toMatchObject({ status: 'unknown', reason: 'provider_absent' });

        expect(evaluateWorldInfoStateCondition({
            providerId: 'mvu', path: ['scene', 'missing'], operator: 'eq', value: 'clocktower',
        }, [ready])).toMatchObject({ status: 'unknown', reason: 'field_unknown' });
    });

    test('busy/error provider never fabricates a boolean result', () => {
        for (const status of ['initializing', 'error', 'absent']) {
            expect(evaluateWorldInfoStateCondition({
                providerId: 'mvu', path: ['scene', 'place'], operator: 'eq', value: 'clocktower',
            }, [{ ...ready, status }])).toMatchObject({
                status: WORLD_INFO_CONDITION_RESULT.UNKNOWN,
                providerStatus: status,
            });
        }
    });

    test('unknown inequality stays unknown instead of becoming true', () => {
        expect(evaluateWorldInfoStateCondition({
            providerId: 'mvu', path: ['unknown'], operator: 'neq', value: 'castle',
        }, [ready])).toMatchObject({ status: 'unknown', reason: 'field_unknown' });
    });

    test('restricted scalar comparisons are deterministic', () => {
        expect(evaluateWorldInfoStateCondition({
            providerId: 'mvu', path: ['scene', 'place'], operator: 'eq', value: 'clocktower',
        }, [ready]).status).toBe('true');
        expect(evaluateWorldInfoStateCondition({
            providerId: 'mvu', path: ['scene', 'place'], operator: 'contains', value: 'tower',
        }, [ready]).status).toBe('true');
        expect(evaluateWorldInfoStateCondition({
            providerId: 'mvu', path: ['quest', 'clues'], operator: 'gte', value: 3,
        }, [ready]).status).toBe('true');
        expect(evaluateWorldInfoStateCondition({
            providerId: 'mvu', path: ['quest', 'clues'], operator: 'lt', value: 3,
        }, [ready]).status).toBe('false');
        expect(evaluateWorldInfoStateCondition({
            providerId: 'mvu', path: ['nullable'], operator: 'eq', value: null,
        }, [ready]).status).toBe('true');
    });

    test('numeric comparisons with non-numbers are unknown, not coerced', () => {
        expect(evaluateWorldInfoStateCondition({
            providerId: 'mvu', path: ['scene', 'place'], operator: 'gt', value: 1,
        }, [ready])).toMatchObject({ status: 'unknown', reason: 'incompatible_types' });
    });

    test('ALL and ANY use three-valued logic', () => {
        const yes = { providerId: 'mvu', path: ['scene', 'night'], operator: 'eq', value: true };
        const no = { providerId: 'mvu', path: ['quest', 'clues'], operator: 'lt', value: 3 };
        const unknown = { providerId: 'lorestate', path: ['scene'], operator: 'eq', value: 'x' };

        expect(evaluateWorldInfoStateConditions([yes, unknown], [ready], 'all').status).toBe('unknown');
        expect(evaluateWorldInfoStateConditions([no, unknown], [ready], 'all').status).toBe('false');
        expect(evaluateWorldInfoStateConditions([yes, unknown], [ready], 'any').status).toBe('true');
        expect(evaluateWorldInfoStateConditions([no, unknown], [ready], 'any').status).toBe('unknown');
        expect(evaluateWorldInfoStateConditions([no], [ready], 'any').status).toBe('false');
    });

    test('state-driven activation requires an explicit flag, real conditions, and a true result', () => {
        const conditions = [{
            providerId: 'mvu',
            path: ['scene', 'place'],
            operator: 'eq',
            value: 'clocktower',
        }];
        const matched = evaluateWorldInfoStateConditions(conditions, [ready], 'all');
        const notMatched = evaluateWorldInfoStateConditions([
            { ...conditions[0], value: 'castle' },
        ], [ready], 'all');

        expect(shouldActivateWorldInfoFromStateConditions({
            stateActivation: true,
            stateConditions: conditions,
        }, matched)).toBe(true);
        expect(shouldActivateWorldInfoFromStateConditions({
            stateActivation: false,
            stateConditions: conditions,
        }, matched)).toBe(false);
        expect(shouldActivateWorldInfoFromStateConditions({
            stateActivation: true,
            stateConditions: [],
        }, matched)).toBe(false);
        expect(shouldActivateWorldInfoFromStateConditions({
            stateActivation: true,
            stateConditions: conditions,
        }, notMatched)).toBe(false);
        expect(shouldActivateWorldInfoFromStateConditions({
            stateActivation: true,
            stateConditions: conditions,
        }, { status: WORLD_INFO_CONDITION_RESULT.UNKNOWN })).toBe(false);
    });

    test('empty conditions pass and malformed/prototype paths fail closed', () => {
        expect(evaluateWorldInfoStateConditions([], [ready])).toMatchObject({ status: 'true', reason: 'no_conditions' });
        expect(evaluateWorldInfoStateCondition({
            providerId: 'mvu', path: ['__proto__'], operator: 'eq', value: 'x',
        }, [ready])).toMatchObject({ status: 'unknown', reason: 'invalid_condition' });
        expect(evaluateWorldInfoStateCondition({
            providerId: 'mvu', path: ['scene'], operator: 'eval', value: 'anything',
        }, [ready])).toMatchObject({ status: 'unknown', reason: 'invalid_condition' });
    });
});
