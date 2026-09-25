import { describe, test, expect, jest } from '@jest/globals';
import {
    getOrchestrationFallbackApiPresetName,
    isOrchestrationApiFallbackEligible,
    runWithOrchestrationApiFallback,
} from '../../public/scripts/agents/orchestrator/api-fallback.js';

function coded(code, message = code) {
    const error = new Error(message);
    error.code = code;
    return error;
}

describe('orchestration API fallback policy', () => {
    test('uses the Workspace Default API only when it differs from the primary', () => {
        expect(getOrchestrationFallbackApiPresetName({ llmNodeApiPresetName: 'backup' }, 'primary')).toBe('backup');
        expect(getOrchestrationFallbackApiPresetName({ llmNodeApiPresetName: 'primary' }, 'primary')).toBe('');
        expect(getOrchestrationFallbackApiPresetName({ llmNodeApiPresetName: '' }, 'primary')).toBe('');
    });

    test.each([
        coded('network'),
        coded('rate_limit'),
        coded('no_response'),
        Object.assign(new Error('provider unavailable'), { status: 503 }),
        new Error('upstream gateway timeout'),
    ])('classifies provider/transport failures as fallback-eligible', error => {
        expect(isOrchestrationApiFallbackEligible(error)).toBe(true);
    });

    test.each([
        coded('aborted'),
        coded('context_budget'),
        coded('invalid_input'),
        coded('auth_missing'),
        coded('tool_call_parse'),
        coded('json_schema_violation'),
        new Error('tool schema validation failed'),
        new Error('context window exceeded'),
    ])('does not switch providers for deterministic/user failures', error => {
        expect(isOrchestrationApiFallbackEligible(error)).toBe(false);
    });

    test('primary success never touches fallback', async () => {
        const execute = jest.fn(async route => ({ route }));
        await expect(runWithOrchestrationApiFallback({
            primaryApiPresetName: 'primary',
            fallbackApiPresetName: 'backup',
            execute,
        })).resolves.toEqual({ route: 'primary' });
        expect(execute).toHaveBeenCalledTimes(1);
    });

    test('eligible primary failure switches exactly once to the fallback route', async () => {
        const execute = jest.fn(async route => {
            if (route === 'primary') throw coded('network', 'network down');
            return { ok: true, route };
        });
        const events = [];
        const result = await runWithOrchestrationApiFallback({
            primaryApiPresetName: 'primary',
            fallbackApiPresetName: 'backup',
            execute,
            onEvent: event => events.push(event.type),
        });
        expect(result).toEqual({ ok: true, route: 'backup' });
        expect(execute.mock.calls.map(call => call[0])).toEqual(['primary', 'backup']);
        expect(events).toEqual(['api_fallback.started', 'api_fallback.succeeded']);
        expect(result.orchestrationApiFallback).toEqual({
            used: true,
            primaryApiPresetName: 'primary',
            fallbackApiPresetName: 'backup',
        });
        expect(Object.keys(result)).toEqual(['ok', 'route']);
    });

    test('same primary and fallback never duplicates a failed call', async () => {
        const execute = jest.fn(async () => { throw coded('rate_limit'); });
        await expect(runWithOrchestrationApiFallback({
            primaryApiPresetName: 'same',
            fallbackApiPresetName: 'same',
            execute,
        })).rejects.toMatchObject({ code: 'rate_limit' });
        expect(execute).toHaveBeenCalledTimes(1);
    });

    test('abort signal suppresses fallback even for an otherwise eligible error', async () => {
        const controller = new AbortController();
        controller.abort();
        const execute = jest.fn(async () => { throw coded('network'); });
        await expect(runWithOrchestrationApiFallback({
            primaryApiPresetName: 'primary',
            fallbackApiPresetName: 'backup',
            abortSignal: controller.signal,
            execute,
        })).rejects.toMatchObject({ code: 'network' });
        expect(execute).toHaveBeenCalledTimes(1);
    });

    test('fallback failure is surfaced after the primary route was attempted', async () => {
        const primary = coded('rate_limit', 'primary failed');
        const backup = coded('network', 'backup failed');
        const execute = jest.fn(async route => {
            if (route === 'primary') throw primary;
            throw backup;
        });
        await expect(runWithOrchestrationApiFallback({
            primaryApiPresetName: 'primary',
            fallbackApiPresetName: 'backup',
            execute,
        })).rejects.toBe(backup);
        expect(execute.mock.calls.map(call => call[0])).toEqual(['primary', 'backup']);
        expect(backup.cause).toBe(primary);
    });
});
