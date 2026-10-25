# Completed — Native Experience P5

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../../../README.md#122-minimal-validation-and-runtime-checks)。

Updated: 2026-09-27. **P5 complete and pushed; stop before P6**.

- Work branch: `feat/native-experience-modes-capability-deepening`.
- Work HEAD: `e21eb93489ae7fad4fb3874c532e797337f689d3` (pushed).
- Baseline: `5beee588ef82fb4cb47d8dafc33526d190aadb15`; P0–P4 preserved.
- Main unchanged: `4dab353ac639d42eae885c79e18245267abd6820`. No merge or branch deletion before P9.
- Formal plan §0 unchanged; P5 follows the frozen design. Only P5 is complete in this continuation.

## P5 implemented

1. **Versioned contract and typed authority.** Optional `experienceContract.presentationRuntime` v1 declares Activity, Scene, Asset Pack, Actor Voice and Host requirements. Exactly `activity`, `media-scene`, `asset-pack`, `safe-presentation`, `host-presentation-input` v1 become supported. P6+ capabilities remain reserved.
2. **Activity settlement before narrative.** Typed `activity.start/pause/resume/settle/cancel` reuse the existing lifecycle command, protected `atri_lifecycle`, immutable SessionRevision and expected-HEAD publication. Narrator input incompatibility leaves no partial facts. The existing Host scheduler resumes the exact declared Task/Variant, then task result, canonical assistant Variant, completion status and authority receipt publish together. Narrator returns prose, not executable Scene markup or new authority. Render, model-delivery and authority receipts stay separate.
3. **Replay, history and elapsed.** Activity instances retain run/scope epochs, elapsed samples, observations and completion state in the same revision snapshot. Terminal tombstones prevent replay after retention. Restore/fork carries the earlier state; cancel/suspend closes late narrative without erasing committed settlement facts. Uncertain retry preserves the exact sample and pending command; resumed runs reject old epochs. `getActivityProjection()` supplies typed Activity identity plus elapsed to the existing temporal projection; no mount-duration or wall/World-clock substitution.
4. **One renderer.** Typed Scene Cue IR supports image/audio/video/caption/speech/clear, bounded to declared exact AssetRef or selected-Variant Attachments. `scene` is a v2 leaf; media/speech primitives are Host-only. Scene compiles into the existing `mountUiDocument` and SurfaceHost, not a second renderer. Caption/speech content remains text. Package actions can call declared Scene/Activity/fullscreen/focus operations, while the one typed-authority-write ceiling remains.
5. **Exact media delivery.** The authenticated existing Session asset route supports GET/HEAD, strong ETag, conditional delivery, single byte ranges and 416 responses. Responses use inert MIME handling, nosniff, CSP and private immutable caching. Limits include 64 cues, 64 Activity declarations, 128 retained Activity records, 512 MiB per pack budget and 64 MiB total unique eager resources.
6. **Host capabilities and cleanup.** Required unsupported Host capabilities block prepare. Speech uses player-owned local voice preferences and explicit user activation; no provider credentials enter Package execution. Fullscreen requires activation and a mounted current Scene. Gamepad samples are bounded, deadzoned, edge-based Host input only. Responsive/reduced-motion changes remain non-authoritative projections.
7. **Final integration fixes.** Runtime initialization failure disposes its prepared Presentation Host. Elapsed projection uses the typed adapter rather than a bare number.

## Delivery and remaining boundaries

Implementation commit contains 29 paths; no local evidence, generated binaries, caches or user data is committed. `feat/native-experience-p5-completed.md` records the stage.

Activity is an authority/handoff contract rather than a bundled minigame. Scene is typed presentation, not model-generated executable UI. Live speech availability depends on installed local voices; required capability negotiation does not prove device output. Elapsed is an explicit active Host projection, not an authoritative real-time simulation or automatic background-tab pause. Restore does not resurrect provider streams, audio playback or fullscreen; Activity resume remains explicit. Lazy media errors appear on demand. Retention reuses P4 logical compaction/tombstones rather than physical GC. P6 owns deeper scoped information, graph queries, actor perspective/context and rollup semantics; P9 owns final migration/health/productization.
