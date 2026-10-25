# Atria Native Content & Session Architecture Refactor — Legacy Implementation History

> 执行规则入口：[Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

> Historical execution notes migrated verbatim from the old Plan. They are audit evidence only; new implementation history belongs in Records.

## N4 in-progress checkpoint — 2026-09-22

**Status: implementation checkpoint only; N4 exit NOT satisfied.** The user requested an immediate push and handoff because their usage quota was nearly exhausted. Stop at this checkpoint; the next conversation must continue N4, not start N5.

- Working branch: `refactor/atria-native-content-session-architecture`
- Pushed checkpoint HEAD: `f3ac20f80f4691eee1d3c7ccab555a39e4322d3b`
- main remains untouched; no new branch or main merge.
- Do not carry N3 #44 success forward as N4 evidence.

### Implemented at the checkpoint

- `SessionCore.applyTimelineCommands`: explicit append/revise/select/remove/removeVariant intents in one immutable revision and HEAD-CAS publication; reuses `_publish`/SessionRepo, no second persistence engine.
- `forkBranch` optionally accepts an exact message/variant within the selected revision. Earlier full-revision forks remain covered by N3 regressions.
- `public/scripts/native/session-projection.js`: Package Actor profile and selected Session revision -> transient character/chat/swipe ABI, stable opaque message/variant mappings, changes to a known projection -> explicit commands. Not a Session importer or authoritative whole-chat save.
- `public/scripts/native/session-runtime.js`: explicit open/reload/close/fork/switch seam, serialized Timeline writes, CAS failure latch, read-only historical projection, native upload transport.
- `src/endpoints/native-session.js`: authenticated server-owned handle, create/load/allowlisted command/upload/read routes. Runtime writes require expectedRevisionId. No arbitrary repository method dispatch.
- `public/script.js`: exported `openNativeSession` seam and Native interception of append/patch/save/reload; projected characters occupy a transient array slot; DOM host itself is not replaced. Native regenerate is routed toward the existing swipe generator; browser behavior still needs proof.
- bookmarks branch routing, Package Regex provider contribution, Native pinned Knowledge candidates entering existing World Info selection without loading legacy books.
- `populateFileAttachment` routes uploads to AssetStore in Native mode; logical assetId is retained in Timeline variant metadata, download URL is derived. AssetRef deletion retains immutable Timeline variant references.
- Native character-state calls return `native_state_integration_pending`; chat state resolves no legacy target. Full state backend integration remains N5. Compatibility metadata is currently transient rather than fully persisted.

### Required continuation — do not report N4 done

1. Fetch and read the live remote work branch and docs again; do not reset to this SHA if another session advanced it.
2. Inspect the whole checkpoint diff against N3, especially runtime write timing, identity binding across streaming/swipe/edit, early-save callbacks, switching/closing during queued operations, failure/reload behavior and remaining direct legacy endpoint calls. Unit pass is not sufficient evidence for these seams.
3. Add isolated real-host browser coverage using the actual Atria server/SPA and existing mock-LLM helpers. Prefer a fresh test-owned data root; do not copy private developer data or use their real configured provider. Existing `_lib/server.js` supports `useExistingDataRoot`; its default clone path uses Unix `cp`, so Windows needs the explicit fresh-root route. No live host was started here.
6. Preserve R7 original node identities and uniqueness for `#sheld`, `#chat`, `#form_sheld`, `#send_form`, `#send_textarea`; existing unit tests do not establish actual browser lifecycle behavior.
7. Review compatibility field mapping with real selector fixtures before claiming World Info compatibility.
8. Full N5 state integration, N7 saves, N8 UI cutover and N9 retirement remain unimplemented. Do not promote this development seam to production UI yet.
9. Obey the Master Plan long-CI/external-input stop rules.
10. The present handoff is an N4 continuation prompt.

### Guidance receipt

`tavern-card-builder` and focused API/runtime skills read; library route `tavern-card-builder`, snapshot `2026-08-18`, ST-A0 opening gates used. Current repository source, not recalled upstream signatures, supplied API provenance. No design catalog candidate was adopted.

---

## Final integration record — merged 2026-09-22

### World Info mobile / compatibility hardening

The final integration hardening therefore:

- keeps modern Atria product routing pointed at Native Worlds & Knowledge;
- keeps the normal-shell real-host World Info adapter smoke;
- gives embedded `#WorldInfo` an explicit root → `#wi-holder` → `#world_popup` → `#wi_workspace_shell` flex/height/visibility contract independent of legacy drawer rules;
- makes `mountWorldInfoWorkspace()` explicitly preserve/restore `hidden` and `aria-hidden`;
- adds an embedded layout contract regression;

The final mobile failure was diagnosed from real Chromium computed layout: the E2E compatibility host itself was `390 × 0`, collapsing all children. The host is now pinned to the actual Playwright viewport and fail-closes if it does not fill that viewport before the editor is mounted.

This hardening preserves the frozen N10 boundary: mature SillyTavern World Info machinery remains adapter/runtime ABI only, while Native Worlds & Knowledge remains product and persistence authority.

### Integrated architecture

The merged Active Native product authority remains:

```text
Package / PackageVersion / EntryPoint
        ↓
WorldRevision + KnowledgeRevision + KnowledgeBinding
        ↓
Session / Branch
        ↓
immutable TimelineEntry + birth Variant
        ↓
SessionRevision
        ↓
SavePoint / .atriasave
        ↓
bounded ContextPlan + source-backed derived state
```

No hidden Character/JSONL/WorldInfo-file/Swipe/FloorState fallback authority was restored during final integration hardening.
