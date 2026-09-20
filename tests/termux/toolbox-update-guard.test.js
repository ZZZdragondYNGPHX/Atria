import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const toolboxPath = path.join(repoRoot, 'scripts', 'termux', 'atria_toolbox.sh');
const toolboxRuntimePath = path.join(repoRoot, 'scripts', 'termux', 'atria_toolbox.runtime.sh.gz');
const termuxCliPath = path.join(repoRoot, 'scripts', 'termux', 'atria.sh');

describe('Termux update guards', () => {
    test('launchers remain valid bash', () => {
        execFileSync('bash', ['-n', toolboxPath], { stdio: 'pipe' });
        execFileSync('bash', ['-n', termuxCliPath], { stdio: 'pipe' });
    });

    test('piped toolbox launch reconnects the interactive runtime to the terminal', () => {
        const source = fs.readFileSync(toolboxPath, 'utf8');

        expect(source).toContain('if [ ! -r /dev/tty ]; then');
        expect(source).toContain('exec bash "$RUNTIME_FILE" "$@" </dev/tty');
    });

    test('toolbox pins install and fetch paths to the standalone Atria repository', () => {
        const source = fs.readFileSync(toolboxPath, 'utf8');

        expect(source).toContain('CANONICAL_REPO_URL="https://github.com/ZZZdragondYNGPHX/Atria.git"');
        expect(source).toContain('LEGACY_PRODUCT_TITLE="Lu""ker"');
        expect(source).toContain('LEGACY_REPO_WEB="https://github.com/ZZZdragondYNGPHX/${LEGACY_PRODUCT_TITLE}"');
        expect(source).toContain('LEGACY_REPO_SSH="git@github.com:ZZZdragondYNGPHX/${LEGACY_PRODUCT_TITLE}.git"');
        expect(source).toContain('LEGACY_RAW_BASE="https://raw.githubusercontent.com/ZZZdragondYNGPHX/${LEGACY_PRODUCT_TITLE}"');
        expect(source).toContain('normalize_runtime_repository_urls');
        expect(source).toContain('grep -Fq "ZZZdragondYNGPHX/${LEGACY_PRODUCT_TITLE}" "$BASE_FILE"');
        expect(source).toContain('git -C "$ATRIA_DIR" remote set-url origin "$CANONICAL_REPO_URL"');
        expect(source).toContain('git -C "$ATRIA_DIR" remote add origin "$CANONICAL_REPO_URL"');
        expect(source).toContain('ensure_atria_origin || return 1');
        expect(source).toContain('fetch_repo_refs_base "$@"');
    });

    test('compressed toolbox runtime already clones the standalone Atria repository', () => {
        const runtime = gunzipSync(fs.readFileSync(toolboxRuntimePath)).toString('utf8');

        expect(runtime).toContain('REPO_URL="https://github.com/ZZZdragondYNGPHX/Atria.git"');
        expect(runtime).toContain('SCRIPT_URL="${ATRIA_TOOLBOX_URL:-https://raw.githubusercontent.com/ZZZdragondYNGPHX/Atria/main/scripts/termux/atria_toolbox.sh}"');
        const legacyTitle = 'Lu' + 'ker';
        expect(runtime).not.toContain(`https://github.com/ZZZdragondYNGPHX/${legacyTitle}.git`);
    });

    test('toolbox preserves old history before aligning a pre-cutover checkout', () => {
        const source = fs.readFileSync(toolboxPath, 'utf8');

        expect(source).toContain('HISTORY_CUTOVER_LEGACY_ANCHOR="91ae97aed557be9439317a67d0ec516f7512fe2e"');
        expect(source).toContain('history_cutover_required "$old_sha" "$remote_sha"');
        expect(source).toContain('backup_branch="history-cutover-backup-$stamp"');
        expect(source).toContain('git -C "$ATRIA_DIR" branch "$backup_branch" "$old_sha"');
        expect(source).toContain('git -C "$ATRIA_DIR" switch -C main origin/main');
    });

    test('direct atria-termux updater repairs origin and handles the same history cutover', () => {
        const source = fs.readFileSync(termuxCliPath, 'utf8');

        expect(source).toContain('CANONICAL_REPO_URL="https://github.com/ZZZdragondYNGPHX/Atria.git"');
        expect(source).toContain('git -C "${REPO_ROOT}" remote set-url origin "${CANONICAL_REPO_URL}"');
        expect(source).toContain('ensure_canonical_origin');
        expect(source).toContain('history_cutover_required "${old_sha}" "${remote_sha}"');
        expect(source).toContain('backup_branch="history-cutover-backup-${stamp}"');
        expect(source).toContain('git -C "${REPO_ROOT}" switch -C main origin/main');
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
            expect(source).toContain('/api/startup/launcher-event?event=');
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
