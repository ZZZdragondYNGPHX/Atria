import { describe, expect, jest, test } from '@jest/globals';

import {
    GAME_RUNTIME_ROLES,
    createRuntimeRoleRouter,
    getDefaultRuntimeRoleConfigs,
    normalizeRuntimeRoleConfig,
} from '../../public/scripts/extensions/game-runtime/llm/roles.js';

describe('R5 Runtime Role routing', () => {
    test('keeps workload roles separate from connection profiles', () => {
        expect(GAME_RUNTIME_ROLES).toEqual([
            'narrator',
            'intent_resolver',
            'event_interpreter',
            'orchestrator',
            'studio',
        ]);

        const config = normalizeRuntimeRoleConfig('intent_resolver', {
            primaryProfile: 'fast-tools',
            fallbackProfiles: ['backup-a', 'backup-b', 'fast-tools'],
            timeoutMs: 30000,
            retries: 2,
        });

        expect(config).toMatchObject({
            role: 'intent_resolver',
            primaryProfile: 'fast-tools',
            fallbackProfiles: ['backup-a', 'backup-b'],
            timeoutMs: 30000,
            retries: 2,
            requirements: {
                tools: true,
                structuredOutput: false,
            },
        });
        expect(config.mode).toBeUndefined();
        expect(config.api).toBeUndefined();
        expect(config.model).toBeUndefined();
    });

    test('ships role-specific defaults instead of one cloned chat policy', () => {
        const defaults = getDefaultRuntimeRoleConfigs();

        expect(defaults.narrator.reasoningPolicy).toBe('quality');
        expect(defaults.intent_resolver.reasoningPolicy).toBe('low_variance');
        expect(defaults.event_interpreter.requirements.structuredOutput).toBe(true);
        expect(defaults.intent_resolver.requirements.tools).toBe(true);
        expect(defaults.studio.reasoningPolicy).toBe('coding');
    });

    test('falls back through ordered profiles only on transport/provider failures', async () => {
        const calls = [];
        const generateTask = jest.fn(async request => {
            calls.push(request.apiPresetName);
            if (request.apiPresetName === 'primary') {
                throw Object.assign(new Error('provider overloaded'), {
                    status: 503,
                    code: 'provider_error',
                });
            }
            return { text: 'ok' };
        });
        const router = createRuntimeRoleRouter({
            generateTask,
            roleConfigs: {
                narrator: {
                    primaryProfile: 'primary',
                    fallbackProfiles: ['backup'],
                    timeoutMs: 5000,
                    retries: 0,
                },
            },
        });

        const routed = await router.execute('narrator', {
            taskMessages: [{ role: 'user', content: 'Narrate.' }],
        });

        expect(calls).toEqual(['primary', 'backup']);
        expect(routed).toMatchObject({
            role: 'narrator',
            apiPresetName: 'backup',
            fallbackUsed: true,
            result: { text: 'ok' },
        });
        expect(routed.attempts).toEqual([
            {
                apiPresetName: 'primary',
                retry: 0,
                status: 'failed',
                code: 'provider_error',
                message: 'provider overloaded',
            },
            {
                apiPresetName: 'backup',
                retry: 0,
                status: 'success',
            },
        ]);
    });

    test('retries the current profile before advancing fallback queue', async () => {
        let primaryAttempts = 0;
        const generateTask = jest.fn(async request => {
            if (request.apiPresetName === 'primary') {
                primaryAttempts += 1;
                if (primaryAttempts < 2) {
                    throw Object.assign(new Error('network reset'), {
                        code: 'network_error',
                    });
                }
            }
            return { text: 'ok' };
        });
        const router = createRuntimeRoleRouter({
            generateTask,
            roleConfigs: {
                narrator: {
                    primaryProfile: 'primary',
                    fallbackProfiles: ['backup'],
                    timeoutMs: 5000,
                    retries: 1,
                },
            },
        });

        const routed = await router.execute('narrator', {
            taskMessages: [{ role: 'user', content: 'Narrate.' }],
        });

        expect(routed.apiPresetName).toBe('primary');
        expect(routed.fallbackUsed).toBe(false);
        expect(generateTask.mock.calls.map(([request]) => request.apiPresetName))
            .toEqual(['primary', 'primary']);
    });

    test('schema/validation errors do not silently switch providers', async () => {
        const generateTask = jest.fn(async () => {
            throw Object.assign(new Error('invalid schema'), {
                code: 'invalid_schema',
            });
        });
        const router = createRuntimeRoleRouter({
            generateTask,
            roleConfigs: {
                narrator: {
                    primaryProfile: 'primary',
                    fallbackProfiles: ['backup'],
                    retries: 2,
                },
            },
        });

        await expect(router.execute('narrator', {
            taskMessages: [{ role: 'user', content: 'Narrate.' }],
        })).rejects.toThrow(/invalid schema/);

        expect(generateTask).toHaveBeenCalledTimes(1);
        expect(generateTask.mock.calls[0][0].apiPresetName).toBe('primary');
    });

    test('enforces role-specific tool and structured-output requirements before dispatch', async () => {
        const generateTask = jest.fn();
        const router = createRuntimeRoleRouter({ generateTask });

        await expect(router.execute('intent_resolver', {
            taskMessages: [{ role: 'user', content: 'Move.' }],
        })).rejects.toThrow(/requires tool calling/);

        await expect(router.execute('event_interpreter', {
            taskMessages: [{ role: 'user', content: 'Classify.' }],
        })).rejects.toThrow(/requires structured output/);

        expect(generateTask).not.toHaveBeenCalled();
    });

    test('unknown Runtime Role fails closed', () => {
        expect(() => normalizeRuntimeRoleConfig('state_writer', {}))
            .toThrow(/Unknown Game Runtime role/);
    });
});
