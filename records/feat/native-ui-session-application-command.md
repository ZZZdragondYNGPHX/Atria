# Native UI Session Application Command

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

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
