import { describe, expect, jest, test } from '@jest/globals';

import { GAME_PACKAGE_STATUS, loadGamePackage } from '../../public/scripts/extensions/game-runtime/package-loader.js';

function response({ status = 200, body = null, jsonError = null } = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            if (jsonError) throw jsonError;
            return body;
        },
    };
}

const manifest = {
    format: 'atria-game',
    manifestVersion: 1,
    id: 'demo.game',
    name: 'Demo Game',
    version: '1.0.0',
    runtime: { min: 1 },
};

describe('Game Package loader', () => {
    test('treats missing game.json as no package instead of a runtime error', async () => {
        const fetchImpl = jest.fn(async () => response({ status: 404 }));
        const result = await loadGamePackage('hero', { fetchImpl });
        expect(result.status).toBe(GAME_PACKAGE_STATUS.NONE);
        expect(result.active).toBe(false);
        expect(result.errors).toEqual([]);
    });

    test('activates a validated game.json package', async () => {
        const fetchImpl = jest.fn(async () => response({ body: manifest }));
        const result = await loadGamePackage('hero', { fetchImpl, headers: { 'x-test': '1' } });

        expect(result.status).toBe(GAME_PACKAGE_STATUS.READY);
        expect(result.active).toBe(true);
        expect(result.manifest.id).toBe('demo.game');
        expect(fetchImpl).toHaveBeenCalledWith('/api/card-app/hero/game.json', {
            headers: { 'x-test': '1' },
            cache: 'no-store',
        });
    });

    test('rejects malformed JSON while preserving the host recovery shell', async () => {
        const fetchImpl = jest.fn(async () => response({ jsonError: new SyntaxError('bad json') }));
        const result = await loadGamePackage('hero', { fetchImpl });
        expect(result.status).toBe(GAME_PACKAGE_STATUS.INVALID);
        expect(result.active).toBe(false);
        expect(result.errors[0]).toContain('not valid JSON');
    });

    test('rejects a manifest that fails schema validation', async () => {
        const fetchImpl = jest.fn(async () => response({
            body: { ...manifest, ui: { mode: 'full', entry: '../escape.html' } },
        }));
        const result = await loadGamePackage('hero', { fetchImpl });
        expect(result.status).toBe(GAME_PACKAGE_STATUS.INVALID);
        expect(result.active).toBe(false);
        expect(result.errors.join('\n')).toContain('safe package-relative path');
    });

    test('reports transport failures without activating the package', async () => {
        const fetchImpl = jest.fn(async () => {
            throw new Error('offline');
        });
        const result = await loadGamePackage('hero', { fetchImpl });
        expect(result.status).toBe(GAME_PACKAGE_STATUS.ERROR);
        expect(result.active).toBe(false);
        expect(result.errors.join('\n')).toContain('offline');
    });
});
