import { describe, expect, jest, test } from '@jest/globals';
import { createLazyRouter } from '../src/middleware/lazy-router.js';

describe('createLazyRouter', () => {
    test('loads once and reuses the router for later requests', async () => {
        const handler = jest.fn(() => 'ok');
        const importer = jest.fn(async () => ({ router: handler }));
        const next = jest.fn();
        const lazy = createLazyRouter(importer);

        await lazy({ id: 1 }, { id: 'res' }, next);
        await lazy({ id: 2 }, { id: 'res' }, next);

        expect(importer).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledTimes(2);
        expect(next).not.toHaveBeenCalled();
    });

    test('clears a rejected import so a later request can retry', async () => {
        const handler = jest.fn(() => 'ok');
        const importer = jest.fn()
            .mockRejectedValueOnce(new Error('first load failed'))
            .mockResolvedValueOnce({ router: handler });
        const next = jest.fn();
        const lazy = createLazyRouter(importer);

        await lazy({}, {}, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(handler).not.toHaveBeenCalled();

        await lazy({}, {}, next);
        expect(importer).toHaveBeenCalledTimes(2);
        expect(handler).toHaveBeenCalledTimes(1);
    });

    test('rejects modules that do not expose the requested router export', async () => {
        const next = jest.fn();
        const lazy = createLazyRouter(async () => ({}));

        await lazy({}, {}, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0]).toBeInstanceOf(TypeError);
    });
});
