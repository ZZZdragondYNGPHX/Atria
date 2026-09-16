#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
MODULE_DIR="${REPO_ROOT}/node_modules/better-sqlite3"

log() {
  printf '[luker-termux] %s\n' "$*"
}

fail() {
  printf '[luker-termux] ERROR: %s\n' "$*" >&2
  exit 1
}

if ! command -v pkg >/dev/null 2>&1 || [[ "${PREFIX:-}" != *com.termux* ]]; then
  fail "This native dependency repair must run inside Termux on Android."
fi

[[ -d "${MODULE_DIR}" ]] || fail "better-sqlite3 is not installed. Run npm ci first."
[[ -f "${MODULE_DIR}/deps/common.gypi" ]] || fail "Missing ${MODULE_DIR}/deps/common.gypi"
[[ -f "${MODULE_DIR}/binding.gyp" ]] || fail "Missing ${MODULE_DIR}/binding.gyp"

verify_sqlite() {
  (cd "${REPO_ROOT}" && node --input-type=module -e "const {default: Database}=await import('better-sqlite3'); const db=new Database(':memory:'); const row=db.prepare('select 1 as ok').get(); db.close(); if (row.ok !== 1) process.exit(1);") >/dev/null 2>&1
}

if verify_sqlite; then
  log "better-sqlite3 native binding: OK"
  exit 0
fi

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
