#!/data/data/com.termux/files/usr/bin/bash
# Luker Toolbox launcher - v0.3.0
# 下载、校验并启动完整运行时；完整脚本会自动保存到 ~/luker_toolbox.sh。

set -e
set -o pipefail

SCRIPT_VERSION="v0.3.0"
RUNTIME_URL="${LUKER_TOOLBOX_RUNTIME_URL:-https://raw.githubusercontent.com/ZZZdragondYNGPHX/Luker/custom-release/scripts/termux/luker_toolbox.runtime.sh.gz}"
RUNTIME_SHA256="${LUKER_TOOLBOX_RUNTIME_SHA256:-2ac8cd6fbab0fdf182caaa634188371e0f1f5fa3a9fe02ff89ee862070efd9b2}"
BOOT_DIR="${TMPDIR:-${PREFIX:-/data/data/com.termux/files/usr}/tmp}/luker-toolbox-$$"
GZ_FILE="$BOOT_DIR/runtime.sh.gz"
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

gzip -dc "$GZ_FILE" > "$RUNTIME_FILE" || {
    echo "[ERROR] 无法解压工具箱运行时。" >&2
    exit 1
}

bash -n "$RUNTIME_FILE" || {
    echo "[ERROR] 工具箱运行时语法检查失败。" >&2
    exit 1
}
chmod +x "$RUNTIME_FILE"
exec bash "$RUNTIME_FILE" "$@"
