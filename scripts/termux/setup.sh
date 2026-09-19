#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
WEBPACK_CACHE_ROOT="${ATRIA_TERMUX_WEBPACK_CACHE_ROOT:-${HOME}/.cache/atria-webpack}"

if ! command -v pkg >/dev/null 2>&1 || [[ "${PREFIX:-}" != *com.termux* ]]; then
  echo "[atria-termux] This installer must be run inside Termux on Android." >&2
  exit 1
fi

log() {
  printf '[atria-termux] %s\n' "$*"
}

log "Installing Termux runtime/build dependencies..."
pkg update -y
pkg install -y git curl python make clang pkg-config

if ! command -v node >/dev/null 2>&1; then
  log "Node.js is not installed; installing Termux Node.js LTS..."
  pkg install -y nodejs-lts npm
elif [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 20 ]]; then
  echo "[atria-termux] Atria requires Node.js >= 20; found $(node --version). Upgrade the existing Termux Node package first." >&2
  exit 1
elif ! command -v npm >/dev/null 2>&1; then
  log "npm is not installed; installing it..."
  pkg install -y npm
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "[atria-termux] Node.js/npm installation failed." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( NODE_MAJOR < 20 )); then
  echo "[atria-termux] Atria requires Node.js >= 20; found $(node --version)." >&2
  exit 1
fi

cd "${REPO_ROOT}"
log "Installing Atria production dependencies with Termux Node headers..."
# Use node-gyp's npm>=11-compatible environment key. Termux ships patched local
# Node headers; native addons should use those instead of downloaded desktop headers.
npm_package_config_node_gyp_nodedir="${PREFIX}" npm ci --omit=dev --no-audit --no-fund

log "Initializing Atria config..."
npm run init

log "Verifying/repairing native SQLite binding for Termux..."
bash "${SCRIPT_DIR}/fix-better-sqlite3.sh"

log "Prebuilding frontend bundles in fast private storage..."
mkdir -p "${WEBPACK_CACHE_ROOT}"
ATRIA_WEBPACK_CACHE_ROOT="${WEBPACK_CACHE_ROOT}" npm run frontend:prebuild-cache

# Install an executable wrapper outside the Git worktree. Do not chmod tracked
# scripts: changing their file mode would make future `git pull` updates dirty.
{
  printf '#!%s/bin/bash\n' "${PREFIX}"
  printf 'exec bash %q "$@"\n' "${SCRIPT_DIR}/atria.sh"
} > "${PREFIX}/bin/atria-termux"
chmod +x "${PREFIX}/bin/atria-termux"

log "Running self-check..."
"${PREFIX}/bin/atria-termux" doctor

cat <<EOF2

[atria-termux] Setup complete.

Start Atria and open it in your browser:
  atria-termux start

Useful commands:
  atria-termux status
  atria-termux logs
  atria-termux doctor
  atria-termux update
  atria-termux stop

Default URL: http://127.0.0.1:8000
EOF2
