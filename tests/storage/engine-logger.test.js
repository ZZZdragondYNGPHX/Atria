import { jest } from '@jest/globals';
import { logEngineError } from '../../src/storage/engine-logger.js';
import { backendLogStore } from '../../src/logging/store.js';

describe('logEngineError', () => {
    let errSpy;
    beforeEach(() => { backendLogStore.clear(); errSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
    afterEach(() => { errSpy.mockRestore(); });

    test('writes a single line with engine, op, handle, code, message', () => {
        const err = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
        logEngineError('mysql', 'ping', 'alice', err);
        expect(errSpy).toHaveBeenCalledTimes(1);
        const rendered = errSpy.mock.calls[0].map(String).join(' ');
        expect(rendered).toMatch(/\[storage:mysql\] op=ping handle=alice err=ECONNREFUSED: connection refused/);
        expect(backendLogStore.query({ modules: ['storage'] }).entries[0]).toMatchObject({
            category: 'engine',
            event: 'engine.error',
            level: 'error',
            data: { engineKind: 'mysql', op: 'ping', handle: 'alice', code: 'ECONNREFUSED' },
        });
    });

    test('substitutes "-" when handle is null/undefined', () => {
        logEngineError('postgres', 'acquire', null, new Error('pool exhausted'));
        const rendered = errSpy.mock.calls[0].map(String).join(' ');
        expect(rendered).toMatch(/handle=- /);
    });

    test('falls back to err.name when code is missing', () => {
        const err = new Error('boom');
        err.name = 'CustomError';
        logEngineError('sqlite', 'tx', 'bob', err);
        const rendered = errSpy.mock.calls[0].map(String).join(' ');
        expect(rendered).toContain('err=CustomError');
    });

    test('appends meta object as second console.error arg when non-empty', () => {
        logEngineError('mysql', 'tx', 'alice', new Error('x'), { retries: 3 });
        expect(backendLogStore.query().entries[0].data).toMatchObject({ retries: 3 });
    });

    test('omits meta arg when empty', () => {
        logEngineError('mysql', 'tx', 'alice', new Error('x'));
        expect(backendLogStore.query().entries[0].data).not.toHaveProperty('retries');
    });
});
