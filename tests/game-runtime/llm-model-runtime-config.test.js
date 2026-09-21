import { describe, expect, test } from '@jest/globals';

import {
    getModelRuntimeConfig,
    getRuntimeRoleConfig,
    setRuntimeRoleConfig,
} from '../../public/scripts/extensions/game-runtime/llm/model-runtime-config.js';

describe('R5 Model & Runtime configuration surface', () => {
    test('initializes every workload role with functional defaults', () => {
        const settings = {};
        const config = getModelRuntimeConfig(settings);

        expect(config.version).toBe(1);
        expect(Object.keys(config.roles)).toEqual([
            'narrator',
            'intent_resolver',
            'event_interpreter',
            'orchestrator',
            'studio',
        ]);
        expect(config.roles.intent_resolver.requirements.tools).toBe(true);
        expect(settings.modelRuntime.version).toBe(1);
    });

    test('updates one Runtime Role without cloning Connection Profile fields into role config', () => {
        const settings = {};
        const next = setRuntimeRoleConfig(settings, 'narrator', {
            primaryProfile: 'quality-primary',
            fallbackProfiles: ['quality-backup'],
            timeoutMs: 90000,
            retries: 2,
            reasoningPolicy: 'quality',
        });

        expect(next).toMatchObject({
            role: 'narrator',
            primaryProfile: 'quality-primary',
            fallbackProfiles: ['quality-backup'],
            timeoutMs: 90000,
            retries: 2,
        });
        expect(next.api).toBeUndefined();
        expect(next.model).toBeUndefined();
        expect(next.mode).toBeUndefined();

        expect(getRuntimeRoleConfig(settings, 'intent_resolver').primaryProfile).toBe('');
        expect(getRuntimeRoleConfig(settings, 'narrator').primaryProfile).toBe('quality-primary');
    });

    test('persists merged role requirements and rejects invalid settings', () => {
        const settings = {};
        const updated = setRuntimeRoleConfig(settings, 'event_interpreter', {
            primaryProfile: 'structured-primary',
            requirements: {
                structuredOutput: true,
            },
        });

        expect(updated.requirements).toEqual({
            tools: false,
            structuredOutput: true,
        });

        expect(() => setRuntimeRoleConfig(settings, 'narrator', {
            timeoutMs: 0,
        })).toThrow(/timeoutMs/);
        expect(() => getRuntimeRoleConfig(settings, 'unknown')).toThrow(/Unknown Game Runtime role/);
    });

    test('returns defensive normalized snapshots instead of mutable live settings', () => {
        const settings = {};
        const first = getModelRuntimeConfig(settings);
        first.roles.narrator.fallbackProfiles.push?.('mutate');

        const second = getModelRuntimeConfig(settings);
        expect(second.roles.narrator.fallbackProfiles).toEqual([]);
    });
});
