import { describe, expect, jest, test } from '@jest/globals';

import { installConsoleAdapter } from '../../src/logging/console-adapter.js';
import { LogStore } from '../../src/logging/store.js';

describe('backend logging consolidation', () => {
    test('console adapter is idempotent and writes one canonical entry', () => {
        const store = new LogStore({ capacity: 10 });
        const output = jest.fn();
        const fakeConsole = {
            trace: output,
            debug: output,
            log: output,
            info: output,
            warn: output,
            error: output,
        };

        installConsoleAdapter({ store, consoleObject: fakeConsole });
        const wrapped = fakeConsole.log;
        installConsoleAdapter({ store, consoleObject: fakeConsole });

        expect(fakeConsole.log).toBe(wrapped);
        fakeConsole.log('[startup] hello', { ok: true });

        expect(store.size).toBe(1);
        expect(store.query().entries[0]).toMatchObject({
            side: 'backend',
            source: 'console',
            module: 'startup',
            event: 'console.log',
        });
        expect(output).toHaveBeenCalledTimes(1);
    });

});
