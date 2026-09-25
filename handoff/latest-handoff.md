# Latest handoff — Native Prompt Controls and Resource UX

Updated: 2026-09-25 (Asia/Shanghai).

## Current task

Repository: `ZZZdragondYNGPHX/Atria`

Task: Atria Native Prompt Controls and adjacent Native resource usability gaps discovered through real product use.

Implementation branch:
`feat/native-prompt-controls`

Branch base and current HEAD:
`d29c2b3170798b136eb41249eaad902a23aab5bd`

Current remote `main` at task creation:
`d29c2b3170798b136eb41249eaad902a23aab5bd`

Formal plan:
`docs:feat/native-prompt-controls.md`

The plan is a living backlog. Confirmed items are NPC-001 through NPC-005. If the
user adds more gaps, append NPC-004/NPC-005/etc. on the same task branch. Do not
invent adjacent scope.

## Confirmed gaps

### NPC-001 — Player-facing Prompt runtime controls

Native Prompt Programs already have typed parameters and module conditions, but the
player-facing runtime has no product-quality controls for selecting them.

Required product behavior includes boolean toggles, mutually exclusive single-choice
groups, human-readable labels/options, validated `prompt.parameters`, no immutable
Prompt revision creation for ordinary runtime choices, preview/execute consistency,
safe stale-value handling and desktop/mobile usability.

TGbreak is a motivating example only. Core code must remain generic.

### NPC-002 — Prompt Program / Module deletion lifecycle

Imported/user-owned Prompt Programs and Prompt Modules can currently be archived but
lack a real user-facing delete lifecycle.

Required outcome: distinct Archive vs Delete actions, safe destructive removal for
eligible user-owned resources, dependency/reference blocking with visible Used By
information, protection of Package/read-only resources, reload-stable state, and no
dangling exact refs.

Do not assume the persistence implementation. Inspect current versioned-resource,
Library and dependency-graph semantics first and preserve Native authority.

### NPC-003 — Knowledge entry browsing clarity

Current Knowledge entries are displayed as a long continuous sequence and become
difficult to scan in larger Knowledge Bases.

Required outcome: a compact, clearly segmented entry overview with high-value summary
fields, progressive disclosure/collapse, fast entry editing and practical navigation
for large sets. Search/filter and sorting/grouping should be evaluated against the
actual Native Knowledge contract. Mobile must remain compact and navigable.

SillyTavern World Info is a usability reference for clarity only. Do not restore its
legacy storage/schema/DOM authority.

### NPC-004 — Per-entry Knowledge enable / disable

Native Knowledge currently has Binding-level `enabled`, but no independent
`KnowledgeEntry` enabled state. Users therefore cannot temporarily disable one entry
while keeping the rest of the same Knowledge Base active.

Required outcome: a first-class per-entry toggle, exposed in the compact NPC-003 list,
with entry-disabled items excluded from all normal Native activation/selection/prompt
delivery paths and diagnosed separately from `binding_disabled`. The state must live
inside the proper immutable Native Knowledge authoring/revision model and survive
Resource Bundle/Package/Project serialization paths. Do not reuse legacy World Info
storage or its `disable` field.

### NPC-005 — First-run guided onboarding / interactive product tour

The current first-run flow is a blocking name/language onboarding dialog and ends
after that setup. Upgrade it into a multi-step guided onboarding system.

Step 1 keeps name/language. Later steps navigate to real Atria workspaces and teach
the user through instructions over the actual interface. The guide needs stable
Previous/Next/Skip/Finish behavior, resumable progress, reopen-later support,
desktop/mobile navigation awareness, immediate localization after language changes,
and optional action-completion checks based on real product state/events.

The guide must use stable Atria Shell/navigation/target contracts, not brittle DOM
click scripts, fixed coordinates or legacy SillyTavern panels. Before implementation,
audit current main and record the concrete common-operation curriculum in the formal
plan. The intent is to teach normal Atria use, not every advanced/developer feature.

## Architecture boundaries

Preserve the current Native Model / Prompt / Runtime and Library / Knowledge authority,
exact resource revisions and dependency integrity.

Do not restore SillyTavern preset/World Info authority, Tavern Helper DOM control,
Regex state, `setvar/getvar/random`, MVU state, localStorage authority, or default
legacy data migration.

Authoring owns Prompt definitions/defaults. Runtime owns player Prompt selections.
Deletion must respect dependency closure. Knowledge changes in NPC-003 are primarily
product browsing/management UX unless current code proves a contract change is needed.
NPC-004 is a real Knowledge contract/runtime semantic change: keep entry state distinct
from KnowledgeBinding.enabled and preserve immutable revision/dependency authority.

## Start by reading

1. Local workspace `AGENTS.md`
2. Local workspace `FORK_MAINTENANCE.md`
3. `docs:feat/native-prompt-controls.md`
4. `main:src/native/model-prompt-runtime/README.md`
5. `main:src/native/model-prompt-runtime/contracts.js`
6. `main:src/native/model-prompt-runtime/prompt-compiler.js`
7. `main:src/native/model-prompt-runtime/prompt-values.js`
8. `main:public/scripts/native/prompt-authoring.js`
9. `main:public/scripts/native/prompt-semantics.js`
10. Current Library/versioned-resource deletion/archive/dependency paths.
11. Current Knowledge/Knowledge Entry Library and authoring UI paths.
12. Relevant current Runtime/Play request UI and generation-host paths.
13. Current first-run onboarding/persona/language implementation, Atria Shell navigation,
    workspace routing, overlay/back resolver and localization paths.

Use the actual remote `feat/native-prompt-controls` HEAD if another session has
advanced it. Preserve existing commits; never reset back to this creation HEAD.

## Completed / validation

Task setup/documentation only:

- `feat/native-prompt-controls` exists from the stated main baseline.
- Formal plan now contains NPC-001 through NPC-005.
- No product implementation has been made on the feature branch.
- No implementation tests/CI are claimed.

The previous Native Product UX audit is complete and integrated. Do not restart its
Groups 1–9 or reopen its prior 44-item backlog as part of this task.

## Next

When implementation begins, reconcile all confirmed NPC items against current code
before editing and record substantive architecture decisions in the formal plan.

Implement the backlog on the same feature branch. Group work sensibly rather than
creating a branch per NPC item. Perform offline tests and any UI/browser validation
that does not require the user. Only request user involvement for genuinely manual
device/UI/permission dependencies.

Do not merge `main` until the full current Native Prompt Controls / Resource UX
backlog is complete and validated.
