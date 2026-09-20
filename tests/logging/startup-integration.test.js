import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

describe('startup diagnostics integration', () => {
    test('client creates and reports a stable startup session ID', () => {
        const init = readFileSync(new URL('../../public/init.js', import.meta.url), 'utf8');
        const script = readFileSync(new URL('../../public/script.js', import.meta.url), 'utf8');
        expect(init).toContain('startupSessionId: createStartupSessionId()');
        expect(script).toContain("startupSessionId: String(startupSessionId || '')");
        expect(script).toContain('correlation: { startupSessionId:');
        expect(script).toContain('runtime: {');
    });

    test('server timing endpoint stores visible/ready reports instead of only printing JSON', () => {
        const source = readFileSync(new URL('../../src/server-main.js', import.meta.url), 'utf8');
        expect(source).toContain('normalizeStartupClientReport');
        expect(source).toContain('startupSessionStore.recordClientReport');
        expect(source).toContain("'client.visible'");
        expect(source).toContain("'client.ready'");
        expect(source).toContain("console.log(report.stage === 'visible' ? '[startup-client-visible]' : '[startup-client]'");
    });
});
