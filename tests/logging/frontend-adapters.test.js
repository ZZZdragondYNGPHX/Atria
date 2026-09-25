import { describe, expect, jest, test } from '@jest/globals';

import {
    installFrontendConsoleAdapter,
    setFrontendConsoleDebugLoggingEnabled,
} from '../../public/scripts/logging/console-adapter.js';
import { __frontendErrorAdapterTestUtils } from '../../public/scripts/logging/error-adapter.js';
import {
    __frontendFetchAdapterTestUtils,
    installFrontendFetchAdapter,
} from '../../public/scripts/logging/fetch-adapter.js';
import { FrontendLogStore } from '../../public/scripts/logging/store.js';

describe('frontend logging adapters', () => {
    test('console adapter captures once and keeps errors visible', () => {
        const store = new FrontendLogStore({ capacity: 10 });
        const sink = jest.fn();
        const fakeConsole = { trace: sink, debug: sink, log: sink, info: sink, warn: sink, error: sink };
        setFrontendConsoleDebugLoggingEnabled(false);
        installFrontendConsoleAdapter({ store, consoleObject: fakeConsole });
        const wrapped = fakeConsole.error;
        installFrontendConsoleAdapter({ store, consoleObject: fakeConsole });
        expect(fakeConsole.error).toBe(wrapped);

        fakeConsole.log('quiet log');
        fakeConsole.error('[orchestrator] failed');

        expect(store.query().entries).toHaveLength(2);
        expect(store.query({ levels: ['error'] }).entries[0].module).toBe('orchestrator');
        expect(sink).toHaveBeenCalledTimes(1);
    });

    test('fetch body summaries exclude prompt/chat content', () => {
        const summary = __frontendFetchAdapterTestUtils.summarizeBody(JSON.stringify({
            model: 'model-x',
            messages: [{ role: 'user', content: 'private prompt body' }],
            atri_generation: { job_id: 'gen-1', persist_target: { kind: 'group', id: '7' } },
        }));
        expect(summary.model).toBe('model-x');
        expect(summary.message_count).toBe(1);
        expect(summary.message_roles).toEqual({ user: 1 });
        expect(JSON.stringify(summary)).not.toContain('private prompt body');
        expect(summary.atri_generation.job_id).toBe('gen-1');
    });

    test('fetch adapter writes structured network lifecycle with generation correlation', async () => {
        const store = new FrontendLogStore({ capacity: 10 });
        const responseHeaders = new Headers({ 'x-atria-generation-id': 'gen-2' });
        const originalFetch = jest.fn(async () => ({ status: 200, ok: true, headers: responseHeaders }));
        const globalObject = { fetch: originalFetch };
        const locationObject = { href: 'https://atria.test/app', origin: 'https://atria.test' };

        installFrontendFetchAdapter({ store, globalObject, locationObject });
        await globalObject.fetch('/api/backends/chat-completions/generate', {
            method: 'POST',
            body: JSON.stringify({ atri_generation: { job_id: 'gen-1' }, messages: [{ role: 'user', content: 'secret text' }] }),
        });

        const entries = store.query().entries;
        expect(entries.map(entry => entry.event)).toEqual(['fetch.request', 'fetch.response']);
        expect(entries[0].correlation).toMatchObject({ requestId: 'gen-1', generationId: 'gen-1' });
        expect(entries[1].correlation).toMatchObject({ requestId: 'gen-2', generationId: 'gen-2' });
        expect(JSON.stringify(entries)).not.toContain('secret text');
    });

    test('error adapter classifier maps known Atria surfaces without guessing ownership', () => {
        expect(__frontendErrorAdapterTestUtils.inferModuleFromFilename('/scripts/agents/orchestrator/main.js')).toBe('orchestrator');
        expect(__frontendErrorAdapterTestUtils.inferModuleFromFilename('/scripts/agents/memory/main.js')).toBe('memory');
        expect(__frontendErrorAdapterTestUtils.inferModuleFromFilename('/scripts/extensions/third-party/demo/main.js')).toBe('extensions');
        expect(__frontendErrorAdapterTestUtils.inferModuleFromFilename('/scripts/script.js')).toBe('system');
    });
});
