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

 Read/list tools run in a maximum six-round, eight-calls-per-round loop within the existing scheduler. Provider continuation state is preserved. Only final prose is published to observers; intermediate tool-round prose is buffered. Final ContextPlan plus `skillRounds` retain request evidence. No Session/World scans, state writes or second generation scheduler were introduced.

## Bounds and next phase

- Content caps use JS string character counts: 32,768 per always/read result, 131,072 aggregate always instructions and separately cumulative narrative tool results. The provider token budget remains authoritative and may reject smaller inputs.
- Narrative calls with caller-supplied tools are rejected as an explicit tool-authority conflict rather than executed by the Skill loop. Existing unrelated generation roles are unchanged.
- Skill-bearing narrative calls buffer streaming until the final tool-free response. Six rounds is a hard limit; no autonomous continuation scheduler.
- Unified Extensions UI, folder/path controls, executable plugin/script Host SDK and first Native authoring Skill bundle are still unimplemented.

Next checkpoint: executable browser external/local plugin runtime and SDK lifecycle, using the foundation store/routes and confirmed Global / Prompt preset / Work targets. Preserve entire-Package Work identity, OR matching with once-only activation, cleanup on scope exit/disable/edit and late async disposal. Keep the current branch and leave main untouched.
