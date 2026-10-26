#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
MODULE_DIR="${REPO_ROOT}/node_modules/better-sqlite3"
MODE="${1:-repair}"
case "$MODE" in repair|check|sqlite|check-sqlite) ;; *) echo 'Unknown native check mode' >&2; exit 1 ;; esac

log() {
  printf '[atria-termux] %s\n' "$*"
}

fail() {
  printf '[atria-termux] ERROR: %s\n' "$*" >&2
  exit 1
}

if ! command -v pkg >/dev/null 2>&1 || [[ "${PREFIX:-}" != *com.termux* ]]; then
  fail "This native dependency repair must run inside Termux on Android."
fi

verify_sqlite() {
  (cd "${REPO_ROOT}" && node --input-type=module -e "const {default: Database}=await import('better-sqlite3'); const db=new Database(':memory:'); const row=db.prepare('select 1 as ok').get(); db.close(); if (row.ok !== 1) process.exit(1);") >/dev/null 2>&1
}

build_tools() {
for build_tool in python make clang pkg-config; do
  if ! command -v "${build_tool}" >/dev/null 2>&1; then
    log "Installing missing native build tools..."
    pkg install -y python make clang pkg-config
    break
  fi
done
}

repair_sqlite() {
[[ -f "${MODULE_DIR}/deps/common.gypi" && -f "${MODULE_DIR}/binding.gyp" ]] || fail 'Missing better-sqlite3; run atria-termux repair.'
build_tools

log "Applying the minimal Termux/Android gyp compatibility patch to better-sqlite3..."
python - "${MODULE_DIR}/deps/common.gypi" "${MODULE_DIR}/binding.gyp" <<'PY'
from pathlib import Path
import sys

common = Path(sys.argv[1])
binding = Path(sys.argv[2])

common_text = common.read_text(encoding="utf-8")
if "android_ndk_path" not in common_text:
    needle = "  'variables': { 'sqlite3%': '' },"
    replacement = """  'variables': {
    'sqlite3%': '',
    # Termux uses the system bionic toolchain rather than an Android NDK tree.
    # Defining this variable prevents gyp from aborting while parsing Android headers.
    'android_ndk_path%': '.',
  },"""
    if needle not in common_text:
        raise SystemExit("Unsupported better-sqlite3 deps/common.gypi layout; refusing to patch automatically")
    common.write_text(common_text.replace(needle, replacement, 1), encoding="utf-8")

binding_text = binding.read_text(encoding="utf-8")
if "-Wno-cast-function-type-mismatch" not in binding_text:
    needle = "      'cflags_cc': ['-std=c++20'],"
    replacement = "      'cflags_cc': ['-std=c++20', '-Wno-cast-function-type-mismatch'],"
    if needle not in binding_text:
        raise SystemExit("Unsupported better-sqlite3 binding.gyp layout; refusing to patch automatically")
    binding.write_text(binding_text.replace(needle, replacement, 1), encoding="utf-8")
PY

log "Building better-sqlite3 against Termux's local Node headers..."
(
  cd "${MODULE_DIR}"
  # Pass --nodedir explicitly to node-gyp. This avoids npm 11's deprecated
  # npm_config_nodedir environment setting and prevents node-gyp from fetching
  # unpatched desktop Node headers for an Android build.
  npm run build-release -- --nodedir="${PREFIX}"
)

if ! verify_sqlite; then
  fail "better-sqlite3 compiled but still cannot be loaded. Re-run this script and send the complete build output."
fi

log "better-sqlite3 native binding: repaired and verified"
}

verify_isolate() {
  (cd "$REPO_ROOT" && node --input-type=module -e "const {default:ivm}=await import('isolated-vm'); const isolate=new ivm.Isolate({memoryLimit:8}); const context=isolate.createContextSync(); const value=context.evalSync('1+1'); context.release(); isolate.dispose(); if(value!==2) process.exit(1);") >/dev/null 2>&1
}

if verify_sqlite; then
  log 'SQLite: OK'
elif [[ "$MODE" == check* ]]; then
  fail 'SQLite unavailable; run atria-termux repair.'
else
  repair_sqlite
fi
[[ "$MODE" == *sqlite ]] && exit 0
if verify_isolate; then
  log 'Native computation (isolated-vm): OK'
elif [[ "$MODE" == check* ]]; then
  fail 'Native computation unavailable; run atria-termux repair.'
else
  [[ -d "$REPO_ROOT/node_modules/isolated-vm" ]] || fail 'isolated-vm is not installed; run atria-termux repair.'
  build_tools
  log 'Building isolated-vm with Termux headers (two compiler jobs)...'
  (cd "$REPO_ROOT/node_modules/isolated-vm" && npm run rebuild -- --jobs=2 --nodedir="$PREFIX" -- -Dandroid_ndk_path=.)
  verify_isolate || fail 'isolated-vm still cannot run; retain the compiler output for diagnosis.'
  log 'Native computation: repaired and verified'
fi
