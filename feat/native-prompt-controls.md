# Atria Native Prompt Controls

Status: planned / open  
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

Record any substantive answer here before or with the implementation commit that depends on it.

## Future gaps

Append newly confirmed gaps below as `NPC-004`, `NPC-005`, etc. Preserve their original intent and keep completed items in the document with status/evidence rather than silently deleting history.
