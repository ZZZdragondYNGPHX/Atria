# NEXT: P6 — Library & Studio Authoring

P0-P5 complete. Stop until explicit user continuation.

- Work branch: refactor/atria-model-prompt-settings
- Main baseline: 2d1c3ec9c8039ecc4728ebe712f4a9f14186906f
- P5 validated HEAD: 0cb56b9a0d37789025fb8069d08f6f43ead2413d
- Evidence: P5-VALIDATION.md; runtime ABI: src/native/model-prompt-runtime/README.md.

## Next-session prompt

Continue Atria Model / Prompt / Runtime Native Refactor on the same work branch.
Fetch work branch/main/docs and preserve newer commits. Do not create a new branch,
redo P0-P5 or merge main. Read main:AGENTS.md, main:FORK_MAINTENANCE.md,
docs:handoff/latest-handoff.md, refactor plan/planning pack, P5-VALIDATION.md and
current P1 resource/A1 authoring/A2 Library/A7 Studio/A8 Agent code/tests/guards.

Execute P6 only as specified in IMPLEMENTATION.md and DESIGN.md:
Library exposes Prompt Programs, Prompt Modules and Generation Profiles with origin,
exact revision, Derived From, Used By, read-only Package originals and Fork/Derive.
Existing Build/A7 Studio adds Prompt Authoring and Runtime Design, Simple/Advanced
Prompt editor, stage/module tree, workspace editor/inspector, conditions/parameters/
provenance and compile preview. AI edits must use A1 operations and human Review,
not direct mutation. Keep Build as the primary authoring domain.

Package work includes runtime requirements/recommended exact refs, exact build
closure and flattened/frozen derive resources. Installed Packages must not track
Library latest or allow player edits to Package originals. Reuse existing Store,
Library, Resource Graph and Session authority. No second prompt database, no legacy
preset fallback. Preserve P4 request isolation/tools/Secret/fallback and A8 gates.

P5 now provides P1 configuration HTTP APIs and compile-only preview with pinned
Session/Project context. Runtime Profiles create immutable Library revisions and
routes remain pinned. P5 selects Library revisions and preserves existing scoped
refs; finish the scoped-resource authoring/picker flow within P6's intended scope.
No Prompt visual editor or Secret provisioning/import was added in P5. Unsupported
provider controls still fail closed; do not label P3 render fixtures as transports.

For frontend/UI changes, start local servers, open real pages with Playwright,
interact at desktop/mobile sizes, capture and inspect screenshots, fix defects and
recapture. Tests alone missed P5's 44px mobile editor; verify actual visual geometry
and focus/keyboard behavior. Use independent mobile Studio layouts.

Run focused/adjacent tests, relevant frozen N/A/P0-P6 guards, lint/syntax/build and
real browser integration. Android/Docker remain opt-in. Use existing SQL disable
switches when services are absent and report exclusions honestly. Record actual
results and update/push work/docs. Stop before P7 until explicit continuation.
