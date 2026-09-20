import { describe, test, expect, jest } from '@jest/globals';
import { requestToolCallWithRetry } from '../../public/scripts/extensions/orchestrator/tool-calling.js';

const schemaResult = (name, args = {}) => ({
    assistantText: '',
    toolCalls: [{ name, args, raw: { type: 'function', function: { name, arguments: JSON.stringify(args) } } }],
});

function coded(code, message = code) {
    const error = new Error(message);
    error.code = code;
    return error;
}

describe('orchestrator tool-calling API fallback integration', () => {
    test('exhausts primary retries before switching to Workspace fallback', async () => {
        const calls = [];
        const generateTask = jest.fn(async options => {
            calls.push(options.apiPresetName);
            if (options.apiPresetName === 'primary') throw coded('network', 'primary offline');
            return schemaResult('done', { ok: true });
        });
        const context = { generateTask };
        const result = await requestToolCallWithRetry(context, { toolCallRetryMax: 1 }, {
            apiPresetName: 'primary',
            fallbackApiPresetName: 'backup',
            functionName: 'done',
            parameters: {
                type: 'object',
                properties: { ok: { type: 'boolean' } },
                required: ['ok'],
                additionalProperties: false,
            },
        });

        expect(result).toEqual({ ok: true });
        expect(calls).toEqual(['primary', 'primary', 'backup']);
    });

    test('does not switch API for deterministic request errors', async () => {
        const calls = [];
        const generateTask = jest.fn(async options => {
            calls.push(options.apiPresetName);
            throw coded('invalid_input', 'bad schema');
        });
        const context = { generateTask };

        await expect(requestToolCallWithRetry(context, { toolCallRetryMax: 0 }, {
            apiPresetName: 'primary',
            fallbackApiPresetName: 'backup',
            functionName: 'done',
            parameters: { type: 'object', properties: {}, additionalProperties: false },
        })).rejects.toMatchObject({ code: 'invalid_input' });

        expect(calls).toEqual(['primary']);
    });
});
