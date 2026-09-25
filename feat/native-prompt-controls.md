# Atria Native Prompt Controls

Status: planned / open  
Implementation branch: `feat/native-prompt-controls`  
Base: `main@d29c2b3170798b136eb41249eaad902a23aab5bd`

## Goal

Fill the product gap between Atria's Native Prompt parameter/condition model and the player-facing runtime UI.

Native Prompt Programs already support typed program parameters and Prompt Module conditions, so conflicting or optional modules can be represented without duplicating presets. The missing product layer is a clear runtime control surface that lets users actually choose those values.

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

## Product / architecture constraints

- Preserve the Native Model / Prompt / Runtime authority boundaries already on `main`.
- Preserve exact resource references and immutable Prompt Program / Prompt Module / Generation Profile revisions.
- Do not restore old SillyTavern preset authority or make legacy preset migration a default requirement.
- Do not reintroduce `setvar/getvar/random`, Regex DOM controls, Tavern Helper scripts, MVU state, or equivalent hidden compatibility layers.
- Authoring owns control definitions/defaults; runtime owns the player's effective selection. Do not conflate authoring edits with runtime choices.
- Reuse the existing Prompt compiler condition system rather than adding a second conditional prompt engine.
- Saved resource names/values remain data, not localization keys. UI chrome and authored display metadata may be localized through existing product patterns.

## Implementation questions to resolve from code, not assumptions

Before editing, inspect the current contracts and product surfaces and resolve:

1. The smallest Native schema extension needed to describe enum/single-choice and boolean presentation metadata.
2. The correct Native persistence scope for runtime selections so they survive the expected lifecycle without mutating immutable Prompt resources.
3. The correct player-facing surface(s) in Play/Runtime and any authoring surface needed to define labels/options/groups.
4. How preview/execute payloads carry effective values without bypassing existing validation.
5. How diagnostics/Request Inspector should show effective parameter values and included/skipped modules.

Record any substantive answer here before or with the implementation commit that depends on it.

## Acceptance criteria for NPC-001

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

## Explicit non-goals for this gap

- Converting old SillyTavern presets into Native resources automatically.
- Recreating Tavern Helper's floating panel or direct Prompt Manager DOM manipulation.
- Reintroducing regex-based runtime state.
- Adding TGbreak-specific names or rules to core product code.
- Changing unrelated model/provider/Generation Profile behavior.

## Future gaps

Append newly confirmed gaps below as `NPC-002`, `NPC-003`, etc. Preserve their original intent and keep completed items in the document with status/evidence rather than silently deleting history.
