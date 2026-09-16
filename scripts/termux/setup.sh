#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

if ! command -v pkg >/dev/null 2>&1 || [[ "${PREFIX:-}" != *com.termux* ]]; then
  echo "[luker-termux] This installer must be run inside Termux on Android." >&2
  exit 1
fi

log() {
  printf '[luker-termux] %s\n' "$*"
}

log "Installing Termux runtime/build dependencies..."
pkg update -y
pkg install -y git curl python make clang pkg-config

if ! command -v node >/dev/null 2>&1; then
  log "Node.js is not installed; installing Termux Node.js LTS..."
  pkg install -y nodejs-lts npm
elif [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 20 ]]; then
  echo "[luker-termux] Luker requires Node.js >= 20; found $(node --version). Upgrade the existing Termux Node package first." >&2
  exit 1
elif ! command -v npm >/dev/null 2>&1; then
  log "npm is not installed; installing it..."
  pkg install -y npm
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "[luker-termux] Node.js/npm installation failed." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( NODE_MAJOR < 20 )); then
  echo "[luker-termux] Luker requires Node.js >= 20; found $(node --version)." >&2
  exit 1
fi

cd "${REPO_ROOT}"
log "Installing Luker production dependencies with Termux Node headers..."
# Use node-gyp's npm>=11-compatible environment key. Termux ships patched local
# Node headers; native addons should use those instead of downloaded desktop headers.
npm_package_config_node_gyp_nodedir="${PREFIX}" npm ci --omit=dev --no-audit --no-fund

log "Initializing Luker config..."
npm run init

log "Verifying/repairing native SQLite binding for Termux..."
bash "${SCRIPT_DIR}/fix-better-sqlite3.sh"

# Install an executable wrapper outside the Git worktree. Do not chmod tracked
# scripts: changing their file mode would make future `git pull` updates dirty.
{
  printf '#!%s/bin/bash\n' "${PREFIX}"
  printf 'exec bash %q "$@"\n' "${SCRIPT_DIR}/luker.sh"
} > "${PREFIX}/bin/luker-termux"
chmod +x "${PREFIX}/bin/luker-termux"

log "Running self-check..."
"${PREFIX}/bin/luker-termux" doctor

cat <<EOF2

[luker-termux] Setup complete.

Start Luker and open it in your browser:
  luker-termux start

Useful commands:
  luker-termux status
  luker-termux logs
  luker-termux doctor
  luker-termux update
  luker-termux stop

Default URL: http://127.0.0.1:8000
EOF2
