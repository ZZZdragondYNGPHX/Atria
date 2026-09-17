#!/data/data/com.termux/files/usr/bin/bash
# Luker Toolbox bootstrap - v0.2.1
# 运行时基于已发布的 v0.2.0 稳定脚本注入 v0.2.1 保活增强。
# 用户首次运行后，完整运行时脚本会由工具箱自身保存到 ~/luker_toolbox.sh。

set -e

BASE_COMMIT="8d3aaffb58f822536ba46bf69c1d8538cc9fb45d"
BASE_URL="${LUKER_TOOLBOX_BASE_URL:-https://raw.githubusercontent.com/ZZZdragondYNGPHX/Luker/${BASE_COMMIT}/scripts/termux/luker_toolbox.sh}"
BOOT_DIR="${TMPDIR:-${PREFIX:-/data/data/com.termux/files/usr}/tmp}/luker-toolbox-bootstrap-$$"
BASE_FILE="$BOOT_DIR/base.sh"
RUNTIME_FILE="$BOOT_DIR/luker_toolbox_runtime.sh"

cleanup_bootstrap() {
    rm -rf "$BOOT_DIR" 2>/dev/null || true
}
trap cleanup_bootstrap EXIT

mkdir -p "$BOOT_DIR"

if ! curl -fsSL "$BASE_URL" -o "$BASE_FILE"; then
    echo "[ERROR] 无法下载 Luker 工具箱基础版本。" >&2
    echo "基础地址：$BASE_URL" >&2
    exit 1
fi

if ! grep -q 'SCRIPT_VERSION="v0.2.0"' "$BASE_FILE"; then
    echo "[ERROR] 基础脚本版本校验失败，已停止运行。" >&2
    exit 1
fi

if [ "$(tail -n 1 "$BASE_FILE")" != "main_menu" ]; then
    echo "[ERROR] 基础脚本入口结构发生变化，已停止运行。" >&2
    exit 1
fi

# 去掉基础脚本最后一次 main_menu 调用，在真正进入菜单前覆盖保活相关函数。
sed '$d' "$BASE_FILE" > "$RUNTIME_FILE"

cat >> "$RUNTIME_FILE" <<'LUKER_KEEPALIVE_V021'

# ============================================================================
# v0.2.1 runtime overrides - Android 增强保活
# ============================================================================
SCRIPT_VERSION="v0.2.1"
KEEPALIVE_MAIN_FLAG="$TOOLBOX_HOME/luker.keepalive"
KEEPALIVE_SECOND_FLAG="$TOOLBOX_HOME/luker-2.keepalive"
KEEPALIVE_FLAG_FILE="$KEEPALIVE_MAIN_FLAG"
BATTERY_SETUP_FLAG="$TOOLBOX_HOME/termux-battery-setup.done"

start_background_process() {
    cd "$LUKER_DIR" || return 1
    mkdir -p "$TOOLBOX_HOME"
    : > "$LOG_FILE"

    info "后台启动 Luker..."
    nohup node "$LUKER_DIR/server.js" >>"$LOG_FILE" 2>&1 &
    local pid=$!
    echo "$pid" > "$PID_FILE"
    sleep 2

    if kill -0 "$pid" 2>/dev/null; then
        info "已启动。PID=$pid"
        info "日志：$LOG_FILE"
        info "地址：http://127.0.0.1:$(get_port)"
        return 0
    fi

    rm -f "$PID_FILE"
    error "启动失败，最近日志："
    tail -n 40 "$LOG_FILE" 2>/dev/null
    return 1
}

start_background() {
    prepare_start || return 1
    start_background_process
}

any_keepalive_enabled() {
    [ -f "$KEEPALIVE_MAIN_FLAG" ] || [ -f "$KEEPALIVE_SECOND_FLAG" ]
}

release_wake_lock_if_unused() {
    any_keepalive_enabled && return 0
    if command -v termux-wake-unlock >/dev/null 2>&1; then
        termux-wake-unlock >/dev/null 2>&1 || true
    fi
}

open_termux_battery_settings() {
    local package_name="com.termux"
    if ! command -v am >/dev/null 2>&1; then
        warn "无法调用 Android 设置，请手动把 Termux 的电池策略设为“不限制/无限制”。"
        return 1
    fi

    # 优先直接请求电池优化白名单；不同 ROM 不支持时逐级回退到应用电池页。
    am start -a android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS \
        -d "package:$package_name" >/dev/null 2>&1 && return 0
    am start -a android.settings.APP_BATTERY_SETTINGS \
        -d "package:$package_name" >/dev/null 2>&1 && return 0
    am start -a android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS \
        >/dev/null 2>&1 && return 0
    am start -a android.settings.APPLICATION_DETAILS_SETTINGS \
        -d "package:$package_name" >/dev/null 2>&1 && return 0

    warn "无法自动打开电池设置，请手动进入 Termux 应用信息 → 电池 → 不限制/无限制。"
    return 1
}

ensure_battery_whitelist_guided() {
    [ -f "$BATTERY_SETUP_FLAG" ] && return 0

    echo ""
    warn "首次使用保活模式，建议把 Termux 加入电池优化白名单。"
    info "系统会打开 Termux 的电池设置；请选择“不限制/无限制”或允许后台运行。"
    if confirm "现在打开电池设置？" y; then
        open_termux_battery_settings || true
        echo ""
        read -r -p "设置完成后回到 Termux，按回车继续..." _
        touch "$BATTERY_SETUP_FLAG"
    else
        warn "已跳过电池白名单设置；保活效果可能受系统限制。"
    fi
}

start_keepalive() {
    prepare_start || return 1
    ensure_termux_api_cli || {
        error "Wake Lock 组件不可用，无法进入保活模式。"
        return 1
    }

    info "正在获取 Wake Lock..."
    if ! termux-wake-lock >/dev/null 2>&1; then
        error "Wake Lock 获取失败。若已安装 termux-api 包，请确认 Termux:API/相关组件可正常使用。"
        return 1
    fi

    if ! start_background_process; then
        release_wake_lock_if_unused
        return 1
    fi

    touch "$KEEPALIVE_FLAG_FILE"
    info "保活模式已启用：后台运行 + Wake Lock。"
    ensure_battery_whitelist_guided
    warn "Android/OEM 仍可能在极端省电或手动清理后台时终止 Termux；建议最近任务中锁定 Termux。"
}

luker_status() {
    ensure_repo || return 1
    local port pid pids
    port=$(get_port)
    pid=$(read_pid 2>/dev/null || true)
    pids=$(find_luker_pids)

    echo -e "${BOLD}实例：${NC}$CURRENT_INSTANCE"
    echo "目录：$LUKER_DIR"
    echo "版本：$(current_ref_label)"
    echo "端口：$port"
    echo "存储：$(get_storage_mode)"
    echo "数据：$(resolve_config_data_dir 2>/dev/null || echo 未配置)"
    echo "备份：$BACKUP_DIR"

    if [ -n "$pid" ]; then
        if [ -f "$KEEPALIVE_FLAG_FILE" ]; then
            echo -e "状态：${GREEN}运行中${NC}（保活模式，后台 PID $pid）"
        else
            echo -e "状态：${GREEN}运行中${NC}（后台 PID $pid）"
        fi
    elif [ -n "$pids" ]; then
        if [ -f "$KEEPALIVE_FLAG_FILE" ]; then
            echo -e "状态：${GREEN}运行中${NC}（保活模式，PID: $(echo "$pids" | tr '\n' ' ')）"
        else
            echo -e "状态：${GREEN}运行中${NC}（PID: $(echo "$pids" | tr '\n' ' ')）"
        fi
    else
        echo -e "状态：${RED}未运行${NC}"
        [ -f "$KEEPALIVE_FLAG_FILE" ] && echo -e "保活标记：${YELLOW}存在但进程已停止${NC}"
    fi
}

stop_luker() {
    local pids
    pids=$(find_luker_pids)
    local pidfile_pid
    pidfile_pid=$(read_pid 2>/dev/null || true)
    if [ -n "$pidfile_pid" ] && ! echo "$pids" | grep -qx "$pidfile_pid"; then
        pids="$pids${pids:+$'\n'}$pidfile_pid"
    fi
    pids=$(echo "$pids" | sed '/^$/d' | sort -u)

    if [ -z "$pids" ]; then
        info "未检测到当前实例的 Luker 进程。"
        rm -f "$PID_FILE"
        if [ -f "$KEEPALIVE_FLAG_FILE" ]; then
            rm -f "$KEEPALIVE_FLAG_FILE"
            release_wake_lock_if_unused
            info "已清理当前实例的保活状态。"
        fi
        return 0
    fi

    info "正在停止 PID：$(echo "$pids" | tr '\n' ' ')"
    kill $pids 2>/dev/null || true

    local n
    for n in 1 2 3 4 5 6 7 8; do
        local alive=""
        local p
        for p in $pids; do kill -0 "$p" 2>/dev/null && alive="$alive $p"; done
        [ -z "$alive" ] && break
        sleep 1
    done

    local alive=""
    local p
    for p in $pids; do kill -0 "$p" 2>/dev/null && alive="$alive $p"; done
    if [ -n "$alive" ]; then
        warn "进程未正常退出，强制停止：$alive"
        kill -9 $alive 2>/dev/null || true
    fi

    rm -f "$PID_FILE"
    if [ -f "$KEEPALIVE_FLAG_FILE" ]; then
        rm -f "$KEEPALIVE_FLAG_FILE"
        release_wake_lock_if_unused
        info "已释放当前实例的保活状态。"
    fi
    info "Luker 已停止。"
}

restart_background() {
    local keepalive=0
    [ -f "$KEEPALIVE_FLAG_FILE" ] && keepalive=1
    stop_luker || true
    sleep 1
    if [ "$keepalive" -eq 1 ]; then
        start_keepalive
    else
        start_background
    fi
}

process_menu() {
    while true; do
        clear
        echo -e "${CYAN}========== Luker 运行管理 ==========${NC}"
        luker_status 2>/dev/null || true
        echo ""
        echo "1. 前台启动"
        echo "2. 后台启动"
        echo "3. 保活启动（后台 + Wake Lock + 电池白名单）"
        echo "4. 停止 Luker"
        echo "5. 后台重启（保持当前模式）"
        echo "6. 查看状态"
        echo "7. 查看后台日志"
        echo "8. 打开 Luker 网页"
        echo "0. 返回"
        read -r -p "请选择：" choice
        case "$choice" in
            1) start_foreground ;;
            2) start_background; pause ;;
            3) start_keepalive; pause ;;
            4) stop_luker; pause ;;
            5) restart_background; pause ;;
            6) luker_status; pause ;;
            7) show_logs ;;
            8) open_browser; pause ;;
            0) return ;;
            *) error "无效选项"; pause ;;
        esac
    done
}

keep_alive_menu() {
    while true; do
        clear
        echo -e "${CYAN}========== Android 保活 ==========${NC}"
        if [ -f "$KEEPALIVE_FLAG_FILE" ]; then
            echo -e "当前实例：${GREEN}保活模式已标记启用${NC}"
        else
            echo -e "当前实例：${YELLOW}普通模式${NC}"
        fi
        echo "1. 一键保活启动当前实例"
        echo "2. 获取 Wake Lock"
        echo "3. 释放 Wake Lock（无其他保活实例时）"
        echo "4. 打开 Termux 电池优化/后台设置"
        echo "5. 重新显示首次电池白名单引导"
        echo "6. 显示手机端保活建议"
        echo "0. 返回"
        read -r -p "请选择：" choice
        case "$choice" in
            1)
                start_keepalive
                pause
                ;;
            2)
                ensure_termux_api_cli && {
                    if termux-wake-lock >/dev/null 2>&1; then
                        info "已获取 Wake Lock。"
                    else
                        error "Wake Lock 获取失败。"
                    fi
                }
                pause
                ;;
            3)
                if any_keepalive_enabled; then
                    warn "仍有实例处于保活模式，不释放全局 Wake Lock。"
                else
                    ensure_termux_api_cli && termux-wake-unlock >/dev/null 2>&1 || true
                    info "已释放 Wake Lock。"
                fi
                pause
                ;;
            4)
                open_termux_battery_settings || true
                pause
                ;;
            5)
                rm -f "$BATTERY_SETUP_FLAG"
                ensure_battery_whitelist_guided
                pause
                ;;
            6)
                echo "- 将 Termux 电池策略设为“不限制/无限制”"
                echo "- 允许后台活动、自启动、通知"
                echo "- 最近任务中锁定 Termux"
                echo "- 使用“保活启动”可自动组合后台运行与 Wake Lock"
                echo "- Android/OEM 的强制清理仍可能终止进程，无法做到绝对不死"
                pause
                ;;
            0) return ;;
            *) error "无效选项"; pause ;;
        esac
    done
}

toggle_instance() {
    if [ "$LUKER_DIR" = "$LUKER_MAIN_DIR" ]; then
        LUKER_DIR="$LUKER_SECOND_DIR"
        CURRENT_INSTANCE="分身实例 (Luker-2)"
        PID_FILE="$TOOLBOX_HOME/luker-2.pid"
        LOG_FILE="$TOOLBOX_HOME/luker-2.log"
        KEEPALIVE_FLAG_FILE="$KEEPALIVE_SECOND_FLAG"
    else
        LUKER_DIR="$LUKER_MAIN_DIR"
        CURRENT_INSTANCE="主实例 (Luker)"
        PID_FILE="$TOOLBOX_HOME/luker.pid"
        LOG_FILE="$TOOLBOX_HOME/luker.log"
        KEEPALIVE_FLAG_FILE="$KEEPALIVE_MAIN_FLAG"
    fi
    refresh_instance_storage_paths
    info "已切换到：$CURRENT_INSTANCE"
}

main_menu
LUKER_KEEPALIVE_V021

chmod +x "$RUNTIME_FILE"
exec bash "$RUNTIME_FILE" "$@"
