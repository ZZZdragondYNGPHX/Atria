# Native UI Session Application Command

Updated: 2026-09-28.

## Goal

Unblock Native Heavy-Frontend Reference Package Phase 5 Phone input without routing Communication writes through World, Local UI state, Story Composer, or model-owned authority.

## Problem

Atria already had strict Session Application domains and typed `app.command` handling through the Host Lifecycle authority, and G2 already allowed declared background Tasks to resolve into predeclared App Commands or scheduled interactions. However, Component Model v2 UI actions exposed `command.dispatch` for World Commands but had no typed operation for an ordinary UI form to write a Session Application record.

Phase 5 requires player-authored Phone input to become committed Communication business state while remaining outside the main Timeline. Using World would violate authority ownership; Local UI would be non-authoritative; Story Composer would incorrectly create a main Timeline user message; using a model Task as a write proxy would grant generation work authority it does not need.

## Change

Branch: `feat/native-ui-session-application-command`.

UI v2 adds one narrow typed action operation:

`application.command`

The action declares a fixed `domainId` and `commandId`, evaluates bounded `args`, and may bind an explicit `recordId`. If no record ID is supplied, the Host creates a stable per-Action record identity and preserves the exact command payload/identity across uncertain retries.

Execution routes only through the already-existing Native Lifecycle client `app.command` path. The Package never receives raw Session state mutation, raw lifecycle dispatch, raw patch, scheduler ownership, Timeline authority, or arbitrary method invocation.

The existing one-authority-write-per-UI-action rule now counts `application.command` as an authority write, preventing a single UI action from mixing it with a World Command or another authority mutation.

The Native UI authoring reference documents the distinction:

- `command.dispatch` -> declared World Command;
- `application.command` -> declared Session Application Domain/Command.

## Validation

Targeted GitHub Actions run `36386573137`: **success**.

The targeted job executed:
- syntax checks for `v2-document.js` and `v2-runtime.js`;
- `game-runtime/ui-v2.test.js`;
- `game-runtime/lifecycle-client-p4.test.js`;
- `native/background-task-app-bridge-g2.test.js`;
- `native/lifecycle-contract-p4.test.js`.

The added UI v2 tests prove:
- Session Application writes use the Host lifecycle client and do not call World authority;
- an uncertain transport retry reuses the exact original App Command payload and generated record identity;
- explicit projected record identities are supported;
- missing Domain declarations and mixed double-authority writes fail closed.

The repository-wide PR Unit Tests job also ran incidentally and reported the already-existing unrelated `native/model-prompt-runtime-p4.test.js` Session-snapshot fixture failure; 811/812 suites and 10277/10278 tests passed. This was not used as Phase 5 validation and was not modified.

The Native Model Prompt Runtime workflow failed at the already-known pre-existing `src/native/adapters/generation-host.js` architecture guard. It is unrelated to this Gap and remains unchanged.

No Android, Docker, paid provider inference, or Phase 6 validation was run.

## Boundary

This seam only lets declarative Native UI invoke an already-declared Session Application typed Command. It does not:
- create a new Session database or state authority;
- expose generic Lifecycle commands to Package UI;
- let UI write Timeline;
- let Phone input invoke Narrator;
- grant ordinary model proposals automatic write authority;
- create a Package scheduler;
- alter G2 background Task semantics.

This gap exists specifically because Phase 5 needs direct player Communication input to commit into Session Application while preserving the frozen World / Session Application / Timeline authority split.
