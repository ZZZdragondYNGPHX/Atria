#!/usr/bin/env bash
set -euo pipefail

legacy_lower="lu""ker"
legacy_title="Lu""ker"
legacy_upper="LU""KER"
pattern="${legacy_title}|${legacy_lower}|${legacy_upper}"

if git grep -n -I -E "${pattern}" -- \
  ':!docs/**' \
  ':!AGENTS.md' \
  ':!FORK_MAINTENANCE.md' \
  ':!README.md' \
  ':!NEW_BUG_PROMPT.md' \
  ':!NEW_FEATURE_PROMPT.md' \
  ':!.github/copilot-instructions.md' \
  ':!.github/workflows/sync-reference-branches.yml'
then
  echo "Unexpected legacy product namespace remains in active Atria code."
  exit 1
fi

runtime="scripts/termux/atria_toolbox.runtime.sh.gz"
if gzip -dc "${runtime}" | grep -n -E "${pattern}"; then
  echo "Unexpected legacy product namespace remains in Termux runtime."
  exit 1
fi

parts=(
  scripts/termux/dist/atria_toolbox_v0.3.0.b64.part1
  scripts/termux/dist/atria_toolbox_v0.3.0.b64.part2
)
if cat "${parts[@]}" | base64 -d | grep -n -E "${pattern}"; then
  echo "Unexpected legacy product namespace remains in Termux distribution."
  exit 1
fi

echo "Atria namespace guard passed."
