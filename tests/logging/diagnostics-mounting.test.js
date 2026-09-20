import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

describe('diagnostics router integration', () => {
    test('private server mounts diagnostics API after L06 caller cutover', () => {
        const startup = readFileSync(new URL('../../src/server-startup.js', import.meta.url), 'utf8');
        const usersAdmin = readFileSync(new URL('../../src/endpoints/users-admin.js', import.meta.url), 'utf8');
        const user = readFileSync(new URL('../../public/scripts/user.js', import.meta.url), 'utf8');

        expect(startup).toContain("app.use('/api/diagnostics', diagnosticsRouter)");
        expect(usersAdmin).not.toContain("router.post('/logs/get'");
        expect(usersAdmin).not.toContain("router.post('/logs/clear'");
        expect(user).toContain("import('./logging/workspace.js')");
        expect(user).not.toContain('/api/users/logs/get');
        expect(user).not.toContain('/api/users/logs/clear');
    });
});
