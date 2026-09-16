#!/data/data/com.termux/files/usr/bin/bash
# Luker Toolbox - Termux 管理工具箱
# 面向仓库: https://github.com/ZZZdragondYNGPHX/Luker
# 默认分支: custom-release
# License: AGPL-3.0
#
# 交互思路参考 mc10091009/st_manager.sh 的 Termux 工具箱，
# 本文件针对 Luker 的仓库结构、分支和数据布局独立重写。

set -o pipefail

# ---------- 基础配置 ----------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

REPO_URL="https://github.com/ZZZdragondYNGPHX/Luker.git"
DEFAULT_BRANCH="custom-release"

LUKER_MAIN_DIR="$HOME/Luker"
LUKER_SECOND_DIR="$HOME/Luker-2"
LUKER_DIR="$LUKER_MAIN_DIR"
CURRENT_INSTANCE="主实例 (Luker)"

TOOLBOX_NAME="luker_toolbox.sh"
TOOLBOX_PATH="$HOME/$TOOLBOX_NAME"
TOOLBOX_HOME="$HOME/.luker_toolbox"

# 程序保留在 Termux 私有目录；用户数据与备份放到 Android 共享存储。
# termux-setup-storage 成功后，$HOME/storage/shared 通常指向 /storage/emulated/0。
SHARED_STORAGE_LINK="${LUKER_SHARED_STORAGE:-$HOME/storage/shared}"
LUKER_MAIN_SHARED_DIR="$SHARED_STORAGE_LINK/Luker"
LUKER_SECOND_SHARED_DIR="$SHARED_STORAGE_LINK/Luker-2"
LUKER_SHARED_DIR="$LUKER_MAIN_SHARED_DIR"
LUKER_DATA_DIR="$LUKER_SHARED_DIR/data"
BACKUP_DIR="$LUKER_SHARED_DIR/backups"
EXPORT_DIR="$LUKER_SHARED_DIR/exports"

LOG_FILE="$TOOLBOX_HOME/luker.log"
PID_FILE="$TOOLBOX_HOME/luker.pid"
SCRIPT_VERSION="v0.2.0"

# 把脚本放到这个仓库路径后，自更新即可直接工作。
SCRIPT_URL="${LUKER_TOOLBOX_URL:-https://raw.githubusercontent.com/ZZZdragondYNGPHX/Luker/custom-release/scripts/termux/luker_toolbox.sh}"
TAG_DISPLAY_LIMIT=12

mkdir -p "$TOOLBOX_HOME" 2>/dev/null || true

# 防止 source 运行，避免 exit 影响当前 Shell。
(return 0 2>/dev/null) && SOURCED=1 || SOURCED=0
if [ "$SOURCED" -eq 1 ]; then
    echo -e "${RED}[ERROR] 请使用 bash 运行本脚本，不要 source/. 执行。${NC}"
    return 1
fi

# ---------- 通用函数 ----------
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }
pause() { read -r -p "按回车键继续..." _; }

confirm() {
    local prompt="$1"
    local default="${2:-n}"
    local answer
    if [ "$default" = "y" ]; then
        read -r -p "$prompt [Y/n]: " answer
        answer="${answer:-y}"
    else
        read -r -p "$prompt [y/N]: " answer
        answer="${answer:-n}"
    fi
    [[ "$answer" =~ ^[Yy]$ ]]
}

safe_delete_confirm() {
    local action="$1"
    warn "$action"
    warn "这是高风险操作。建议先备份。"
    confirm "确认继续？" n || return 1

    local code=$((RANDOM % 9000 + 1000))
    local input
    read -r -p "二次确认：请输入 $code ：" input
    [ "$input" = "$code" ]
}

is_termux() {
    [ -n "${PREFIX:-}" ] && [[ "$PREFIX" == *"com.termux"* ]]
}

node_major() {
    node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0
}

get_abs_path() {
    if command -v realpath >/dev/null 2>&1; then
        realpath "$1" 2>/dev/null
    elif command -v readlink >/dev/null 2>&1; then
        readlink -f "$1" 2>/dev/null
    else
        echo "$1"
    fi
}

repo_ok() {
    [ -d "$LUKER_DIR/.git" ] && [ -f "$LUKER_DIR/package.json" ] && [ -f "$LUKER_DIR/server.js" ]
}

ensure_repo() {
    if ! repo_ok; then
        error "当前实例不是完整的 Luker 仓库：$LUKER_DIR"
        return 1
    fi
}

ensure_config() {
    if [ ! -f "$LUKER_DIR/config.yaml" ] && [ -f "$LUKER_DIR/default/config.yaml" ]; then
        cp "$LUKER_DIR/default/config.yaml" "$LUKER_DIR/config.yaml"
        info "已从 default/config.yaml 初始化 config.yaml"
    fi
}

get_port() {
    local port="8000"
    if [ -f "$LUKER_DIR/config.yaml" ]; then
        local p
        p=$(awk '/^[[:space:]]*port:[[:space:]]*[0-9]+[[:space:]]*$/ {print $2; exit}' "$LUKER_DIR/config.yaml" 2>/dev/null)
        [[ "$p" =~ ^[0-9]+$ ]] && port="$p"
    fi
    echo "$port"
}

get_storage_mode() {
    local config="$LUKER_DIR/config.yaml"
    [ -f "$config" ] || { echo "fs"; return; }
    awk '
        /^storage:[[:space:]]*$/ { in_storage=1; next }
        in_storage && /^[^[:space:]]/ { in_storage=0 }
        in_storage && /^[[:space:]]+mode:[[:space:]]*/ {
            gsub(/["\047]/, "", $2); print $2; exit
        }
    ' "$config" 2>/dev/null
}

current_ref_label() {
    if ! repo_ok; then
        echo "未安装"
        return
    fi
    local branch tag sha
    branch=$(git -C "$LUKER_DIR" symbolic-ref --short -q HEAD 2>/dev/null || true)
    tag=$(git -C "$LUKER_DIR" describe --tags --exact-match 2>/dev/null || true)
    sha=$(git -C "$LUKER_DIR" rev-parse --short HEAD 2>/dev/null || true)
    if [ -n "$branch" ]; then
        echo "$branch @ $sha"
    elif [ -n "$tag" ]; then
        echo "tag:$tag @ $sha"
    else
        echo "detached @ $sha"
    fi
}

# ---------- 环境 ----------
install_termux_deps() {
    if ! command -v pkg >/dev/null 2>&1; then
        error "未检测到 Termux 的 pkg 命令。此工具箱仅针对 Termux。"
        return 1
    fi

    info "更新 Termux 软件源索引..."
    pkg update -y || return 1

    info "安装 Luker/工具箱所需依赖..."
    # nodejs 提供 node/npm；build-essential/python 为原生 npm 模块编译准备环境。
    pkg install -y \
        git curl nodejs python build-essential clang make pkg-config \
        tar jq lsof psmisc procps openssh
}

init_environment() {
    if ! is_termux; then
        warn "当前环境看起来不像 Termux；脚本仍会继续，但 Android 专用功能可能不可用。"
    fi

    local required=(git curl node npm python tar jq lsof fuser pgrep)
    local missing=()
    local cmd
    for cmd in "${required[@]}"; do
        command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
    done

    if [ ${#missing[@]} -gt 0 ]; then
        warn "缺少依赖：${missing[*]}"
        if confirm "自动安装 Termux 依赖？" y; then
            install_termux_deps || return 1
        else
            return 1
        fi
    fi

    local major
    major=$(node_major)
    if [ "$major" -lt 20 ] 2>/dev/null; then
        error "Luker 要求 Node.js >= 20；当前：$(node -v 2>/dev/null || echo 未安装)"
        info "可在 Termux 执行：pkg install nodejs"
        return 1
    fi

    info "Node.js: $(node -v) | npm: $(npm -v)"
}

install_node_modules() {
    ensure_repo || return 1
    cd "$LUKER_DIR" || return 1
    info "安装生产依赖..."
    # 与 Luker start.sh 的策略保持一致，减少 Android/Termux 上安装脚本副作用。
    npm install \
        --no-save \
        --no-audit \
        --no-fund \
        --loglevel=error \
        --no-progress \
        --omit=dev \
        --ignore-scripts
}

# ---------- Android 共享存储 / 数据分离 ----------
shared_storage_display_path() {
    if [ -e "$SHARED_STORAGE_LINK" ]; then
        get_abs_path "$SHARED_STORAGE_LINK" 2>/dev/null || echo "$SHARED_STORAGE_LINK"
    else
        echo "/storage/emulated/0"
    fi
}

refresh_instance_storage_paths() {
    local shared_root="$SHARED_STORAGE_LINK"
    if [ -d "$SHARED_STORAGE_LINK" ]; then
        local resolved
        resolved=$(get_abs_path "$SHARED_STORAGE_LINK" 2>/dev/null || true)
        [ -n "$resolved" ] && shared_root="$resolved"
    fi

    if [ "$LUKER_DIR" = "$LUKER_SECOND_DIR" ]; then
        LUKER_SHARED_DIR="$shared_root/Luker-2"
    else
        LUKER_SHARED_DIR="$shared_root/Luker"
    fi
    LUKER_DATA_DIR="$LUKER_SHARED_DIR/data"
    BACKUP_DIR="$LUKER_SHARED_DIR/backups"
    EXPORT_DIR="$LUKER_SHARED_DIR/exports"
}

ensure_shared_storage() {
    if [ ! -d "$SHARED_STORAGE_LINK" ]; then
        if ! is_termux; then
            error "未找到 Android 共享存储：$SHARED_STORAGE_LINK"
            return 1
        fi
        warn "尚未授予 Termux 共享存储权限。"
        info "接下来会调用 termux-setup-storage，请在 Android 弹窗中允许文件访问。"
        if ! confirm "现在授权共享存储？" y; then
            return 1
        fi
        termux-setup-storage >/dev/null 2>&1 || true
        local n
        for n in $(seq 1 20); do
            [ -d "$SHARED_STORAGE_LINK" ] && break
            sleep 1
        done
    fi

    if [ ! -d "$SHARED_STORAGE_LINK" ]; then
        error "共享存储仍不可用。请手动执行：termux-setup-storage"
        return 1
    fi

    refresh_instance_storage_paths
    mkdir -p "$LUKER_DATA_DIR" "$BACKUP_DIR" "$EXPORT_DIR" || {
        error "无法写入共享存储：$LUKER_SHARED_DIR"
        return 1
    }

    local test_file="$LUKER_SHARED_DIR/.luker-write-test.$$"
    if ! printf 'ok' > "$test_file" 2>/dev/null; then
        error "共享存储没有写入权限：$LUKER_SHARED_DIR"
        return 1
    fi
    rm -f "$test_file"
    return 0
}

get_config_data_root() {
    local config="$LUKER_DIR/config.yaml"
    [ -f "$config" ] || { echo "./data"; return; }
    local value
    value=$(awk '
        /^[[:space:]]*dataRoot:[[:space:]]*/ {
            sub(/^[[:space:]]*dataRoot:[[:space:]]*/, "", $0)
            gsub(/^["\047]|["\047]$/, "", $0)
            print $0
            exit
        }
    ' "$config" 2>/dev/null)
    [ -n "$value" ] && echo "$value" || echo "./data"
}

resolve_config_data_dir() {
    local root
    root=$(get_config_data_root)
    case "$root" in
        /*) echo "$root" ;;
        ~/*) echo "$HOME/${root#~/}" ;;
        *) echo "$LUKER_DIR/${root#./}" ;;
    esac
}

set_config_data_root() {
    ensure_config
    local target="$LUKER_DATA_DIR"
    local config="$LUKER_DIR/config.yaml"
    local tmp="$config.tmp.$$"

    awk -v target="$target" '
        BEGIN { done=0 }
        !done && /^[[:space:]]*dataRoot:[[:space:]]*/ {
            print "dataRoot: " target
            done=1
            next
        }
        { print }
        END {
            if (!done) print "dataRoot: " target
        }
    ' "$config" > "$tmp" || { rm -f "$tmp"; return 1; }
    mv "$tmp" "$config"
}

has_files() {
    local dir="$1"
    [ -d "$dir" ] && find "$dir" -mindepth 1 -print -quit 2>/dev/null | grep -q .
}

# 仓库自带 data/.gitkeep；它不是用户数据，迁移判断时忽略。
has_meaningful_data() {
    local dir="$1"
    [ -d "$dir" ] && find "$dir" -mindepth 1 ! -name '.gitkeep' -print -quit 2>/dev/null | grep -q .
}

has_symlinks() {
    local dir="$1"
    [ -d "$dir" ] && find "$dir" -type l -print -quit 2>/dev/null | grep -q .
}

verify_data_copy() {
    local src="$1"
    local dst="$2"
    python - "$src" "$dst" <<'PYVERIFY'
import hashlib, os, sys
src, dst = sys.argv[1:3]

def manifest(root):
    out = {}
    for base, dirs, files in os.walk(root):
        for name in files:
            p = os.path.join(base, name)
            rel = os.path.relpath(p, root)
            if os.path.islink(p):
                continue
            h = hashlib.sha256()
            try:
                with open(p, 'rb') as f:
                    for chunk in iter(lambda: f.read(1024 * 1024), b''):
                        h.update(chunk)
                out[rel] = (os.path.getsize(p), h.hexdigest())
            except OSError as e:
                print(f"READ_ERROR {rel}: {e}", file=sys.stderr)
                raise
    return out

try:
    a = manifest(src)
    b = manifest(dst)
except Exception:
    sys.exit(2)

if a != b:
    missing = sorted(set(a) - set(b))[:20]
    extra = sorted(set(b) - set(a))[:20]
    changed = sorted(k for k in set(a) & set(b) if a[k] != b[k])[:20]
    if missing: print("MISSING:", *missing, sep="\n  ", file=sys.stderr)
    if extra: print("EXTRA:", *extra, sep="\n  ", file=sys.stderr)
    if changed: print("CHANGED:", *changed, sep="\n  ", file=sys.stderr)
    sys.exit(1)
print(f"verified_files={len(a)}")
PYVERIFY
}

migrate_private_data_to_shared() {
    ensure_repo || return 1
    ensure_shared_storage || return 1
    ensure_config

    local current legacy
    current=$(resolve_config_data_dir)
    legacy="$LUKER_DIR/data"

    # 已经指向当前实例的共享 data 时，只做目录准备。
    if [ "$(get_abs_path "$current" 2>/dev/null || echo "$current")" = "$(get_abs_path "$LUKER_DATA_DIR" 2>/dev/null || echo "$LUKER_DATA_DIR")" ]; then
        set_config_data_root || return 1
        info "数据分离已启用：$(get_abs_path "$LUKER_DATA_DIR" 2>/dev/null || echo "$LUKER_DATA_DIR")"
        return 0
    fi

    # 对 sqlite 做额外提示：数据库也会随 dataRoot 进入共享存储。
    if [ "$(get_storage_mode)" = "sqlite" ]; then
        warn "当前存储后端为 sqlite。迁移后 SQLite 数据库也会位于 Android 共享存储。"
        warn "共享存储由 Android/FUSE 管理，数据库性能和锁可靠性通常不如 Termux 私有目录。"
        confirm "仍然继续数据分离？" n || return 1
    fi

    if has_symlinks "$current"; then
        error "当前数据目录中存在符号链接；Android 共享存储不适合直接迁移符号链接。"
        info "请先处理这些链接："
        find "$current" -type l -print 2>/dev/null | head -n 20
        return 1
    fi

    if has_files "$LUKER_DATA_DIR" && [ "$(get_abs_path "$current" 2>/dev/null || echo "$current")" != "$(get_abs_path "$LUKER_DATA_DIR" 2>/dev/null || echo "$LUKER_DATA_DIR")" ]; then
        error "目标共享数据目录已经有内容，为防止覆盖，自动迁移已停止。"
        echo "当前数据：$current"
        echo "目标数据：$LUKER_DATA_DIR"
        info "请先通过备份/恢复或手动确认两边内容，再重试。"
        return 1
    fi

    if [ -d "$current" ] && has_meaningful_data "$current"; then
        warn "检测到旧数据，需要迁移到 Android 共享存储："
        echo "  从：$current"
        echo "  到：$(get_abs_path "$LUKER_DATA_DIR" 2>/dev/null || echo "$LUKER_DATA_DIR")"
        confirm "复制并校验旧数据？" y || return 1

        info "正在复制数据；旧数据在校验成功前不会删除。"
        mkdir -p "$LUKER_DATA_DIR" || return 1
        cp -R "$current"/. "$LUKER_DATA_DIR"/ || {
            error "复制失败；旧数据保持不变。"
            return 1
        }

        info "正在逐文件 SHA-256 校验..."
        if ! verify_data_copy "$current" "$LUKER_DATA_DIR"; then
            error "数据校验失败。不会切换 dataRoot，也不会删除旧数据。"
            return 1
        fi
        info "数据校验通过。"
    fi

    set_config_data_root || { error "修改 config.yaml 失败。"; return 1; }

    # 仓库跟踪 data/.gitkeep，因此不移动/替换整个 data 目录，避免把 Git 工作区弄脏。
    # 旧用户数据暂时原地保留为安全副本；确认共享数据正常后可从菜单清理。
    if [ -d "$legacy" ] && has_meaningful_data "$legacy"; then
        warn "旧 Termux 私有 data 仍原地保留，当前运行已切换到共享 dataRoot。"
        info "确认新数据正常后，可在“数据分离 / 共享存储”菜单中清理旧私有数据。"
    fi

    info "数据分离完成。"
    echo "程序：$LUKER_DIR"
    echo "数据：$(get_abs_path "$LUKER_DATA_DIR" 2>/dev/null || echo "$LUKER_DATA_DIR")"
    echo "备份：$(get_abs_path "$BACKUP_DIR" 2>/dev/null || echo "$BACKUP_DIR")"
}

ensure_data_separation() {
    ensure_repo || return 1
    ensure_shared_storage || return 1
    ensure_config

    local current target
    current=$(resolve_config_data_dir)
    target="$LUKER_DATA_DIR"
    if [ "$(get_abs_path "$current" 2>/dev/null || echo "$current")" != "$(get_abs_path "$target" 2>/dev/null || echo "$target")" ]; then
        warn "当前 Luker 尚未使用共享数据目录。"
        migrate_private_data_to_shared || return 1
    else
        mkdir -p "$LUKER_DATA_DIR" "$BACKUP_DIR" "$EXPORT_DIR"
    fi
}

show_storage_status() {
    refresh_instance_storage_paths
    local configured="$(get_config_data_root 2>/dev/null || echo './data')"
    local resolved="$(resolve_config_data_dir 2>/dev/null || echo '-')"
    local shared_real="$(get_abs_path "$LUKER_SHARED_DIR" 2>/dev/null || echo "$LUKER_SHARED_DIR")"
    echo -e "${BOLD}程序目录：${NC}$LUKER_DIR"
    echo -e "${BOLD}config dataRoot：${NC}$configured"
    echo -e "${BOLD}实际数据目录：${NC}$resolved"
    echo -e "${BOLD}共享目录：${NC}$shared_real"
    echo -e "${BOLD}备份目录：${NC}$(get_abs_path "$BACKUP_DIR" 2>/dev/null || echo "$BACKUP_DIR")"
    if [ -d "$SHARED_STORAGE_LINK" ]; then
        echo -e "共享存储权限：${GREEN}可用${NC}"
    else
        echo -e "共享存储权限：${RED}未初始化${NC}"
    fi
}

cleanup_private_data_backups() {
    ensure_repo || return 1
    local legacy="$LUKER_DIR/data"
    local has_legacy=0
    has_meaningful_data "$legacy" && has_legacy=1

    shopt -s nullglob
    local old=("$LUKER_DIR"/data.private-backup-*)
    shopt -u nullglob

    if [ "$has_legacy" -eq 0 ] && [ ${#old[@]} -eq 0 ]; then
        info "没有可清理的旧 Termux 私有用户数据。"
        return 0
    fi

    warn "此操作只清理旧的 Termux 私有数据副本，不删除 Android 共享数据。"
    [ "$has_legacy" -eq 1 ] && echo "  $legacy（保留仓库自带 .gitkeep）"
    [ ${#old[@]} -gt 0 ] && printf '  %s\n' "${old[@]}"
    safe_delete_confirm "清理上述旧私有数据" || return 1

    if [ "$has_legacy" -eq 1 ]; then
        shopt -s dotglob nullglob
        local item
        for item in "$legacy"/*; do
            [ "$(basename "$item")" = ".gitkeep" ] && continue
            rm -rf -- "$item"
        done
        shopt -u dotglob nullglob
    fi
    [ ${#old[@]} -gt 0 ] && rm -rf -- "${old[@]}"
    info "旧私有数据已清理；共享数据保持不变。"
}

data_storage_menu() {
    while true; do
        clear
        echo -e "${CYAN}========== Luker 数据分离 ==========${NC}"
        show_storage_status
        echo ""
        echo "1. 初始化/迁移到 Android 共享存储"
        echo "2. 重新校验当前数据目录"
        echo "3. 查看共享目录内容"
        echo "4. 清理迁移后保留的旧 Termux 私有 data"
        echo "0. 返回"
        read -r -p "请选择：" choice
        case "$choice" in
            1) migrate_private_data_to_shared; pause ;;
            2)
                ensure_shared_storage && {
                    local current
                    current=$(resolve_config_data_dir)
                    if [ "$(get_abs_path "$current" 2>/dev/null || echo "$current")" = "$(get_abs_path "$LUKER_DATA_DIR" 2>/dev/null || echo "$LUKER_DATA_DIR")" ]; then
                        info "config.yaml 已正确指向共享数据目录。"
                        find "$LUKER_DATA_DIR" -type f 2>/dev/null | wc -l | xargs -I{} echo "文件数：{}"
                    else
                        error "config.yaml 当前未指向本实例共享数据目录。"
                    fi
                }
                pause
                ;;
            3)
                ensure_shared_storage && {
                    echo "$(get_abs_path "$LUKER_SHARED_DIR" 2>/dev/null || echo "$LUKER_SHARED_DIR")"
                    ls -lah "$LUKER_SHARED_DIR" 2>/dev/null
                }
                pause
                ;;
            4) cleanup_private_data_backups; pause ;;
            0) return ;;
            *) error "无效选项"; pause ;;
        esac
    done
}

# ---------- Git / 版本 ----------
show_tags() {
    ensure_repo || return 1
    local tags=()
    mapfile -t tags < <(git -C "$LUKER_DIR" tag --sort=-creatordate 2>/dev/null | head -n "$TAG_DISPLAY_LIMIT")
    if [ ${#tags[@]} -eq 0 ]; then
        warn "未检测到 Tag。"
        return 1
    fi
    echo -e "${YELLOW}最近 ${#tags[@]} 个 Tag：${NC}"
    local i
    for i in "${!tags[@]}"; do
        printf " %2d. %s\n" "$((i + 1))" "${tags[$i]}"
    done
}

select_target() {
    # 通过全局变量 SELECTED_TYPE / SELECTED_VALUE 返回。
    SELECTED_TYPE="branch"
    SELECTED_VALUE="$DEFAULT_BRANCH"

    echo ""
    echo "选择目标版本："
    echo " 1. custom-release（你的整合版，推荐）"
    echo " 2. release"
    echo " 3. main"
    echo " 4. 指定 Tag"
    echo " 0. 取消"
    local choice
    read -r -p "请输入 [0-4]，默认 1：" choice
    choice="${choice:-1}"

    case "$choice" in
        1) SELECTED_TYPE="branch"; SELECTED_VALUE="custom-release" ;;
        2) SELECTED_TYPE="branch"; SELECTED_VALUE="release" ;;
        3) SELECTED_TYPE="branch"; SELECTED_VALUE="main" ;;
        4)
            show_tags || return 1
            local tag
            read -r -p "请输入完整 Tag：" tag
            [ -n "$tag" ] || return 1
            if ! git -C "$LUKER_DIR" rev-parse -q --verify "refs/tags/$tag" >/dev/null 2>&1; then
                error "Tag 不存在：$tag"
                return 1
            fi
            SELECTED_TYPE="tag"
            SELECTED_VALUE="$tag"
            ;;
        0) return 1 ;;
        *) error "无效选项"; return 1 ;;
    esac
}

worktree_clean() {
    [ -z "$(git -C "$LUKER_DIR" status --porcelain 2>/dev/null)" ]
}

install_luker() {
    if [ -e "$LUKER_DIR" ]; then
        warn "目标目录已存在：$LUKER_DIR"
        if repo_ok; then
            info "检测到已有 Luker。建议使用“更新/切换版本”，避免重装。"
        fi
        if ! safe_delete_confirm "将删除当前目录并重新安装：$LUKER_DIR"; then
            info "已取消。"
            return
        fi
        if ! backup_data; then
            error "自动备份未完成。"
            confirm "仍然删除旧程序目录并继续重装？" n || { info "已取消重装。"; return 1; }
        fi
        rm -rf "$LUKER_DIR" || return 1
    fi

    init_environment || return 1

    info "克隆 Luker 仓库..."
    if ! git clone "$REPO_URL" "$LUKER_DIR"; then
        error "克隆失败。"
        return 1
    fi

    git -C "$LUKER_DIR" fetch --all --tags --prune || true
    select_target || { warn "未选择版本，默认使用 $DEFAULT_BRANCH"; SELECTED_TYPE="branch"; SELECTED_VALUE="$DEFAULT_BRANCH"; }

    if [ "$SELECTED_TYPE" = "branch" ]; then
        if git -C "$LUKER_DIR" show-ref --verify --quiet "refs/remotes/origin/$SELECTED_VALUE"; then
            git -C "$LUKER_DIR" switch -C "$SELECTED_VALUE" "origin/$SELECTED_VALUE" || return 1
        else
            error "远程分支不存在：$SELECTED_VALUE"
            return 1
        fi
    else
        git -C "$LUKER_DIR" checkout --detach "tags/$SELECTED_VALUE" || return 1
    fi

    ensure_config
    if ! ensure_data_separation; then
        warn "Luker 程序已安装，但共享数据目录尚未配置完成。首次启动前需要完成数据分离。"
    fi
    install_node_modules || return 1
    info "Luker 安装完成：$(current_ref_label)"
}

update_luker() {
    ensure_repo || return 1

    if ! worktree_clean; then
        error "仓库存在未提交修改，为防止覆盖，本次更新已停止。"
        git -C "$LUKER_DIR" status --short
        info "请先提交/暂存修改，或在电脑端处理后再更新。"
        return 1
    fi

    if confirm "更新前先备份 Luker 数据？" y; then
        backup_data || return 1
    fi

    info "同步远程分支和 Tag..."
    git -C "$LUKER_DIR" fetch origin --prune --tags || return 1
    select_target || return 1

    if [ "$SELECTED_TYPE" = "branch" ]; then
        if ! git -C "$LUKER_DIR" show-ref --verify --quiet "refs/remotes/origin/$SELECTED_VALUE"; then
            error "远程分支不存在：$SELECTED_VALUE"
            return 1
        fi
        git -C "$LUKER_DIR" switch -C "$SELECTED_VALUE" "origin/$SELECTED_VALUE" || return 1
    else
        git -C "$LUKER_DIR" checkout --detach "tags/$SELECTED_VALUE" || return 1
    fi

    ensure_config
    ensure_data_separation || { error "数据分离未就绪，更新后的 Luker 暂不启动。"; return 1; }
    install_node_modules || return 1
    info "更新完成：$(current_ref_label)"
}

rollback_luker() {
    ensure_repo || return 1
    if ! worktree_clean; then
        error "仓库存在未提交修改，已停止版本切换。"
        return 1
    fi

    confirm "切换版本前先备份数据？" y && backup_data

    git -C "$LUKER_DIR" fetch origin --tags --prune || return 1
    echo " 1. 切换到 Tag"
    echo " 2. 切换到 Commit"
    echo " 0. 取消"
    local choice target
    read -r -p "请选择 [0-2]：" choice
    case "$choice" in
        1)
            show_tags || return 1
            read -r -p "输入完整 Tag：" target
            git -C "$LUKER_DIR" rev-parse -q --verify "refs/tags/$target" >/dev/null 2>&1 || { error "Tag 不存在"; return 1; }
            git -C "$LUKER_DIR" checkout --detach "tags/$target" || return 1
            ;;
        2)
            echo -e "${YELLOW}最近 12 个提交：${NC}"
            git -C "$LUKER_DIR" log -n 12 --oneline
            read -r -p "输入 Commit Hash：" target
            git -C "$LUKER_DIR" cat-file -e "$target^{commit}" 2>/dev/null || { error "Commit 不存在"; return 1; }
            git -C "$LUKER_DIR" checkout --detach "$target" || return 1
            ;;
        0) return ;;
        *) error "无效选项"; return 1 ;;
    esac

    install_node_modules || return 1
    info "版本切换完成：$(current_ref_label)"
}

# ---------- 备份 / 恢复 ----------
backup_data() {
    ensure_repo || return 1
    ensure_config
    ensure_shared_storage || return 1

    local timestamp backup_file mode data_dir
    timestamp=$(date +"%Y%m%d_%H%M%S")
    backup_file="$BACKUP_DIR/luker_backup_${timestamp}.tar.gz"
    local seq=0
    while [ -e "$backup_file" ]; do
        seq=$((seq + 1))
        backup_file="$BACKUP_DIR/luker_backup_${timestamp}_${seq}.tar.gz"
    done
    mode=$(get_storage_mode)
    [ -n "$mode" ] || mode="fs"
    data_dir=$(resolve_config_data_dir)

    mkdir -p "$BACKUP_DIR"

    local internal_items=()
    [ -f "$LUKER_DIR/config.yaml" ] && internal_items+=("config.yaml")
    [ -f "$LUKER_DIR/secrets.json" ] && internal_items+=("secrets.json")
    [ -f "$LUKER_DIR/.env" ] && internal_items+=(".env")
    [ -d "$LUKER_DIR/plugins" ] && internal_items+=("plugins")
    [ -d "$LUKER_DIR/public/scripts/extensions/third-party" ] && internal_items+=("public/scripts/extensions/third-party")

    info "存储后端：$mode"
    if [ "$mode" = "mysql" ] || [ "$mode" = "postgres" ]; then
        warn "当前使用外部数据库。备份包含本地 data/附件/配置/插件，不包含远程数据库表数据。"
    fi

    local tar_args=(-czf "$backup_file")
    local has_any=0

    if [ -d "$data_dir" ]; then
        # 无论 dataRoot 在哪里，都统一以 data/ 作为备份包内路径。
        tar_args+=(-C "$(dirname "$data_dir")" "$(basename "$data_dir")")
        has_any=1
    fi
    if [ ${#internal_items[@]} -gt 0 ]; then
        tar_args+=(-C "$LUKER_DIR" "${internal_items[@]}")
        has_any=1
    fi

    if [ "$has_any" -eq 0 ]; then
        error "没有找到可备份的数据。"
        return 1
    fi

    info "正在创建共享存储备份..."
    if tar "${tar_args[@]}"; then
        info "备份完成：$(get_abs_path "$backup_file" 2>/dev/null || echo "$backup_file")"
        warn "该备份位于手机共享存储，可能包含 API Key/数据库连接信息，请妥善保管。"
    else
        rm -f "$backup_file"
        error "备份失败。"
        return 1
    fi
}

archive_is_safe() {
    local archive="$1"
    local entry
    while IFS= read -r entry; do
        [ -z "$entry" ] && continue
        [[ "$entry" == /* ]] && return 1
        [[ "/$entry/" == *"/../"* ]] && return 1
    done < <(tar -tzf "$archive" 2>/dev/null)
    return 0
}

restore_data() {
    ensure_repo || return 1
    ensure_shared_storage || return 1
    ensure_data_separation || return 1

    shopt -s nullglob
    local files=("$BACKUP_DIR"/luker_backup_*.tar.gz "$HOME/luker_backups"/luker_backup_*.tar.gz "$HOME"/luker_backup_*.tar.gz)
    shopt -u nullglob

    if [ ${#files[@]} -eq 0 ]; then
        error "未找到 Luker 备份。目录：$BACKUP_DIR"
        return 1
    fi

    echo "可用备份："
    local i
    for i in "${!files[@]}"; do
        printf " %2d. %s\n" "$((i + 1))" "${files[$i]}"
    done

    local idx archive
    read -r -p "选择序号：" idx
    [[ "$idx" =~ ^[0-9]+$ ]] || { error "无效序号"; return 1; }
    [ "$idx" -ge 1 ] && [ "$idx" -le "${#files[@]}" ] || { error "序号超范围"; return 1; }
    archive="${files[$((idx - 1))]}"

    tar -tzf "$archive" >/dev/null 2>&1 || { error "备份包损坏或格式不正确。"; return 1; }
    archive_is_safe "$archive" || { error "备份包包含不安全路径，已拒绝恢复。"; return 1; }

    warn "恢复会覆盖当前共享 data 与同名配置/插件文件。"
    safe_delete_confirm "从 $(basename "$archive") 恢复到当前 Luker 实例" || return 1

    info "恢复前创建当前快照..."
    backup_data || { error "当前快照备份失败，为避免数据丢失已停止恢复。"; return 1; }

    local stage="$TOOLBOX_HOME/restore-stage.$$"
    rm -rf "$stage"
    mkdir -p "$stage" || return 1
    if ! tar -xzf "$archive" -C "$stage"; then
        rm -rf "$stage"
        error "解包失败。"
        return 1
    fi

    # 兼容旧备份：旧格式中的 data/ 也会被迁移到当前共享 dataRoot。
    if [ -d "$stage/data" ]; then
        rm -rf "$LUKER_DATA_DIR.restore-new"
        mkdir -p "$LUKER_DATA_DIR.restore-new" || { rm -rf "$stage"; return 1; }
        cp -R "$stage/data"/. "$LUKER_DATA_DIR.restore-new"/ || { rm -rf "$stage"; return 1; }
        if ! verify_data_copy "$stage/data" "$LUKER_DATA_DIR.restore-new"; then
            rm -rf "$stage" "$LUKER_DATA_DIR.restore-new"
            error "恢复数据校验失败，当前数据未替换。"
            return 1
        fi
        local old_restore="$LUKER_DATA_DIR.restore-old-$(date +%Y%m%d_%H%M%S)"
        if [ -d "$LUKER_DATA_DIR" ]; then
            mv "$LUKER_DATA_DIR" "$old_restore" || { rm -rf "$stage"; return 1; }
        fi
        mv "$LUKER_DATA_DIR.restore-new" "$LUKER_DATA_DIR" || return 1
        rm -rf "$old_restore"
    fi

    local item
    for item in config.yaml secrets.json .env plugins; do
        if [ -e "$stage/$item" ]; then
            rm -rf "$LUKER_DIR/$item"
            cp -R "$stage/$item" "$LUKER_DIR/$item" || { rm -rf "$stage"; return 1; }
        fi
    done
    if [ -d "$stage/public/scripts/extensions/third-party" ]; then
        mkdir -p "$LUKER_DIR/public/scripts/extensions"
        rm -rf "$LUKER_DIR/public/scripts/extensions/third-party"
        cp -R "$stage/public/scripts/extensions/third-party" "$LUKER_DIR/public/scripts/extensions/third-party" || {
            rm -rf "$stage"; return 1;
        }
    fi
    rm -rf "$stage"

    # 备份里的旧 config.yaml 可能写着 ./data；恢复后重新锁定到共享目录。
    set_config_data_root || return 1
    info "恢复完成。数据仍位于 Android 共享存储。建议重启 Luker。"
}

backup_menu() {
    while true; do
        clear
        echo -e "${CYAN}========== Luker 备份与恢复 ==========${NC}"
        echo "备份位置：$(get_abs_path "$BACKUP_DIR" 2>/dev/null || echo "$BACKUP_DIR")"
        echo "1. 创建备份"
        echo "2. 恢复备份"
        echo "3. 查看备份目录"
        echo "0. 返回"
        read -r -p "请选择：" choice
        case "$choice" in
            1) backup_data; pause ;;
            2) restore_data; pause ;;
            3) ensure_shared_storage && { echo "$BACKUP_DIR"; ls -lh "$BACKUP_DIR" 2>/dev/null; }; pause ;;
            0) return ;;
            *) error "无效选项"; pause ;;
        esac
    done
}

# ---------- 进程 / 端口 ----------
read_pid() {
    [ -f "$PID_FILE" ] || return 1
    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null)
    [[ "$pid" =~ ^[0-9]+$ ]] || return 1
    kill -0 "$pid" 2>/dev/null || return 1
    echo "$pid"
}

find_luker_pids() {
    local escaped
    escaped=$(printf '%s' "$LUKER_DIR/server.js" | sed 's/[][\\.^$*+?{}|()]/\\&/g')
    pgrep -f "node .*${escaped}" 2>/dev/null || true
}

port_pids() {
    local port="$1"
    local out=""
    if command -v lsof >/dev/null 2>&1; then
        out=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
    fi
    if [ -z "$out" ] && command -v fuser >/dev/null 2>&1; then
        out=$(fuser "$port"/tcp 2>/dev/null || true)
    fi
    echo "$out" | tr ' ' '\n' | sed '/^$/d' | sort -u
}

show_port_usage() {
    local port
    port=$(get_port)
    local pids
    pids=$(port_pids "$port")
    info "配置端口：$port"
    if [ -z "$pids" ]; then
        info "端口未检测到监听进程。"
        return 0
    fi

    warn "端口 $port 正在被以下 PID 使用："
    local pid
    for pid in $pids; do
        printf "  PID %-7s " "$pid"
        ps -p "$pid" -o args= 2>/dev/null || echo "(无法读取命令行)"
    done
    return 1
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
        echo -e "状态：${GREEN}运行中${NC}（后台 PID $pid）"
    elif [ -n "$pids" ]; then
        echo -e "状态：${GREEN}运行中${NC}（PID: $(echo "$pids" | tr '\n' ' ')）"
    else
        echo -e "状态：${RED}未运行${NC}"
    fi
}

prepare_start() {
    ensure_repo || return 1
    ensure_config
    init_environment || return 1
    ensure_data_separation || {
        error "共享数据目录未就绪，已停止启动，避免继续写入 Termux 私有 data。"
        return 1
    }

    if [ ! -d "$LUKER_DIR/node_modules" ]; then
        warn "node_modules 不存在。"
        install_node_modules || return 1
    fi

    local own_pids
    own_pids=$(find_luker_pids)
    if [ -n "$own_pids" ]; then
        warn "当前 Luker 实例已在运行：$(echo "$own_pids" | tr '\n' ' ')"
        return 1
    fi

    local port foreign
    port=$(get_port)
    foreign=$(port_pids "$port")
    if [ -n "$foreign" ]; then
        error "端口 $port 已被占用，已停止启动。"
        show_port_usage
        return 1
    fi
}

start_foreground() {
    prepare_start || return 1
    cd "$LUKER_DIR" || return 1
    info "前台启动 Luker，Ctrl+C 可停止。"
    exec node "$LUKER_DIR/server.js"
}

start_background() {
    prepare_start || return 1
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
    else
        rm -f "$PID_FILE"
        error "启动失败，最近日志："
        tail -n 40 "$LOG_FILE" 2>/dev/null
        return 1
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
    info "Luker 已停止。"
}

restart_background() {
    stop_luker || true
    sleep 1
    start_background
}

show_logs() {
    if [ ! -f "$LOG_FILE" ]; then
        warn "尚无后台日志：$LOG_FILE"
        return
    fi
    echo -e "${DIM}Ctrl+C 退出实时日志不会停止 Luker。${NC}"
    tail -n 100 -f "$LOG_FILE"
}

open_browser() {
    local url="http://127.0.0.1:$(get_port)"
    info "打开：$url"
    if command -v termux-open-url >/dev/null 2>&1; then
        termux-open-url "$url"
    elif command -v am >/dev/null 2>&1; then
        am start -a android.intent.action.VIEW -d "$url" >/dev/null 2>&1 || true
    else
        echo "$url"
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
        echo "3. 停止 Luker"
        echo "4. 后台重启"
        echo "5. 查看状态"
        echo "6. 查看后台日志"
        echo "7. 打开 Luker 网页"
        echo "0. 返回"
        read -r -p "请选择：" choice
        case "$choice" in
            1) start_foreground ;;
            2) start_background; pause ;;
            3) stop_luker; pause ;;
            4) restart_background; pause ;;
            5) luker_status; pause ;;
            6) show_logs ;;
            7) open_browser; pause ;;
            0) return ;;
            *) error "无效选项"; pause ;;
        esac
    done
}

# ---------- 配置 ----------
change_port() {
    ensure_repo || return 1
    ensure_config
    local current new tmp
    current=$(get_port)
    info "当前端口：$current"
    read -r -p "输入新端口 (1024-65535)：" new
    [[ "$new" =~ ^[0-9]+$ ]] || { error "端口必须是数字。"; return 1; }
    [ "$new" -ge 1024 ] && [ "$new" -le 65535 ] || { error "建议使用 1024-65535。"; return 1; }

    if [ -n "$(port_pids "$new")" ]; then
        error "端口 $new 当前已被占用。"
        return 1
    fi

    tmp="$LUKER_DIR/config.yaml.tmp.$$"
    awk -v p="$new" '
        BEGIN { done=0 }
        !done && /^[[:space:]]*port:[[:space:]]*[0-9]+[[:space:]]*$/ { print "port: " p; done=1; next }
        { print }
        END { if (!done) print "port: " p }
    ' "$LUKER_DIR/config.yaml" > "$tmp" || { rm -f "$tmp"; return 1; }
    mv "$tmp" "$LUKER_DIR/config.yaml"
    info "端口已改为 $new。重启 Luker 后生效。"
}

config_menu() {
    while true; do
        clear
        echo -e "${CYAN}========== Luker 配置 ==========${NC}"
        echo "当前端口：$(get_port)"
        echo "1. 修改端口"
        echo "2. 检查端口占用"
        echo "3. 打开 config.yaml 所在目录信息"
        echo "4. 数据分离 / 存储位置管理"
        echo "0. 返回"
        read -r -p "请选择：" choice
        case "$choice" in
            1) change_port; pause ;;
            2) show_port_usage; pause ;;
            3) echo "$LUKER_DIR/config.yaml"; pause ;;
            4) data_storage_menu ;;
            0) return ;;
            *) error "无效选项"; pause ;;
        esac
    done
}

# ---------- Android 保活 ----------
ensure_termux_api_cli() {
    if ! command -v termux-wake-lock >/dev/null 2>&1; then
        warn "未检测到 termux-api 命令行组件。"
        if command -v pkg >/dev/null 2>&1 && confirm "安装 termux-api 包？" y; then
            pkg install termux-api -y || return 1
        else
            return 1
        fi
    fi
}

keep_alive_menu() {
    while true; do
        clear
        echo -e "${CYAN}========== Android 保活 ==========${NC}"
        echo "1. 获取 Wake Lock"
        echo "2. 释放 Wake Lock"
        echo "3. 打开电池优化设置"
        echo "4. 显示手机端保活建议"
        echo "0. 返回"
        read -r -p "请选择：" choice
        case "$choice" in
            1)
                ensure_termux_api_cli && {
                    termux-wake-lock
                    info "已请求 Wake Lock。Termux:API App 也需要已安装。"
                }
                pause
                ;;
            2)
                ensure_termux_api_cli && termux-wake-unlock
                info "已释放 Wake Lock。"
                pause
                ;;
            3)
                am start -a android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS 2>/dev/null || \
                am start -a android.settings.BATTERY_SAVER_SETTINGS 2>/dev/null || \
                warn "无法自动打开，请手动进入 Termux 的电池设置。"
                pause
                ;;
            4)
                echo "- 将 Termux 电池策略设为“不限制/无限制”"
                echo "- 允许后台活动、自启动、通知"
                echo "- 最近任务中锁定 Termux"
                echo "- 长时间运行时可配合 Wake Lock"
                pause
                ;;
            0) return ;;
            *) error "无效选项"; pause ;;
        esac
    done
}

# ---------- 工具箱自安装 / 自更新 / 自启 ----------
install_self() {
    local current=""
    [ -e "$0" ] && current=$(get_abs_path "$0")

    if [ -n "$current" ] && [ -f "$current" ]; then
        if [ "$current" != "$TOOLBOX_PATH" ]; then
            cp "$current" "$TOOLBOX_PATH" || return 1
            chmod +x "$TOOLBOX_PATH"
            info "工具箱已安装到：$TOOLBOX_PATH"
        fi
        return 0
    fi

    info "当前为临时执行，尝试从仓库保存工具箱..."
    curl -fsSL "$SCRIPT_URL" -o "$TOOLBOX_PATH" || {
        warn "暂时无法保存工具箱。请先将脚本提交到：scripts/termux/luker_toolbox.sh"
        return 1
    }
    chmod +x "$TOOLBOX_PATH"
}

update_self() {
    info "当前工具箱：$SCRIPT_VERSION"
    local tmp="$TOOLBOX_PATH.tmp.$$"
    if ! curl -fsSL "$SCRIPT_URL" -o "$tmp"; then
        rm -f "$tmp"
        error "无法下载工具箱更新：$SCRIPT_URL"
        info "如果这是首次使用，请先把本脚本提交到 Luker 的 scripts/termux/luker_toolbox.sh。"
        return 1
    fi

    grep -q '^#!/.*bash' "$tmp" || { rm -f "$tmp"; error "下载内容不是有效 Bash 脚本。"; return 1; }
    mv "$tmp" "$TOOLBOX_PATH"
    chmod +x "$TOOLBOX_PATH"
    info "工具箱已更新，重新载入。"
    exec bash "$TOOLBOX_PATH" --skip-init
}

remove_autostart_blocks() {
    local file="$1"
    [ -f "$file" ] || return 0
    local tmp="$file.luker_tmp.$$"
    awk '
        /^# BEGIN LUKER_TOOLBOX_AUTOSTART$/ {skip=1; next}
        /^# END LUKER_TOOLBOX_AUTOSTART$/   {skip=0; next}
        !skip {print}
    ' "$file" > "$tmp" && mv "$tmp" "$file"
}

autostart_file() {
    if [ -n "${ZSH_VERSION:-}" ] || [[ "${SHELL:-}" == *zsh ]]; then
        echo "$HOME/.zshrc"
    else
        echo "$HOME/.bashrc"
    fi
}

enable_toolbox_autostart() {
    install_self || return 1
    local rc
    rc=$(autostart_file)
    touch "$rc"
    remove_autostart_blocks "$rc"
    cat >> "$rc" <<'BLOCK'
# BEGIN LUKER_TOOLBOX_AUTOSTART
if [ -t 0 ] && [ -z "$TMUX" ] && [ -z "$LUKER_TOOLBOX_SESSION_GUARD" ]; then
    export LUKER_TOOLBOX_SESSION_GUARD=1
    [ -f "$HOME/luker_toolbox.sh" ] && bash "$HOME/luker_toolbox.sh" --skip-init
fi
# END LUKER_TOOLBOX_AUTOSTART
BLOCK
    info "已开启：进入 Termux 时自动打开 Luker 工具箱。"
    info "配置文件：$rc"
}

disable_toolbox_autostart() {
    remove_autostart_blocks "$HOME/.bashrc"
    remove_autostart_blocks "$HOME/.zshrc"
    info "已关闭工具箱自动打开。"
}

autostart_enabled() {
    grep -q '^# BEGIN LUKER_TOOLBOX_AUTOSTART$' "$HOME/.bashrc" 2>/dev/null || \
    grep -q '^# BEGIN LUKER_TOOLBOX_AUTOSTART$' "$HOME/.zshrc" 2>/dev/null
}

toggle_autostart() {
    if autostart_enabled; then
        disable_toolbox_autostart
    else
        enable_toolbox_autostart
    fi
}

# ---------- 实例 ----------
toggle_instance() {
    if [ "$LUKER_DIR" = "$LUKER_MAIN_DIR" ]; then
        LUKER_DIR="$LUKER_SECOND_DIR"
        CURRENT_INSTANCE="分身实例 (Luker-2)"
        PID_FILE="$TOOLBOX_HOME/luker-2.pid"
        LOG_FILE="$TOOLBOX_HOME/luker-2.log"
    else
        LUKER_DIR="$LUKER_MAIN_DIR"
        CURRENT_INSTANCE="主实例 (Luker)"
        PID_FILE="$TOOLBOX_HOME/luker.pid"
        LOG_FILE="$TOOLBOX_HOME/luker.log"
    fi
    refresh_instance_storage_paths
    info "已切换到：$CURRENT_INSTANCE"
}

# ---------- 卸载 ----------
uninstall_menu() {
    echo "1. 删除当前 Luker 程序（保留共享数据）"
    echo "2. 删除工具箱与自启配置"
    echo "3. 删除当前 Luker 程序 + 工具箱（保留共享数据）"
    echo "4. 删除当前实例的共享数据与备份"
    echo "0. 返回"
    local choice
    read -r -p "请选择：" choice
    case "$choice" in
        1)
            safe_delete_confirm "删除 $LUKER_DIR" || return
            stop_luker || true
            rm -rf "$LUKER_DIR"
            info "已删除当前实例程序。共享数据仍保留：$LUKER_SHARED_DIR"
            ;;
        2)
            safe_delete_confirm "删除 Luker 工具箱" || return
            disable_toolbox_autostart
            rm -f "$TOOLBOX_PATH"
            info "已删除工具箱。"
            exit 0
            ;;
        3)
            safe_delete_confirm "删除 $LUKER_DIR 和 Luker 工具箱" || return
            stop_luker || true
            rm -rf "$LUKER_DIR"
            disable_toolbox_autostart
            rm -f "$TOOLBOX_PATH"
            info "已完成程序与工具箱卸载。共享数据仍保留：$LUKER_SHARED_DIR"
            exit 0
            ;;
        4)
            ensure_shared_storage || return
            safe_delete_confirm "永久删除共享目录 $LUKER_SHARED_DIR（包含 data/backups/exports）" || return
            rm -rf "$LUKER_SHARED_DIR"
            info "当前实例共享数据与备份已删除。"
            ;;
        0) return ;;
        *) error "无效选项" ;;
    esac
}

# ---------- 主菜单 ----------
main_menu() {
    while true; do
        clear
        local auto="OFF"
        autostart_enabled && auto="ON"

        echo -e "${CYAN}"
        echo " _          _             "
        echo "| |   _   _| | _____ _ __ "
        echo "| |  | | | | |/ / _ \ '__|"
        echo "| |__| |_| |   <  __/ |   "
        echo "|_____\__,_|_|\_\___|_|   "
        echo -e "${NC}"
        echo -e "${CYAN}====================================================${NC}"
        echo -e "${BOLD}${PURPLE} Luker Termux 工具箱 ${NC} ${YELLOW}${SCRIPT_VERSION}${NC}"
        echo -e "${CYAN}====================================================${NC}"
        echo -e "实例：${YELLOW}$CURRENT_INSTANCE${NC}"
        echo -e "程序：${CYAN}$LUKER_DIR${NC}"
        echo -e "数据：${CYAN}$(get_abs_path "$LUKER_DATA_DIR" 2>/dev/null || echo "$LUKER_DATA_DIR")${NC}"
        echo -e "版本：${BLUE}$(current_ref_label)${NC}"
        echo -e "${CYAN}----------------------------------------------------${NC}"
        echo -e "${BOLD}${BLUE}[运行]${NC}"
        echo " 1. 启动/停止/状态/日志"
        echo " 2. 安装 Luker"
        echo " 3. 更新/切换到目标分支"
        echo " 4. Tag / Commit 版本切换"
        echo ""
        echo -e "${BOLD}${BLUE}[维护]${NC}"
        echo " 5. 重装 npm 依赖"
        echo " 6. 备份与恢复"
        echo " 7. 端口与配置"
        echo " 8. Android 保活"
        echo " 9. 数据分离 / 共享存储"
        echo ""
        echo -e "${BOLD}${BLUE}[工具箱]${NC}"
        echo "10. 更新此工具箱"
        echo "11. Termux 打开时自动进入工具箱 [$auto]"
        echo "12. 切换主实例 / 分身实例"
        echo "13. 卸载管理"
        echo ""
        echo " 0. 退出"
        echo -e "${CYAN}====================================================${NC}"

        local option
        read -r -p "请输入选项 [0-13]：" option
        case "$option" in
            1) process_menu ;;
            2) install_luker; pause ;;
            3) update_luker; pause ;;
            4) rollback_luker; pause ;;
            5) install_node_modules; pause ;;
            6) backup_menu ;;
            7) config_menu ;;
            8) keep_alive_menu ;;
            9) data_storage_menu ;;
            10) update_self; pause ;;
            11) toggle_autostart; pause ;;
            12) toggle_instance; sleep 1 ;;
            13) uninstall_menu; pause ;;
            0) exit 0 ;;
            *) error "无效选项"; pause ;;
        esac
    done
}

# ---------- 入口 ----------
refresh_instance_storage_paths
if [ "${1:-}" != "--skip-init" ]; then
    init_environment || {
        warn "环境检查未完全通过。你仍可进入工具箱处理安装/修复。"
        pause
    }
    install_self || true
fi

# 已安装的旧版 Luker 在进入菜单时只提示，不强制迁移；真正启动前会强制完成数据分离。
if repo_ok; then
    ensure_config
    local_current_data="$(resolve_config_data_dir 2>/dev/null || echo ./data)"
    if [ "$(get_abs_path "$local_current_data" 2>/dev/null || echo "$local_current_data")" != "$(get_abs_path "$LUKER_DATA_DIR" 2>/dev/null || echo "$LUKER_DATA_DIR")" ]; then
        warn "检测到当前 Luker 数据仍在旧位置：$local_current_data"
        info "首次启动 Luker 时，工具箱会引导迁移到 Android 共享存储。"
        sleep 2
    fi
fi

main_menu
