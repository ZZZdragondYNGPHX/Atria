# Native UI Temporal Projection

Updated: 2026-09-28.

## Goal

Unblock Native Heavy-Frontend Reference Package Phase 4 Schedule presentation without copying Lifecycle Game Clock state into World or Session Application records.

## Problem

Atria already exposed the Host-owned Temporal Projection through `game-runtime.getTemporalProjection()`, but Component Model v2 UI expressions could not read it. UI roots were limited to World, Package Data, Information Projection, Local UI / Preference and other existing presentation roots. The Phase 4 Schedule baseline requires the current continuous Game Clock. Mirroring that clock into Package state would create a second time authority and violate the Native authority split.

## Change

Branch: `feat/native-ui-temporal-projection`.

The v2 UI expression root set now includes read-only `temporal`. The live v2 runtime fills it from the existing Host `getTemporalProjection()`; the main Experience integration passes the existing Lifecycle client getter through. No new clock, persistence namespace, scheduler, mutation route, lifecycle command, raw patch or Package-owned time state was added.

Message presentation contexts remain isolated: presentation contexts receive an empty temporal object rather than Session authority data.

## Boundary

This is a read-only presentation seam. It does not add Session Application mutation from UI and does not change World/Lifecycle authority ownership. Package Phase 4 may use `temporal` to display the current Game Clock while Schedule records continue to come from the existing Information Runtime.
