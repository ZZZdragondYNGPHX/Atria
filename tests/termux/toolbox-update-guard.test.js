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

    test('toolbox prebuild targets the active instance data root', () => {
        const source = fs.readFileSync(toolboxPath, 'utf8');
        expect(source).toContain('data_root=$(resolve_config_data_dir');
        expect(source).toContain('npm run frontend:prebuild-cache -- --dataRoot "$data_root"');
    });

    test('already-current main still repairs a missing frontend cache', () => {
        const source = fs.readFileSync(toolboxPath, 'utf8');
        const currentBranchGuard = source.indexOf('if [ "$branch" = "main" ] && [ "$old_sha" = "$remote_sha" ]');
        const prebuildCall = source.indexOf('prebuild_frontend_cache || return 1', currentBranchGuard);
        const earlyReturn = source.indexOf('return 0', currentBranchGuard);
        expect(currentBranchGuard).toBeGreaterThan(-1);
        expect(prebuildCall).toBeGreaterThan(currentBranchGuard);
        expect(prebuildCall).toBeLessThan(earlyReturn);
    });

    test('Termux runtime keeps disposable Webpack files on private storage', () => {
        const toolboxSource = fs.readFileSync(toolboxPath, 'utf8');
        const cliSource = fs.readFileSync(termuxCliPath, 'utf8');
        const setupSource = fs.readFileSync(path.join(repoRoot, 'scripts', 'termux', 'setup.sh'), 'utf8');

        expect(toolboxSource).toContain('ATRIA_TERMUX_WEBPACK_CACHE_ROOT');
        expect(toolboxSource).toContain('ATRIA_WEBPACK_CACHE_ROOT="$WEBPACK_CACHE_ROOT" nohup node');
        expect(toolboxSource).toContain('ATRIA_WEBPACK_CACHE_ROOT="$WEBPACK_CACHE_ROOT" npm run frontend:prebuild-cache');
        expect(cliSource).toContain('ATRIA_WEBPACK_CACHE_ROOT="${WEBPACK_CACHE_ROOT}" nohup node');
        expect(setupSource).toContain('ATRIA_WEBPACK_CACHE_ROOT="${WEBPACK_CACHE_ROOT}" npm run frontend:prebuild-cache');
    });

    test('readiness probes use HEAD instead of downloading the SPA document', () => {
        const toolboxSource = fs.readFileSync(toolboxPath, 'utf8');
        const cliSource = fs.readFileSync(termuxCliPath, 'utf8');

        expect(toolboxSource).toContain('curl -fsSI --connect-timeout 1 --max-time 2');
        expect(cliSource).toContain('curl -fsSI --max-time 3');
        expect(toolboxSource).not.toContain('curl -sS -o /dev/null --connect-timeout 1 --max-time 2');
        expect(cliSource).not.toContain('curl -fsS --max-time 3 "${URL}/"');
    });

    test('warm startup readiness is detected at sub-second cadence', () => {
        const toolboxSource = fs.readFileSync(toolboxPath, 'utf8');
        const cliSource = fs.readFileSync(termuxCliPath, 'utf8');

        expect(toolboxSource).toContain('local polls_per_second=5');
        expect(toolboxSource).toContain('sleep 0.2');
        expect(cliSource).toContain('for attempt in $(seq 1 600)');
        expect(cliSource).toContain('sleep 0.2');
    });

    test('Termux launchers log readiness and browser-open boundaries', () => {
        const toolboxSource = fs.readFileSync(toolboxPath, 'utf8');
        const cliSource = fs.readFileSync(termuxCliPath, 'utf8');

        for (const source of [toolboxSource, cliSource]) {
            expect(source).toContain('[atria-termux-launch]');
            expect(source).toContain('browser-open-start');
            expect(source).toContain('browser-open-return');
            expect(source).toContain('ready-detected');
            expect(source).toContain('epoch_ms=');
        }
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
