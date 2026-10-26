#!/usr/bin/env bash
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)" || exit 1
export ATRIA_TERMUX_ROOT="${ATRIA_TERMUX_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
exec bash "$SCRIPT_DIR/atria_toolbox.sh" "${@:-help}"
