import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const toolboxPath = path.join(repoRoot, 'scripts', 'termux', 'atria_toolbox.sh');
const termuxCliPath = path.join(repoRoot, 'scripts', 'termux', 'atria.sh');

describe('Termux update guards', () => {
    test('launchers remain valid bash', () => {
        execFileSync('bash', ['-n', toolboxPath], { stdio: 'pipe' });
        execFileSync('bash', ['-n', termuxCliPath], { stdio: 'pipe' });
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

    test('toolbox code changes warm the frontend cache after the existing repair flow', () => {
        const source = fs.readFileSync(toolboxPath, 'utf8');
        expect(source).toContain('prebuild_frontend_cache()');
        expect(source).toContain('npm run frontend:prebuild-cache');
        expect(source).toContain("declare -f post_code_change");
        expect(source).toContain('post_code_change_base "$@" || return 1');
        expect(source.indexOf('post_code_change_base "$@" || return 1'))
            .toBeLessThan(source.indexOf('prebuild_frontend_cache || return 1'));
    });

    test('direct Termux setup/update prebuild the versioned frontend cache', () => {
        const cliSource = fs.readFileSync(termuxCliPath, 'utf8');
        const setupSource = fs.readFileSync(path.join(repoRoot, 'scripts', 'termux', 'setup.sh'), 'utf8');
        expect(cliSource).toContain('npm run frontend:prebuild-cache');
        expect(setupSource).toContain('npm run frontend:prebuild-cache');
    });

    test('atria-termux updater heals only the known unstaged sentinel deletion', () => {
        const source = fs.readFileSync(termuxCliPath, 'utf8');
        expect(source).toContain('public/scripts/extensions/third-party/.gitkeep');
        expect(source).toContain('git restore --worktree -- "${restore_sentinel}"');
        expect(source.indexOf('git restore --worktree -- "${restore_sentinel}"'))
            .toBeLessThan(source.indexOf('git status --porcelain)"'));
    });
});
