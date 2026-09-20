import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const toolboxPath = path.join(repoRoot, 'scripts', 'termux', 'atria_toolbox.sh');
const runtimePath = path.join(repoRoot, 'scripts', 'termux', 'atria_toolbox.runtime.sh.gz');
const source = fs.readFileSync(toolboxPath, 'utf8');

function blockBetween(start, end) {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex + start.length);
    expect(startIndex).toBeGreaterThan(-1);
    expect(endIndex).toBeGreaterThan(startIndex);
    return source.slice(startIndex, endIndex);
}

describe('Termux uninstall modes', () => {
    test('generated toolbox runtime remains valid bash', () => {
        const runtime = gunzipSync(fs.readFileSync(runtimePath)).toString('utf8');
        const runtimeLines = runtime.trimEnd().split('\n');
        expect(runtimeLines.at(-1)).toBe('main_menu');

        const heredocStart = "cat >> \"$RUNTIME_FILE\" <<'ATRIA_V031_READY_FIX'\n";
        const start = source.indexOf(heredocStart);
        const end = source.indexOf('\nATRIA_V031_READY_FIX', start + heredocStart.length);
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);

        const injected = source.slice(start + heredocStart.length, end);
        const generated = runtimeLines.slice(0, -1).join('\n') + '\n' + injected + '\n';
        execFileSync('bash', ['-n'], { input: generated, stdio: ['pipe', 'pipe', 'pipe'] });
    });

    test('uninstall menu exposes the two product-level choices', () => {
        const menu = blockBetween('uninstall_menu() {', '\nmain_menu\nATRIA_V031_READY_FIX');
        expect(menu).toContain('1. 卸载当前 Atria（保留用户数据）');
        expect(menu).toContain('2. 彻底卸载 Atria');
        expect(menu).toContain('uninstall_current_keep_data');
        expect(menu).toContain('uninstall_atria_completely');
    });

    test('keep-data uninstall removes only the current program checkout', () => {
        const keep = blockBetween('uninstall_current_keep_data() {', '\nconfirm_complete_uninstall() {');
        expect(keep).toContain('stop_atria || true');
        expect(keep).toContain('rm -rf -- "$ATRIA_DIR"');
        expect(keep).toContain('用户数据已保留：$ATRIA_SHARED_DIR');
        expect(keep).not.toContain('rm -rf -- "$ATRIA_SHARED_DIR"');
        expect(keep).not.toContain('$ATRIA_MAIN_SHARED_DIR');
        expect(keep).not.toContain('$ATRIA_SECOND_SHARED_DIR');
    });

    test('complete uninstall removes both instances, shared user data and Atria-owned launch state', () => {
        const complete = blockBetween('uninstall_atria_completely() {', '\nuninstall_menu() {');
        expect(complete).toContain('stop_all_atria_instances');
        expect(complete).toContain('disable_toolbox_autostart');
        expect(complete).toContain('rm -rf -- "$ATRIA_MAIN_DIR" "$ATRIA_SECOND_DIR"');
        expect(complete).toContain('rm -rf -- "$ATRIA_MAIN_SHARED_DIR" "$ATRIA_SECOND_SHARED_DIR"');
        expect(complete).toContain('rm -rf -- "${HOME}/.local/state/atria-termux"');
        expect(complete).toContain('rm -f -- "${PREFIX}/bin/atria-termux"');
        expect(complete).toContain('rm -f -- "$TOOLBOX_PATH"');
        expect(complete).toContain('rm -rf -- "$TOOLBOX_HOME"');
    });

    test('complete uninstall is protected by owned-path guards and two confirmations', () => {
        const guard = blockBetween('atria_uninstall_assert_owned_path() {', '\natria_uninstall_default_cache_path() {');
        const confirm = blockBetween('confirm_complete_uninstall() {', '\nuninstall_atria_completely() {');

        expect(guard).toContain('"/"|"$HOME"|"$PREFIX"|"$SHARED_STORAGE_LINK"');
        expect(guard).toContain('[ "$path" = "$ATRIA_MAIN_DIR" ] || [ "$path" = "$ATRIA_SECOND_DIR" ]');
        expect(guard).toContain('[ "$path" = "$ATRIA_MAIN_SHARED_DIR" ] || [ "$path" = "$ATRIA_SECOND_SHARED_DIR" ]');
        expect(confirm).toContain("请输入 DELETE ATRIA");
        expect(confirm).toContain('[ "$input" = "DELETE ATRIA" ]');
        expect(confirm).toContain('safe_delete_confirm "最终确认：彻底卸载 Atria 并永久删除全部 Atria 用户数据"');
    });

    test('custom Webpack cache overrides are preserved instead of blindly deleted', () => {
        const complete = blockBetween('uninstall_atria_completely() {', '\nuninstall_menu() {');
        expect(complete).toContain('if [ "$WEBPACK_CACHE_ROOT" = "$default_cache" ]');
        expect(complete).toContain('检测到自定义 Webpack 缓存路径，出于安全考虑未自动删除');
    });
});
