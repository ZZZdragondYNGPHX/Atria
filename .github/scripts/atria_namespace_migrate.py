#!/usr/bin/env python3
from __future__ import annotations

import base64
import gzip
import hashlib
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
os.chdir(ROOT)

PROTECTED_TEXT = {
    "AGENTS.md",
    "FORK_MAINTENANCE.md",
    "docs/plans/atria-namespace-migration.md",
    ".github/scripts/atria_namespace_migrate.py",
}

DELETE_PATHS = {
    ".st-119-conflicts.txt",
    ".st-119-diagnostics.txt",
}

SPECIFIC_REPLACEMENTS = [
    ("https://raw.githubusercontent.com/ZZZdragondYNGPHX/Luker/custom-release/", "https://raw.githubusercontent.com/ZZZdragondYNGPHX/Atria/main/"),
    ("https://github.com/ZZZdragondYNGPHX/Luker.git", "https://github.com/ZZZdragondYNGPHX/Atria.git"),
    ("luker_generation", "atri_generation"),
    ("luker_orchestrator_", "atri_orchestrator_"),
    ("luker_orch_", "atri_orch_"),
    ("luker_memory_", "atri_memory_"),
    ("luker_mg_", "atri_mg_"),
    ("luker_ctx_", "atri_ctx_"),
    ("luker_docs_", "atri_docs_"),
    ("luker_web_", "atri_web_"),
    ("luker_search_agent_", "atri_search_agent_"),
    ("luker_agent_runtime_", "atri_agent_runtime_"),
    ("luker_agent_", "atri_agent_"),
    ("luker_runtime_", "atri_runtime_"),
    ("luker_checkpoint_", "atri_checkpoint_"),
    ("luker_iteration_", "atri_iteration_"),
    ("luker_floor_", "atri_floor_"),
    ("luker_tool_", "atri_tool_"),
]

def run(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, check=check, text=True, capture_output=False)

def tracked_files() -> list[str]:
    cp = subprocess.run(["git", "ls-files", "-z"], check=True, capture_output=True)
    return [x.decode("utf-8") for x in cp.stdout.split(b"\0") if x]

def transform_text(text: str, path: str) -> str:
    for old, new in SPECIFIC_REPLACEMENTS:
        text = text.replace(old, new)

    if path.startswith("scripts/termux/"):
        text = text.replace("custom-release", "main")

    text = text.replace("LUKER_", "ATRIA_")
    text = text.replace("Luker", "Atria")
    text = text.replace("LUKER", "ATRIA")
    text = text.replace("luker-", "atria-")
    text = text.replace("luker.", "atria.")
    text = text.replace("luker_", "atria_")
    text = text.replace("luker", "atria")
    return text

def rename_paths() -> None:
    paths = [p for p in tracked_files() if re.search(r"luker", p, flags=re.I)]
    for old in sorted(paths, key=lambda p: (p.count("/"), len(p)), reverse=True):
        if not Path(old).exists():
            continue
        new = old.replace("LUKER", "ATRIA").replace("Luker", "Atria").replace("luker", "atria")
        if new == old:
            continue
        Path(new).parent.mkdir(parents=True, exist_ok=True)
        run("git", "mv", old, new)

def delete_stale_artifacts() -> None:
    for path in DELETE_PATHS:
        if Path(path).exists():
            run("git", "rm", "-f", path)

def migrate_text_files() -> None:
    for rel in tracked_files():
        if rel in PROTECTED_TEXT or rel.startswith(".github/workflows/"):
            continue
        path = Path(rel)
        if not path.is_file() or path.suffix == ".gz":
            continue
        raw = path.read_bytes()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            continue
        new = transform_text(text, rel)
        if new != text:
            path.write_text(new, encoding="utf-8", newline="")

def migrate_termux_runtime() -> None:
    gz_path = Path("scripts/termux/atria_toolbox.runtime.sh.gz")
    part1 = Path("scripts/termux/dist/atria_toolbox_v0.3.0.b64.part1")
    part2 = Path("scripts/termux/dist/atria_toolbox_v0.3.0.b64.part2")
    launcher = Path("scripts/termux/atria_toolbox.sh")

    if not gz_path.exists():
        raise SystemExit(f"missing Termux runtime: {gz_path}")
    raw_runtime = gzip.decompress(gz_path.read_bytes())
    runtime_text = raw_runtime.decode("utf-8")
    migrated = transform_text(runtime_text, str(gz_path)).encode("utf-8")
    gz_bytes = gzip.compress(migrated, compresslevel=9, mtime=0)
    gz_path.write_bytes(gz_bytes)

    encoded = base64.b64encode(migrated).decode("ascii")
    split_at = 15000
    part1.write_text(encoded[:split_at], encoding="ascii")
    part2.write_text(encoded[split_at:], encoding="ascii")

    decoded = base64.b64decode(part1.read_text(encoding="ascii") + part2.read_text(encoding="ascii"))
    if decoded != migrated:
        raise SystemExit("Termux base64 distribution does not round-trip")

    digest = hashlib.sha256(gz_bytes).hexdigest()
    launcher_text = launcher.read_text(encoding="utf-8")
    replacement = 'RUNTIME_SHA256="$' + '{ATRIA_TOOLBOX_RUNTIME_SHA256:-' + digest + '}"'
    launcher_text, count = re.subn(
        r'RUNTIME_SHA256="\$\{ATRIA_TOOLBOX_RUNTIME_SHA256:-[0-9a-f]{64}\}"',
        replacement,
        launcher_text,
        count=1,
    )
    if count != 1:
        raise SystemExit("could not update Termux runtime SHA256")
    launcher.write_text(launcher_text, encoding="utf-8")

def write_namespace_guard() -> None:
    guard = r'''#!/usr/bin/env bash
set -euo pipefail

legacy_lower="lu""ker"
legacy_title="Lu""ker"
legacy_upper="LU""KER"
pattern="${legacy_title}|${legacy_lower}|${legacy_upper}"

if git grep -n -I -E "${pattern}" -- \
  ':!docs/**' \
  ':!AGENTS.md' \
  ':!FORK_MAINTENANCE.md' \
  ':!.github/workflows/**' \
  ':!.github/scripts/atria_namespace_migrate.py'
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
'''
    path = Path("scripts/check-atria-namespace.sh")
    path.write_text(guard, encoding="utf-8")
    path.chmod(0o755)

def update_agent_rules() -> None:
    path = Path("AGENTS.md")
    text = path.read_text(encoding="utf-8")
    text = text.replace(
        "- Legacy Luker identifiers may remain when they are compatibility-sensitive persisted keys, protocol fields, migration surfaces, or legacy data paths.\n- Do not introduce new Luker-branded product identity.",
        "- Active Atria product code must use Atria-owned namespaces; predecessor compatibility aliases and persisted-key fallbacks are not part of the current product contract.\n- The legacy reference branch may retain historical predecessor naming, but active product code must not reintroduce it."
    )
    path.write_text(text, encoding="utf-8")

def main() -> None:
    rename_paths()
    delete_stale_artifacts()
    migrate_text_files()
    migrate_termux_runtime()
    write_namespace_guard()
    update_agent_rules()
    run("git", "add", "-A")
    run("git", "diff", "--cached", "--check")
    print("Atria namespace migration working tree prepared.")

if __name__ == "__main__":
    main()
