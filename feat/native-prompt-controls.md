# Atria Native Prompt Controls

Status: in progress — Group 1 implemented; Groups 2–6 pending
Implementation branch: `feat/native-prompt-controls`  
Base: `main@d29c2b3170798b136eb41249eaad902a23aab5bd`

## Goal

Track and implement the current Native product gaps discovered while adapting real user content to Atria.

NPC-001 focuses on the gap between Atria's Native Prompt parameter/condition model and the player-facing runtime UI. NPC-002 and later items may cover adjacent Native resource/product usability gaps when they are directly discovered through real product use.

This document is a living task plan. New confirmed gaps may be appended later. Do not infer extra scope only because adjacent code exists.

## Confirmed gaps

### NPC-001 — Player-facing Prompt runtime controls

Current Native Prompt authoring can define typed parameters and conditions, but an end user does not have a product-quality control surface for choosing them during normal use.

Required behavior:

- Boolean options must be usable as ordinary on/off controls.
- Mutually exclusive choices must be expressible and rendered as one choice group rather than several independent toggles.
- The UI must support human-facing labels/options instead of requiring users to type raw internal values such as `tuned_chinese`, `third`, or `normal`.
- A user's runtime selection must feed the existing typed `prompt.parameters` path used by Native Prompt compilation.
- Runtime selection must not create a new immutable Prompt Program revision merely because a player changed a choice.
- Defaults remain defined by the authored Prompt Program/resource contract.
- Invalid or stale option values must fail or recover visibly; they must not silently activate conflicting modules.
- Preview and execution must use the same selected values and expose enough diagnostics to verify which effective values/modules were applied.
- Controls must remain usable on desktop and mobile.
- State must use an existing/native authority. Do not introduce SillyTavern DOM state, Tavern Helper, ad-hoc `localStorage`, or another parallel preset authority.

Representative use cases:

- Writing style: one of basic / forum / web-novel / tuned-Chinese / wuxia / comedy / minimal / recommended / dialogue-driven.
- POV: one of first / second / third / ensemble.
- Pace: one of skip / fast / normal / slow.
- Input handling: one of expand / retell / direct.
- Optional features: anti-omniscience, knowledge grounding, action choices, summary, parallel events, time/location display, and similar independent toggles.
- Character behavior mode: off / realism / fandom, where realism and fandom are mutually exclusive.

The feature must be generic. TGbreak is a motivating example, not a hard-coded product special case.

#### Acceptance criteria

- A Prompt Program can declare at least boolean controls and a finite mutually exclusive choice.
- End users can change those controls without editing raw JSON or typing internal enum strings.
- Exactly one option in an exclusive group is effective.
- Toggling/changing runtime choices does not create a new Prompt Program revision.
- Defaults work when the user has made no override.
- Effective values reach Native compilation through validated typed prompt parameters.
- Preview and execute agree on effective values.
- Invalid/stale values are surfaced safely.
- Reload/lifecycle behavior matches the chosen Native persistence scope.
- Desktop and narrow/mobile layouts are verified.
- Focused unit/integration tests cover schema validation, compilation, persistence/lifecycle and UI behavior.
- Relevant Native guards/lint/build pass.

#### Explicit non-goals

- Converting old SillyTavern presets into Native resources automatically.
- Recreating Tavern Helper's floating panel or direct Prompt Manager DOM manipulation.
- Reintroducing regex-based runtime state.
- Adding TGbreak-specific names or rules to core product code.
- Changing unrelated model/provider/Generation Profile behavior.

### NPC-002 — Prompt Program / Module deletion lifecycle

Imported Prompt Programs and Prompt Modules currently cannot be truly deleted from the user-facing product; the available lifecycle only allows archiving. This leaves imported/test resources accumulated in Library even when the user explicitly wants them removed.

Required behavior:

- Provide an explicit delete path for user-owned Prompt Programs and Prompt Modules where deletion is safe.
- Archive and delete must remain distinct actions: archive is reversible visibility/lifecycle management; delete is destructive removal.
- Deletion must respect Native exact-reference integrity. A referenced resource must not disappear silently and leave broken Runtime Routes, Prompt Programs, Project/Package dependencies, or other owners.
- When deletion is blocked by references, show the user what is using the resource and what must be changed first.
- When deletion is allowed, require a clear destructive confirmation and remove the resource according to the real Native persistence model.
- Immutable revision semantics must remain intact; do not simulate deletion by mutating an immutable revision in place.
- Imported Resource Bundle copies are independent Library resources and should follow the same lifecycle rules as other user-owned Prompt resources.
- Package originals and other read-only/non-user-owned resources must remain protected.
- Desktop/mobile resource actions must expose the lifecycle consistently.

Implementation must first inspect the existing Library/versioned resource deletion and dependency graph behavior. Do not assume physical storage deletion is always the correct operation if the current persistence contract uses tombstones/history; preserve the Native authority while giving the user a real product-level delete action.

#### Acceptance criteria

- A safe, user-owned, unreferenced Prompt Program can be deleted.
- A safe, user-owned, unreferenced Prompt Module can be deleted.
- Delete and Archive are visibly separate actions with different semantics.
- Referenced resources cannot be destructively removed without resolving references; the UI identifies blocking usages.
- Deletion cannot corrupt exact-resource closure or leave Runtime/Project/Package references dangling.
- Read-only/package-owned originals cannot be deleted.
- Imported bundle copies behave like ordinary Library-owned Prompt resources.
- Deletion state remains correct after reload.
- Focused persistence/dependency/UI tests and relevant Native guards pass.

### NPC-003 — Knowledge entry browsing / World-book-style information density

The current Knowledge UI presents entries as a long continuous sequence. With a non-trivial Knowledge Base this becomes hard to scan, locate, compare, and manage. The product needs a clearer browsing model comparable in usability to SillyTavern's World Info list, without copying its legacy architecture.

Required behavior:

- Knowledge entries must be visually segmented into clear, individually identifiable rows/cards/items instead of reading as one long uninterrupted block.
- The default browsing surface should prioritize fast scanning: entry title/name, enabled/active state where applicable, concise trigger/key/metadata summary, and other high-value fields visible without opening the full editor.
- Entry details/content should be collapsible or otherwise progressively disclosed so a large Knowledge Base remains navigable.
- Users must be able to quickly open one entry for editing and return to the same browsing context.
- Add practical navigation aids for large sets, based on the current Native Knowledge contract: at minimum search/filtering if supported by existing data; sorting/grouping should be considered where it materially improves scanning.
- Mobile must not degrade into an excessively tall wall of expanded fields. The compact overview must remain usable at narrow widths.
- Preserve Native Knowledge / Knowledge Entry / Knowledge Binding semantics. This is a browsing and management UX improvement, not a return to the old World Info data model.
- Do not merge unrelated runtime Knowledge selection, retrieval logic, or legacy migration into this item unless current code proves they are required for the browsing surface.

SillyTavern World Info is a usability reference for clarity and scanability only. Do not copy its storage authority, DOM assumptions, or legacy schema.

#### Acceptance criteria

- A Knowledge Base with many entries presents a compact, clearly separated overview.
- Users can identify an entry without expanding its full content.
- Expanding/editing one entry does not force all entries into full-detail layout.
- Search/filter navigation works for realistic entry counts, or an equivalent current-Native navigation mechanism is implemented and justified.
- Returning from an entry preserves useful list context where practical.
- Desktop and narrow/mobile layouts are verified with many entries.
- Existing Knowledge semantics, exact identities and bindings remain unchanged unless a separately documented contract change is necessary.
- Focused Knowledge UI/state tests and relevant Native guards/lint/build pass.

### NPC-004 — Per-entry Knowledge enable / disable

Native Knowledge currently exposes an `enabled` state on `KnowledgeBinding`, which can disable an entire bound Knowledge source, but individual `KnowledgeEntry` records do not have an equivalent independent enabled/disabled lifecycle. As a result, users cannot temporarily suppress one specific entry while keeping the rest of the Knowledge Base active.

Required behavior:

- Add a first-class per-entry enabled/disabled state for Native Knowledge entries.
- The control must be available directly from the compact Knowledge entry browsing surface introduced by NPC-003, so users can toggle an entry without opening the full editor.
- Entry enabled state and Binding enabled state must remain separate:
  - disabling a Binding disables the whole bound Knowledge source;
  - disabling one entry suppresses only that entry while other entries in the same Knowledge Base remain eligible.
- A disabled entry must be excluded from Native Knowledge discovery, direct activation, related-entry activation, required-dependency expansion, recursive/secondary activation, and final prompt delivery unless the product explicitly defines and documents a narrow exception.
- Disabled entries must not consume Knowledge lane budget or appear as selected/injected context.
- Runtime diagnostics should distinguish at least `entry_disabled` from `binding_disabled` so the reason is observable.
- Toggling an entry must use the correct Native authoring/revision authority. Do not add hidden mutable state outside the Knowledge resource model merely to imitate SillyTavern's switch.
- Because Knowledge revisions are immutable, implementation must determine the correct product interaction for changing this authoring property and make the revision/update consequence clear to the user.
- Existing Package/read-only Knowledge remains protected; changing an entry there requires the existing fork/project-authoring path rather than mutating the original.
- Import/export, Resource Bundle, Package build/freeze, Session selection, Save/restore and Knowledge promotion must preserve the entry enabled state where those paths carry Knowledge resources.
- Desktop and mobile must expose the state clearly and consistently.

SillyTavern World Info's per-entry toggle is the usability reference. The implementation must remain Native and must not reuse the legacy World Info `disable` field, storage authority or DOM behavior.

#### Acceptance criteria

- A user can disable one Knowledge entry while leaving other entries in the same Knowledge Base active.
- A disabled entry cannot be selected or injected through ordinary keyword/state/direct/related/required activation paths.
- Re-enabling the entry restores normal eligibility without rebuilding unrelated entries.
- Binding-level disable and entry-level disable are independently represented and diagnosed.
- NPC-003's compact list shows and can operate the per-entry state.
- Exact identities, immutable revision semantics and dependency closure remain valid.
- Resource Bundle / Package / Project and other Native Knowledge serialization paths preserve the state.
- Runtime tests prove disabled entries do not consume selection/budget or reach prompt channels.
- Desktop and narrow/mobile UI tests cover toggle state, revision/save flow and reload behavior.
- Relevant Knowledge/Native guards, lint and build pass.

### NPC-005 — Persistent guided learning / interactive product tour

The current first-run experience is a blocking onboarding dialog centered on persona/name and UI language. The product needs a persistent, reusable guided-learning system rather than a tutorial that only exists during first launch.

First launch is only the automatic entry point into the guide. The same guide must remain permanently accessible so users can review the full curriculum, revisit individual lessons, or resume unfinished learning at any time.

Required behavior:

- Upgrade the current first-run name/language dialog into Step 1 of a persistent multi-step guided-learning system.
- Step 1 must retain the existing required identity/language setup and its persistence behavior.
- On a fresh install, Atria should automatically enter the guide from Step 1.
- After initial setup, the guide remains a permanent product feature and must be reopenable at any time from a clear, discoverable Help/Learning entry.
- Users must be able to open the complete guide, jump to a specific lesson/chapter, restart a lesson, or resume unfinished progress without resetting account/product state.
- Guide completion is learning progress only. Completing or skipping the tour must never remove the guide from the product.
- After the user clicks Next, the guide must be able to navigate to a specific real Atria workspace/surface for the next lesson.
- Each lesson must present clear instructions tied to the current real product surface while allowing the user to perform the actual operation in that surface.
- The guide must provide Previous and Next controls so the user can move backward/forward between onboarding steps without restarting the whole flow.
- Moving between steps must restore or navigate to the correct target surface deterministically; the guide must not assume the user stayed on the previous screen.
- The guidance layer must not replace the underlying feature UI with mock controls. Users should learn the real interface and real actions.
- A step may require an observable user action before it is considered complete where that is useful for learning. Completion conditions must be explicit and bounded; the guide must never trap the user because an optional/external dependency is unavailable.
- Users need a clear Close/Exit path. First-run flow may additionally provide Skip and Finish, but those actions only change progress/automatic prompting; they do not disable access to the guide.
- Progress must survive ordinary reload/restart. The system should remember completed lessons and the last active lesson while still allowing free review of earlier lessons.
- Completed users must not be forced through the guide again on startup, but can deliberately reopen any lesson later.
- The persistent guide should expose a curriculum/index view or equivalent navigation so it functions as an in-product learning reference, not merely a linear wizard.
- The experience must work across desktop and mobile layouts. Target highlighting/instructions must tolerate responsive navigation differences such as rail vs bottom navigation, dock vs sheet, and temporary overlays.
- Guidance must coexist correctly with Android Back / overlay / sheet behavior and must not leave the product in a trapped modal state.
- The guide must use Atria navigation/workspace APIs and product state. Do not implement cross-screen guidance by brittle DOM click scripts, fixed pixel coordinates, arbitrary timeouts, or legacy SillyTavern panel assumptions.
- UI text must use the existing Atria localization system; changing the language during Step 1 must immediately update subsequent guidance and the persistent curriculum/index.
- Accessibility must be preserved: keyboard/focus order, screen-reader labels, reduced-motion behavior, and visible focus must remain usable during guided lessons.
- The learning system should be extensible so future common operations can add lessons without rewriting one monolithic flow.

#### Guided-learning curriculum

Before implementation, audit the current `main` product and write the concrete common-operation lesson/chapter list into this plan. The curriculum should teach normal Atria usage and remain useful as a long-term in-product reference after onboarding is complete.

At minimum, evaluate whether the curriculum needs to cover:

- identity/name and interface language;
- the main navigation model and how to move between product domains;
- connection/model/runtime setup needed before generation;
- Library resource discovery/import and basic management;
- starting/opening a playable project/session;
- the core Play interaction and common session controls;
- Knowledge / Worlds & Knowledge basics;
- Prompt/Generation selection and the player-facing controls added by NPC-001 where appropriate;
- save/load/recovery basics;
- where common Settings, Help and Diagnostics live.

This list is a scope floor for the audit, not permission to invent unnecessary lessons. Use the current product IA and actual common workflows to decide the final curriculum. Advanced Studio authoring, developer tooling, Agents internals, diagnostics internals and other specialist features should only be included if they are genuinely useful enough to deserve an optional advanced lesson.

#### Step / lesson model

The implementation must have an explicit lesson/state model rather than one long hard-coded callback chain. Each lesson/step should be able to describe, using an Atria-owned contract:

- stable lesson and step IDs;
- curriculum section/category and ordering;
- localized title/instruction content;
- target product route/workspace;
- optional target element/region using a stable product identifier rather than CSS position assumptions;
- whether user interaction with the underlying surface is allowed/required;
- optional completion predicate/event;
- Previous/Next/Close behavior;
- whether the lesson is completed, resumable, replayable, or freely reviewable;
- mobile/desktop target variants only where the product actually has different navigation surfaces.

The exact schema is an implementation decision to be derived from current code. Avoid a second generic workflow/orchestration engine: this is a focused learning/tour state machine owned by the product shell.

#### Acceptance criteria

- Fresh install automatically opens the persistent guide at Step 1 with name/language.
- Next from Step 1 navigates to the intended real product surface and shows the next instruction without losing guide state.
- Users can operate the real underlying interface during interactive lessons.
- Previous/Next can traverse a lesson and reliably restore the correct target surface.
- Required-action lessons detect the real product event/state rather than treating a decorative click as success.
- Close/Exit leaves Atria in a usable normal state and preserves progress.
- First-run Skip/Finish stops automatic onboarding without removing the persistent guide.
- Partial progress survives reload/restart and resumes predictably.
- Completed users are not forced through onboarding again on startup.
- At any later time, users can reopen the learning center/guide, browse the curriculum, revisit completed lessons and jump directly to a selected lesson.
- Replaying a lesson does not reset unrelated user data or destructive product state.
- Language switching in Step 1 affects subsequent guide text immediately.
- Desktop and narrow/mobile E2E cover cross-workspace navigation, overlays/sheets and Back behavior.
- Tests cover first run, resume, back/forward navigation, completion, skip, close/reopen, direct lesson selection, replay, unavailable optional dependencies and persistent access after completion.
- Existing onboarding persona/language persistence behavior remains correct.
- Relevant Shell/navigation/localization guards, lint and frontend build pass.

#### Explicit non-goals

- Making the guide inaccessible after onboarding completion.
- Replacing normal product screens with tutorial-only duplicates.
- Teaching every advanced or developer feature during first run.
- Restoring legacy SillyTavern onboarding/import UI.
- Automating user choices that should be made by the user.
- Encoding the tutorial as fragile selectors and scripted DOM clicks instead of stable Atria product navigation/targets.

### NPC-006 — Regex preset/local scope Native cutover

The Regex Global Plugin has been retained, but two persisted script scopes still use SillyTavern-era ownership:

- `PRESET` scripts are still read/written through the legacy preset manager and persisted as `regex_scripts` inside a Chat Completion Preset.
- `SCOPED` scripts are still tied to `characters[this_chid]` / character extension data and persisted as card-local `regex_scripts`.
- Legacy allow/deny state such as `preset_allowed_regex` and `character_allowed_regex` is still retained in capability settings.

This is not only a labeling problem. Atria no longer treats a legacy Chat Completion Preset or character card as the correct owner for these product concepts, so the Regex plugin still crosses retired SillyTavern authority boundaries.

Required behavior:

- Keep Regex as an Atria Global Plugin and preserve the text-transformation engine, safe execution diagnostics, import/export/editor behavior and runtime provider API that remain product-relevant.
- Replace the legacy `PRESET` and `SCOPED` persisted ownership paths with Atria-native ownership/binding semantics.
- Do not keep writing regex scripts into legacy Chat Completion Preset extension fields.
- Do not keep writing project/game-local regex scripts into legacy character-card extension fields or resolving their owner through `this_chid`.
- Do not preserve `preset_allowed_regex` / `character_allowed_regex` as hidden legacy runtime authority after the Native replacement exists.
- The replacement scopes must match Atria's current product model. Before implementation, inspect the current Runtime Route, Prompt/Generation, Project/Package, Library and Session boundaries and determine which Native owner(s) correctly represent:
  - scripts that follow a reusable runtime/prompt configuration;
  - scripts that belong to one game/project/package rather than the whole account;
  - account-wide/global scripts.
- Do not assume the Native replacement must be named "preset regex" or "local regex". Product labels must describe the real Atria owner.
- A script's effective scope and provenance must be visible in the Regex UI so users can tell why a rule is active.
- Scope-specific enable/disable must be owned by the new Native binding/selection model rather than legacy preset/character allow flags.
- The Regex editor must support creating, editing, moving/copying, importing/exporting and deleting scripts in the supported Native scopes without falling back to SillyTavern preset/card persistence.
- Runtime collection/execution order must remain deterministic. If Native scope ordering differs from the old Global/Scoped/Preset order, define and document the new precedence explicitly and cover it with tests.
- Package/project-local Regex assets must travel through the correct Native package/build/install path when the current product architecture says they are part of the authored experience.
- Read-only/package-owned assets must obey existing immutable/fork/update rules rather than being silently edited in place.
- Diagnostics must report each effective Regex script with its Native source/provenance and whether it was skipped/disabled.
- Desktop/mobile Regex management must expose the same Native scope model and must not retain disabled legacy sections as dead UI.

Hard-cut requirement:

- Do not add dual-read, dual-write, alias or fallback between the old SillyTavern `PRESET` / `SCOPED` stores and the new Native owners.
- Old legacy preset/card regex data does not need automatic migration unless a separate explicit migration task is created later.
- Remove active product/runtime dependencies on the old preset-manager and character-card regex persistence once the Native path is complete.
- Compatibility-only code may remain only when an actually supported external Plugin API still requires it, and such compatibility must not become the product's source of truth.

The existing "Regex Presets" feature (groups of enabled Regex scripts) is conceptually separate from "Preset Scripts" stored inside a Chat Completion Preset. Audit it independently: keep it if it is still an Atria-owned useful grouping feature, but do not confuse it with or use it to preserve the legacy Chat Completion Preset scope.

#### Acceptance criteria

- Creating a non-global Regex script never requires or mutates a legacy Chat Completion Preset or character card.
- No active Native product flow resolves Regex ownership from `getPresetManager(...).writePresetExtensionField(...regex_scripts...)` or `characters[this_chid]` / character `regex_scripts`.
- Legacy `preset_allowed_regex` / `character_allowed_regex` no longer control Native Regex execution.
- Users can clearly distinguish account-wide scripts from Atria-native configuration/project/package-local scripts in the Regex UI.
- The effective Regex set for a runtime/session is resolved only from the documented Atria-native owners/bindings plus registered runtime Plugin providers.
- Project/package-associated scripts survive build/install/reopen according to the chosen Native ownership model.
- Exact/read-only resources cannot be mutated outside their normal fork/revision/update lifecycle.
- Import/export and Regex Presets continue to work where still applicable without reintroducing legacy preset/card authority.
- Diagnostics identify Native scope/provenance and disabled/skipped state.
- Tests cover persistence, scope precedence, runtime selection, project/package lifecycle, deletion, import/export and hard-cut residual guards.
- Desktop and narrow/mobile Regex UI are verified.
- A residual guard fails if product code reintroduces active legacy Chat Completion Preset or character-card Regex persistence.

#### Explicit non-goals

- Rewriting the Regex matching/replacement engine merely for naming consistency.
- Restoring legacy SillyTavern Chat Completion Presets or character cards as first-class Atria product owners.
- Automatically migrating historical SillyTavern preset/card Regex data.
- Removing the managed runtime Regex provider API used by legitimate Plugins if it remains compatible with the Native ownership model.
- Treating "Regex Presets" and "Preset Scripts" as the same feature.

### NPC-006 — Complete Regex Native cutover

The Regex product was retained as an explicit Atria Global Plugin, but its internal authoring/ownership model still exposes SillyTavern-era prompt-preset and character-card scopes.

Current main still contains and exposes:

- `SCRIPT_TYPES.PRESET`;
- `SCRIPT_TYPES.SCOPED`;
- `getPresetManager()` coupling from Regex UI/runtime;
- `preset_allowed_regex`;
- `character_allowed_regex`;
- "Preset Scripts" stored in preset data;
- "Scoped Scripts" stored in character/card data;
- create/move/import/editor paths that treat preset/scoped as first-class Regex script authorities.

This is an incomplete Native cutover. Hiding the two UI sections alone is not sufficient if the old storage, execution or compatibility paths remain live.

Required behavior:

- Remove SillyTavern prompt-preset-owned Regex scripts as a live Atria authority.
- Remove SillyTavern character/card-scoped Regex scripts as a live Atria authority.
- Retire the corresponding create/edit/move/toggle/import/export paths and runtime execution branches that depend on those legacy scopes.
- Remove live Regex dependency on the legacy preset manager and character-card storage for Regex ownership.
- Remove obsolete retained capability keys and serialization/hydration paths such as `preset_allowed_regex` and `character_allowed_regex` once their callers are retired.
- Keep Atria's explicit Global Regex Plugin ownership for genuinely global user-authored Regex rules.
- Keep plugin/runtime-registered Regex rules as the read-only runtime contribution lane where still required.
- If Atria still needs non-global Regex ownership for a Project/Package/Experience use case, design that ownership under the appropriate Native exact resource/project contract. Do not preserve `PRESET` or `SCOPED` merely as aliases.
- Do not silently map SillyTavern preset/card Regex data into a new Native scope as a default migration requirement. The product's existing hard-cut policy remains authoritative unless a separately approved current-Atria data transition is necessary.
- Audit all execution paths so retired preset/scoped scripts cannot still affect input, prompt, display, edit, orchestration, plugin floors, or post-processing through hidden compatibility code.
- Remove or update stale localization, documentation, tests and diagnostics that still present prompt-preset/character-card Regex ownership as an Atria product concept.
- Preserve the Regex engine's useful generic capabilities (find/replace, placements, safety/diagnostics, global rules and plugin-provided rules) independently of the retired ownership scopes.

"Regex Presets" — the Regex plugin feature that saves/switches groups of enabled rules — must not automatically be conflated with SillyTavern "Preset Scripts". Audit it separately. It may remain if it is useful and can operate purely on valid Atria-owned Regex rules after preset/card scopes are removed.

#### Acceptance criteria

- Regex UI no longer exposes "Preset Scripts" or character/card "Scoped Scripts" as authoring sections.
- Users cannot create, move, import or save Regex rules into SillyTavern prompt-preset or character-card ownership.
- Runtime Regex execution no longer reads those retired authorities.
- Regex no longer imports or calls legacy preset-manager APIs for script ownership.
- `SCRIPT_TYPES.PRESET` and `SCRIPT_TYPES.SCOPED` are removed from the live product contract unless code audit proves a differently named Native scope is required and documented.
- `preset_allowed_regex` / `character_allowed_regex` and equivalent obsolete state no longer hydrate/serialize as live Atria capability authority.
- Global user Regex rules continue to work.
- Plugin/runtime-registered read-only Regex rules continue to work where supported.
- Regex Presets, if retained, reference only supported Atria-owned rule identities and no longer encode retired scope buckets.
- No hidden legacy preset/card Regex path can change generation or display output.
- Import/export/bulk edit/debugger UI reflects only supported Atria scopes.
- Regression covers execution placement, display/prompt post-processing, import/export, Regex Presets if retained, plugin-provided rules and reload persistence.
- Relevant Regex/Plugin/Shell guards, lint and frontend build pass.

#### Explicit non-goals

- Reintroducing legacy SillyTavern preset or character-card Regex compatibility under new labels.
- Treating old preset/card Regex migration as a default product requirement.
- Removing the entire Regex Global Plugin.
- Removing plugin/runtime-provided Regex rules solely because the old preset/scoped authorities are retired.
- Removing the separate Regex Presets grouping feature without first determining whether it remains useful after the Native cutover.

## Product / architecture constraints

- Preserve the Native Model / Prompt / Runtime and Native Library/Knowledge authority boundaries already on `main`.
- Preserve exact resource references and immutable Prompt Program / Prompt Module / Generation Profile revisions.
- Do not restore old SillyTavern preset/World Info authority or make legacy migration a default requirement.
- Do not reintroduce `setvar/getvar/random`, Regex DOM controls, Tavern Helper scripts, MVU state, or equivalent hidden compatibility layers.
- Authoring owns Prompt control definitions/defaults; runtime owns the player's effective selection. Do not conflate authoring edits with runtime choices.
- Reuse the existing Prompt compiler condition system rather than adding a second conditional prompt engine.
- Saved resource names/values remain data, not localization keys. UI chrome and authored display metadata may be localized through existing product patterns.
- For destructive actions, resolve Native dependency/reference integrity before deciding storage behavior. Product semantics are authoritative; do not bolt a UI delete button onto unsafe persistence.

## Implementation questions to resolve from code, not assumptions

Before editing, inspect the current contracts and product surfaces and resolve:

1. The smallest Native schema extension needed to describe enum/single-choice and boolean Prompt presentation metadata.
2. The correct Native persistence scope for Prompt runtime selections so they survive the expected lifecycle without mutating immutable Prompt resources.
3. The correct player-facing surface(s) in Play/Runtime and any authoring surface needed to define Prompt labels/options/groups.
4. How preview/execute payloads carry effective Prompt values without bypassing existing validation.
5. How diagnostics/Request Inspector should show effective Prompt parameter values and included/skipped modules.
6. What the current archive/delete/versioned-resource/dependency contracts already support for Prompt Program/Module removal, and which references must block destructive deletion.
7. What current Knowledge Entry fields are most useful in the compact list and which current UI/state path should own search/filter/sort/expanded-entry state.
8. Where per-entry enabled state belongs in the immutable Native Knowledge contract, and how every activation/selection/serialization path must honor it without conflating it with KnowledgeBinding.enabled.
9. Which Shell/navigation APIs and stable target identifiers the persistent guide should use, where guide progress/history belongs, how users reopen/jump/replay lessons, and which current product workflows constitute the final common-operation curriculum.
10. Which Regex paths still depend on SillyTavern prompt-preset/character-card ownership, whether Regex Presets can remain as a scope-neutral Atria feature, and whether any real non-global Regex use case requires a new Native-owned scope.
10. Which current Atria Native owner/binding replaces legacy Regex PRESET and SCOPED persistence, what the resulting scope precedence is, and which compatibility-only Regex APIs can remain without retaining legacy authority.

Record any substantive answer here before or with the implementation commit that depends on it.

## Future gaps

Append newly confirmed gaps below as `NPC-007`, `NPC-008`, etc. Preserve their original intent and keep completed items in the document with status/evidence rather than silently deleting history.

## Group 1 — NPC-001 implementation record (2026-09-25)

Baseline: d29c2b3170798b136eb41249eaad902a23aab5bd. Code HEAD: 2958b9c2bacfebd876a69b12e2dcffb3a30d5779 (pushed).

### Code-audited decisions

- Existing typed parameter definitions gain optional label/description and finite
  options ({ value, label }). Options are distinct, bounded to 128, and match the
  string/number parameter type. A finite choice must have a default or be required.
  Boolean parameters use ordinary checkboxes. Human display metadata stays authored
  data; UI chrome uses existing zh-CN/zh-TW localization.
- Player choices live in the existing mutable player Runtime Route's optional
  promptParameters map. They persist across reloads and apply to all sessions using
  that route. No Session, immutable Program/Module revision, Package original,
  localStorage, preset authority or additional storage kind is written.
- Precedence: authored defaults < resolved route overrides < explicit request
  parameters. Fallback routes resolve their own choices against their own exact
  Program. Existing compiler binding and module/stage conditions are authoritative.
- Play exposes Prompt choices in its existing inspector/sheet. Runtime Diagnostics
  exposes the same controls for its selected preview route. This selector edits a
  route; it does not change the route used by a running session. Override default
  enables editing; disabling it removes the override on Save. Restore defaults
  persists an empty override map. Unsaved choices are explicitly described as drafts.
- Authenticated prompt-controls GET reads inherited definitions using RouteResolver
  and flattenPromptProgram over existing Library/Project/Package readers. PUT
  validates typed partial overrides and serializes a compare-and-update against the
  loaded route. Stale concurrent edits fail visibly without overwriting route config.
- Changing Program refs does not silently migrate/drop stale selections. Unknown
  parameters, wrong types and retired choices fail closed before send, with localized
  remediation and explicit reset. Required parameters without defaults remain required
  at compilation; users can save a partial setup without inventing defaults.
- Preview/execute carry identical snapshot.promptIr.compilation evidence: effective
  parameters, selected stages and included/disabled/condition-false module decisions.
- Parameter validation now lives in a pure dual-host public/shared contract, with a
  localized frontend wrapper. This fixes the baseline Core import of a browser
  localization module; the P0 guard scans the shared module too.
- P5/P6 guards were updated for existing Library Generation Profile ownership and
  block-form Library authoring actions, preserving their substantive checks.

### Validation and scope

- Related unit/integration suite: 12 suites / 158 tests passed; subsequent focused
  suite after added schema/Project/Package coverage: 5 suites / 91 tests passed.
- Real-host Playwright: 1440px desktop and 390px narrow viewport, 2 cases passed.
  Actual controls save/reopen, restore defaults, compile preview and generate through
  the real Native HTTP host against a local synthetic provider. Effective values agree.
  Narrow-screen sheet closure and inspector navigation use the existing Shell contract.
- Root lint, focused test lint, zh-CN/zh-TW localization coverage, frontend prebuild,
  and relevant P0–P7 guards pass (final command evidence recorded in handoff).
- Broader P8 aggregate also passes A0–A6, then stops on an existing A7 Studio guard
  requiring attachResource/forkResource/updateResource strings in studio-workspace.js.
  Those calls were already absent at the baseline. This unrelated guard reconciliation
  is retained as a Final Integration follow-up, not claimed as passing.
- No live paid model, Android device/build, Docker build or GitHub CI wait was needed.

### Remaining sequence / stop gate

Group 2: NPC-003 + NPC-004; Group 3: NPC-002; Group 4: NPC-006;
Group 5: NPC-005; Group 6: Final Integration. Stop after Group 1 commit/push and
wait for the user's “继续”. Do not merge main early. Final Integration must include
remaining broad-guard reconciliation, verified main integration/push, feature branch
removal and final handoff; docs remains permanent.
