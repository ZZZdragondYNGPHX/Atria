import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { hasCompleteWebpackOutput } from '../src/middleware/webpack-serve.js';

describe('Webpack warm-start output detection', () => {
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
