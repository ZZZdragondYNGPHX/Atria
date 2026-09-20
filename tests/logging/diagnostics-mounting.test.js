import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

describe('diagnostics router integration', () => {
    test('private server mounts diagnostics API without deleting legacy viewer routes before L06 switches callers', () => {
        const startup = readFileSync(new URL('../../src/server-startup.js', import.meta.url), 'utf8');
        const usersAdmin = readFileSync(new URL('../../src/endpoints/users-admin.js', import.meta.url), 'utf8');
        expect(startup).toContain("app.use('/api/diagnostics', diagnosticsRouter)");
        expect(usersAdmin).toContain("router.post('/logs/get'");
        expect(usersAdmin).toContain("router.post('/logs/clear'");
    });
});
