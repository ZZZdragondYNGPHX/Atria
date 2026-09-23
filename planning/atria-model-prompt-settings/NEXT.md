# NEXT: P3 — Request Context & Prompt Compiler

P0/P1/P2 complete. Stop until explicit user continuation.

- Repository: ZZZdragondYNGPHX/Atria
- Existing work branch: refactor/atria-model-prompt-settings
- Main: 2d1c3ec9c8039ecc4728ebe712f4a9f14186906f
- P2 validated HEAD: 5d5ab196c37ad7ff25db44d9dd249c0863b94115
- P2 evidence: P2-VALIDATION.md; latest handoff records actual validation.

## Next-session prompt

Continue Atria Model / Prompt / Runtime Native Refactor on the same work branch.
Fetch work branch, main and docs; preserve newer remote commits. Do not create a
new branch or merge main. Read main:AGENTS.md, main:FORK_MAINTENANCE.md,
docs:handoff/latest-handoff.md, refactor plan, this planning pack and
src/native/model-prompt-runtime, P0/P1/P2 tests/guards and Native Context Compiler.

Execute P3 only as specified in IMPLEMENTATION.md and DESIGN.md:
Native Session/Task/Studio RequestContextPlan providers; Prompt Module/Program compiler;
finite conditions and typed parameters; exact single-parent derive/conflicts;
semantic target/stage ordering; Request Local and explicit cross-stage artifacts;
Prompt IR/protocol renderers; single-model and orchestrated projections of the same
resources. No persistent prompt side effects.

Reuse P2 preparePrompt/Context Provider ports and existing Native context authority.
No second context fact scanner, persistence system, Library or Resource Graph.
Preserve Kernel/tools/output authority, P2 fallback/secret/concurrency invariants,
A1/A8 Review/Commit and frozen semantics. No first-party cutover (P4), Runtime UI (P5),
generateTask deletion or premature A6/A8 replacement-gate changes.

Run local focused/adjacent tests, relevant frozen/P0–P3 guards, lint, syntax, build
and applicable integration. Do not rely on CI. Record commands, exclusions and
actual results; push work/docs, report, and stop before P4 until user continues.

User UI verification rule (2026-09-23): whenever frontend/UI changes are made,
start a local development server, use Playwright to actually open the pages,
interact with key desktop/mobile pages, capture and visually inspect screenshots,
fix layout/overflow/responsiveness/interaction/visual defects, and capture again.
DOM/unit tests or code reasoning alone are not UI acceptance evidence.
