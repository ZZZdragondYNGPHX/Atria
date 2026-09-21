import { describe, expect, test } from '@jest/globals';

import {
    GAME_RUNTIME_VERSION,
    normalizeGamePackagePath,
    resolveGamePackageAssetUrl,
    validateGameManifest,
} from '../../public/scripts/extensions/game-runtime/manifest.js';

function minimalManifest(overrides = {}) {
    return {
        format: 'atria-game',
        manifestVersion: 1,
        id: 'demo.game',
        name: 'Demo Game',
        version: '0.1.0',
        runtime: { min: GAME_RUNTIME_VERSION },
        ...overrides,
    };
}

describe('Game Package manifest', () => {
    test('accepts a minimal package without world or logic modules', () => {
        const result = validateGameManifest(minimalManifest());
        expect(result).toEqual({
            ok: true,
            errors: [],
            manifest: {
                format: 'atria-game',
                manifestVersion: 1,
                id: 'demo.game',
                name: 'Demo Game',
                version: '0.1.0',
                runtime: { min: 1 },
                capabilities: [],
            },
        });
    });

    test('accepts current R1 optional world, logic, ui and capability metadata', () => {
        const result = validateGameManifest(minimalManifest({
            capabilities: ['chat.read', 'host.fullscreen'],
            ui: { mode: 'hybrid', entry: 'ui/game.html', surface: 'chat.header' },
            world: { schema: 'world/schema.json', initial: 'world/initial.json' },
            logic: { entry: 'scripts/main.js' },
        }));
        expect(result.ok).toBe(true);
        expect(result.manifest.ui).toEqual({
            mode: 'hybrid',
            entry: 'ui/game.html',
            surface: 'chat.header',
        });
        expect(result.manifest.world.schema).toBe('world/schema.json');
        expect(result.manifest.logic.entry).toBe('scripts/main.js');
    });

    test('defaults UI surface to app.root and rejects unknown public surfaces', () => {
        const defaulted = validateGameManifest(minimalManifest({
            ui: { mode: 'component', entry: 'ui/hud.html' },
        }));
        expect(defaulted.ok).toBe(true);
        expect(defaulted.manifest.ui.surface).toBe('app.root');

        const invalid = validateGameManifest(minimalManifest({
            ui: {
                mode: 'component',
                entry: 'ui/hud.html',
                surface: '#chat',
            },
        }));
        expect(invalid.ok).toBe(false);
        expect(invalid.errors.join('\n')).toContain('ui.surface');
    });

    test('rejects unsupported runtime versions', () => {
        const future = validateGameManifest(minimalManifest({
            runtime: { min: GAME_RUNTIME_VERSION + 1 },
        }));
        expect(future.ok).toBe(false);
        expect(future.errors.join('\n')).toContain('package requires runtime');
    });

    test('rejects hostile or ambiguous package paths', () => {
        for (const value of [
            '../secret.json',
            '/absolute/file',
            'ui/../secret.html',
            'https://example.com/game.html',
            'ui\\game.html',
            'ui//game.html',
            'ui/game.html?x=1',
        ]) {
            expect(normalizeGamePackagePath(value)).toBeNull();
        }
    });

    test('rejects unknown manifest fields and capabilities', () => {
        const result = validateGameManifest(minimalManifest({
            surprise: true,
            capabilities: ['filesystem.write'],
        }));
        expect(result.ok).toBe(false);
        expect(result.errors.join('\n')).toContain("unexpected property 'surprise'");
        expect(result.errors.join('\n')).toContain("unsupported capability 'filesystem.write'");
    });

    test('asset resolver percent-encodes segments after validating package-local path', () => {
        expect(resolveGamePackageAssetUrl('hero 01', 'assets/icon one.png'))
            .toBe('/api/card-app/hero%2001/assets/icon%20one.png');
        expect(() => resolveGamePackageAssetUrl('hero', '../escape')).toThrow();
    });
});
