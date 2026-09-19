import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { hasCompleteWebpackOutput, migrateLegacyWebpackOutput } from '../src/middleware/webpack-serve.js';
import getPublicLibConfig, { getWebpackCacheVersion, getWebpackRootInfo, isTermuxRuntime } from '../webpack.config.js';

describe('Webpack warm-start output detection', () => {
    test('bundle cache key is stable and based on bundle inputs rather than Git HEAD', () => {
        const first = getWebpackCacheVersion();
        const second = getWebpackCacheVersion();
        expect(first).toMatch(/^[0-9a-f]{16}$/);
        expect(second).toBe(first);

        const configSource = fs.readFileSync(new URL('../webpack.config.js', import.meta.url), 'utf8');
        expect(configSource).toContain("package-lock.json");
        expect(configSource).toContain("public/lib-bundle-core.js");
        expect(configSource).toContain("public/lib-bundle-optional.js");
        expect(configSource).toContain("public/lib-bundle-codemirror.js");
        expect(configSource).not.toContain('gitRevision');
        expect(configSource).not.toContain('readLocalGitRevision');
        expect(configSource).toContain('if (cachedWebpackCacheVersion)');
        expect(configSource).toContain('cachedWebpackCacheVersion = hash.digest');
    });


    test('Termux auto-routes frontend cache to private HOME without launcher env', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-webpack-termux-'));
        const home = path.join(root, 'home');
        const dataRoot = path.join(root, 'shared-data');
        const previous = {
            home: process.env.HOME,
            prefix: process.env.PREFIX,
            cacheRoot: process.env.ATRIA_WEBPACK_CACHE_ROOT,
            dataRoot: globalThis.DATA_ROOT,
        };
        fs.mkdirSync(home, { recursive: true });
        fs.mkdirSync(dataRoot, { recursive: true });

        process.env.HOME = home;
        process.env.PREFIX = '/data/data/com.termux/files/usr';
        delete process.env.ATRIA_WEBPACK_CACHE_ROOT;
        globalThis.DATA_ROOT = dataRoot;

        try {
            expect(isTermuxRuntime()).toBe(true);
            const info = getWebpackRootInfo();
            expect(info.source).toBe('termux-private');
            expect(info.root).toBe(path.join(home, '.cache', 'atria-webpack'));

            const config = getPublicLibConfig();
            expect(config.output.path.startsWith(info.root)).toBe(true);
            expect(config.output.path).not.toContain(dataRoot);
        } finally {
            if (previous.home === undefined) delete process.env.HOME; else process.env.HOME = previous.home;
            if (previous.prefix === undefined) delete process.env.PREFIX; else process.env.PREFIX = previous.prefix;
            if (previous.cacheRoot === undefined) delete process.env.ATRIA_WEBPACK_CACHE_ROOT; else process.env.ATRIA_WEBPACK_CACHE_ROOT = previous.cacheRoot;
            globalThis.DATA_ROOT = previous.dataRoot;
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('migrates a fresh legacy shared-storage bundle into Termux private cache', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-webpack-migrate-'));
        const home = path.join(root, 'home');
        const dataRoot = path.join(root, 'shared-data');
        const previous = {
            home: process.env.HOME,
            prefix: process.env.PREFIX,
            cacheRoot: process.env.ATRIA_WEBPACK_CACHE_ROOT,
            dataRoot: globalThis.DATA_ROOT,
        };
        fs.mkdirSync(home, { recursive: true });
        fs.mkdirSync(dataRoot, { recursive: true });

        process.env.HOME = home;
        process.env.PREFIX = '/data/data/com.termux/files/usr';
        delete process.env.ATRIA_WEBPACK_CACHE_ROOT;
        globalThis.DATA_ROOT = dataRoot;

        try {
            const target = getPublicLibConfig();
            const legacyOutput = path.join(dataRoot, '_webpack', 'legacy-layout-key', 'output');
            fs.mkdirSync(legacyOutput, { recursive: true });
            for (const entryName of Object.keys(target.entry)) {
                fs.writeFileSync(path.join(legacyOutput, `${entryName}.js`), `legacy-${entryName}`);
            }

            const source = migrateLegacyWebpackOutput(target);
            expect(source).toBe(legacyOutput);
            expect(hasCompleteWebpackOutput(target)).toBe(true);
            expect(fs.readFileSync(path.join(target.output.path, 'lib.core.bundle.js'), 'utf8'))
                .toBe('legacy-lib.core.bundle');
        } finally {
            if (previous.home === undefined) delete process.env.HOME; else process.env.HOME = previous.home;
            if (previous.prefix === undefined) delete process.env.PREFIX; else process.env.PREFIX = previous.prefix;
            if (previous.cacheRoot === undefined) delete process.env.ATRIA_WEBPACK_CACHE_ROOT; else process.env.ATRIA_WEBPACK_CACHE_ROOT = previous.cacheRoot;
            globalThis.DATA_ROOT = previous.dataRoot;
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('explicit private cache root wins over external dataRoot', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-webpack-private-'));
        const previousEnv = process.env.ATRIA_WEBPACK_CACHE_ROOT;
        const previousDataRoot = globalThis.DATA_ROOT;
        process.env.ATRIA_WEBPACK_CACHE_ROOT = root;
        globalThis.DATA_ROOT = '/storage/emulated/0/Atria/data';

        try {
            const config = getPublicLibConfig();
            expect(config.output.path.startsWith(root)).toBe(true);
            expect(config.cache.cacheDirectory.startsWith(root)).toBe(true);
            expect(config.output.path).not.toContain('/storage/emulated/0/Atria/data');
        } finally {
            if (previousEnv === undefined) delete process.env.ATRIA_WEBPACK_CACHE_ROOT;
            else process.env.ATRIA_WEBPACK_CACHE_ROOT = previousEnv;
            globalThis.DATA_ROOT = previousDataRoot;
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('requires every current bundle to exist and be non-empty', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-webpack-output-'));
        const config = {
            entry: {
                'lib.core.bundle': '/dev/null',
                'lib.optional.bundle': '/dev/null',
                'codemirror.bundle': '/dev/null',
            },
            output: { path: root },
        };

        expect(hasCompleteWebpackOutput(config)).toBe(false);

        fs.writeFileSync(path.join(root, 'lib.core.bundle.js'), 'core');
        fs.writeFileSync(path.join(root, 'lib.optional.bundle.js'), 'optional');
        expect(hasCompleteWebpackOutput(config)).toBe(false);

        fs.writeFileSync(path.join(root, 'codemirror.bundle.js'), 'codemirror');
        expect(hasCompleteWebpackOutput(config)).toBe(true);

        fs.writeFileSync(path.join(root, 'codemirror.bundle.js'), '');
        expect(hasCompleteWebpackOutput(config)).toBe(false);

        fs.rmSync(root, { recursive: true, force: true });
    });

    test('fails closed when output metadata is incomplete', () => {
        expect(hasCompleteWebpackOutput({})).toBe(false);
        expect(hasCompleteWebpackOutput({ output: { path: '/tmp' }, entry: {} })).toBe(false);
    });
});
