# Skill invocation integration checkpoint

Updated: 2026-09-27. Approved plan step 2; later phases remain pending.

- Branch: `feat/native-experience-modes-capability-deepening`.
- Baseline: `fda5907ed7e80db7c47c2baa168fdfb554ca1c7d`.
- Result: `db0369deaf2b296f2e5361b88460fd047536f505` (pushed).
- Main remains `4dab353ac639d42eae885c79e18245267abd6820`. No merge or branch deletion; all earlier commits retained.

## Implementation

`public/shared/skill-invocation.js` now owns physical scope precedence and invocation filtering for narrative, Studio and Agents. Scope resolution happens before per-path off/on-demand/always settings; an off or denied more-specific entry never resurrects a lower-scope namesake. Existing declarations, exact PackageVersion matching, mode/agent visible inheritance and unioned deny lists remain. Folder metadata does not affect resolution. Preferences use the existing authenticated Extensions settings authority; no Package originals or user data migration.

Native Studio resolves inventory once for its Task, loads always instructions into its system prompt, and restricts supporting-file/list tools to that resolved inventory. Skill read options enforce one-based offset, 1–200 lines and a 32,768-character response ceiling. Settings/read failures do not silently restore disabled Skills.

Agents' existing resolver and prompt block now use the common helpers and always instructions. Active Native Sessions automatically route through global -> exact PackageVersion resolution; legacy chat retains global/preset/orchestration-preset/character layering. Existing skill tools still receive the filtered visible set; no tool privileges are granted by a Skill. Settings are read anew on resolution (inventory retains its existing brief cache).

Native Generation Host prepares narrative Skills from the authenticated user's existing SkillRepository and ExtensionsStore. Ordinary narrator calls use the narrative path. Model Tasks use explicit Turn narratorTaskId or exact Activity narrator task/variant declarations, independent of their borrowed model route role. Unrelated Tasks do not acquire narrative Skills merely because their route is role.narrator.

Always instructions and the scoped on-demand inventory enter ContextPlan as procedural directives with provenance, installed hashes and the existing provider token budget. Read/list tools run in a maximum six-round, eight-calls-per-round loop within the existing scheduler. Every round re-enters GenerationService for capability validation, prompt compilation/token budgeting, secret handling, cancellation and fallback. Reads check installed identity, reject path traversal, cap individual content and cumulative tool payloads. Session/Project anchors are checked before and after sends. Provider continuation state is preserved. Only final prose is published to observers; intermediate tool-round prose is buffered. Final ContextPlan plus `skillRounds` retain request evidence. No Session/World scans, state writes or second generation scheduler were introduced.

## Actual lightweight validation

With MySQL/PostgreSQL tests disabled:

- `npm --prefix tests run test:unit -- --runInBand skill-invocation native-skill-platform studio-agent-a8 model-prompt-runtime-p4 multi-skill-visible-resolver skill-resolution-scope-precedence skill-resolution-runtime-plumbing --silent --verbose=false` — 7 suites / 63 tests passed.
- `... --runInBand skill-invocation information-session-p6 --testNamePattern='Skill|Skill context' --silent --verbose=false` — 8 passed / 26 skipped. Six are overlapping resolver cases; two additional P6 Skill isolation cases run on FS and SQLite. **65 distinct passing tests across eight involved suites**, not a full run of information-session-p6.
- ESLint on all 13 changed JS files: passed, no warnings/errors. `git diff --check`: passed.
- New cases cover scope/path isolation, deny-over-always, references/pagination, actual local fake HTTP -> GenerationService rounds, final-only prose, provider-state continuation, round/cancel/stale bounds, actual token-budget rejection before send, Studio tool dispatch and Native Agent dispatch. P6 tests prove selected projections remain scoped and unrelated Tasks receive no Skill directive.

Two development failures were corrected: Skill provenance initially used a field outside the closed ContextPlan contract; a test import preceding its jsdom docblock disabled its intended environment. Both affected suites subsequently passed.

No full repository regression, global guard sweep, browser visual run, Android, Docker, paid model call or real-user data change. Broad verification remains deferred until UI, plugin runner and bundled Skill content are complete, per current user instruction.

## Bounds and next phase

- Content caps use JS string character counts: 32,768 per always/read result, 131,072 aggregate always instructions and separately cumulative narrative tool results. The provider token budget remains authoritative and may reject smaller inputs.
- Available narrative Skills require generation.tools; unsupported providers fail capability validation. Narrative calls with caller-supplied tools are rejected as an explicit tool-authority conflict rather than executed by the Skill loop. Existing unrelated generation roles are unchanged.
- Skill-bearing narrative calls buffer streaming until the final tool-free response. Six rounds is a hard limit; no autonomous continuation scheduler.
- Agent resolution failures retain existing fail-closed empty visibility behavior; no disabled/denied Skill is restored.
- Unified Extensions UI, folder/path controls, executable plugin/script Host SDK and first Native authoring Skill bundle are still unimplemented. Existing API preferences can drive these paths; this checkpoint does not claim finished product UX or full acceptance.

Next checkpoint: executable browser external/local plugin runtime and SDK lifecycle, using the foundation store/routes and confirmed Global / Prompt preset / Work targets. Preserve entire-Package Work identity, OR matching with once-only activation, cleanup on scope exit/disable/edit and late async disposal. Continue targeted checks only. Keep the current branch and leave main untouched.
