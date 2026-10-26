#!/usr/bin/env bash
# One readable implementation for the Termux menu and CLI.
set -o pipefail
umask 077
SCRIPT_VERSION="v0.4.0"
REPO_URL="https://github.com/ZZZdragondYNGPHX/Atria.git"
SCRIPT_URL="${ATRIA_TOOLBOX_URL:-https://raw.githubusercontent.com/ZZZdragondYNGPHX/Atria/main/scripts/termux/atria_toolbox.sh}"
SELF="${BASH_SOURCE[0]:-}"
[[ -z "$SELF" || ! -f "$SELF" ]] || SELF=$(realpath "$SELF")
cd -- "$HOME" || exit 1
APP="${ATRIA_TERMUX_ROOT:-$HOME/Atria}"
STATE="${ATRIA_TERMUX_STATE_DIR:-$HOME/.atria_toolbox}"
PRIVATE_DATA="${XDG_DATA_HOME:-$HOME/.local/share}/atria/data"
BACKUPS="${ATRIA_TERMUX_BACKUP_DIR:-$HOME/storage/shared/Atria/backups}"
CACHE="${ATRIA_TERMUX_WEBPACK_CACHE_ROOT:-$HOME/.cache/atria-webpack}"
PID_FILE="$STATE/atria.pid"
LOG_FILE="$STATE/atria.log"
WAKE_FILE="$STATE/atria.keepalive"
SAVED_SCRIPT="$STATE/atria_toolbox.sh"
PORT=8000
DATA_ROOT=''
STORAGE_MODE=''

info() { printf '[INFO] %s\n' "$*"; }
error() { printf '[ERROR] %s\n' "$*" >&2; return 1; }
confirm() {
    local answer
    read -r -p "$1 [y/N] " answer || return 1
    [[ "$answer" == y || "$answer" == Y ]]
}
pause() { read -r -p '按回车键返回…' _ || return 0; }
require_repo() {
    [[ -f "$APP/server.js" && -f "$APP/package.json" ]] || { error '尚未安装 Atria，请先安装。'; return 1; }
}
runtime() { node "$APP/scripts/termux/runtime-tools.js" "$1" "$APP" "${@:2}"; }

read_settings() {
    require_repo || return 1
    [[ -f "$APP/scripts/termux/runtime-tools.js" ]] || { error '主程序需要更新，请选择“更新 Atria”。'; return 1; }
    local values fields=()
    values=$(runtime paths) || return 1
    mapfile -t fields <<< "$values"
    DATA_ROOT="${fields[0]}" PORT="${fields[1]}" STORAGE_MODE="${fields[2]}"
    PLUGINS="${fields[3]}" EXTENSIONS="${fields[4]}"
    URL="http://127.0.0.1:$PORT"
}

ensure_tools() {
    command -v pkg >/dev/null && [[ "${PREFIX:-}" == *com.termux* ]] || { error '安装/修复须在 Android Termux 内执行。'; return 1; }
    local packages=() executable package
    for package in git:git curl:curl tar:tar python:python flock:util-linux pgrep:procps; do
        executable="${package%%:*}"
        command -v "$executable" >/dev/null || packages+=("${package#*:}")
    done
    command -v node >/dev/null || packages+=(nodejs-lts)
    command -v npm >/dev/null || packages+=(npm)
    if (( ${#packages[@]} )); then
        info "安装缺少的环境：${packages[*]}"
        pkg install -y "${packages[@]}" || return 1
    fi
}

save_entrypoints() {
    local source="${1:-$SELF}" temporary
    [[ -f "$source" ]] || return 1
    mkdir -p "$STATE" || return 1
    temporary=$(mktemp "$STATE/toolbox.XXXXXX") || return 1
    cp -- "$source" "$temporary" && bash -n "$temporary" && mv -f -- "$temporary" "$SAVED_SCRIPT" || {
        rm -f -- "$temporary"; return 1;
    }
    {
        printf '#!/usr/bin/env bash\n'
        printf 'if [[ -z ${ATRIA_TERMUX_ROOT:-} ]]; then export ATRIA_TERMUX_ROOT=%q; fi\n' "$APP"
        printf 'if [[ -z ${ATRIA_TERMUX_STATE_DIR:-} ]]; then export ATRIA_TERMUX_STATE_DIR=%q; fi\n' "$STATE"
        printf 'exec bash %q "$@"\n' "$SAVED_SCRIPT"
    } > "$HOME/atria_toolbox.sh" || return 1
    chmod +x "$HOME/atria_toolbox.sh"
    if [[ -n "${PREFIX:-}" && -d "$PREFIX/bin" ]]; then
        { printf '#!%s/bin/bash\n' "$PREFIX"; tail -n +2 "$HOME/atria_toolbox.sh"; } > "$PREFIX/bin/atria-termux" || return 1
        chmod +x "$PREFIX/bin/atria-termux"
    fi
}

with_lock() {
    command -v flock >/dev/null || { error '缺少 flock；请执行 pkg install util-linux 或运行 setup。'; return 1; }
    (
        flock -n 9 || { error '另一项 Atria 操作正在进行，请等它完成。'; exit 1; }
        "$@"
    ) 9>"$STATE/operation.lock"
}

process_matches() {
    local pid="$1" executable cwd argv=()
    [[ "$pid" =~ ^[0-9]+$ && -r "/proc/$pid/cmdline" ]] || return 1
    kill -0 "$pid" 2>/dev/null || return 1
    mapfile -d '' -t argv < "/proc/$pid/cmdline" 2>/dev/null || return 1
    executable="${argv[0]##*/}"
    [[ "$executable" == node || "$executable" == nodejs ]] || return 1
    [[ "${argv[1]:-}" == "$APP/server.js" ]] && return 0
    [[ "${argv[1]:-}" == server.js ]] || return 1
    cwd=$(readlink -f "/proc/$pid/cwd" 2>/dev/null) || return 1
    [[ "$cwd" == "$APP" ]]
}

owned_pids() {
    local pid file candidates=()
    for file in "$PID_FILE" "$HOME/.local/state/atria-termux/server.pid"; do
        [[ -f "$file" ]] && candidates+=("$(cat "$file")")
    done
    while IFS= read -r pid; do candidates+=("$pid"); done < <(pgrep -f 'node.*server\.js' 2>/dev/null || true)
    for pid in "${candidates[@]}"; do process_matches "$pid" && printf '%s\n' "$pid"; done | sort -un
}

release_wake() {
    if [[ -f "$WAKE_FILE" ]]; then
        command -v termux-wake-unlock >/dev/null && termux-wake-unlock || true
        rm -f -- "$WAKE_FILE"
    fi
}

stop_server() {
    local pids pid started=$SECONDS force="${1:-}"
    pids=$(owned_pids)
    if [[ -z "$pids" ]]; then
        rm -f -- "$PID_FILE" "$STATE/ready"
        release_wake
        info 'Atria 已停止。'
        return 0
    fi
    info '正在保存并停止 Atria…'
    for pid in $pids; do process_matches "$pid" && kill -TERM "$pid"; done
    while (( SECONDS - started < 30 )); do
        [[ -z "$(owned_pids)" ]] && break
        sleep 0.2
    done
    pids=$(owned_pids)
    if [[ -n "$pids" ]]; then
        [[ "$force" == --force ]] || { error '30 秒内未正常退出，后续操作已取消；查看日志后可显式执行 stop --force。'; return 1; }
        for pid in $pids; do process_matches "$pid" && kill -KILL "$pid"; done
        sleep 0.2
        [[ -z "$(owned_pids)" ]] || { error '进程仍存在，已停止后续操作。'; return 1; }
    fi
    rm -f -- "$PID_FILE" "$STATE/ready"
    release_wake
    info 'Atria 已停止。'
}

http_ready() { curl -fsSI --connect-timeout 0.3 --max-time 1 "$URL/" >/dev/null 2>&1; }

open_browser() {
    read_settings || return 1
    http_ready || { error 'HTTP 尚未就绪，请先启动或查看日志。'; return 1; }
    if command -v termux-open-url >/dev/null; then termux-open-url "$URL";
    elif command -v am >/dev/null; then am start -a android.intent.action.VIEW -d "$URL" >/dev/null;
    else info "请在浏览器打开 $URL"; fi
}

wait_ready() {
    local pid="$1" started=$SECONDS next=10 state timeout="${ATRIA_STARTUP_WAIT_SECONDS:-180}"
    [[ "$timeout" =~ ^[1-9][0-9]*$ ]] || timeout=180
    while (( SECONDS - started < timeout )); do
        # This is our freshly spawned child; it may not have exec'd node yet.
        if ! kill -0 "$pid" 2>/dev/null; then
            release_wake
            error '服务在启动阶段退出。最近日志：'
            tail -n 50 "$LOG_FILE"
            return 1
        fi
        if http_ready; then
            state=$(runtime probe "$URL") || { error "HTTP 已响应，但应用检查失败。日志：$LOG_FILE"; return 1; }
            printf '%s:%s\n' "$pid" "$state" > "$STATE/ready"
            if [[ "$state" == login-required ]]; then info 'HTTP 已就绪，请在浏览器登录；尚未验证账号内页面。';
            else info '服务、存储和页面初始化均已就绪。'; fi
            info "等待耗时 $((SECONDS - started))s；地址：$URL"
            return 0
        fi
        if (( SECONDS - started >= next )); then
            info "正在启动… $((SECONDS - started))s / ${timeout}s"
            next=$((SECONDS - started + 10))
        fi
        sleep 0.2
    done
    error "启动等待超时，进程仍保留供诊断。请查看 $LOG_FILE"
}

start_server() {
    local mode="${1:-start}" wake="${ATRIA_TERMUX_WAKE_LOCK:-1}" pid
    read_settings || return 1
    if [[ -n "$(owned_pids)" ]]; then info '当前实例已有进程；请使用 status、logs 或 restart。'; return 0; fi
    http_ready && { error "端口 $PORT 已有其他 HTTP 服务，未启动新进程。"; return 1; }
    runtime node || return 1
    bash "$APP/scripts/termux/fix-native.sh" check || return 1
    [[ "$mode" == normal || "$mode" == foreground ]] && wake=0
    mkdir -p "$CACHE" || return 1
    if [[ "$wake" == 1 ]]; then
        command -v termux-wake-lock >/dev/null || { error '缺少 termux-wake-lock；请安装 termux-tools 或选择普通启动。'; return 1; }
        termux-wake-lock || return 1
        touch "$WAKE_FILE"
    fi
    : > "$LOG_FILE"
    rm -f -- "$STATE/ready"
    (
        cd -- "$APP" || exit 1
        export NODE_ENV=production
        export NODE_COMPILE_CACHE="${NODE_COMPILE_CACHE:-$APP/node_modules/.cache/atria-node}"
        export ATRIA_WEBPACK_CACHE_ROOT="$CACHE"
        exec nohup node "$APP/server.js" --dataRoot "$DATA_ROOT" --port "$PORT" \
            --listen false --enableIPv4 true --enableIPv6 false --browserLaunchEnabled false
    ) >> "$LOG_FILE" 2>&1 < /dev/null 9>&- &
    pid=$!
    printf '%s\n' "$pid" > "$PID_FILE"
    info "进程 PID=$pid；日志：$LOG_FILE"
    if [[ "$mode" == foreground ]]; then
        info '调试模式：输出日志，Ctrl+C 停止服务。'
        trap 'stop_server; exit 130' INT TERM
        tail --pid="$pid" -n +1 -f "$LOG_FILE" 9>&-
        wait "$pid"
        local result=$?
        trap - INT TERM
        return "$result"
    fi
    wait_ready "$pid" || return 1
    [[ "${ATRIA_TERMUX_OPEN_BROWSER:-1}" == 0 ]] || open_browser
}

restart_server() {
    local wake=0
    [[ -f "$WAKE_FILE" ]] && wake=1
    stop_server || return 1
    ATRIA_TERMUX_WAKE_LOCK="$wake" start_server
}

prepare_runtime() {
    require_repo || return 1
    runtime node || return 1
    local stamp installed=''
    stamp=$(runtime fingerprint) || return 1
    [[ -f "$STATE/prepared" ]] && installed=$(cat "$STATE/prepared")
    if [[ "${1:-}" == --force || ! -d "$APP/node_modules" || "$stamp" != "$installed" ]]; then
        info '按锁文件安装生产依赖…'
        (cd "$APP" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund) || return 1
    fi
    runtime init "$PRIVATE_DATA" || return 1
    read_settings || return 1
    mkdir -p "$DATA_ROOT" "$CACHE" || return 1
    bash "$APP/scripts/termux/fix-native.sh" || return 1
    info '准备前端缓存…'
    (cd "$APP" && ATRIA_WEBPACK_CACHE_ROOT="$CACHE" node scripts/prebuild-frontend-cache.js --dataRoot "$DATA_ROOT") || return 1
    save_entrypoints "$APP/scripts/termux/atria_toolbox.sh" || return 1
    printf '%s\n' "$stamp" > "$STATE/prepared"
    info "准备完成。数据目录：$DATA_ROOT"
}

setup_existing() { stop_server && prepare_runtime "${1:-}"; }

install_atria() {
    if [[ -e "$APP" ]]; then error '程序目录已存在，未覆盖。已有安装请使用 update 或 repair。'; return 1; fi
    local stage="${APP}.install-$$"
    [[ ! -e "$stage" ]] || return 1
    info '下载 main 最新版本，不下载其他分支及完整历史…'
    if ! git clone --depth 1 --single-branch --no-tags --branch main "$REPO_URL" "$stage"; then
        error "下载失败，临时目录保留供检查：$stage"; return 1
    fi
    mv -- "$stage" "$APP" || return 1
    prepare_runtime
}

update_atria() {
    require_repo || return 1
    [[ -z "$(git -C "$APP" status --porcelain)" ]] || { error '工作区有修改，更新已停止，不覆盖本地文件。'; return 1; }
    local branch old new running=0 wake=0
    branch=$(git -C "$APP" branch --show-current)
    [[ "$branch" == main ]] || { error '当前不在 main；请先自行保存开发改动并切回 main。'; return 1; }
    git -C "$APP" remote set-url origin "$REPO_URL" || return 1
    git -C "$APP" fetch --no-tags origin '+refs/heads/main:refs/remotes/origin/main' || return 1
    old=$(git -C "$APP" rev-parse HEAD) new=$(git -C "$APP" rev-parse origin/main)
    git -C "$APP" merge-base --is-ancestor "$old" "$new" || { error '本地历史已分叉，未重置或覆盖。'; return 1; }
    [[ -n "$(owned_pids)" ]] && running=1
    [[ -f "$WAKE_FILE" ]] && wake=1
    stop_server || return 1
    git -C "$APP" merge --ff-only origin/main || return 1
    # Preparation comes from the updated checkout, not an old menu in memory.
    ATRIA_TERMUX_PREPARING=1 bash "$APP/scripts/termux/atria_toolbox.sh" prepare || return 1
    info "当前 main @ $(git -C "$APP" rev-parse --short HEAD)"
    if (( running )); then ATRIA_TERMUX_WAKE_LOCK="$wake" start_server; fi
}

ensure_backups() {
    if [[ "$BACKUPS" == "$HOME/storage/shared/"* && ! -d "$HOME/storage/shared" ]]; then
        error '共享存储未授权。先执行 termux-setup-storage，或设置 ATRIA_TERMUX_BACKUP_DIR。'; return 1
    fi
    mkdir -p "$BACKUPS"
}

archive_action() {
    local action="$1" file="$2" snapshot result
    snapshot=$(mktemp "$STATE/paths.XXXXXX") || return 1
    runtime snapshot > "$snapshot" || { rm -f "$snapshot"; return 1; }
    python "$APP/scripts/termux/data-archive.py" "$action" "$snapshot" "$file"
    result=$?
    rm -f -- "$snapshot"
    return "$result"
}

backup_data() {
    read_settings && ensure_backups || return 1
    local running=0 wake=0 result file
    [[ -n "$(owned_pids)" ]] && running=1
    [[ -f "$WAKE_FILE" ]] && wake=1
    stop_server || return 1
    file="$BACKUPS/atria_backup_$(date +%Y%m%d_%H%M%S)_$$.tar.gz"
    archive_action backup "$file"; result=$?
    if (( result == 0 )); then info "备份完成：$file"; fi
    if (( running )); then ATRIA_TERMUX_WAKE_LOCK="$wake" start_server || return 1; fi
    return "$result"
}

restore_data() {
    local file="${1:-}" snapshot
    read_settings && ensure_backups || return 1
    [[ -f "$file" ]] || { error '请提供现有 .tar.gz 备份的完整路径。'; return 1; }
    archive_action check "$file" || return 1
    info "恢复到：$DATA_ROOT（保留当前路径与端口）"
    confirm '恢复将替换当前数据和备份内的配置/插件，继续？' || return 1
    stop_server || return 1
    snapshot="$BACKUPS/atria_before_restore_$(date +%Y%m%d_%H%M%S)_$$.tar.gz"
    archive_action backup "$snapshot" || { error '当前数据快照失败，未执行恢复。'; return 1; }
    info "恢复前快照：$snapshot"
    archive_action restore "$file" || return 1
    info '恢复完成；服务保持停止，请检查后再启动。'
}

status_server() {
    printf '\nAtria Termux %s\n程序：%s\n' "$SCRIPT_VERSION" "$APP"
    require_repo || return 1
    printf '版本：%s\n' "$(git -C "$APP" log -1 --format='%h %s' 2>/dev/null)"
    read_settings || return 1
    printf '数据：%s\n存储：%s\n地址：%s\n备份：%s\n' "$DATA_ROOT" "$STORAGE_MODE" "$URL" "$BACKUPS"
    local pids
    pids=$(owned_pids)
    if [[ -z "$pids" ]]; then info '状态：未运行'; return 1; fi
    if http_ready; then info "状态：HTTP 可访问，PID ${pids//$'\n'/ }（完整检查用 doctor）";
    else info "状态：进程存在，HTTP 尚不可访问，PID ${pids//$'\n'/ }"; return 1; fi
}

show_logs() {
    [[ -f "$LOG_FILE" ]] || { error "没有日志：$LOG_FILE"; return 1; }
    if [[ "${1:-}" == -f ]]; then tail -n 100 -f "$LOG_FILE"; else tail -n 100 "$LOG_FILE"; fi
}

doctor() {
    local failed=0
    read_settings || return 1
    runtime node || failed=1
    bash "$APP/scripts/termux/fix-native.sh" check || failed=1
    printf '数据目录：%s\n前端缓存：%s\n日志：%s\n' "$DATA_ROOT" "$CACHE" "$LOG_FILE"
    [[ -d "$DATA_ROOT" && -w "$DATA_ROOT" ]] || { error '数据目录不存在或不可写。'; failed=1; }
    if [[ -n "$(owned_pids)" ]]; then runtime probe "$URL" || failed=1; else info '服务未运行，未执行 HTTP 检查。'; fi
    [[ ! -f "$LOG_FILE" ]] || runtime timings "$LOG_FILE"
    (( failed == 0 )) && info '基础检查通过。'
    return "$failed"
}

change_port() {
    read_settings || return 1
    [[ -z "$(owned_pids)" ]] || { error '请先停止服务再修改端口。'; return 1; }
    local port="${1:-}"
    [[ -n "$port" ]] || read -r -p '新端口：' port
    runtime port "$port"
}

uninstall_atria() {
    require_repo && read_settings || return 1
    local purge="${1:-}" answer
    case "$APP" in /|"$HOME"|"${PREFIX:-/}") error '拒绝删除根目录或环境目录。'; return 1 ;; esac
    case "$HOME/" in "$APP/"*) error '拒绝删除包含 HOME 的目录。'; return 1 ;; esac
    local protected
    for protected in "${PREFIX:-/}" "$STATE" "$BACKUPS"; do
        protected=$(realpath -m "$protected") || return 1
        case "$protected/" in "$APP/"*) error '程序目录包含运行环境、工具箱或备份，拒绝卸载。'; return 1 ;; esac
    done
    if [[ "$DATA_ROOT" == "$APP" || "$DATA_ROOT" == "$APP/"* ]]; then
        error '数据位于程序目录内部；请先通过应用迁移到独立目录再卸载。'; return 1
    fi
    info "删除程序：$APP"
    info "数据：$DATA_ROOT"
    if [[ "$purge" == --purge ]]; then
        case "$DATA_ROOT" in "$PRIVATE_DATA"|"$HOME/storage/shared/Atria/data"|/storage/emulated/*/Atria/data) ;;
            *) error '自定义数据目录不自动删除；请用保留数据卸载。'; return 1 ;;
        esac
        read -r -p '输入 DELETE ATRIA 删除程序及上述数据（保留备份）：' answer
        [[ "$answer" == 'DELETE ATRIA' ]] || return 1
    else confirm '卸载程序并保留数据？将先备份配置和插件。' || return 1; fi
    stop_server && ensure_backups || return 1
    archive_action backup "$BACKUPS/atria_before_uninstall_$(date +%Y%m%d_%H%M%S)_$$.tar.gz" || return 1
    cd -- "$HOME" || return 1
    rm -rf -- "$APP" || return 1
    if [[ "$purge" == --purge ]]; then rm -rf -- "$DATA_ROOT" || return 1; fi
    rm -f -- "$STATE/prepared"
    info '程序已卸载，工具箱和备份已保留。'
}

update_toolbox() {
    local temporary
    temporary=$(mktemp "$STATE/download.XXXXXX") || return 1
    if ! curl -fsSL "$SCRIPT_URL" -o "$temporary" || ! bash -n "$temporary"; then
        rm -f -- "$temporary"; error '工具箱下载失败，旧版保持不变。'; return 1
    fi
    grep -q '^SCRIPT_VERSION=' "$temporary" || { rm -f "$temporary"; return 1; }
    mv -f -- "$temporary" "$SAVED_SCRIPT" || return 1
}

usage() {
    cat <<'HELP'
atria-termux [command]
  menu                 打开菜单（默认）
  install              首次安装 main
  setup / repair       准备环境 / 重装依赖并修复
  update               增量更新 main；原来运行则恢复运行
  start [--normal]     保活启动 / 普通后台启动
  debug                前台日志调试，Ctrl+C 停止
  stop [--force]       正常停止 / 显式允许强停
  restart              保持原保活模式重启
  status / doctor      状态 / 原生模块与应用检查
  logs [-f]            最近日志 / 跟随日志
  open / url           打开网页 / 显示地址
  backup               停机一致备份，完成后恢复原运行状态
  restore <archive>    校验、备份当前数据、恢复；保持停止
  port <number>        停止状态下修改端口
  uninstall [--purge]  卸载程序 / 同时删除标准数据目录
  self-update          更新工具箱

新安装数据：~/.local/share/atria/data；已有 config.yaml 的 dataRoot 保持不变。
默认备份：~/storage/shared/Atria/backups，需要 termux-setup-storage 授权。
可配置 ATRIA_TERMUX_ROOT、ATRIA_TERMUX_BACKUP_DIR、ATRIA_TERMUX_PORT。
HELP
}

dispatch() {
    local command="${1:-menu}"; shift || true
    case "$command" in install|setup|repair|update) ensure_tools || return 1 ;; esac
    case "$command" in
        menu|--skip-init) menu ;;
        install) with_lock install_atria ;;
        setup) with_lock setup_existing ;;
        repair) with_lock setup_existing --force ;;
        prepare)
            [[ -n "${ATRIA_TERMUX_PREPARING:-}" ]] || { error 'prepare 是更新内部入口，请使用 setup。'; return 1; }
            prepare_runtime ;;
        update) with_lock update_atria ;;
        start) with_lock start_server "$([[ "${1:-}" == --normal ]] && echo normal || echo start)" ;;
        debug) with_lock start_server foreground ;;
        stop) with_lock stop_server "${1:-}" ;;
        restart) with_lock restart_server ;;
        status) status_server ;;
        doctor) doctor ;;
        logs) show_logs "${1:-}" ;;
        open) open_browser ;;
        url) read_settings && printf '%s\n' "$URL" ;;
        backup) with_lock backup_data ;;
        restore) with_lock restore_data "${1:-}" ;;
        port) with_lock change_port "${1:-}" ;;
        uninstall) with_lock uninstall_atria "${1:-}" ;;
        self-update) with_lock update_toolbox && exec bash "$SAVED_SCRIPT" menu ;;
        help|-h|--help) usage ;;
        *) error '未知命令。'; usage; return 1 ;;
    esac
}

menu() {
    [[ -t 0 ]] || { error '菜单需要终端输入；也可以使用 atria-termux help 中的命令。'; return 1; }
    local choice archive
    while true; do
        printf '\n========== Atria Termux %s ==========\n' "$SCRIPT_VERSION"
        printf '1. 启动并打开网页    2. 停止    3. 重启\n4. 状态与诊断        5. 日志与启动耗时\n6. 安装 / 更新 / 修复\n7. 备份 / 恢复      8. 端口与运行选项\n9. 卸载            0. 退出\n'
        read -r -p '请选择：' choice || return 0
        case "$choice" in
            1) dispatch start ;;
            2) dispatch stop ;;
            3) dispatch restart ;;
            4) status_server; doctor ;;
            5) show_logs; [[ ! -f "$APP/scripts/termux/runtime-tools.js" ]] || runtime timings "$LOG_FILE" ;;
            6)
                printf '1. 首次安装  2. 更新 Atria  3. 修复依赖和缓存  4. 更新工具箱  0. 返回\n'
                read -r -p '请选择：' choice || return 0
                case "$choice" in 1) dispatch install ;; 2) dispatch update ;; 3) dispatch repair ;; 4) dispatch self-update ;; esac ;;
            7)
                printf '1. 创建备份  2. 恢复备份  3. 授权共享存储  0. 返回\n'
                read -r -p '请选择：' choice || return 0
                case "$choice" in
                    1) dispatch backup ;;
                    2) printf '备份目录：%s\n' "$BACKUPS"; read -r -p '备份完整路径：' archive; dispatch restore "$archive" ;;
                    3) termux-setup-storage ;;
                esac ;;
            8)
                printf '1. 修改端口  2. 普通后台启动  3. 前台调试  4. 打开网页\n'
                read -r -p '请选择：' choice || return 0
                case "$choice" in 1) dispatch port ;; 2) dispatch start --normal ;; 3) dispatch debug ;; 4) dispatch open ;; esac ;;
            9)
                printf '1. 保留数据卸载  2. 删除程序及标准数据目录  0. 返回\n'
                read -r -p '请选择：' choice || return 0
                case "$choice" in 1) dispatch uninstall ;; 2) dispatch uninstall --purge ;; esac ;;
            0) return 0 ;;
            *) error '无效选项。' ;;
        esac
        pause
    done
}

main() {
    mkdir -p "$STATE" || return 1
    APP=$(realpath -m "$APP") || return 1
    if [[ ! -f "$SELF" ]]; then
        # curl | bash cannot use the consumed script pipe as menu input.
        local temporary
        temporary=$(mktemp "$STATE/download.XXXXXX") || return 1
        curl -fsSL "$SCRIPT_URL" -o "$temporary" && bash -n "$temporary" || { rm -f "$temporary"; return 1; }
        mv -f -- "$temporary" "$SAVED_SCRIPT" || return 1
        if [[ "${1:-menu}" == menu || "${1:-}" == --skip-init ]]; then
            [[ -r /dev/tty ]] || { error '请在 Termux 终端打开工具箱。'; return 1; }
            exec bash "$SAVED_SCRIPT" "${@:-menu}" </dev/tty
        fi
        exec bash "$SAVED_SCRIPT" "$@" </dev/null
    fi
    if [[ "${1:-menu}" == menu || "${1:-}" == --skip-init ]]; then save_entrypoints || return 1; fi
    dispatch "$@"
}

main "$@"
