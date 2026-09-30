# Documentation Plan-Bundle Normalization — Record

- **Task ID:** `refactor/docs-plan-bundle-normalization`
- **Primary Workspace:** `docs`
- **Status:** Completed
- **Start docs HEAD:** `c6bf5ac09cc201e52a7ddcf27b5c4e25b3de4dbf`
- **Completion:** the docs commit containing this Record

## Scope

- Synchronize Atria docs governance/hot-path/template rules with the current Standardized-project Plan Bundle model.
- Convert the actively discussed `package/original-occult-western-fantasy-game` Plan from one 75 KB monolith into an indexed modular Plan Bundle.
- Preserve approved game-design content and current Round 3.8 state.
- Leave older Plans/Records and unrelated archived material untouched.
- Leave the unrelated live MCP HANDOFF untouched.

## Completed

- Governance version advanced to 1.1 with explicit Single-file Plan / Plan Bundle lifecycle and minimal-context routing.
- Added `plans/README.md` and `templates/PLAN-BUNDLE/`.
- Updated docs-local `AGENTS.md`, Web adapter, Plan template and HANDOFF template for `index.md`-first routing.
- Replaced the active game Plan monolith with `index.md`, `decisions.md`, `foundation.md`, `metaphysics.md`, `society.md`, `religion.md`, `geography.md`, and `platform-and-gameplay.md`.
- Current Round 3.8 routes to `geography.md`; unrelated modules are no longer default context.
- The old monolithic game Plan path was removed to avoid competing authorities.

## Validation

- Parsed the latest active Plan by stable section markers before migration.
- Verified all six domain chunks plus discussion/sequence/approval sections were locatable and ordered.
- Preserved the original detailed domain text inside the new authoritative modules; routing/workflow text was normalized for Bundle semantics.
- No product source, Package assets, plugin code, tests, builds, device checks or UI checks were changed or claimed.

## Deferred by explicit scope

- Historical/archived Plans and Records were not reorganized.
- Existing single-file Plans that are not the current game-design discussion remain as-is until they materially need conversion.
