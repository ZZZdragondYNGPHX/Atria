import { describe, expect, jest, test } from '@jest/globals';

import { createCommandRegistry } from '../../public/scripts/atria-shell/command-registry.js';

describe('Atria command registry', () => {
    test('registers, searches, executes and unregisters commands', async () => {
        const registry = createCommandRegistry();
        const run = jest.fn(() => 'opened');
        const dispose = registry.register({
            id: 'navigate.library',
            title: 'Go to Library',
            group: 'Navigation',
            description: 'Open Library',
            keywords: ['assets', 'worlds'],
            run,
        });

        expect(registry.size()).toBe(1);
        expect(registry.search('library').map(command => command.id)).toEqual(['navigate.library']);
        expect(registry.search('assets').map(command => command.id)).toEqual(['navigate.library']);
        await expect(registry.execute('navigate.library', { source: 'test' })).resolves.toBe('opened');
        expect(run).toHaveBeenCalledWith({ source: 'test' });

        expect(dispose()).toBe(true);
        expect(registry.size()).toBe(0);
    });

    test('filters unavailable commands without letting failed predicates break search', () => {
        const registry = createCommandRegistry();
        registry.register({
            id: 'visible',
            title: 'Visible',
            run: () => {},
        });
        registry.register({
            id: 'hidden',
            title: 'Hidden',
            when: () => false,
            run: () => {},
        });
        registry.register({
            id: 'broken',
            title: 'Broken predicate',
            when: () => { throw new Error('boom'); },
            run: () => {},
        });

        expect(registry.list().map(command => command.id)).toEqual(['visible']);
    });

    test('rejects duplicate ids and unknown execution', async () => {
        const registry = createCommandRegistry();
        registry.register({ id: 'same', title: 'Same', run: () => {} });

        expect(() => registry.register({ id: 'same', title: 'Again', run: () => {} }))
            .toThrow('already registered');
        await expect(registry.execute('missing')).rejects.toThrow('Unknown Atria command');
    });
});
