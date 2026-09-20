import { describe, expect, jest, test } from '@jest/globals';

import { emitConsoleOutput, installConsoleAdapter } from '../../src/logging/console-adapter.js';
import { LogStore } from '../../src/logging/store.js';

describe('structured console compatibility', () => {
    test('structured console emission remains observable to a console spy without duplicate capture', () => {
        const store = new LogStore({ capacity: 10 });
        const sink = jest.fn();
        const fakeConsole = {
            trace: sink, debug: sink, log: sink, info: sink, warn: sink, error: sink,
        };
        installConsoleAdapter({ store, consoleObject: fakeConsole });
        const spy = jest.spyOn(fakeConsole, 'warn').mockImplementation(() => {});

        emitConsoleOutput('warn', ['compat warning', new Error('boom')], { consoleObject: fakeConsole });

        expect(spy).toHaveBeenCalledWith('compat warning', expect.any(Error));
        expect(store.size).toBe(0);
    });
});
