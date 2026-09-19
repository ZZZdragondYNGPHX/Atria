import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const SERVER_BOOTSTRAP_URL = new URL('../src/endpoints/bootstrap.js', import.meta.url);
const CLIENT_SCRIPT_URL = new URL('../public/script.js', import.meta.url);

describe('bootstrap version snapshot fast path', () => {
    test('server includes process version metadata in /api/bootstrap', () => {
        const source = readFileSync(SERVER_BOOTSTRAP_URL, 'utf8');
        expect(source).toContain('const versionPromise = getVersion();');
        expect(source).toContain('const version = await versionPromise;');
        expect(source).toMatch(/response\.send\(\{[\s\S]*?version,[\s\S]*?settings,/);
    });

    test('client prefers bootstrap version and keeps /version as fallback', () => {
        const source = readFileSync(CLIENT_SCRIPT_URL, 'utf8');
        expect(source).toContain('getClientVersion(snapshot?.version)');
        expect(source).toContain("fetch('/version')");
        expect(source).toContain('if (!data)');
        expect(source).toContain('await Promise.all([');
    });
});
