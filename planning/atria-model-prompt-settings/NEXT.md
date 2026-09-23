# NEXT: P4 — First-party Runtime Cutover

P0/P1/P2/P3 complete. Stop until explicit user continuation.

- Work branch: refactor/atria-model-prompt-settings
- Main baseline: 2d1c3ec9c8039ecc4728ebe712f4a9f14186906f
- P3 validated HEAD: 5e51332b34146236fd4d4a6d45c25ef7c37a9e08
- P3 evidence: P3-VALIDATION.md; implementation ABI: src/native/model-prompt-runtime/README.md.

## Next-session prompt

Continue Atria Model / Prompt / Runtime Native Refactor on the same work branch.
Fetch work branch, main and docs; preserve newer remote commits. Do not create a new
branch or merge main. Read main:AGENTS.md, main:FORK_MAINTENANCE.md,
docs:handoff/latest-handoff.md, refactor plan and planning pack, current P0–P3 code/tests/
guards, and the actual first-party generation callers before editing.

Execute P4 only as specified in IMPLEMENTATION.md and DESIGN.md:
Game Runtime, Runtime Role Router, Studio Agent, Orchestrator, Memory/Search and Native
Play first-party generation paths move to GenerationService and the P3 compiler/context
ports. Reuse existing exact resource, Session/Revision, Library, Store and Resource Graph
authorities. Preserve role/fallback semantics, tools/output contract, secret boundary,
request isolation and human Review/Commit. Single-model and orchestration must project
the same Prompt resources. Third-party legacy facade can remain as a compatibility island.
Do not let first-party native calls read generateTask, buildPresetAwarePromptMessages,
connectionProfiles.resolve or getPresetManager as authority.

Only update A8's transitional generateTask assertion after its replacement seam and tool
projection are implemented and tested; preserve human Review/Commit and other frozen
invariants. Do not wholesale weaken guards or prematurely change A6 gates. Do not execute
P5–P8. Do not delete the third-party compatibility facade as a shortcut.

P3 has conservative render-only Anthropic/Gemini fixtures; unsupported interleaved system
semantics fail closed. Current transport fixtures still reject tools/output/prefill they
cannot implement. Inspect and implement required host adapters during actual P4 cutover;
do not silently omit authority or misrepresent these fixtures as production coverage.

Run local focused/adjacent tests, relevant N/A/P0–P4 guards, lint, syntax, build and
applicable integration. Android/Docker remain opt-in. Record actual commands/results and
exclusions; push work/docs, report, then stop before P5 until user continues.

For any frontend/UI change: start a local development server; open actual pages with
Playwright; interact with key desktop/mobile pages; capture and visually inspect screenshots;
fix layout/overflow/responsiveness/interaction/visual defects; capture again. DOM/unit tests
or code reasoning alone do not constitute UI acceptance.
