import { describe, expect, jest, test } from '@jest/globals';

import {
    ATRIA_BACK_RESULT,
    createAtriaBackResolver,
} from '../../public/scripts/atria-shell/back-resolver.js';

describe('R7D Back Resolver', () => {
    test('closes context before command and route history', () => {
        const calls = [];
        const handlers = {
            dismissKeyboard: jest.fn(() => false),
            dismissModalPopover: jest.fn(() => false),
            dismissContextSheet: jest.fn(() => {
                calls.push('context');
                return true;
            }),
            dismissCommandSurface: jest.fn(() => {
                calls.push('command');
                return true;
            }),
            navigateAtriaBack: jest.fn(() => {
                calls.push('route');
                return true;
            }),
        };
        const resolver = createAtriaBackResolver(handlers);

        expect(resolver.resolve()).toBe(ATRIA_BACK_RESULT.CONSUMED);
        expect(resolver.getLastStep()).toBe('context-sheet');
        expect(calls).toEqual(['context']);
        expect(handlers.dismissCommandSurface).not.toHaveBeenCalled();
        expect(handlers.navigateAtriaBack).not.toHaveBeenCalled();
    });

    test('preserves generation interruption before leaving route state', () => {
        const calls = [];
        const resolver = createAtriaBackResolver({
            dismissGeneration: () => {
                calls.push('generation');
                return true;
            },
            dismissDetailRoute: () => {
                calls.push('detail');
                return true;
            },
        });

        expect(resolver.resolve()).toBe(ATRIA_BACK_RESULT.CONSUMED);
        expect(resolver.getLastStep()).toBe('generation');
        expect(calls).toEqual(['generation']);
    });

    test('Full Game wins over Immersive and previous Atria route', () => {
        const calls = [];
        const resolver = createAtriaBackResolver({
            escapeFullGame: () => {
                calls.push('full');
                return true;
            },
            exitImmersive: () => {
                calls.push('immersive');
                return true;
            },
            navigateAtriaBack: () => {
                calls.push('route');
                return true;
            },
        });

        expect(resolver.resolve()).toBe(ATRIA_BACK_RESULT.CONSUMED);
        expect(resolver.getLastStep()).toBe('full-game');
        expect(calls).toEqual(['full']);
    });

    test('returns unhandled only after every Web-layer resolver declines', () => {
        const resolver = createAtriaBackResolver({});
        expect(resolver.resolve()).toBe(ATRIA_BACK_RESULT.UNHANDLED);
        expect(resolver.getLastStep()).toBeNull();
    });
});
