#!/usr/bin/env bash
set -euo pipefail

roots=(
  public/scripts/extensions/orchestrator/workspace
  public/scripts/extensions/orchestrator/main.js
)

fail=0
check() {
  local pattern="$1"
  local label="$2"
  if grep -RInI -F -- "$pattern" "${roots[@]}" --exclude='i18n.js' 2>/dev/null; then
    echo "Workspace IA regression: $label"
    fail=1
  fi
}

check "Knowledge · Sources · Build & Maintenance" "old Memory launcher returned"
check "Unified Preset Library" "old Preset page heading returned"
check "Preset Graph · compiled preview" "compiled-preview accordion returned"
check "Preset Graph · visual" "old visual-graph accordion returned"
check "Advanced Plan structure editor" "raw Plan editor returned to the main product layer"
check "Delete and clear its bindings" "old destructive Preset action returned"
check "This node’s Memory" "old cross-page node Memory button returned"
check "width: min(1080px, 92vw)" "old right-side drawer geometry returned"
check "openWorkspace('Presets')" "old Presets route returned"
check "openWorkspace('Live Run')" "old Live Run route returned"
check "openWorkspace('Graph')" "old Graph route returned"
check "openWorkspace('Agents')" "old Agents route returned"

if (( fail )); then
  exit 1
fi

echo "Atria Workspace information architecture guard passed."
