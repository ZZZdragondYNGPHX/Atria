#!/data/data/com.termux/files/usr/bin/bash
# Luker Toolbox launcher - v0.3.1
# v0.3.1 修复：后台进程存活不代表 Web 服务已经监听；启动/打开网页前等待 HTTP 就绪。

set -e
set -o pipefail

SCRIPT_VERSION="v0.3.1"
RUNTIME_URL="${LUKER_TOOLBOX_RUNTIME_URL:-https://raw.githubusercontent.com/ZZZdragondYNGPHX/Luker/custom-release/scripts/termux/luker_toolbox.runtime.sh.gz}"
# v0.3.0 完整运行时；本启动器在执行前注入 v0.3.1 就绪检测修复。
RUNTIME_SHA256="${LUKER_TOOLBOX_RUNTIME_SHA256:-2ac8cd6fbab0fdf182caaa634188371e0f1f5fa3a9fe02ff89ee862070efd9b2}"
BOOT_DIR="${TMPDIR:-${PREFIX:-/data/data/com.termux/files/usr}/tmp}/luker-toolbox-$$"
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
    echo "[ERROR] 无法下载 Luker 工具箱运行时。" >&2
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

cat >> "$RUNTIME_FILE" <<'LUKER_V031_READY_FIX'

# ============================================================================
# v0.3.1 startup readiness fix
# ============================================================================
SCRIPT_VERSION="v0.3.1"
STARTUP_WAIT_SECONDS="${LUKER_STARTUP_WAIT_SECONDS:-180}"
BROWSER_WAIT_SECONDS="${LUKER_BROWSER_WAIT_SECONDS:-60}"

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

    info "等待 Luker Web 服务就绪（首次启动可能需要编译前端）..."
    while [ "$elapsed" -lt "$timeout" ]; do
        if ! kill -0 "$pid" 2>/dev/null; then
            rm -f "$PID_FILE"
            error "Luker 进程在启动阶段退出。最近日志："
            tail -n 80 "$LOG_FILE" 2>/dev/null || true
            return 1
        fi

        if server_http_ready "$port"; then
            info "Luker Web 服务已就绪（${elapsed}s）。"
            return 0
        fi

        if [ "$elapsed" -gt 0 ] && [ $((elapsed % 10)) -eq 0 ]; then
            info "仍在初始化... ${elapsed}s / ${timeout}s"
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    if kill -0 "$pid" 2>/dev/null; then
        warn "Luker 进程仍在运行，但 ${timeout}s 内 Web 端口尚未就绪。"
        warn "它可能仍在编译/迁移；可稍后查看状态或后台日志。"
        echo "--- 最近启动日志 ---"
        tail -n 40 "$LOG_FILE" 2>/dev/null || true
        echo "--------------------"
        return 2
    fi

    rm -f "$PID_FILE"
    error "Luker 进程已退出。最近日志："
    tail -n 80 "$LOG_FILE" 2>/dev/null || true
    return 1
}

start_background_process() {
    cd "$LUKER_DIR" || return 1
    mkdir -p "$TOOLBOX_HOME"
    : > "$LOG_FILE"

    nohup node "$LUKER_DIR/server.js" >>"$LOG_FILE" 2>&1 &
    local pid=$!
    local port
    port=$(get_port)
    echo "$pid" > "$PID_FILE"

    info "Luker 后台进程已启动。PID=$pid"
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

luker_status() {
    refresh_instance_storage_paths
    cleanup_stale_keepalive_flags

    echo -e "${BOLD}实例：${NC}$CURRENT_INSTANCE"
    echo "目录：$LUKER_DIR"
    echo "版本：$(current_ref_label)"
    if ! repo_ok; then
        echo -e "状态：${YELLOW}未安装${NC}"
        return 0
    fi

    local port pid pids ready=0
    port=$(get_port)
    pid=$(read_pid 2>/dev/null || true)
    pids=$(find_luker_pids)
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
        pids=$(find_luker_pids)
        if [ -z "$pid" ] && [ -z "$pids" ]; then
            error "Luker 当前未运行，无法打开网页。"
            return 1
        fi

        [ -z "$pid" ] && pid=$(echo "$pids" | head -n 1)
        warn "Luker 进程已存在，但 Web 服务尚未就绪。"
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

main_menu
LUKER_V031_READY_FIX

bash -n "$RUNTIME_FILE" || {
    echo "[ERROR] 工具箱运行时语法检查失败。" >&2
    exit 1
}
chmod +x "$RUNTIME_FILE"
exec bash "$RUNTIME_FILE" "$@"
