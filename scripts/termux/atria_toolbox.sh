#!/data/data/com.termux/files/usr/bin/bash
# Atria Toolbox launcher - v0.3.3
# v0.3.3：自动修复完整恢复误删的 third-party/.gitkeep，再执行工作区清洁校验。
# v0.3.2：Termux 日常安装/更新统一跟随 Atria main；保留 Tag/Commit 调试入口。
# v0.3.1 修复：后台进程存活不代表 Web 服务已经监听；启动/打开网页前等待 HTTP 就绪。

set -e
set -o pipefail

SCRIPT_VERSION="v0.3.3"
RUNTIME_URL="${ATRIA_TOOLBOX_RUNTIME_URL:-https://raw.githubusercontent.com/ZZZdragondYNGPHX/Atria/main/scripts/termux/atria_toolbox.runtime.sh.gz}"
# v0.3.0 完整运行时；本启动器在执行前注入 v0.3.1 就绪检测与 v0.3.2 main 分支策略。
RUNTIME_SHA256="${ATRIA_TOOLBOX_RUNTIME_SHA256:-286140c2c810618fa1a00a5a24e5447e0cf06e37b4f878fcf6eddc90955b2965}"
BOOT_DIR="${TMPDIR:-${PREFIX:-/data/data/com.termux/files/usr}/tmp}/atria-toolbox-$$"
GZ_FILE="$BOOT_DIR/runtime.sh.gz"
BASE_FILE="$BOOT_DIR/runtime.base.sh"
RUNTIME_FILE="$BOOT_DIR/runtime.sh"

cleanup() {
    rm -rf "$BOOT_DIR" 2>/dev/null || true
}
trap cleanup EXIT

command -v curl >/dev/null 2>&1 || {
    echo "[ERROR] 缺少 curl。请先执行：pkg install curl" >&2
    exit 1
}

if ! command -v gzip >/dev/null 2>&1; then
    if command -v pkg >/dev/null 2>&1; then
        echo "[INFO] 正在安装 gzip..."
        pkg install gzip -y || exit 1
    else
        echo "[ERROR] 缺少 gzip，且无法自动安装。" >&2
        exit 1
    fi
fi

mkdir -p "$BOOT_DIR"
curl -fsSL "$RUNTIME_URL" -o "$GZ_FILE" || {
    echo "[ERROR] 无法下载 Atria 工具箱运行时。" >&2
    exit 1
}

if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$GZ_FILE" | awk '{print $1}')
    if [ "$actual" != "$RUNTIME_SHA256" ]; then
        echo "[ERROR] 工具箱运行时校验失败，已停止执行。" >&2
        echo "expected: $RUNTIME_SHA256" >&2
        echo "actual:   $actual" >&2
        exit 1
    fi
fi

gzip -dc "$GZ_FILE" > "$BASE_FILE" || {
    echo "[ERROR] 无法解压工具箱运行时。" >&2
    exit 1
}

# v0.3.0 运行时最后一行是 main_menu。先移除入口，再覆盖需要修复的函数。
if [ "$(tail -n 1 "$BASE_FILE")" != "main_menu" ]; then
    echo "[ERROR] 工具箱运行时入口结构发生变化，已停止执行。" >&2
    exit 1
fi
sed '$d' "$BASE_FILE" > "$RUNTIME_FILE"

cat >> "$RUNTIME_FILE" <<'ATRIA_V031_READY_FIX'

# ============================================================================
# v0.3.1 startup readiness fix
# ============================================================================
SCRIPT_VERSION="v0.3.1"
STARTUP_WAIT_SECONDS="${ATRIA_STARTUP_WAIT_SECONDS:-180}"
BROWSER_WAIT_SECONDS="${ATRIA_BROWSER_WAIT_SECONDS:-60}"

server_http_ready() {
    local port="${1:-$(get_port)}"
    command -v curl >/dev/null 2>&1 || return 1
    curl -sS -o /dev/null --connect-timeout 1 --max-time 2 "http://127.0.0.1:${port}/" >/dev/null 2>&1
}

wait_for_server_ready() {
    local pid="$1"
    local timeout="${2:-$STARTUP_WAIT_SECONDS}"
    local port="${3:-$(get_port)}"
    local elapsed=0

    [[ "$timeout" =~ ^[0-9]+$ ]] || timeout=180
    [ "$timeout" -gt 0 ] 2>/dev/null || timeout=180

    info "等待 Atria Web 服务就绪（首次启动可能需要编译前端）..."
    while [ "$elapsed" -lt "$timeout" ]; do
        if ! kill -0 "$pid" 2>/dev/null; then
            rm -f "$PID_FILE"
            error "Atria 进程在启动阶段退出。最近日志："
            tail -n 80 "$LOG_FILE" 2>/dev/null || true
            return 1
        fi

        if server_http_ready "$port"; then
            info "Atria Web 服务已就绪（${elapsed}s）。"
            return 0
        fi

        if [ "$elapsed" -gt 0 ] && [ $((elapsed % 10)) -eq 0 ]; then
            info "仍在初始化... ${elapsed}s / ${timeout}s"
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    if kill -0 "$pid" 2>/dev/null; then
        warn "Atria 进程仍在运行，但 ${timeout}s 内 Web 端口尚未就绪。"
        warn "它可能仍在编译/迁移；可稍后查看状态或后台日志。"
        echo "--- 最近启动日志 ---"
        tail -n 40 "$LOG_FILE" 2>/dev/null || true
        echo "--------------------"
        return 2
    fi

    rm -f "$PID_FILE"
    error "Atria 进程已退出。最近日志："
    tail -n 80 "$LOG_FILE" 2>/dev/null || true
    return 1
}

start_background_process() {
    cd "$ATRIA_DIR" || return 1
    mkdir -p "$TOOLBOX_HOME"
    : > "$LOG_FILE"

    nohup node "$ATRIA_DIR/server.js" >>"$LOG_FILE" 2>&1 &
    local pid=$!
    local port
    port=$(get_port)
    echo "$pid" > "$PID_FILE"

    info "Atria 后台进程已启动。PID=$pid"
    info "日志：$LOG_FILE"

    wait_for_server_ready "$pid" "$STARTUP_WAIT_SECONDS" "$port"
    local ready_rc=$?
    case "$ready_rc" in
        0)
            info "地址：http://127.0.0.1:$port"
            return 0
            ;;
        2)
            # 进程仍存活，只是服务还没监听；保持后台进程，状态页显示“启动中”。
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

atria_status() {
    refresh_instance_storage_paths
    cleanup_stale_keepalive_flags

    echo -e "${BOLD}实例：${NC}$CURRENT_INSTANCE"
    echo "目录：$ATRIA_DIR"
    echo "版本：$(current_ref_label)"
    if ! repo_ok; then
        echo -e "状态：${YELLOW}未安装${NC}"
        return 0
    fi

    local port pid pids ready=0
    port=$(get_port)
    pid=$(read_pid 2>/dev/null || true)
    pids=$(find_atria_pids)
    echo "端口：$port"
    echo "存储：$(get_storage_mode)"
    echo "数据：$(resolve_config_data_dir 2>/dev/null || echo 未配置)"
    echo "备份：$BACKUP_DIR"

    server_http_ready "$port" && ready=1

    if [ -n "$pid" ]; then
        if [ "$ready" -eq 0 ]; then
            if [ -f "$KEEPALIVE_FLAG_FILE" ]; then
                echo -e "状态：${YELLOW}启动中${NC}（保活后台，PID $pid；端口 $port 尚未就绪）"
            else
                echo -e "状态：${YELLOW}启动中${NC}（后台 PID $pid；端口 $port 尚未就绪）"
            fi
        elif [ -f "$KEEPALIVE_FLAG_FILE" ]; then
            echo -e "状态：${GREEN}运行中${NC}（保活后台，PID $pid）"
        else
            echo -e "状态：${GREEN}运行中${NC}（普通后台，PID $pid）"
        fi
    elif [ -n "$pids" ]; then
        if [ "$ready" -eq 0 ]; then
            echo -e "状态：${YELLOW}进程存在但服务未就绪${NC}（PID: $(echo "$pids" | tr '\n' ' ')）"
        elif [ -f "$KEEPALIVE_FLAG_FILE" ]; then
            echo -e "状态：${GREEN}运行中${NC}（保活模式，PID: $(echo "$pids" | tr '\n' ' ')）"
        else
            echo -e "状态：${GREEN}运行中${NC}（前台/外部进程，PID: $(echo "$pids" | tr '\n' ' ')）"
        fi
    else
        echo -e "状态：${RED}未运行${NC}"
    fi
}

open_browser() {
    local port url pid pids
    port=$(get_port)
    url="http://127.0.0.1:$port"

    if ! server_http_ready "$port"; then
        pid=$(read_pid 2>/dev/null || true)
        pids=$(find_atria_pids)
        if [ -z "$pid" ] && [ -z "$pids" ]; then
            error "Atria 当前未运行，无法打开网页。"
            return 1
        fi

        [ -z "$pid" ] && pid=$(echo "$pids" | head -n 1)
        warn "Atria 进程已存在，但 Web 服务尚未就绪。"
        info "先等待服务完成初始化，再打开浏览器。"
        wait_for_server_ready "$pid" "$BROWSER_WAIT_SECONDS" "$port" || {
            error "服务仍未就绪，已取消打开浏览器。请查看“后台日志”。"
            return 1
        }
    fi

    info "打开：$url"
    if command -v termux-open-url >/dev/null 2>&1; then
        termux-open-url "$url"
    elif command -v am >/dev/null 2>&1; then
        am start -a android.intent.action.VIEW -d "$url" >/dev/null 2>&1 || true
    else
        echo "$url"
    fi
}


# ============================================================================
# v0.3.2 main-branch policy
# ============================================================================
SCRIPT_VERSION="v0.3.3"
DEFAULT_BRANCH="main"
SCRIPT_URL="${ATRIA_TOOLBOX_URL:-https://raw.githubusercontent.com/ZZZdragondYNGPHX/Atria/main/scripts/termux/atria_toolbox.sh}"

heal_known_restore_sentinel_dirty_state() {
    local sentinel="public/scripts/extensions/third-party/.gitkeep"
    local status
    status=$(git -C "$ATRIA_DIR" status --porcelain -- "$sentinel" 2>/dev/null || true)

    # A buggy full-restore path could delete this tracked empty-directory
    # sentinel before the archive finished. It contains no user data, so it is
    # safe to restore automatically before the normal dirty-worktree guard.
    if [ "$status" = " D $sentinel" ]; then
        if git -C "$ATRIA_DIR" cat-file -e "HEAD:$sentinel" 2>/dev/null; then
            git -C "$ATRIA_DIR" restore --worktree -- "$sentinel" || return 1
            info "已自动恢复仓库占位文件：$sentinel"
        fi
    fi
}

update_main_branch() {
    ensure_repo || return 1
    heal_known_restore_sentinel_dirty_state || return 1
    require_clean_worktree || return 1

    local branch old_sha remote_sha running
    branch=$(git -C "$ATRIA_DIR" symbolic-ref --short -q HEAD 2>/dev/null || true)

    fetch_repo_refs || return 1
    if ! git -C "$ATRIA_DIR" show-ref --verify --quiet "refs/remotes/origin/main"; then
        error "远程 main 分支不存在。"
        return 1
    fi

    old_sha=$(git -C "$ATRIA_DIR" rev-parse HEAD)
    remote_sha=$(git -C "$ATRIA_DIR" rev-parse "origin/main")
    if [ "$branch" = "main" ] && [ "$old_sha" = "$remote_sha" ]; then
        info "main 已经是最新：main @ ${old_sha:0:10}"
        return 0
    fi

    running=$(find_atria_pids 2>/dev/null || true)
    if [ -n "$running" ]; then
        confirm "切换/更新到 main 前停止正在运行的 Atria？" y || return 1
        stop_atria || return 1
    fi
    if confirm "切换/更新到 main 前创建数据备份？" y; then
        backup_data || { error "备份失败，操作已停止。"; return 1; }
    fi

    switch_to_remote_branch "main" || return 1
    post_code_change
}

update_current_branch() {
    update_main_branch
}

switch_branch_interactive() {
    info "Atria Termux 日常分支固定为 main。"
    update_main_branch
}

version_menu() {
    while true; do
        clear
        echo -e "${CYAN}========== Atria 版本管理 ==========${NC}"
        echo "当前：$(current_ref_label)"
        echo ""
        echo "1. 更新 / 切换到 main"
        echo "2. 切换到 Tag"
        echo "3. 切换到 Commit"
        echo "4. 查看最近提交"
        echo "0. 返回"
        read -r -p "请选择：" choice
        case "$choice" in
            1) update_main_branch; pause ;;
            2) switch_tag_interactive; pause ;;
            3) switch_commit_interactive; pause ;;
            4) show_recent_commits; pause ;;
            0) return ;;
            *) error "无效选项"; pause ;;
        esac
    done
}

main_menu
ATRIA_V031_READY_FIX

bash -n "$RUNTIME_FILE" || {
    echo "[ERROR] 工具箱运行时语法检查失败。" >&2
    exit 1
}
chmod +x "$RUNTIME_FILE"
exec bash "$RUNTIME_FILE" "$@"
