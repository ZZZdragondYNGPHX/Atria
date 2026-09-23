# Active checkpoint: Model / Prompt / Runtime — P4 complete, ready for P5

- Repository: ZZZdragondYNGPHX/Atria
- Work branch: refactor/atria-model-prompt-settings
- Main unchanged: 2d1c3ec9c8039ecc4728ebe712f4a9f14186906f
- P3 HEAD: 5e51332b34146236fd4d4a6d45c25ef7c37a9e08
- P4 validated/pushed HEAD: 6cba266814a7ff04666220f1031efdb844ad4e46
- Date: 2026-09-23
- Next: P5 Native Runtime Product UI, only after explicit continuation.
- Same branch; no main merge, new branch or P0–P4 redo.

## Delivered

Native Game/Role Router, Play, Studio Agent, Orchestrator and Memory/Search use
an authenticated generation host, P2 resolver/service and P3 context/compiler over
P1 exact resources. No second Store/Library/fact scanner. Non-Native legacy sender
remains an explicit adapter. Concrete OpenAI-compatible/raw-text HTTP/SSE ports
use exact Secret IDs and documented controls. Host retries precede complete-route
fallback; outer legacy loops cannot replay terminal Native errors.

Play retains Draft/Revision/Retry/Continue and orchestration behavior. Live drafts
are presentation-only; Stop cancels/discards. Real screenshots found/fixed mobile
Play layout and an uncaught Stop abort. Studio retains backend tools, pinned Task
base revision, Skills and human Review/Commit/Takeover. Fixed Create Task's initial
execution. A8 now requires executeNativeGeneration; other A8 and all A6 gates remain.

## Validation

- Broad FS/SQLite: 206 suites / 1807 tests passed.
- Final caller follow-up: 143 suites / 1744 tests passed.
- Focused P2–P4/client/Play/A9: 6 suites / 98 tests passed. Counts overlap.
- P0–P4, A1/A2/A6/A7/A8, N9/N10 guards, lint, syntax/diff and webpack passed.
- Local server + Playwright Edge: four desktop/mobile cases passed, including
  streaming/Stop/Timeline and Studio create/takeover. Screenshots visually checked.
- Earlier SQL failures were absent MySQL/PostgreSQL services; final runs use the
  existing disable switches. A9 Windows path bug fixed. No Android/Docker run.
- No live external model credentials or real mobile device certification.

See planning/atria-model-prompt-settings/P4-VALIDATION.md for commands/exclusions.
Runtime ABI and residual whitelist: src/native/model-prompt-runtime/README.md.

## Next

Use planning/atria-model-prompt-settings/NEXT.md. P5 delivers Native Runtime
Routes/Models/Connections/Profiles/Diagnostics and missing-route remediation.
Native users need explicit P1 configuration; no legacy model fallback exists.
Legacy Native dry-run is rejected; preview must use P3. Evolve A6's transitional
gates only after replacement UI works and passes visual verification. Do not start
P6–P8 or merge main.
