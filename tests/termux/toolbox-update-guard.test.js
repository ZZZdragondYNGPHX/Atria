import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const toolboxPath = path.join(repoRoot, 'scripts', 'termux', 'atria_toolbox.sh');

describe('Termux toolbox update guard', () => {
    test('launcher remains valid bash', () => {
        execFileSync('bash', ['-n', toolboxPath], { stdio: 'pipe' });
    });

    test('known restore-deleted .gitkeep is healed before dirty-worktree refusal', () => {
        const source = fs.readFileSync(toolboxPath, 'utf8');
        const healCall = source.indexOf('heal_known_restore_sentinel_dirty_state || return 1');
        const cleanGuard = source.indexOf('require_clean_worktree || return 1', healCall);
        expect(healCall).toBeGreaterThan(-1);
        expect(cleanGuard).toBeGreaterThan(healCall);
        expect(source).toContain('public/scripts/extensions/third-party/.gitkeep');
        expect(source).toContain('git -C "$ATRIA_DIR" restore --worktree -- "$sentinel"');
    });
});
